import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import supertest from 'supertest';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthService } from '../../auth/auth.service';
import { GenerationOrchestrator } from '../../ai/orchestrator/generation-orchestrator';
import { ReplyPacksController } from './reply-packs.controller';
import { RequestTracingInterceptor } from '../../common/interceptors/request-tracing.interceptor';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { validationExceptionFactory } from '../../common/validation/validation-error.factory';
import { ErrorCodes } from '../../common/errors/error-codes';

describe('ReplyPacksController (integration)', () => {
  let app: INestApplication;
  let orchestrator: jest.Mocked<GenerationOrchestrator>;

  const mockResponse = {
    generationRunId: 'test-run-id',
    analysisMode: 'text' as const,
    detectedLanguage: 'en',
    translation: 'translated',
    summary: 'summary',
    context: 'context',
    theme: 'casual',
    topic: 'tech',
    sentiment: 'positive',
    commentStrategy: 'engage',
    suggestions: [
      {
        suggestionId: 'test-run-id-0',
        text: 'Great point!',
        meaningVi: 'Ý kiến hay!',
        whyItWorks: 'Engages',
        score: {
          total: 82,
          postFit: 80,
          visibility: 75,
          specificity: 70,
          native: 85,
          engagementHook: 78,
        },
        risk: 'low' as const,
        tone: 'casual_supportive',
        niche: 'tech',
      },
    ],
    metadata: {
      provider: 'openai',
      model: 'gpt-4',
      promptVersion: 'suggestion-compose:v1',
      latencyMs: 1234,
      fallbackUsed: false,
    },
  };

  beforeAll(async () => {
    orchestrator = { generate: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReplyPacksController],
      providers: [
        { provide: GenerationOrchestrator, useValue: orchestrator },
        { provide: APP_GUARD, useClass: AuthGuard },
        {
          provide: AuthService,
          useValue: {
            verifyBearerToken: jest
              .fn()
              .mockImplementation((authHeader?: string) => {
                if (!authHeader)
                  throw new UnauthorizedException('Missing bearer token');
                return { userId: 'test-user', name: 'Test' };
              }),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalInterceptors(new RequestTracingInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const validPost = {
    platform: 'x' as const,
    postId: '123',
    text: 'Hello world',
    contentType: 'text' as const,
    postType: 'original' as const,
    capturedAt: new Date().toISOString(),
    extractorVersion: '1.0.0',
  };

  const validOptions = {
    tone: 'casual_supportive',
    niche: 'tech',
    maxSuggestions: 1,
    targetLanguage: 'en',
    explanationLanguage: 'en',
    visionEnabled: false,
  };

  it('returns 201 with ReplyPackResponse on success', async () => {
    orchestrator.generate.mockResolvedValue(mockResponse);

    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({ post: validPost, options: validOptions });

    expect(res.status).toBe(201);
    expect(res.body.generationRunId).toBe('test-run-id');
    expect(res.body.analysisMode).toBe('text');
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].suggestionId).toBe('test-run-id-0');
    expect(res.body.metadata.provider).toBe('openai');
    expect(res.body.metadata.fallbackUsed).toBe(false);
  });

  it('passes requestId created by RequestTracingInterceptor to orchestrator', async () => {
    orchestrator.generate.mockResolvedValue(mockResponse);

    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Request-Id', 'trace-req-abc-123')
      .send({ post: validPost, options: validOptions });

    expect(res.status).toBe(201);
    expect(orchestrator.generate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requestId: 'trace-req-abc-123' }),
    );
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .send({ post: validPost, options: validOptions });

    expect(res.status).toBe(401);
  });

  it('returns INVALID_POST_CONTEXT when post has neither text nor media', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({
        post: { ...validPost, text: undefined },
        options: validOptions,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_POST_CONTEXT);
  });

  it('accepts a media-only post and forces vision on', async () => {
    orchestrator.generate.mockResolvedValue(mockResponse);

    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({
        post: {
          ...validPost,
          text: undefined,
          media: [{ type: 'image', url: 'https://example.com/a.jpg' }],
        },
        options: validOptions,
      });

    expect(res.status).toBe(201);
    expect(orchestrator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ visionEnabled: true }),
      }),
      expect.anything(),
    );
  });

  it('applies defaults when options is omitted entirely', async () => {
    orchestrator.generate.mockResolvedValue(mockResponse);

    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({ post: validPost });

    expect(res.status).toBe(201);
    expect(orchestrator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          niche: 'auto',
          intent: 'auto',
          length: 'short',
          energy: 'balanced',
          language: 'auto',
          emojiLevel: 'none',
          replyCount: 4,
        }),
      }),
      expect.anything(),
    );
  });

  it('returns INVALID_NICHE for an unknown niche', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({
        post: validPost,
        options: { ...validOptions, niche: 'underwater_basket_weaving' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_NICHE);
  });

  it('returns INVALID_INTENT for an unknown intent', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({
        post: validPost,
        options: { ...validOptions, intent: 'rant' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_INTENT);
  });

  it('returns INVALID_REPLY_COUNT when replyCount is outside {3,4}', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({
        post: validPost,
        options: { ...validOptions, replyCount: 7 },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_REPLY_COUNT);
  });

  it('returns 500 when AI generation fails', async () => {
    orchestrator.generate.mockRejectedValue(new Error('AI provider timeout'));

    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({ post: validPost, options: validOptions });

    expect(res.status).toBe(500);
  });

  it('returns 400 when options.maxSuggestions exceeds 5', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/reply-packs')
      .set('Authorization', 'Bearer valid-token')
      .send({
        post: validPost,
        options: { ...validOptions, maxSuggestions: 10 },
      });

    expect(res.status).toBe(400);
  });
});
