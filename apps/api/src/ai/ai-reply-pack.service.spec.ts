import { ConfigService } from '@nestjs/config';
import { ErrorCodes } from '../common/errors/error-codes';
import { AiConfigService } from './ai.config';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiReplyPackService } from './ai-reply-pack.service';
import { AiProviderError, AiReplyPackInput } from './ai.types';
import { ReplyPackJsonParser } from './parsers/reply-pack-json.parser';
import { AiProvider } from './providers/ai-provider.interface';

const MOCK_REPLY_PACK_JSON = JSON.stringify({
  translation: 'Xin chào',
  summary: 'Tóm tắt bài post',
  context: 'Bối cảnh',
  theme: 'Chủ đề',
  topic: 'Chủ đề',
  sentiment: 'positive',
  commentStrategy: 'Thảo luận',
  suggestions: [
    {
      text: 'Gợi ý 1',
      meaningVi: 'Ý nghĩa 1',
      whyItWorks: 'Lý do 1',
      tone: 'short_native',
      score: {
        total: 90,
        postFit: 9,
        visibility: 9,
        specificity: 9,
        native: 9,
        engagementHook: 9,
      },
      risk: 'low',
    },
  ],
});

const mockInput: AiReplyPackInput = {
  dto: {
    platform: 'x',
    postText: 'Great tech news today!',
    targetCommentLanguage: 'en',
    tone: 'short_native',
    niche: 'auto',
    maxSuggestions: 3,
    translationLanguage: 'en',
  },
  detectedLanguage: 'en',
  targetLanguage: 'en',
};

describe('AiReplyPackService (Phase 4C Controlled Fallback)', () => {
  let service: AiReplyPackService;
  let primaryProvider: jest.Mocked<AiProvider>;
  let fallbackProvider: jest.Mocked<AiProvider>;

  beforeEach(() => {
    primaryProvider = {
      name: 'deepseek',
      generateReplyPack: jest.fn(),
    };
    fallbackProvider = {
      name: 'openai',
      generateReplyPack: jest.fn(),
    };

    const mockRegistry = {
      get: jest.fn((name: string) => {
        if (name === 'deepseek') return primaryProvider;
        if (name === 'openai') return fallbackProvider;
        throw new Error(`Unknown provider ${name}`);
      }),
    } as unknown as AiProviderRegistry;

    const mockConfig = {
      getTextProviderName: () => 'deepseek',
      getTextProviderEndpoint: () => ({
        apiUrl: 'http://mock-primary',
        apiKey: 'sk-primary',
        model: 'deepseek-chat',
      }),
      getTextFallbackConfig: jest.fn().mockReturnValue({
        provider: 'openai',
        apiKey: 'sk-fallback',
        model: 'gpt-4.1-mini',
      }),
    } as unknown as AiConfigService;

    service = new AiReplyPackService(
      mockConfig,
      mockRegistry,
      new ReplyPackJsonParser(),
    );
  });

  it('should succeed using primary provider when no error occurs', async () => {
    primaryProvider.generateReplyPack.mockResolvedValueOnce({
      content: MOCK_REPLY_PACK_JSON,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    const result = await service.generateReplyPack(mockInput);

    expect(primaryProvider.generateReplyPack).toHaveBeenCalledTimes(1);
    expect(fallbackProvider.generateReplyPack).not.toHaveBeenCalled();
    expect(result.execution.primaryProvider).toBe('deepseek');
    expect(result.execution.finalProvider).toBe('deepseek');
    expect(result.execution.fallbackUsed).toBe(false);
    expect(result.execution.attemptCount).toBe(1);
    expect(result.execution.replyPackUsage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
  });

  it('should call fallback provider once when primary fails with retryable AiProviderError', async () => {
    primaryProvider.generateReplyPack.mockRejectedValueOnce(
      new AiProviderError('DeepSeek timeout (504)', {
        providerName: 'deepseek',
        code: ErrorCodes.AI_PROVIDER_TIMEOUT,
        isRetryable: true,
        statusCode: 504,
      }),
    );
    fallbackProvider.generateReplyPack.mockResolvedValueOnce({
      content: MOCK_REPLY_PACK_JSON,
      usage: { inputTokens: 120, outputTokens: 60, totalTokens: 180 },
    });

    const result = await service.generateReplyPack(mockInput);

    expect(primaryProvider.generateReplyPack).toHaveBeenCalledTimes(1);
    expect(fallbackProvider.generateReplyPack).toHaveBeenCalledTimes(1);
    expect(result.execution.primaryProvider).toBe('deepseek');
    expect(result.execution.finalProvider).toBe('openai');
    expect(result.execution.finalModel).toBe('gpt-4.1-mini');
    expect(result.execution.fallbackUsed).toBe(true);
    expect(result.execution.attemptCount).toBe(2);
    expect(result.execution.replyPackUsage).toEqual({
      inputTokens: 120,
      outputTokens: 60,
      totalTokens: 180,
    });
  });

  it('should NOT call fallback when primary error is non-retryable (e.g. 400 Bad Request)', async () => {
    primaryProvider.generateReplyPack.mockRejectedValueOnce(
      new AiProviderError('Invalid context', {
        providerName: 'deepseek',
        code: ErrorCodes.INVALID_POST_CONTEXT,
        isRetryable: false,
        statusCode: 400,
      }),
    );

    await expect(service.generateReplyPack(mockInput)).rejects.toThrow(
      'Invalid context',
    );
    expect(fallbackProvider.generateReplyPack).not.toHaveBeenCalled();
  });

  it('should NOT call fallback when fallback config is unconfigured / null', async () => {
    (service as any).aiConfig.getTextFallbackConfig = jest
      .fn()
      .mockReturnValue(null);

    primaryProvider.generateReplyPack.mockRejectedValueOnce(
      new AiProviderError('DeepSeek rate limited (429)', {
        providerName: 'deepseek',
        code: ErrorCodes.AI_PROVIDER_RATE_LIMITED,
        isRetryable: true,
        statusCode: 429,
      }),
    );

    await expect(service.generateReplyPack(mockInput)).rejects.toThrow(
      'DeepSeek rate limited (429)',
    );
    expect(fallbackProvider.generateReplyPack).not.toHaveBeenCalled();
  });
});
