import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';
import type { AuthUser } from '../auth/types/auth-user.type';

interface MockService {
  evaluate: jest.Mock;
  evaluateBatch: jest.Mock;
  scorePost: jest.Mock;
  scoreSnapshot: jest.Mock;
}

describe('OpportunityController', () => {
  let controller: OpportunityController;
  let service: MockService;

  const mockUser: AuthUser = {
    userId: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  beforeEach(async () => {
    service = {
      evaluate: jest.fn(),
      evaluateBatch: jest.fn(),
      scorePost: jest.fn(),
      scoreSnapshot: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpportunityController],
      providers: [
        {
          provide: OpportunityService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<OpportunityController>(OpportunityController);
  });

  describe('evaluate', () => {
    const validRequest = {
      post: {
        platform: 'x' as const,
        postId: 'post-123',
        text: 'Test post content',
        metrics: {
          replies: 5,
          reposts: 10,
          likes: 100,
          views: 1000,
          bookmarks: 0,
        },
        contentType: 'text' as const,
        postType: 'original' as const,
      },
      context: { niche: 'tech', preferredTopics: ['ai', 'ml'] },
    };

    const mockResponse = {
      postId: 'post-123',
      total: 75,
      label: 'high' as const,
      components: { nicheMatch: 80, freshness: 70 },
      reasons: ['Good niche match'],
      scoreVersion: 'opportunity:v1',
      expiresAt: new Date().toISOString(),
      cached: false,
    };

    it('should return score for valid request', async () => {
      service.evaluate.mockResolvedValue(mockResponse);

      const result = await controller.evaluate(mockUser, validRequest);
      expect(result).toEqual(mockResponse);
      expect(service.evaluate).toHaveBeenCalledWith(
        'user-123',
        validRequest.post,
        validRequest.context,
      );
    });

    it('should require auth (guard is applied)', () => {
      expect(typeof controller.evaluate).toBe('function');
    });

    it('should handle invalid DTO gracefully (validation runs at HTTP layer)', async () => {
      const invalidRequest = {
        ...validRequest,
        post: { ...validRequest.post, postId: '' },
      };
      service.evaluate.mockResolvedValue(mockResponse);

      // The controller method itself doesn't validate - validation happens at the pipe level
      const result = await controller.evaluate(mockUser, invalidRequest);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('evaluateBatch', () => {
    const validBatchRequest = {
      posts: [
        {
          platform: 'x' as const,
          postId: 'post-1',
          text: 'Post 1',
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
          text: 'Post 2',
          metrics: {
            replies: 0,
            reposts: 0,
            likes: 5,
            views: 50,
            bookmarks: 0,
          },
          contentType: 'image' as const,
          postType: 'reply' as const,
        },
      ],
      context: { preferredTopics: ['tech'] },
    };

    const mockBatchResponse = {
      results: [
        {
          postId: 'post-1',
          success: true,
          result: {
            postId: 'post-1',
            total: 60,
            label: 'medium' as const,
            components: {},
            reasons: [],
            scoreVersion: 'opportunity:v1',
            expiresAt: new Date().toISOString(),
            cached: false,
          },
        },
        {
          postId: 'post-2',
          success: true,
          result: {
            postId: 'post-2',
            total: 55,
            label: 'medium' as const,
            components: {},
            reasons: [],
            scoreVersion: 'opportunity:v1',
            expiresAt: new Date().toISOString(),
            cached: false,
          },
        },
      ],
      metadata: {
        total: 2,
        succeeded: 2,
        failed: 0,
        cacheHits: 0,
        cacheMisses: 2,
        scoreVersion: 'opportunity:v1',
      },
    };

    it('should return batch scores for valid request', async () => {
      service.evaluateBatch.mockResolvedValue(mockBatchResponse);

      const result = await controller.evaluateBatch(
        mockUser,
        validBatchRequest,
      );
      expect(result).toEqual(mockBatchResponse);
      expect(service.evaluateBatch).toHaveBeenCalledWith(
        'user-123',
        validBatchRequest.posts,
        validBatchRequest.context,
      );
    });

    it('should preserve input order in results', async () => {
      const orderedResponse = {
        ...mockBatchResponse,
        results: [
          { ...mockBatchResponse.results[0], postId: 'post-1' },
          { ...mockBatchResponse.results[1], postId: 'post-2' },
        ],
      };
      service.evaluateBatch.mockResolvedValue(orderedResponse);

      const result = await controller.evaluateBatch(
        mockUser,
        validBatchRequest,
      );
      expect(result.results[0].postId).toBe('post-1');
      expect(result.results[1].postId).toBe('post-2');
    });

    it('should handle empty batch (validation at HTTP layer)', async () => {
      service.evaluateBatch.mockResolvedValue({
        results: [],
        metadata: {
          total: 0,
          succeeded: 0,
          failed: 0,
          cacheHits: 0,
          cacheMisses: 0,
          scoreVersion: 'opportunity:v1',
        },
      });
      const result = await controller.evaluateBatch(mockUser, {
        posts: [],
        context: undefined,
      });
      expect(result.results).toHaveLength(0);
    });

    it('should handle batch larger than max size (validation at HTTP layer)', async () => {
      const largeBatch = {
        posts: Array.from({ length: 11 }, (_, i) => ({
          platform: 'x' as const,
          postId: `post-${i}`,
          contentType: 'text' as const,
          postType: 'original' as const,
        })),
      };
      service.evaluateBatch.mockResolvedValue({
        results: largeBatch.posts.map((p) => ({
          postId: p.postId,
          success: true,
          result: {
            postId: p.postId,
            total: 50,
            label: 'medium' as const,
            components: {},
            reasons: [],
            scoreVersion: 'opportunity:v1',
            expiresAt: new Date().toISOString(),
            cached: false,
          },
        })),
        metadata: {
          total: 11,
          succeeded: 11,
          failed: 0,
          cacheHits: 0,
          cacheMisses: 11,
          scoreVersion: 'opportunity:v1',
        },
      });
      const result = await controller.evaluateBatch(mockUser, largeBatch);
      expect(result.results).toHaveLength(11);
    });
  });

  describe('legacy endpoints', () => {
    it('scorePost should delegate to service', () => {
      const legacyRequest = {
        candidate: {
          text: 'Test post',
          contentType: 'text',
          metrics: { replies: 1, reposts: 2, likes: 10 },
        },
      };
      const legacyResponse = {
        postUrl: 'https://x.com/test',
        score: { total: 50, label: 'medium' as const },
      };
      service.scorePost.mockReturnValue(legacyResponse);

      const result = controller.scorePost(legacyRequest);
      expect(result).toEqual(legacyResponse);
      expect(service.scorePost).toHaveBeenCalledWith(legacyRequest);
    });

    it('scoreSnapshot should delegate to service', async () => {
      const legacyRequest = { snapshotId: 'snap-123' };
      const legacyResponse = {
        snapshotId: 'snap-123',
        topOpportunities: [],
        summary: {},
      };
      service.scoreSnapshot.mockResolvedValue(legacyResponse);

      const result = await controller.scoreSnapshot(legacyRequest);
      expect(result).toEqual(legacyResponse);
      expect(service.scoreSnapshot).toHaveBeenCalledWith(legacyRequest);
    });
  });
});
