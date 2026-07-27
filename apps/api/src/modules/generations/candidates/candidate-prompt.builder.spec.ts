import { NichePolicyResolver } from '../niche/niche-policy.resolver';
import { resetNichePolicies } from '../niche/niche-policy.registry';
import type { NicheDetectionResult } from '../niche/niche.types';
import {
  CandidatePromptBuilder,
  GLOBAL_BANNED_OPENERS,
} from './candidate-prompt.builder';
import { buildStrategySlots } from './strategy-slot.builder';
import { EMOJI_MAX, LENGTH_WORD_BANDS } from '../types/reply-constraints';
import { toCandidateVisionContext } from './candidate.types';
import type { CandidateGenerationInput } from './candidate.types';
import type { VisionContext } from '../../../vision/types/vision.types';

function detection(
  overrides: Partial<NicheDetectionResult> = {},
): NicheDetectionResult {
  return {
    primaryNiche: 'crypto',
    secondaryNiches: [],
    confidence: 0.9,
    evidence: [],
    sourceSignals: [],
    classificationMethod: 'lightweight',
    needsGenerationTimeClassification: false,
    fallbackUsed: false,
    ...overrides,
  };
}

describe('CandidatePromptBuilder', () => {
  let builder: CandidatePromptBuilder;
  let resolver: NichePolicyResolver;

  beforeEach(() => {
    resetNichePolicies();
    builder = new CandidatePromptBuilder();
    resolver = new NichePolicyResolver();
  });

  afterAll(() => {
    resetNichePolicies();
  });

  function input(
    overrides: Partial<CandidateGenerationInput> = {},
  ): CandidateGenerationInput {
    const nicheResult = overrides.nicheResult ?? detection();

    return {
      postContext: {
        text: 'Base sequencer went down for 40 minutes.',
        language: 'en',
      },
      nicheResult,
      nichePolicy: resolver.resolveFromDetection(nicheResult),
      options: {
        replyCount: 4,
        length: 'short',
        energy: 'balanced',
        language: 'auto',
        emojiLevel: 'none',
        explanationLanguage: 'vi',
        tone: 'auto',
        intent: 'auto',
      },
      ...overrides,
    };
  }

  function build(overrides: Partial<CandidateGenerationInput> = {}): string {
    const built = input(overrides);
    const slots = buildStrategySlots(4, {
      tone: built.options.tone,
      intent: built.options.intent,
      policy: built.nichePolicy,
    });
    return builder.build(built, slots);
  }

  it('renders post context, slots, rules and the output schema', () => {
    const prompt = build();

    expect(prompt).toContain('POST CONTEXT');
    expect(prompt).toContain('Base sequencer went down for 40 minutes.');
    expect(prompt).toContain('STRATEGY SLOTS');
    expect(prompt).toContain('slot_1: intent=react');
    expect(prompt).toContain('RULES');
    expect(prompt).toContain('OUTPUT JSON');
    expect(prompt).toContain('referencedConcept');
  });

  it('states the word band and emoji ceiling as numbers, not band names', () => {
    const band = LENGTH_WORD_BANDS.short;

    expect(build()).toContain(
      `Length: ${band.min}–${band.max} words per reply`,
    );
    expect(build()).toContain('Emoji: none at all.');
    expect(
      build({ options: { ...input().options, emojiLevel: 'rich' } }),
    ).toContain(`Emoji: at most ${EMOJI_MAX.rich} per reply.`);
  });

  it('renders the post sentiment when the caller has one', () => {
    const prompt = build({
      postContext: {
        text: 'Base sequencer went down for 40 minutes.',
        language: 'en',
        sentiment: 'frustrated',
      },
    });

    expect(prompt).toContain('Sentiment: frustrated');
  });

  it('asks for the analysis block and a meaning per candidate', () => {
    const prompt = build();

    expect(prompt).toContain('"analysis"');
    expect(prompt).toContain('"sentiment"');
    expect(prompt).toContain('"meaning"');
    expect(prompt).toContain('Vietnamese');
  });

  it('drops the analysis block for a selective retry', () => {
    const built = input();
    const slots = buildStrategySlots(4, {
      tone: built.options.tone,
      intent: built.options.intent,
      policy: built.nichePolicy,
    });

    const prompt = builder.build(built, slots, { includeAnalysis: false });

    expect(prompt).not.toContain('"analysis"');
    // `meaning` vẫn phải xin — candidate mới cũng cần bản dịch.
    expect(prompt).toContain('"meaning"');
  });

  it('embeds the Phase 3 niche policy block', () => {
    const prompt = build();

    expect(prompt).toContain('## NICHE POLICY: crypto');
    expect(prompt).toContain('SAFETY (non-negotiable):');
    expect(prompt).toContain('not financial advice');
  });

  it('merges global, policy and user banned phrases into one list', () => {
    const prompt = build({
      userStyle: { blockedPhrases: ['Just my two sats'] },
    });

    expect(prompt).toContain(GLOBAL_BANNED_OPENERS[0]);
    expect(prompt).toContain('To the moon');
    expect(prompt).toContain('Just my two sats');
  });

  describe('vision context', () => {
    // Doc test case 3.
    it('renders the vision section and requires one image-anchored reply', () => {
      const prompt = build({
        visionContext: {
          summary: 'A dashboard showing a six-hour outage window.',
          detectedEntities: ['dashboard', 'red alert banner'],
          mood: 'tense',
        },
      });

      expect(prompt).toContain('VISION CONTEXT');
      expect(prompt).toContain('A dashboard showing a six-hour outage window.');
      expect(prompt).toContain('dashboard, red alert banner');
      expect(prompt).toContain('Mood: tense');
      expect(prompt).toContain('only appears in the image');
    });

    it('omits the image rule entirely when there is no vision context', () => {
      const prompt = build();

      expect(prompt).not.toContain('VISION CONTEXT');
      expect(prompt).not.toContain('only appears in the image');
    });
  });

  describe('niche decision block', () => {
    // Doc test case 6 (phía prompt).
    it('asks the model to settle the niche when classification is pending', () => {
      const prompt = build({
        nicheResult: detection({
          confidence: 0.5,
          needsGenerationTimeClassification: true,
        }),
      });

      expect(prompt).toContain('NICHE DECISION');
      expect(prompt).toContain('niche: null');
      expect(prompt).toContain('nicheConfidence');
      expect(prompt).toContain('PROVISIONAL');
    });

    it('omits the block when Phase 2 already settled the niche', () => {
      const prompt = build();

      expect(prompt).not.toContain('NICHE DECISION');
    });
  });

  it('renders user style when present and skips it when empty', () => {
    expect(build({ userStyle: { preferredTones: ['insightful'] } })).toContain(
      'Preferred tones: insightful',
    );

    expect(build({ userStyle: {} })).not.toContain('USER STYLE');
  });
});

