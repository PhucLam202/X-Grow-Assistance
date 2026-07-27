import { AiProviderError } from '../../../ai/ai.types';
import type { AiProviderResult } from '../../../ai/ai.types';
import type { AiProvider } from '../../../ai/providers/ai-provider.interface';
import { ApplicationError } from '../../../common/errors/application.error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { NichePolicyResolver } from '../niche/niche-policy.resolver';
import { resetNichePolicies } from '../niche/niche-policy.registry';
import type { NicheDetectionResult } from '../niche/niche.types';
import { CandidateGenerationService } from './candidate-generation.service';
import { CandidatePromptBuilder } from './candidate-prompt.builder';
import type { CandidateGenerationInput } from './candidate.types';

const RICH_POST =
  'Base sequencer went down for 40 minutes this morning. Zero funds lost but withdrawals were stuck.';

function payload(slotIds: string[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    ...extra,
    candidates: slotIds.map((slotId) => ({
      slotId,
      text: `reply ${slotId}`,
      referencedConcept: 'the 40 minute outage',
      selfScore: { postFit: 0.8, naturalness: 0.8, empathyFit: 0.8 },
    })),
  });
}

/** Provider giả — object literal thoả `AiProvider`, đúng phong cách spec hiện có. */
function makeProvider(
  name: string,
  impl: (prompt: string) => Promise<AiProviderResult>,
): AiProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name: name as AiProvider['name'],
    calls,
    generateReplyPack: () => Promise.reject(new Error('not used')),
    generateStructured: (prompt: string) => {
      calls.push(prompt);
      return impl(prompt);
    },
  };
}

