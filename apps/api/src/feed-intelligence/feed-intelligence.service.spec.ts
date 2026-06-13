import { LanguageDetectorService } from '../common/language/language-detector.service';
import { MongoService } from '../mongo/mongo.service';
import { FeedIntelligenceService } from './feed-intelligence.service';
import { StoredFeedSnapshot } from './types/feed-intelligence.types';

type UpdateOneCall = [
  { id: string },
  { $set: StoredFeedSnapshot },
  { upsert: true },
];

type FeedSnapshotsCollectionMock = {
  updateOne: jest.Mock<Promise<{ acknowledged: boolean }>, UpdateOneCall>;
  findOne: jest.Mock<Promise<StoredFeedSnapshot | null>, [{ id: string }]>;
};

describe('FeedIntelligenceService', () => {
  it('persists and reloads snapshots from Mongo', async () => {
    const storedSnapshot: StoredFeedSnapshot = {
      id: 'snap-1',
      source: 'x_home_feed',
      capturedAt: '2026-06-12T12:00:00.000Z',
      visiblePostCount: 1,
      acceptedPosts: 1,
      ignoredPosts: 0,
      candidates: [],
      createdAt: '2026-06-12T12:00:01.000Z',
    };

    const feedSnapshotsCollection: FeedSnapshotsCollectionMock = {
      updateOne: jest
        .fn<Promise<{ acknowledged: boolean }>, UpdateOneCall>()
        .mockResolvedValue({ acknowledged: true }),
      findOne: jest
        .fn<Promise<StoredFeedSnapshot | null>, [{ id: string }]>()
        .mockResolvedValue(storedSnapshot),
    };

    const dbMock = {
      collection: jest.fn().mockReturnValue(feedSnapshotsCollection),
    };

    const mongoService = {
      db: jest.fn().mockResolvedValue(dbMock),
    } as unknown as MongoService;

    const service = new FeedIntelligenceService(
      new LanguageDetectorService(),
      mongoService,
    );

    const submitResult = await service.submitSnapshot({
      snapshotId: 'snap-1',
      source: 'x_home_feed',
      capturedAt: '2026-06-12T12:00:00.000Z',
      visiblePostCount: 1,
      posts: [
        {
          localId: 'post-1',
          platform: 'x',
          postUrl: 'https://x.com/example/status/1',
          text: 'One Piece theory discussion?',
          media: [],
          detectedAt: '2026-06-12T12:00:00.000Z',
          source: 'feed_scan',
        },
      ],
    });

    expect(submitResult.snapshotId).toBe('snap-1');
    expect(dbMock.collection).toHaveBeenCalledWith('feed_snapshots');
    expect(feedSnapshotsCollection.updateOne).toHaveBeenCalledTimes(1);

    const [query, payload] = feedSnapshotsCollection.updateOne.mock.calls[0];
    expect(query).toEqual({ id: 'snap-1' });
    expect(payload.$set.id).toBe('snap-1');

    const reloadedService = new FeedIntelligenceService(
      new LanguageDetectorService(),
      mongoService,
    );

    const reloadedSnapshot = await reloadedService.getSnapshot('snap-1');
    expect(reloadedSnapshot).toMatchObject({ id: 'snap-1' });
    expect(reloadedSnapshot?.candidates).toHaveLength(0);
  });
});
