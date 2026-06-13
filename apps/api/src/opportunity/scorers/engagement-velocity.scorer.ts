import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { FreshnessScorer } from './freshness.scorer';
import { clampScore, safeNumber } from './scorer.utils';

@Injectable()
export class EngagementVelocityScorer {
  constructor(private readonly freshnessScorer: FreshnessScorer) {}

  score(input: OpportunityScoringInput): number {
    const metrics = input.candidate.metrics;
    if (!metrics)
      return input.candidate.feedScore
        ? clampScore(input.candidate.feedScore * 0.65)
        : 42;

    const ageMinutes = Math.max(
      this.freshnessScorer.getAgeMinutes(input) ?? 90,
      1,
    );
    const weightedEngagement =
      safeNumber(metrics.likes) +
      safeNumber(metrics.replies) * 2 +
      safeNumber(metrics.reposts) * 3;
    const engagementVelocity = weightedEngagement / ageMinutes;
    const viewVelocity =
      metrics.views !== undefined ? safeNumber(metrics.views) / ageMinutes : 0;
    const velocityScore =
      Math.log10(engagementVelocity + 1) * 32 +
      Math.log10(viewVelocity + 1) * 12;

    return clampScore(velocityScore);
  }
}
