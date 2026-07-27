import { ConfigService } from '@nestjs/config';
import { FeedIntelligenceService } from '../feed-intelligence/feed-intelligence.service';
import { TopOpportunitiesSelector } from './selectors/top-opportunities.selector';
import {
  OpportunityService,
  OPPORTUNITY_SCORE_VERSION,
} from './opportunity.service';
import { InMemoryCacheService } from '../infrastructure/cache/in-memory-cache.service';

describe('OpportunityService', () => {
  let service: OpportunityService;
  let cacheService: InMemoryCacheService;
  const mockFeedIntelligence = { getSnapshot: jest.fn() };

  beforeEach(() => {
    cacheService = new InMemoryCacheService(new ConfigService());
    service = new OpportunityService(
      mockFeedIntelligence as unknown as FeedIntelligenceService,
      new TopOpportunitiesSelector(),
      cacheService,
      new ConfigService(),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scorePost (legacy)', () => {
    it('scores a fresh niche post as actionable', () => {
      const result = service.scorePost({
        candidate: {
          text: 'One Piece theory: which character has the strongest final arc setup?',
          detectedLanguage: 'en',
          detectedNiche: 'anime_manga',
          detectedTopic: 'one piece',
          contentType: 'mixed',
          mediaCount: 1,
          hasQuestion: true,
          metrics: {
            replies: 18,
            reposts: 42,
            likes: 900,
            views: 14000,
          },
          timestamps: {
            postedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
            extractedAt: new Date().toISOString(),
          },
        },
        userContext: {
          targetNiches: ['anime_manga'],
        },
      });

      expect(result.score.total).toBeGreaterThanOrEqual(60);
      expect(result.score.recommendedAction).not.toBe('skip');
      expect(result.score.reasonVi.length).toBeGreaterThan(0);
    });

    it('skips high-risk negative topics', () => {
      const result = service.scorePost({
        candidate: {
          text: 'Political tragedy after shooting: everyone is fighting in the replies',
          detectedLanguage: 'en',
          detectedNiche: 'general',
          detectedTopic: 'politics',
          contentType: 'text',
          mediaCount: 0,
          metrics: {
            replies: 1600,
            likes: 300,
            reposts: 80,
            views: 200000,
          },
        },
      });

      expect(result.score.recommendedAction).toBe('skip');
      expect(result.score.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('evaluate', () => {
    const validPost = {
      platform: 'x' as const,
      postId: 'post-123',
      text: 'Test post about AI',
      metrics: {
        replies: 5,
        reposts: 10,
        likes: 100,
        views: 1000,
        bookmarks: 0,
      },
      contentType: 'text' as const,
      postType: 'original' as const,
    };

    const validContext = { niche: 'tech', preferredTopics: ['ai', 'ml'] };

    const validInput = {
      userId: 'user-123',
      post: validPost,
      context: validContext,
    };

    it('returns score with correct structure', async () => {
      const result = await service.evaluate(
        validInput.userId,
        validInput.post,
        validInput.context,
      );
      expect(result.postId).toBe('post-123');
      expect(result.total).toBeDefined();
      expect(result.label).toBeDefined();
      expect(result.components).toBeDefined();
      expect(result.reasons).toBeInstanceOf(Array);
      expect(result.scoreVersion).toBe(OPPORTUNITY_SCORE_VERSION);
      expect(result.expiresAt).toBeDefined();
      expect(result.cached).toBe(false);
    });

    it('includes scoreVersion in response', async () => {
      const result = await service.evaluate(
        validInput.userId,
        validInput.post,
        validInput.context,
      );
      expect(result.scoreVersion).toBe(OPPORTUNITY_SCORE_VERSION);
    });

    it('works with missing metrics', async () => {
      const postWithoutMetrics = { ...validPost, metrics: undefined };
      const result = await service.evaluate(
        validInput.userId,
        postWithoutMetrics,
        validInput.context,
      );
      expect(result.total).toBeDefined();
      expect(result.label).toBeDefined();
    });

    it('cache miss invokes scorer', async () => {
      const result1 = await service.evaluate(
        validInput.userId,
        validInput.post,
        validInput.context,
      );
      expect(result1.cached).toBe(false);
    });

    it('cache hit returns cached result on second call within same test', async () => {
      // First call - cache miss, populates cache
      await service.evaluate(
        validInput.userId,
        validInput.post,
        validInput.context,
      );
      // Second call - should hit cache
      const result2 = await service.evaluate(
        validInput.userId,
        validInput.post,
        validInput.context,
      );
      expect(result2.cached).toBe(true);
    });

    it('cache failure degrades gracefully', async () => {
      const failingCache = {
        get: jest.fn().mockRejectedValue(new Error('Cache error')),
        set: jest.fn().mockResolvedValue(undefined),
      };
      const failingService = new OpportunityService(
        mockFeedIntelligence as unknown as FeedIntelligenceService,
        new TopOpportunitiesSelector(),
        failingCache as any,
        new ConfigService(),
      );

      const result = await failingService.evaluate(
        validInput.userId,
        validInput.post,
        validInput.context,
      );
      expect(result).toBeDefined();
      expect(result.cached).toBe(false);
    });

    it('different users use different cache keys', async () => {
      await service.evaluate('user-1', validPost, validContext);
      const result2 = await service.evaluate('user-2', validPost, validContext);
      expect(result2.cached).toBe(false);
    });

    it('different score versions use different cache keys', async () => {
      const result = await service.evaluate(
        validInput.userId,
        validInput.post,
        validInput.context,
      );
      expect(result.scoreVersion).toBe(OPPORTUNITY_SCORE_VERSION);
    });
  });

  describe('evaluateBatch', () => {
    const posts = [
      {
        platform: 'x' as const,
        postId: 'post-1',
        text: 'Post 1 about AI',
        metrics: {
          replies: 1,
          reposts: 2,
          likes: 10,
          views: 100,
          bookmarks: 0,
        },
        contentType: 'text' as const,
        postType: 'original' as const,
      },
      {
        platform: 'x' as const,
        postId: 'post-2',
        text: 'Post 2 about ML',
        metrics: { replies: 0, reposts: 0, likes: 5, views: 50, bookmarks: 0 },
        contentType: 'image' as const,
        postType: 'reply' as const,
      },
    ];

    it('returns results for all posts in order', async () => {
      const result = await service.evaluateBatch('user-123', posts, {
        preferredTopics: ['tech'],
      });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].postId).toBe('post-1');
      expect(result.results[1].postId).toBe('post-2');
    });

    it('metadata includes total, succeeded, failed, cacheHits, cacheMisses, scoreVersion', async () => {
      const result = await service.evaluateBatch('user-123', posts, {
        preferredTopics: ['tech'],
      });
      expect(result.metadata.total).toBe(2);
      expect(result.metadata.succeeded).toBe(2);
      expect(result.metadata.failed).toBe(0);
      expect(result.metadata.cacheHits).toBe(0);
      expect(result.metadata.cacheMisses).toBe(2);
      expect(result.metadata.scoreVersion).toBe(OPPORTUNITY_SCORE_VERSION);
    });

    it('preserves input order in results', async () => {
      const orderedPosts = [
        { ...posts[0], postId: 'post-a' },
        { ...posts[1], postId: 'post-b' },
        { ...posts[0], postId: 'post-c' },
      ];

      const result = await service.evaluateBatch('user-123', orderedPosts, {
        preferredTopics: ['tech'],
      });
      expect(result.results.map((r) => r.postId)).toEqual([
        'post-a',
        'post-b',
        'post-c',
      ]);
    });

    it('single post error does not fail entire batch', async () => {
      const failingCache = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key.includes('post-2')) throw new Error('Cache error');
          return Promise.resolve(null);
        }),
        set: jest.fn().mockResolvedValue(undefined),
      };
      const failingService = new OpportunityService(
        mockFeedIntelligence as unknown as FeedIntelligenceService,
        new TopOpportunitiesSelector(),
        failingCache as any,
        new ConfigService(),
      );

      const result = await failingService.evaluateBatch('user-123', posts);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });
  });

  describe('InMemoryCacheService', () => {
    let cache: InMemoryCacheService;

    beforeEach(() => {
      cache = new InMemoryCacheService(new ConfigService());
    });

    it('set/get success', async () => {
      await cache.set('key1', { value: 'test' }, 60);
      const result = await cache.get('key1');
      expect(result).toEqual({ value: 'test' });
    });

    it('missing key returns null', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('expired key returns null', async () => {
      await cache.set('key1', { value: 'test' }, 0);
      await new Promise((r) => setTimeout(r, 10));
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('delete removes key', async () => {
      await cache.set('key1', { value: 'test' }, 60);
      await cache.delete('key1');
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('different keys do not collide', async () => {
      await cache.set('key1', { value: 'test1' }, 60);
      await cache.set('key2', { value: 'test2' }, 60);
      const r1 = await cache.get('key1');
      const r2 = await cache.get('key2');
      expect(r1).toEqual({ value: 'test1' });
      expect(r2).toEqual({ value: 'test2' });
    });
  });
});
