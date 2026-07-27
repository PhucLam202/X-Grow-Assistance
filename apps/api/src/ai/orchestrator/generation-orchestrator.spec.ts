import { Test, TestingModule } from '@nestjs/testing';
import { GenerationOrchestrator } from './generation-orchestrator';
import { AiConfigService } from '../ai.config';
import { VisionAnalyzeService } from '../../vision/vision-analyze.service';
import { LanguageDetectorService } from '../../common/language/language-detector.service';
import { GenerationRunRepository } from '../../modules/generations/generation-run.repository';
import { normalizeReplyPackRequest } from '../../modules/generations/mappers/legacy-request.mapper';
import { ContextNormalizerService } from '../../modules/generations/niche/context-normalizer.service';
import { LightweightClassifierService } from '../../modules/generations/niche/lightweight-classifier.service';
import { NicheClassifierService } from '../../modules/generations/niche/niche-classifier.service';
import { NicheConfidenceService } from '../../modules/generations/niche/niche-confidence.service';
import { NichePolicyResolver } from '../../modules/generations/niche/niche-policy.resolver';
import { ReplyPackPipelineService } from '../../modules/generations/pipeline/reply-pack-pipeline.service';
import type { ReplyPackPipelineResult } from '../../modules/generations/pipeline/reply-pack-pipeline.service';
import type { ScoredCandidate } from '../../modules/generations/scoring/scoring.types';
import { VisionContext } from '../../vision/types/vision.types';
import { AiExecutionMetadata } from '../ai.types';

import { AnalyticsService } from '../../analytics/analytics.service';

import { IdempotencyService } from '../../modules/generations/idempotency.service';

