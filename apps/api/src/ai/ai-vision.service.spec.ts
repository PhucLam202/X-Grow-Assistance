import { ErrorCodes } from '../common/errors/error-codes';
import { AiConfigService } from './ai.config';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiVisionService } from './ai-vision.service';
import { AiProviderError, AiVisionInput } from './ai.types';
import { VisionAnalysisJsonParser } from './parsers/vision-analysis-json.parser';
import { AiProvider } from './providers/ai-provider.interface';

const MOCK_VISION_JSON = JSON.stringify({
  translation: 'Dịch',
  summary: 'Tóm tắt',
  context: 'Bối cảnh',
  theme: 'Chủ đề',
  topic: 'Chủ đề',
  sentiment: 'positive',
  commentStrategy: 'Chiến lược',
  imageAnalysis: {
    summary: 'Hình ảnh đẹp',
    visibleText: 'OCR Text',
    visualTone: 'Professional',
    importantObjects: ['Laptop'],
  },
  combinedContext: {
    topic: 'Tech',
    intent: 'Informative',
    sentiment: 'Positive',
    explanation: 'Giải thích',
    commentStrategy: 'Hỏi đáp',
    avoid: ['Làm phiền'],
  },
  suggestions: [
    {
      text: 'Gợi ý 1',
      meaningVi: 'Ý nghĩa 1',
      whyItWorks: 'Lý do 1',
      tone: 'short_native',
      score: {
        total: 95,
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

const mockInput: AiVisionInput = {
  dto: {
    post: { platform: 'x', text: 'Check out this screenshot' },
    media: [{ type: 'image', url: 'https://pbs.twimg.com/image.png' }],
    options: {
      tone: 'short_native',
      niche: 'auto',
      maxSuggestions: 3,
      targetCommentLanguage: 'en',
      explanationLanguage: 'en',
    },
  },
  images: [
    {
      sourceUrl: 'https://pbs.twimg.com/image.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  ],
  detectedLanguage: 'en',
  translationLanguage: 'en',
  targetLanguage: 'en',
};

describe('AiVisionService (Phase 4C Vision Fallback)', () => {
  let service: AiVisionService;
  let primaryProvider: jest.Mocked<AiProvider>;
  let fallbackProvider: jest.Mocked<AiProvider>;

  beforeEach(() => {
    primaryProvider = {
      name: 'openai',
      generateReplyPack: jest.fn(),
      analyzeVision: jest.fn(),
      analyzeVisionContext: jest.fn(),
    };
    fallbackProvider = {
      name: 'openrouter',
      generateReplyPack: jest.fn(),
      analyzeVision: jest.fn(),
      analyzeVisionContext: jest.fn(),
    };

    const mockRegistry = {
      get: jest.fn((name: string) => {
        if (name === 'openai') return primaryProvider;
        if (name === 'openrouter') return fallbackProvider;
        throw new Error(`Unknown provider ${name}`);
      }),
    } as unknown as AiProviderRegistry;

    const mockConfig = {
      getVisionProviderName: () => 'openai',
      getProviderDefaultVisionModel: (provider: string) =>
        provider === 'openai' ? 'gpt-5-nano' : 'qwen/qwen3-vl-30b-a3b-instruct',
      getVisionFallbackConfig: jest.fn().mockReturnValue({
        provider: 'openrouter',
        apiKey: 'sk-openrouter',
        model: 'qwen/qwen3-vl-30b-a3b-instruct',
      }),
    } as unknown as AiConfigService;

    service = new AiVisionService(
      mockConfig,
      mockRegistry,
      new VisionAnalysisJsonParser(),
    );
  });

  it('should analyze vision using primary provider when no error occurs', async () => {
    primaryProvider.analyzeVision!.mockResolvedValueOnce({
      content: MOCK_VISION_JSON,
      usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    });

    const result = await service.analyzeVision(mockInput);

    expect(primaryProvider.analyzeVision).toHaveBeenCalledTimes(1);
    expect(fallbackProvider.analyzeVision).not.toHaveBeenCalled();
    expect(result.data.analysisMode).toBe('vision');
    expect(result.execution.primaryProvider).toBe('openai');
    expect(result.execution.finalProvider).toBe('openai');
    expect(result.execution.fallbackUsed).toBe(false);
    expect(result.execution.attemptCount).toBe(1);
    expect(result.execution.visionUsage).toEqual({
      inputTokens: 200,
      outputTokens: 80,
      totalTokens: 280,
    });
  });

  it('should call vision fallback provider once when primary vision fails with retryable error and keep analysisMode=vision', async () => {
    primaryProvider.analyzeVision!.mockRejectedValueOnce(
      new AiProviderError('OpenAI Vision 503 unavailable', {
        providerName: 'openai',
        code: ErrorCodes.AI_PROVIDER_UNAVAILABLE,
        isRetryable: true,
        statusCode: 503,
      }),
    );
    fallbackProvider.analyzeVision!.mockResolvedValueOnce({
      content: MOCK_VISION_JSON,
      usage: { inputTokens: 220, outputTokens: 90, totalTokens: 310 },
    });

    const result = await service.analyzeVision(mockInput);

    expect(primaryProvider.analyzeVision).toHaveBeenCalledTimes(1);
    expect(fallbackProvider.analyzeVision).toHaveBeenCalledTimes(1);
    expect(result.data.analysisMode).toBe('vision');
    expect(result.execution.primaryProvider).toBe('openai');
    expect(result.execution.finalProvider).toBe('openrouter');
    expect(result.execution.finalModel).toBe('qwen/qwen3-vl-30b-a3b-instruct');
    expect(result.execution.fallbackUsed).toBe(true);
    expect(result.execution.attemptCount).toBe(2);
    expect(result.execution.visionUsage).toEqual({
      inputTokens: 220,
      outputTokens: 90,
      totalTokens: 310,
    });
  });
});
