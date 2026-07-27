import { Injectable } from '@nestjs/common';

import type { NicheScore } from './niche.types';

/** At or above this, the niche is accepted and Phase 4 need not re-classify. */
export const NICHE_ACCEPT_THRESHOLD = 0.8;

/** Base confidence per evidence shape, before the score-gap adjustment. */
export const CONFIDENCE_BASE = {
  deterministic: 0.9,
  twoStrong: 0.85,
  strongPlusWeak: 0.75,
  oneStrong: 0.65,
  twoWeak: 0.55,
  singleWeak: 0.3,
} as const;

/** A clear winner is more trustworthy than a photo finish. */
export const GAP_BONUS = 0.05;
export const GAP_BONUS_THRESHOLD = 0.5;
export const GAP_PENALTY = 0.1;
export const GAP_PENALTY_THRESHOLD = 0.2;

/**
 * A secondary niche must be at least this fraction of the primary's score to be
 * worth mentioning at all.
 */
export const SECONDARY_SCORE_RATIO = 0.4;
export const MAX_SECONDARY_NICHES = 2;

@Injectable()
export class NicheConfidenceService {
  /**
   * Confidence for a lightweight (keyword) result.
   *
   * Encodes the doc's rule "never pick a niche off a single weak keyword": one
   * lone weak hit bottoms out at 0.30, far below the accept threshold, so the
   * request is flagged for Phase 4 instead of committing to a guess.
   */
  forLightweight(top: NicheScore, runnerUp?: NicheScore): number {
    return this.round(this.base(top) + this.gapAdjustment(top, runnerUp));
  }

  /** Deterministic signals start high but still respond to a muddy score gap. */
  forDeterministic(top?: NicheScore, runnerUp?: NicheScore): number {
    const adjustment = top ? this.gapAdjustment(top, runnerUp) : 0;
    return this.round(CONFIDENCE_BASE.deterministic + adjustment);
  }

  isConfident(confidence: number): boolean {
    return confidence >= NICHE_ACCEPT_THRESHOLD;
  }

  /**
   * "Has evidence" means one strong hit, or two weak hits corroborating each
   * other. A single weak keyword is noise.
   */
  hasMeaningfulEvidence(score: NicheScore): boolean {
    return score.strongHits >= 1 || score.weakHits >= 2;
  }

  /** Relative distance between the top two niches, in `[0, 1]`. */
  scoreGap(top: NicheScore, runnerUp?: NicheScore): number {
    if (!runnerUp || top.score <= 0) return 1;
    return Math.max(0, (top.score - runnerUp.score) / top.score);
  }

  selectSecondaries(scores: NicheScore[], primary: string): NicheScore[] {
    const primaryScore = scores.find((score) => score.niche === primary);
    if (!primaryScore) return [];

    return scores
      .filter((score) => score.niche !== primary)
      .filter((score) => score.strongHits >= 1)
      .filter(
        (score) => score.score >= primaryScore.score * SECONDARY_SCORE_RATIO,
      )
      .slice(0, MAX_SECONDARY_NICHES);
  }

  private base(top: NicheScore): number {
    if (top.strongHits >= 2) return CONFIDENCE_BASE.twoStrong;
    if (top.strongHits === 1 && top.weakHits >= 1)
      return CONFIDENCE_BASE.strongPlusWeak;
    if (top.strongHits === 1) return CONFIDENCE_BASE.oneStrong;
    if (top.weakHits >= 2) return CONFIDENCE_BASE.twoWeak;
    return CONFIDENCE_BASE.singleWeak;
  }

  private gapAdjustment(top: NicheScore, runnerUp?: NicheScore): number {
    const gap = this.scoreGap(top, runnerUp);
    if (gap >= GAP_BONUS_THRESHOLD) return GAP_BONUS;
    if (gap < GAP_PENALTY_THRESHOLD) return -GAP_PENALTY;
    return 0;
  }

  private round(confidence: number): number {
    return Number(Math.min(1, Math.max(0, confidence)).toFixed(2));
  }
}