describe('CandidateGenerationService', () => {
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

  function input(
    overrides: Partial<CandidateGenerationInput> = {},
  ): CandidateGenerationInput {
    const nicheResult = overrides.nicheResult ?? detection();
    return {
      postContext: { text: RICH_POST, language: 'en' },
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
      ...overrides,
    };
  }

  function makeService(
    providers: Record<string, AiProvider>,
    fallback?: string,
  ) {
    const aiConfig = {
      getTextProviderName: () => 'deepseek',
      getTextProviderEndpoint: () => ({
        apiUrl: 'https://example.test',
        apiKey: 'k',
        model: 'deepseek-v4-flash',
      }),
      getTextFallbackConfig: () =>
        fallback
          ? { provider: fallback, apiKey: 'k2', model: 'gpt-4.1-mini' }
          : null,
    };

    const registry = {
      get: (name: string) => {
        const provider = providers[name];
        if (!provider) throw new Error(`Unsupported AI provider: ${name}`);
        return provider;
      },
    };

    return new CandidateGenerationService(
      aiConfig as never,
      registry as never,
      new CandidatePromptBuilder(),
    );
  }

  // Doc test case 7.
  it('returns four candidates from a single call and does not retry', async () => {
    const provider = makeProvider('deepseek', () =>
      Promise.resolve({
        content: payload(['slot_1', 'slot_2', 'slot_3', 'slot_4']),
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      }),
    );

    const result = await makeService({ deepseek: provider }).generate(input());

    expect(result.candidates).toHaveLength(4);
    expect(provider.calls).toHaveLength(1);
    // Pipeline cần hai thứ này để chạy được selective retry sau validation.
    expect(result.slots).toHaveLength(4);
    expect(result.provider).toBe(provider);
    expect(result.execution).toMatchObject({
      primaryProvider: 'deepseek',
      finalProvider: 'deepseek',
      fallbackUsed: false,
      attemptCount: 1,
      replyPackUsage: { totalTokens: 300 },
    });
  });

  it('orders candidates by slot even when the model returns them shuffled', async () => {
    const provider = makeProvider('deepseek', () =>
      Promise.resolve({
        content: payload(['slot_3', 'slot_1', 'slot_2', 'slot_4']),
      }),
    );

    const result = await makeService({ deepseek: provider }).generate(input());

    expect(result.candidates.map((c) => c.slotId)).toEqual([
      'slot_1',
      'slot_2',
      'slot_3',
      'slot_4',
    ]);
  });

  /**
   * Retry là việc của pipeline, không phải của service này: chỉ sau validation
   * (Phase 5) mới biết còn mấy candidate DÙNG ĐƯỢC. Bản cũ retry ngay ở đây
   * dựa trên số candidate parse được, nên một batch 4 candidate mà 3 cái bị
   * validation loại thì không bao giờ được sinh bù. Test case 8/9 của doc Phase
   * 4 giờ nằm ở `pipeline/reply-pack-pipeline.service.spec.ts`.
   */
  it('does not retry on its own when the model returns fewer than three', async () => {
    const provider = makeProvider('deepseek', () =>
      Promise.resolve({ content: payload(['slot_1', 'slot_2']) }),
    );

    const result = await makeService({ deepseek: provider }).generate(input());

    expect(result.candidates).toHaveLength(2);
    expect(provider.calls).toHaveLength(1);
  });

  it('carries the analysis block from the same call', async () => {
    const provider = makeProvider('deepseek', () =>
      Promise.resolve({
        content: payload(['slot_1', 'slot_2', 'slot_3'], {
          analysis: {
            summary: 'A sequencer outage stalled withdrawals.',
            topic: 'L2 reliability',
            sentiment: 'concerned',
            translation: 'Sequencer của Base sập 40 phút.',
          },
        }),
      }),
    );

    const result = await makeService({ deepseek: provider }).generate(input());

    expect(result.analysis).toEqual({
      summary: 'A sequencer outage stalled withdrawals.',
      topic: 'L2 reliability',
      sentiment: 'concerned',
      translation: 'Sequencer của Base sập 40 phút.',
    });
  });

  describe('provider failures', () => {
    // Doc test case 11.
    it('falls back to the secondary provider on a retryable timeout', async () => {
      const primary = makeProvider('deepseek', () =>
        Promise.reject(
          new AiProviderError('timed out', {
            providerName: 'deepseek',
            code: ErrorCodes.AI_PROVIDER_TIMEOUT,
            isRetryable: true,
          }),
        ),
      );
      const fallback = makeProvider('openai', () =>
        Promise.resolve({ content: payload(['slot_1', 'slot_2', 'slot_3']) }),
      );

      const result = await makeService(
        { deepseek: primary, openai: fallback },
        'openai',
      ).generate(input());

      expect(result.execution).toMatchObject({
        finalProvider: 'openai',
        fallbackUsed: true,
        attemptCount: 2,
      });
      expect(result.execution.fallbackReason).toContain('timed out');
    });

    it('does not fall back on a non-retryable error', async () => {
      const primary = makeProvider('deepseek', () =>
        Promise.reject(
          new AiProviderError('bad key', {
            providerName: 'deepseek',
            code: ErrorCodes.AI_AUTHENTICATION_FAILED,
            isRetryable: false,
            statusCode: 401,
          }),
        ),
      );
      const fallback = makeProvider('openai', () =>
        Promise.resolve({ content: payload(['slot_1']) }),
      );

      const service = makeService(
        { deepseek: primary, openai: fallback },
        'openai',
      );

      await expect(service.generate(input())).rejects.toMatchObject({
        code: ErrorCodes.AI_AUTHENTICATION_FAILED,
      });
      expect(fallback.calls).toHaveLength(0);
    });

    it('maps a timeout with no fallback configured to an ApplicationError', async () => {
      const primary = makeProvider('deepseek', () =>
        Promise.reject(
          new AiProviderError('timed out', {
            providerName: 'deepseek',
            code: ErrorCodes.AI_PROVIDER_TIMEOUT,
            isRetryable: true,
          }),
        ),
      );

      await expect(
        makeService({ deepseek: primary }).generate(input()),
      ).rejects.toBeInstanceOf(ApplicationError);
    });

    // Provider chỉ làm vision (openrouter) không implement generateStructured.
    it('skips a provider without generateStructured and uses the fallback', async () => {
      const visionOnly: AiProvider = {
        name: 'openrouter',
        generateReplyPack: () => Promise.reject(new Error('vision only')),
      };
      const fallback = makeProvider('openai', () =>
        Promise.resolve({ content: payload(['slot_1', 'slot_2', 'slot_3']) }),
      );

      const service = makeService(
        { deepseek: visionOnly, openai: fallback },
        'openai',
      );
      const result = await service.generate(input());

      expect(result.execution.finalProvider).toBe('openai');
      expect(result.execution.fallbackUsed).toBe(true);
    });
  });

  it('asks for three candidates when the post is thin', async () => {
    const provider = makeProvider('deepseek', () =>
      Promise.resolve({ content: payload(['slot_1', 'slot_2', 'slot_3']) }),
    );

    await makeService({ deepseek: provider }).generate(
      input({ postContext: { text: 'gm', language: 'en' } }),
    );

    expect(provider.calls[0]).toContain('slot_3');
    expect(provider.calls[0]).not.toContain('slot_4');
  });

  // Doc test case 6 (end-to-end).
  it('surfaces the niche the model settled on', async () => {
    const provider = makeProvider('deepseek', () =>
      Promise.resolve({
        content: payload(['slot_1', 'slot_2', 'slot_3'], {
          niche: 'ai_ml',
          nicheConfidence: 0.77,
        }),
      }),
    );

    const result = await makeService({ deepseek: provider }).generate(
      input({
        nicheResult: detection({
          confidence: 0.5,
          needsGenerationTimeClassification: true,
        }),
      }),
    );

    expect(result.resolvedNiche).toEqual({ niche: 'ai_ml', confidence: 0.77 });
    expect(result.candidates.every((c) => c.niche === 'ai_ml')).toBe(true);
  });
});
