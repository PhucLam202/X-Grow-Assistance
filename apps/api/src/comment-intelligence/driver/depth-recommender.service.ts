import { Injectable } from '@nestjs/common';
import {
  CommentDepth,
  CommentZone,
  DriverInput,
} from '../types/comment-intelligence.types';

@Injectable()
export class DepthRecommenderService {
  recommend(input: DriverInput, zone: CommentZone): CommentDepth {
    if (zone === 'technical_insight') return 'deep';
    if (zone === 'debate_hot_take' || zone === 'news_reaction') return 'medium';
    if (zone === 'low_context') return 'short';
    if ((input.authorContinuations?.length ?? 0) > 1) return 'medium';
    if ((input.mainPost.text?.length ?? 0) > 240) return 'medium';
    return 'short';
  }
}