describe('GenerationOrchestrator', () => {
  let orchestrator: GenerationOrchestrator;
  let mockAiConfig: jest.Mocked<AiConfigService>;
  let mockPipeline: jest.Mocked<ReplyPackPipelineService>;
  let mockVisionAnalyze: jest.Mocked<VisionAnalyzeService>;
  let mockLanguageDetector: jest.Mocked<LanguageDetectorService>;
  let mockRunRepository: jest.Mocked<GenerationRunRepository>;
  let mockAnalyticsService: jest.Mocked<AnalyticsService>;
  let mockIdempotencyService: jest.Mocked<IdempotencyService>;

  const mockExecution: AiExecutionMetadata = {
    primaryProvider: 'openai',
    primaryModel: 'gpt-4',
    finalProvider: 'openai',
    finalModel: 'gpt-4',
    fallbackUsed: false,
    attemptCount: 1,
    replyPackUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
  };

  const mockScoredCandidate: ScoredCandidate = {
    id: 'cand_1_slot_1',
    slotId: 'slot_1',
    text: 'What did the rollout look like on the first day of the new feature?',
    meaning: 'Ngày đầu triển khai tính năng mới diễn ra thế nào?',
    niche: 'tech',
    nicheConfidence: 0.8,
    intent: 'ask',
    tone: 'question_based',
    length: 'short',
    energy: 'balanced',
    referencedConcept: 'the new feature launch',
    generationAttempt: 1,
    scores: {
      postFit: 0.8,
      specificity: 0.7,
      naturalness: 0.75,
      nicheFit: 0.7,
      empathyFit: 0.6,
      conversationPotential: 0.85,
      safetyScore: 1,
      userStyleFit: 0.6,
      ruleScore: 0.74,
      modelSelfScore: 0.8,
      finalScore: 0.75,
    },
    scoringMethod: 'rule_plus_self_score',
    scoreReasons: ['Conversation potential is strong (0.85).'],
    visionAligned: false,
  };

  const mockPipelineResult: ReplyPackPipelineResult = {
    suggestions: [mockScoredCandidate],
    penalties: [],
    analysis: {
      summary: 'A launch announcement for a new feature.',
      topic: 'product launch',
      sentiment: 'excited',
      translation: 'Vừa ra mắt tính năng mới!',
      commentStrategy: 'Ask about the rollout.',
    },
    execution: mockExecution,
    warnings: [],
    stats: {
      generated: 4,
      rejected: 3,
      duplicates: 1,
      retryUsed: false,
      scoringMethod: 'rule_plus_self_score',
    },
  };

  const mockVisionContext: VisionContext = {
    analysisMode: 'vision_context',
    detectedLanguage: 'en',
    translationLanguage: 'en',
    translation: 'Translated text',
    summary: 'Test post with image',
    context: 'Visual context available',
    theme: 'casual',
    topic: 'tech',
    sentiment: 'positive',
    commentStrategy: 'reference visual',
    imageAnalysis: {
      summary: 'A person coding on laptop',
      visibleText: 'Code on screen',
      visualTone: 'focused',
      importantObjects: ['laptop', 'monitor', 'coffee'],
    },
    combinedContext: {
      topic: 'tech',
      intent: 'showcase coding',
      sentiment: 'positive',
      explanation: 'User sharing coding setup',
      commentStrategy: 'ask about setup',
      avoid: ['criticizing equipment'],
    },
  };

  beforeEach(async () => {
    mockAiConfig = {
      getTextProviderName: jest.fn().mockReturnValue('openai'),
      getTextProviderEndpoint: jest.fn().mockReturnValue({
        apiUrl: 'https://api.openai.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      }),
      getVisionProviderName: jest.fn().mockReturnValue('openai'),
      getProviderDefaultVisionModel: jest.fn().mockReturnValue('gpt-4-vision'),
      getOpenAiVisionConfig: jest.fn().mockReturnValue({
        apiKey: 'test-key',
        model: 'gpt-4-vision',
      }),
      getTextFallbackConfig: jest.fn().mockReturnValue(null),
      getVisionFallbackConfig: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<AiConfigService>;

    mockPipeline = {
      run: jest.fn().mockResolvedValue(mockPipelineResult),
    } as unknown as jest.Mocked<ReplyPackPipelineService>;

    mockVisionAnalyze = {
      analyze: jest.fn(),
      analyzeContext: jest.fn().mockResolvedValue({
        data: mockVisionContext,
        execution: {
          ...mockExecution,
          visionUsage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
        },
      }),
      generateFromContext: jest.fn(),
    } as unknown as jest.Mocked<VisionAnalyzeService>;

    mockLanguageDetector = {
      detect: jest.fn().mockReturnValue('en'),
    };

    mockRunRepository = {
      create: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<GenerationRunRepository>;

    mockAnalyticsService = {
      trackGenerationEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AnalyticsService>;

    mockIdempotencyService = {
      handleBegin: jest.fn().mockResolvedValue({ idempotencyActive: false }),
      handleComplete: jest.fn().mockResolvedValue(undefined),
      handleFailure: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IdempotencyService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationOrchestrator,
        { provide: AiConfigService, useValue: mockAiConfig },
        { provide: ReplyPackPipelineService, useValue: mockPipeline },
        { provide: VisionAnalyzeService, useValue: mockVisionAnalyze },
        { provide: LanguageDetectorService, useValue: mockLanguageDetector },
        { provide: GenerationRunRepository, useValue: mockRunRepository },
        // Real cascade services: they are pure rule-based, no I/O to mock.
        ContextNormalizerService,
        LightweightClassifierService,
        NicheConfidenceService,
        NicheClassifierService,
        NichePolicyResolver,
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

    orchestrator = module.get<GenerationOrchestrator>(GenerationOrchestrator);
  });

  const baseTextRequest = normalizeReplyPackRequest({
    post: {
      platform: 'x',
      postId: '123456',
      text: 'Just launched a new feature!',
      author: { name: 'Dev', handle: 'dev' },
      contentType: 'text',
      postType: 'original',
      capturedAt: new Date().toISOString(),
      extractorVersion: '1.0.0',
    },
    options: {
      tone: 'casual_supportive',
      niche: 'auto',
      maxSuggestions: 3,
      targetLanguage: 'en',
      explanationLanguage: 'en',
      visionEnabled: false,
    },
  });

  it('should create initial processing run and mark completed with final provider/model metadata', async () => {
    mockPipeline.run.mockResolvedValueOnce({
      ...mockPipelineResult,
      execution: {
        primaryProvider: 'deepseek',
        primaryModel: 'deepseek-chat',
        finalProvider: 'openai',
        finalModel: 'gpt-4.1-mini',
        fallbackUsed: true,
        fallbackReason: 'DeepSeek 504 timeout',
        attemptCount: 2,
        replyPackUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
      },
    });

    const response = await orchestrator.generate(baseTextRequest);

    // Initial run creation
    expect(mockRunRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        provider: 'openai',
        model: 'gpt-4',
        promptVersion: 'candidate:v2',
      }),
    );

    // Final markCompleted update with actual final provider/model from execution metadata
    expect(mockRunRepository.markCompleted).toHaveBeenCalledWith(
      response.generationRunId,
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        primaryProvider: 'deepseek',
        primaryModel: 'deepseek-chat',
        fallbackUsed: true,
        fallbackReason: 'DeepSeek 504 timeout',
        attemptCount: 2,
        replyPackUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
      }),
    );

    // Analytics completion event
    expect(mockAnalyticsService.trackGenerationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'generation_completed',
        promptVersion: 'candidate:v2',
        replyPackUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
      }),
    );

    // Public response DTO does not leak execution metadata directly
    expect(
      (response as unknown as Record<string, unknown>).execution,
    ).toBeUndefined();
    expect(response.generationRunId).toBeDefined();
    expect(response.suggestions.length).toBe(1);
    expect(response.metadata.promptVersion).toBe('candidate:v2');
  });

  it('duplicate completed returns stored response without AI call', async () => {
    const storedResponse = {
      generationRunId: 'stored-run-123',
      analysisMode: 'text' as const,
      detectedLanguage: 'en',
      translation: 'Stored',
      summary: 'Stored',
      context: 'Stored',
      theme: 'theme',
      topic: 'tech',
      sentiment: 'positive',
      commentStrategy: 'Strategy',
      suggestions: [],
      metadata: {
        provider: 'openai',
        model: 'gpt-4',
        promptVersion: 'candidate:v2',
        latencyMs: 100,
        fallbackUsed: false,
      },
    };

    mockIdempotencyService.handleBegin.mockResolvedValueOnce({
      idempotencyActive: true,
      isCompleted: true,
      storedResponse,
      keyHash: 'hash-123',
    });

    const response = await orchestrator.generate(baseTextRequest, {
      requestId: 'req-1',
      userId: 'user-1',
      idempotencyKey: 'key-abc',
    });

    expect(response).toEqual(storedResponse);
    expect(mockPipeline.run).not.toHaveBeenCalled();
  });

  describe('niche analysis', () => {
    function requestWithText(text: string, niche = 'auto') {
      return normalizeReplyPackRequest({
        post: { platform: 'x', postId: 'p1', text },
        options: {
          tone: 'casual_supportive',
          niche,
          targetLanguage: 'en',
          explanationLanguage: 'en',
          visionEnabled: false,
        },
      } as never);
    }

    beforeEach(() => {
      mockPipeline.run.mockResolvedValue(mockPipelineResult);
    });

    it('reports the detected niche in the analysis block', async () => {
      const response = await orchestrator.generate(
        requestWithText(
          'Our RAG pipeline improved a lot after fine-tuning the LLM and ' +
            'swapping the embedding model.',
        ),
      );

      expect(response.analysis?.primaryNiche).toBe('ai_ml');
      expect(response.analysis?.classificationMethod).not.toBe(
        'general_fallback',
      );
      expect(response.analysis?.nicheConfidence).toBeGreaterThan(0);
      expect(response.analysis?.needsGenerationTimeClassification).toBe(false);
      expect(response.analysis?.nicheEvidence?.length).toBeGreaterThan(0);
    });

    it('falls back to general when a low-signal post gets no niche from the model', async () => {
      const response = await orchestrator.generate(
        requestWithText('Just shipped it.'),
      );

      // Phase 2 gắn cờ "để Phase 4 chốt"; pipeline không trả `resolvedNiche`
      // nghĩa là model cũng không chốt được — đó là đường duy nhất tới
      // general_fallback sau một context không rỗng.
      expect(response.analysis?.needsGenerationTimeClassification).toBe(false);
      expect(response.analysis?.classificationMethod).toBe('general_fallback');
      expect(response.analysis?.primaryNiche).toBe('general');
    });

    it('reports the niche the model settled on inside the same call', async () => {
      mockPipeline.run.mockResolvedValueOnce({
        ...mockPipelineResult,
        resolvedNiche: { niche: 'ai_ml', confidence: 0.82 },
      });

      const response = await orchestrator.generate(
        requestWithText('Just shipped it.'),
      );

      expect(response.analysis?.primaryNiche).toBe('ai_ml');
      expect(response.analysis?.classificationMethod).toBe(
        'generation_embedded',
      );
      expect(response.analysis?.needsGenerationTimeClassification).toBe(false);
    });

    it('keeps a manually chosen niche', async () => {
      const response = await orchestrator.generate(
        requestWithText('Deadlift PR at the gym today.', 'crypto'),
      );

      expect(response.analysis?.primaryNiche).toBe('crypto');
      expect(response.analysis?.classificationMethod).toBe('manual');
    });

    it('persists the niche outcome on the generation run', async () => {
      await orchestrator.generate(
        requestWithText(
          'Bitcoin on-chain volume is up and DeFi liquidity pools are filling.',
        ),
      );

      expect(mockRunRepository.markCompleted).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          primaryNiche: 'crypto',
          nicheClassificationMethod: expect.any(String),
          nicheConfidence: expect.any(Number),
        }),
      );
    });

    it('reports the niche on the generation_completed analytics event', async () => {
      await orchestrator.generate(
        requestWithText(
          'Bitcoin on-chain volume is up and DeFi liquidity pools are filling.',
        ),
      );

      expect(mockAnalyticsService.trackGenerationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'generation_completed',
          niche: 'crypto',
          nicheClassificationMethod: expect.any(String),
          nicheConfidence: expect.any(Number),
          needsGenerationTimeClassification: false,
        }),
      );
    });

    it('still reports the resolved niche on generation_failed when the AI call fails after classification', async () => {
      mockPipeline.run.mockRejectedValueOnce(new Error('AI provider timeout'));

      await expect(
        orchestrator.generate(
          requestWithText(
            'Bitcoin on-chain volume is up and DeFi liquidity pools are filling.',
          ),
        ),
      ).rejects.toThrow('AI provider timeout');

      expect(mockAnalyticsService.trackGenerationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'generation_failed',
          niche: 'crypto',
        }),
      );
    });

    it('omits the niche on generation_failed when the failure happens before classification', async () => {
      mockVisionAnalyze.analyzeContext.mockRejectedValueOnce(
        new Error('vision provider unavailable'),
      );

      await expect(
        orchestrator.generate(
          normalizeReplyPackRequest({
            post: {
              platform: 'x',
              postId: 'p1',
              media: [{ type: 'image', url: 'https://example.com/a.jpg' }],
            },
            options: {
              tone: 'casual_supportive',
              niche: 'auto',
              targetLanguage: 'en',
              explanationLanguage: 'en',
              visionEnabled: true,
            },
          } as never),
        ),
      ).rejects.toThrow();

      expect(mockAnalyticsService.trackGenerationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'generation_failed',
          niche: undefined,
        }),
      );
    });
  });
});
