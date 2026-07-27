import type { AiProviderResult } from '../../../ai/ai.types';
import type { AiProvider } from '../../../ai/providers/ai-provider.interface';
import { ApplicationError } from '../../../common/errors/application.error';
import { CandidateGenerationService } from '../candidates/candidate-generation.service';
import { CandidatePromptBuilder } from '../candidates/candidate-prompt.builder';
import { SelectiveRetryService } from '../candidates/selective-retry.service';
import type { CandidateGenerationInput } from '../candidates/candidate.types';
import { NichePolicyResolver } from '../niche/niche-policy.resolver';
import { resetNichePolicies } from '../niche/niche-policy.registry';
import type { NicheDetectionResult } from '../niche/niche.types';
import { DiversityRankingService } from '../scoring/diversity-ranking.service';
import { EmpathyFitScorer } from '../scoring/empathy-fit.scorer';
import { FinalScoreService } from '../scoring/final-score.service';
import { RuleScoringService } from '../scoring/rule-scoring.service';
import { ScoringFeatureExtractor } from '../scoring/scoring-feature.extractor';
import { CandidateRetentionService } from '../validation/candidate-retention.service';
import { CandidateValidatorService } from '../validation/candidate-validator.service';
import { FactualityFilterService } from '../validation/factuality-filter.service';
import { SafetyFilterService } from '../validation/safety-filter.service';
import { ReplyPackPipelineService } from './reply-pack-pipeline.service';

const POST =
  'Base sequencer went down for 40 minutes this morning. Zero funds lost but withdrawals were stuck.';

/** Câu 10–14 từ, neo vào post, khác nhau hoàn toàn về từ vựng. */
const TEXTS: Record<string, string> = {
  slot_1:
    'The stuck withdrawals matter more here than the downtime itself does, honestly',
  slot_2:
    'Was the escape hatch usable while the sequencer was still offline, or only after?',
  slot_3:
    'Zero funds lost through all of that is worth publishing loudly today',
  slot_4:
    'Publishing a minute-by-minute timeline afterwards would settle most questions',
};

const CONCEPTS: Record<string, string> = {
  slot_1: 'the stuck withdrawals',
  slot_2: 'the escape hatch',
  slot_3: 'zero funds lost',
  slot_4: 'the sequencer timeline',
};

function payload(slotIds: string[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    analysis: {
      summary: 'A sequencer outage stalled withdrawals for 40 minutes.',
      sentiment: 'concerned',
    },
    candidates: slotIds.map((slotId) => ({
      slotId,
      text: TEXTS[slotId],
      referencedConcept: CONCEPTS[slotId],
      selfScore: { postFit: 0.8, naturalness: 0.8, empathyFit: 0.7 },
    })),
    ...overrides,
  });
}

function makeProvider(
  impl: (prompt: string) => Promise<AiProviderResult>,
): AiProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: 'deepseek',
    calls,
    generateReplyPack: () => Promise.reject(new Error('not used')),
    generateStructured: (prompt: string) => {
      calls.push(prompt);
      return impl(prompt);
    },
  };
}

