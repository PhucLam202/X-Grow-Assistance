import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { FreshnessScorer } from './freshness.scorer';
import { clampScore, safeNumber } from './scorer.utils';

@Injectable()
export class CompetitionLevelScorer {
  constructor(private readonly freshnessScorer: FreshnessScorer) {}

  score(input: OpportunityScoringInput): number {
    const metrics = input.candidate.metrics;
    if (!metrics) return 45;

    const replies = safeNumber(metrics.replies);
    const views = safeNumber(metrics.views);
    const ageMinutes = this.freshnessScorer.getAgeMinutes(input);
    let score = 25;

    if (views > 0) score += Math.min(35, (replies / views) * 1800);
    if (replies > 50) score += 12;
    if (replies > 250) score += 18;
    if (replies > 1000) score += 25;
    if (ageMinutes !== undefined && ageMinutes > 120 && replies > 1000)
      score += 16;
    if (ageMinutes !== undefined && ageMinutes < 30 && replies < 50)
      score -= 16;

    return clampScore(score);
  }
}
