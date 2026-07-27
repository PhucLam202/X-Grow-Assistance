import { NichePolicyResolver } from '../niche/niche-policy.resolver';
import { resetNichePolicies } from '../niche/niche-policy.registry';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import { EmpathyFitScorer } from './empathy-fit.scorer';
import { RuleScoringService } from './rule-scoring.service';
import { FinalScoreService } from './final-score.service';
import { ScoringFeatureExtractor } from './scoring-feature.extractor';
import type { CandidateForFeatures } from './scoring-feature.extractor';

const POST =
  'Base sequencer went down for 40 minutes this morning. Zero funds lost but withdrawals were stuck.';

function forFeatures(
  overrides: Partial<CandidateForFeatures> = {},
): CandidateForFeatures {
  return {
    id: 'a',
    slotId: 'slot_1',
    text: 'Were the stuck withdrawals reachable through the escape hatch during those 40 minutes?',
    niche: 'crypto',
    nicheConfidence: 0.9,
    intent: 'ask',
    tone: 'question_based',
    length: 'short',
    energy: 'balanced',
    referencedConcept: 'the stuck withdrawals',
    generationAttempt: 1,
    ...overrides,
  };
}

describe('ScoringFeatureExtractor', () => {
  let extractor: ScoringFeatureExtractor;
  let policy: ResolvedNichePolicy;

  beforeEach(() => {
    resetNichePolicies();
    policy = new NichePolicyResolver().resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.9,
      needsGenerationTimeClassification: false,
    });
    extractor = new ScoringFeatureExtractor(new EmpathyFitScorer());
  });

  afterAll(() => {
    resetNichePolicies();
  });

  function extract(
    candidate: CandidateForFeatures,
    penaltyCodes: string[] = [],
  ) {
    return extractor.extract({
      candidate,
      postContext: { text: POST, language: 'en' },
      nichePolicy: policy,
      visionAligned: false,
      penaltyCodes,
    });
  }

  /**
   * Bất biến quan trọng nhất của Phase 6: rule features không được nhìn thấy
   * self-score của model. Kiểu `CandidateForFeatures` chặn ở compile time; bài
   * test này chặn ở runtime, qua đường `FinalScoreService`.
   */
  it('produces identical features regardless of the model self-score', () => {
    const service = new FinalScoreService(extractor, new RuleScoringService());
    const base = forFeatures();

    const withHigh = service.scoreAll({
      postContext: { text: POST, language: 'en' },
      nichePolicy: policy,
      candidates: [
        { ...base, selfScore: { postFit: 1, naturalness: 1, empathyFit: 1 } },
      ],
      penalties: [],
      visionAlignment: [],
    })[0];

    const withLow = service.scoreAll({
      postContext: { text: POST, language: 'en' },
      nichePolicy: policy,
      candidates: [
        { ...base, selfScore: { postFit: 0, naturalness: 0, empathyFit: 0 } },
      ],
      penalties: [],
      visionAlignment: [],
    })[0];

    expect(withHigh.scores.ruleScore).toBe(withLow.scores.ruleScore);
    expect(withHigh.scores.postFit).toBe(withLow.scores.postFit);
    expect(withHigh.scores.naturalness).toBe(withLow.scores.naturalness);
    // Chỉ final score được phép khác — đó là chỗ self-score có quyền nói.
    expect(withHigh.scores.finalScore).toBeGreaterThan(
      withLow.scores.finalScore,
    );
  });

  it('rates a reply that reuses post details above one that shares nothing', () => {
    const grounded = extract(forFeatures());
    const floating = extract(
      forFeatures({
        text: 'Interesting stuff, definitely something everyone here should think about today',
        referencedConcept: 'the discussion',
      }),
    );

    expect(grounded.postFit).toBeGreaterThan(floating.postFit);
  });

  it('penalises essay-speak in naturalness', () => {
    const human = extract(forFeatures());
    const robotic = extract(
      forFeatures({
        text: 'It is important to note that, furthermore, this outage is truly remarkable indeed',
      }),
    );

    expect(robotic.naturalness).toBeLessThan(human.naturalness);
  });

  it('rates a question above a flat statement on conversation potential', () => {
    const question = extract(forFeatures());
    const statement = extract(
      forFeatures({
        text: 'The stuck withdrawals were the real cost of those forty minutes offline',
        intent: 'add_insight',
      }),
    );

    expect(question.conversationPotential).toBeGreaterThan(
      statement.conversationPotential,
    );
  });

  it('drops safetyScore for a soft safety flag and keeps it at 1 otherwise', () => {
    expect(extract(forFeatures()).safetyScore).toBe(1);
    expect(
      extract(forFeatures(), ['niche_safety_soft']).safetyScore,
    ).toBeLessThan(1);
  });

  it('keeps every feature inside 0-1 for degenerate input', () => {
    const features = extract(
      forFeatures({ text: '!!!!', referencedConcept: '', nicheConfidence: 0 }),
    );

    for (const value of Object.values(features)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('EmpathyFitScorer', () => {
  const scorer = new EmpathyFitScorer();

  function score(
    text: string,
    sentiment?: string,
    empathySignal?: string,
  ): number {
    return scorer.score({
      candidate: forFeatures({
        text,
        ...(empathySignal ? { empathySignal } : {}),
      }),
      postContext: {
        text: 'We had to put our dog down this morning.',
        language: 'en',
        ...(sentiment ? { sentiment } : {}),
      },
      visionAligned: false,
    });
  }

  it('rewards acknowledgement on a grieving post', () => {
    expect(
      score(
        'I am so sorry, hope you had a good last morning together',
        'grieving',
      ),
    ).toBeGreaterThan(score('What breed was the dog?', 'grieving'));
  });

  it('punishes exclamation-driven cheer on a grieving post', () => {
    expect(score('Sending love!!!', 'grieving')).toBeLessThan(
      score('Sending love, that is a hard morning', 'grieving'),
    );
  });

  it('rewards a grounded empathySignal', () => {
    expect(
      score(
        'That is a hard call to make',
        'grieving',
        'shares the grief of the morning',
      ),
    ).toBeGreaterThan(score('That is a hard call to make', 'grieving'));
  });

  it('treats a missing sentiment as neutral rather than guessing', () => {
    const neutral = score('Congrats, that must be a relief');
    expect(neutral).toBeGreaterThan(0);
    expect(neutral).toBeLessThanOrEqual(1);
  });
});
