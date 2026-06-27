import { CommentQualityRankerService } from './comment-quality-ranker.service';
import {
  ComposerInput,
  GeneratedComment,
} from '../types/comment-intelligence.types';

const composerInput: ComposerInput = {
  input: {
    platform: 'x',
    mainPost: {
      text: 'React stale closure bug explained with a practical fix.',
    },
    extraction: { confidence: 0.9, warnings: [], missingFields: [] },
  },
  decision: {
    zone: 'technical_insight',
    intent: 'share_insight',
    shouldComment: true,
    recommendedLanguage: 'en',
    recommendedTone: 'insightful',
    recommendedDepth: 'medium',
    commentStrategy: 'Add a useful technical angle.',
    avoid: [],
    requiredTools: [],
    needsContextExpansion: false,
    contextReasons: [],
    decisionStage: 'final',
    confidence: 0.9,
    warnings: [],
  },
};

describe('CommentQualityRankerService', () => {
  it('downgrades generic comments and selects the specific candidate', () => {
    const ranker = new CommentQualityRankerService();
    const candidates: GeneratedComment[] = [
      {
        text: 'Great post',
        label: 'generic',
        style: 'safe',
        score: 95,
        reason: 'generic praise',
        risk: 'low',
      },
      {
        text: 'The stale closure angle is the part most people miss here.',
        label: 'specific',
        style: 'value_add',
        score: 82,
        reason: 'specific technical angle',
        risk: 'low',
      },
    ];

    const result = ranker.rank(composerInput, candidates);

    expect(result.bestPick?.text).toContain('stale closure');
    expect(result.bestPick?.score).toBeGreaterThan(
      result.alternatives[0].score,
    );
  });
});
