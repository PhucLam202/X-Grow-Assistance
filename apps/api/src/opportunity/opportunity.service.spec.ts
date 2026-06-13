import { FeedIntelligenceService } from '../feed-intelligence/feed-intelligence.service';
import { TopOpportunitiesSelector } from './selectors/top-opportunities.selector';
import { OpportunityService } from './opportunity.service';

describe('OpportunityService', () => {
  const service = new OpportunityService(
    { getSnapshot: jest.fn() } as unknown as FeedIntelligenceService,
    new TopOpportunitiesSelector(),
  );

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