describe('toCandidateVisionContext', () => {
  const base: VisionContext = {
    analysisMode: 'vision_context',
    detectedLanguage: 'en',
    translationLanguage: 'en',
    translation: '',
    summary: 'outer summary',
    context: '',
    theme: '',
    topic: '',
    sentiment: 'tense',
    commentStrategy: '',
    imageAnalysis: {
      summary: 'A dashboard with a red banner.',
      visibleText: 'INCIDENT 4821',
      visualTone: 'urgent',
      importantObjects: ['dashboard', 'banner'],
    },
    combinedContext: {
      topic: '',
      intent: '',
      sentiment: '',
      explanation: '',
      commentStrategy: 'ask about the failover',
      avoid: ['blaming the team'],
    },
  };

  it('maps importantObjects to entities and visualTone to mood', () => {
    expect(toCandidateVisionContext(base)).toEqual({
      summary: 'A dashboard with a red banner.',
      detectedEntities: ['dashboard', 'banner'],
      mood: 'urgent',
      visibleText: 'INCIDENT 4821',
      avoid: ['blaming the team'],
    });
  });

  it('returns undefined for a text-only fallback or a missing context', () => {
    expect(
      toCandidateVisionContext({ ...base, analysisMode: 'text_only_fallback' }),
    ).toBeUndefined();
    expect(toCandidateVisionContext(undefined)).toBeUndefined();
  });

  it('falls back to the outer summary when the image analysis has none', () => {
    const result = toCandidateVisionContext({
      ...base,
      imageAnalysis: undefined,
    });

    expect(result?.summary).toBe('outer summary');
    expect(result?.mood).toBe('tense');
  });
});
