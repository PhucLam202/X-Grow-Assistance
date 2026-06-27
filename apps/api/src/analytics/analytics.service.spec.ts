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
      service.track({
        deviceId: 'device-1',
        eventName: 'copy_clicked',
        platform: 'x',
        postUrl: 'https://x.com/example/status/1',
      }, 'user-1'),
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
});
