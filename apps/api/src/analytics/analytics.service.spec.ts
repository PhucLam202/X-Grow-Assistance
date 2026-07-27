import { AnalyticsService } from './analytics.service';
import { MongoService } from '../mongo/mongo.service';

type UsageEventsCollectionMock = {
  insertOne: ReturnType<typeof jest.fn>;
  countDocuments: ReturnType<typeof jest.fn>;
  aggregate: ReturnType<typeof jest.fn>;
  find: ReturnType<typeof jest.fn>;
};

type DbMock = {
  collection: ReturnType<typeof jest.fn>;
  usageEventsCollection: UsageEventsCollectionMock;
};

describe('AnalyticsService', () => {
  const createDbMock = (): DbMock => {
    const usageEventsCollection = {
      insertOne: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(3),
      aggregate: jest
        .fn()
        .mockReturnValueOnce({
          toArray: jest.fn().mockResolvedValue([
            { _id: 'analyze_succeeded', count: 2 },
            { _id: 'copy_clicked', count: 1 },
          ]),
        })
        .mockReturnValueOnce({
          toArray: jest
            .fn()
            .mockResolvedValue([{ _id: null, averageLatencyMs: 245 }]),
        }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              {
                id: 'event-3',
                eventName: 'copy_clicked',
                platform: 'x',
                createdAt: '2026-06-12T12:03:00.000Z',
              },
            ]),
          }),
        }),
      }),
    };

    return {
      collection: jest.fn().mockReturnValue(usageEventsCollection),
      usageEventsCollection,
    };
  };

  it('persists usage events to Mongo', async () => {
    const dbMock = createDbMock();
    const mongoService = {
      db: jest.fn().mockResolvedValue(dbMock),
    } as unknown as MongoService;
    const service = new AnalyticsService(mongoService, null as never);

    await expect(
      service.track(
        {
          deviceId: 'device-1',
          eventName: 'copy_clicked',
          platform: 'x',
          postUrl: 'https://x.com/example/status/1',
        },
        'user-1',
      ),
    ).resolves.toEqual({ ok: true });

    expect(dbMock.collection).toHaveBeenCalledWith('usage_events');
    expect(dbMock.usageEventsCollection.insertOne).toHaveBeenCalledTimes(1);
    const insertedDoc = dbMock.usageEventsCollection.insertOne.mock.calls[0][0];
    expect(insertedDoc.deviceId).toBe('device-1');
    expect(insertedDoc.eventName).toBe('copy_clicked');
    expect(insertedDoc.platform).toBe('x');
    expect(insertedDoc.postUrl).toBe('https://x.com/example/status/1');
    expect(insertedDoc.userId).toBe('user-1');
    expect(typeof insertedDoc.id).toBe('string');
    expect(typeof insertedDoc.createdAt).toBe('string');
  });

  it('builds summary from persisted usage events', async () => {
    const dbMock = createDbMock();
    const mongoService = {
      db: jest.fn().mockResolvedValue(dbMock),
    } as unknown as MongoService;
    const service = new AnalyticsService(mongoService, null as never);

    await expect(service.getSummary()).resolves.toEqual({
      totalEvents: 3,
      byEventName: {
        analyze_succeeded: 2,
        copy_clicked: 1,
      },
      averageLatencyMs: 245,
      latestEvents: [
        {
          id: 'event-3',
          eventName: 'copy_clicked',
          platform: 'x',
          createdAt: '2026-06-12T12:03:00.000Z',
        },
      ],
    });

    expect(dbMock.collection).toHaveBeenCalledWith('usage_events');
  });

  describe('Phase 3C — Generation Analytics & Reliability', () => {
    it('persists generation_completed event with full context', async () => {
      const dbMock = createDbMock();
      const mongoService = {
        db: jest.fn().mockResolvedValue(dbMock),
      } as unknown as MongoService;
      const service = new AnalyticsService(mongoService, null as never);

      await service.trackGenerationEvent({
        eventName: 'generation_completed',
        requestId: 'req-abc-999',
        generationRunId: 'gen-run-123',
        userId: 'user-777',
        postId: 'post-555',
        analysisMode: 'vision',
        fallbackUsed: false,
        provider: 'openai',
        model: 'gpt-4',
        latencyMs: 1250,
      });

      const inserted = dbMock.usageEventsCollection.insertOne.mock
        .calls[0][0] as Record<string, unknown>;
      expect(inserted.eventName).toBe('generation_completed');
      expect(inserted.requestId).toBe('req-abc-999');
      expect(inserted.generationRunId).toBe('gen-run-123');
      expect(inserted.userId).toBe('user-777');
      expect(inserted.postId).toBe('post-555');
      expect(inserted.analysisMode).toBe('vision');
      expect(inserted.fallbackUsed).toBe(false);
      expect(inserted.provider).toBe('openai');
      expect(inserted.model).toBe('gpt-4');
      expect(inserted.latencyMs).toBe(1250);
    });

    it('persists generation_failed event with stable errorCode', async () => {
      const dbMock = createDbMock();
      const mongoService = {
        db: jest.fn().mockResolvedValue(dbMock),
      } as unknown as MongoService;
      const service = new AnalyticsService(mongoService, null as never);

      await service.trackGenerationEvent({
        eventName: 'generation_failed',
        requestId: 'req-fail-100',
        generationRunId: 'gen-run-456',
        userId: 'user-123',
        postId: 'post-100',
        analysisMode: 'text_only_fallback',
        fallbackUsed: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        latencyMs: 300,
        errorCode: 'AI_PROVIDER_TIMEOUT',
      });

      const inserted = dbMock.usageEventsCollection.insertOne.mock
        .calls[0][0] as Record<string, unknown>;
      expect(inserted.eventName).toBe('generation_failed');
      expect(inserted.requestId).toBe('req-fail-100');
      expect(inserted.errorCode).toBe('AI_PROVIDER_TIMEOUT');
      expect(inserted.analysisMode).toBe('text_only_fallback');
      expect(inserted.fallbackUsed).toBe(true);
    });

    it('sanitizes secret fields from event payloads', async () => {
      const dbMock = createDbMock();
      const mongoService = {
        db: jest.fn().mockResolvedValue(dbMock),
      } as unknown as MongoService;
      const service = new AnalyticsService(mongoService, null as never);

      await service.trackGenerationEvent({
        eventName: 'generation_completed',
        requestId: 'req-secret-check',
        authorization: 'Bearer secret-jwt-token',
        apiKey: 'sk-1234567890',
        password: 'my-secret-password',
        provider: 'openai',
      } as unknown as Parameters<typeof service.trackGenerationEvent>[0]);

      const inserted = dbMock.usageEventsCollection.insertOne.mock
        .calls[0][0] as Record<string, unknown>;
      expect(inserted.authorization).toBeUndefined();
      expect(inserted.apiKey).toBeUndefined();
      expect(inserted.password).toBeUndefined();
      expect(inserted.provider).toBe('openai');
    });

    it('analytics persistence failure logs warning with requestId and does not throw', async () => {
      const dbMock = createDbMock();
      dbMock.usageEventsCollection.insertOne.mockRejectedValue(
        new Error('Mongo connection lost'),
      );
      const mongoService = {
        db: jest.fn().mockResolvedValue(dbMock),
      } as unknown as MongoService;
      const service = new AnalyticsService(mongoService, null as never);

      await expect(
        service.trackGenerationEvent({
          eventName: 'generation_completed',
          requestId: 'req-db-fail',
          generationRunId: 'gen-123',
        }),
      ).resolves.toEqual({ ok: true });
    });
  });
});
