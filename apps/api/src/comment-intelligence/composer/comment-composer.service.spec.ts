import { AiReplyPackService } from '../../ai/ai-reply-pack.service';
import { CommentComposerService } from './comment-composer.service';
import { CommentQualityRankerService } from './comment-quality-ranker.service';
import { CommentStyleMapperService } from './comment-style-mapper.service';
import { DriverDecisionReplyPackAdapterService } from './driver-decision-reply-pack-adapter.service';

describe('CommentComposerService', () => {
  it('returns deterministic fallback candidates when AI generation fails', async () => {
    const styleMapper = new CommentStyleMapperService();
    const service = new CommentComposerService(
      styleMapper,
      new DriverDecisionReplyPackAdapterService(styleMapper),
      {
        generateReplyPack: jest
          .fn()
          .mockRejectedValue(new Error('missing api key')),
      } as unknown as AiReplyPackService,
      new CommentQualityRankerService(),
      null as never,
    );

    const result = await service.compose({
      input: {
        platform: 'x',
        mainPost: { text: 'Thread: a React stale closure caused this bug.' },
        extraction: { confidence: 0.91, warnings: [], missingFields: [] },
      },
      decision: {
        zone: 'technical_insight',
        intent: 'share_insight',
        shouldComment: true,
        recommendedLanguage: 'en',
        recommendedTone: 'insightful',
        recommendedDepth: 'deep',
        commentStrategy: 'Add a useful technical angle.',
        avoid: [],
        requiredTools: [],
        needsContextExpansion: false,
        contextReasons: [],
        decisionStage: 'final',
        confidence: 0.91,
        warnings: [],
      },
    });

    expect(result.bestPick).not.toBeNull();
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(
      result.warnings.some((warning) =>
        warning.startsWith('composer_ai_generation_failed'),
      ),
    ).toBe(true);
  });
});