describe('ReplyPackPipelineService', () => {
  let resolver: NichePolicyResolver;

  beforeEach(() => {
    resetNichePolicies();
    resolver = new NichePolicyResolver();
  });

  afterAll(() => {
    resetNichePolicies();
  });

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

  function input(): CandidateGenerationInput {
    const nicheResult = detection();
    return {
      postContext: { text: POST, language: 'en', sentiment: 'concerned' },
      nicheResult,
      nichePolicy: resolver.resolveFromDetection(nicheResult),
      options: {
        replyCount: 4,
        length: 'short',
        energy: 'balanced',
        language: 'auto',
        emojiLevel: 'none',
        tone: 'auto',
        intent: 'auto',
        explanationLanguage: 'vi',
      },
    };
  }

  function makePipeline(provider: AiProvider) {
    const promptBuilder = new CandidatePromptBuilder();

    const aiConfig = {
      getTextProviderName: () => 'deepseek',
      getTextProviderEndpoint: () => ({
        apiUrl: 'https://example.test',
        apiKey: 'k',
        model: 'deepseek-v4-flash',
      }),
      getTextFallbackConfig: () => null,
    };

    const registry = { get: () => provider };

    return new ReplyPackPipelineService(
      new CandidateGenerationService(
        aiConfig as never,
        registry as never,
        promptBuilder,
      ),
      new SelectiveRetryService(promptBuilder),
      new CandidateValidatorService(
        new SafetyFilterService(),
        new FactualityFilterService(),
        new CandidateRetentionService(),
      ),
      new FinalScoreService(
        new ScoringFeatureExtractor(new EmpathyFitScorer()),
        new RuleScoringService(),
      ),
      new DiversityRankingService(),
    );
  }

  it('generates, validates, scores and ranks in one pass without retrying', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        content: payload(['slot_1', 'slot_2', 'slot_3', 'slot_4']),
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      }),
    );

    const result = await makePipeline(provider).run(input());

    expect(provider.calls).toHaveLength(1);
    expect(result.suggestions).toHaveLength(4);
    expect(result.stats).toMatchObject({
      generated: 4,
      rejected: 0,
      retryUsed: false,
      scoringMethod: 'rule_plus_self_score',
    });
    // Sort theo điểm giảm dần.
    const scores = result.suggestions.map((s) => s.scores.finalScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(result.analysis?.sentiment).toBe('concerned');
  });

  /**
   * Đây là lỗi mà bản Phase 4 cũ không thể bắt: nó retry dựa trên số candidate
   * PARSE được, nên một batch 4 cái mà 2 cái bị validation loại thì không bao
   * giờ được sinh bù.
   */
  it('retries only after validation, not after parsing', async () => {
    let call = 0;
    const provider = makeProvider(() => {
      call += 1;
      if (call === 1) {
        // 4 candidate parse được, nhưng 2 cái vi phạm safety crypto.
        return Promise.resolve({
          content: JSON.stringify({
            candidates: [
              {
                slotId: 'slot_1',
                text: TEXTS.slot_1,
                referencedConcept: CONCEPTS.slot_1,
                selfScore: { postFit: 0.8, naturalness: 0.8, empathyFit: 0.7 },
              },
              {
                slotId: 'slot_2',
                text: TEXTS.slot_2,
                referencedConcept: CONCEPTS.slot_2,
                selfScore: { postFit: 0.8, naturalness: 0.8, empathyFit: 0.7 },
              },
              {
                slotId: 'slot_3',
                text: 'Guaranteed profits next cycle regardless of what the sequencer does today',
                referencedConcept: CONCEPTS.slot_3,
              },
              {
                slotId: 'slot_4',
                text: 'Buy the dip while everyone panics about the withdrawals today, easy',
                referencedConcept: CONCEPTS.slot_4,
              },
            ],
          }),
        });
      }
      return Promise.resolve({ content: payload(['slot_3', 'slot_4']) });
    });

    const result = await makePipeline(provider).run(input());

    expect(provider.calls).toHaveLength(2);
    expect(result.stats.retryUsed).toBe(true);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(3);
    // Retry chỉ xin lại slot còn thiếu, và không xin lại analysis.
    expect(provider.calls[1]).toContain('ALREADY WRITTEN');
    expect(provider.calls[1]).not.toContain('"analysis"');
  });

  // Doc Phase 4 test case 9.
  it('returns what it has when the retry itself fails', async () => {
    let call = 0;
    const provider = makeProvider(() => {
      call += 1;
      return call === 1
        ? Promise.resolve({ content: payload(['slot_1', 'slot_2']) })
        : Promise.reject(new Error('provider exploded'));
    });

    const result = await makePipeline(provider).run(input());

    expect(result.suggestions).toHaveLength(2);
    expect(result.stats.retryUsed).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/Returned 2 of 4/);
  });

  it('propagates a generation failure as an ApplicationError', async () => {
    // Provider chỉ làm vision (không có `generateStructured`) và không có
    // fallback nào được cấu hình.
    const visionOnly: AiProvider = {
      name: 'deepseek',
      generateReplyPack: () => Promise.reject(new Error('not used')),
    };

    await expect(makePipeline(visionOnly).run(input())).rejects.toBeInstanceOf(
      ApplicationError,
    );
  });

  it('fails with a stable error code when validation rejects everything', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        content: JSON.stringify({
          candidates: ['slot_1', 'slot_2', 'slot_3', 'slot_4'].map(
            (slotId) => ({
              slotId,
              // Sáo rỗng ở đầu câu → reject toàn bộ.
              text: 'Great post, this is so true and everyone should read it today',
              referencedConcept: CONCEPTS[slotId],
            }),
          ),
        }),
      }),
    );

    await expect(makePipeline(provider).run(input())).rejects.toMatchObject({
      code: 'GENERATION_FAILED',
    });
  });
});
