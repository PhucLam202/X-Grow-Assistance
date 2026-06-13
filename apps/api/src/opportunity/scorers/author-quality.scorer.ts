import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { clampScore, safeNumber } from './scorer.utils';

@Injectable()
export class AuthorQualityScorer {
  score(input: OpportunityScoringInput): number {
    let score = 48;
    if (input.candidate.username) score += 12;
    if (input.candidate.authorName) score += 8;
    if (input.candidate.postUrl) score += 6;

    const metrics = input.candidate.metrics;
    if (metrics) {
      const totalEngagement =
        safeNumber(metrics.likes) +
        safeNumber(metrics.replies) +
        safeNumber(metrics.reposts);
      if (totalEngagement >= 100) score += 8;
      if (totalEngagement >= 1000) score += 10;
      if (safeNumber(metrics.views) >= 10000) score += 8;
    }

    return clampScore(score);
  }
}
