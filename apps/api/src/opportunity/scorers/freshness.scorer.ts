import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { normalizeText } from './scorer.utils';

@Injectable()
export class FreshnessScorer {
  score(input: OpportunityScoringInput): number {
    const ageMinutes = this.getAgeMinutes(input);
    if (ageMinutes === undefined) return 55;
    if (ageMinutes < 10) return 96;
    if (ageMinutes < 30) return 88;
    if (ageMinutes < 120) return 72;
    if (ageMinutes < 720) return 48;
    if (ageMinutes < 1440) return 32;
    return 18;
  }

  getAgeMinutes(input: OpportunityScoringInput): number | undefined {
    const postedAt = input.candidate.timestamps?.postedAt;
    if (postedAt) {
      const timestamp = Date.parse(postedAt);
      if (!Number.isNaN(timestamp)) {
        return Math.max(0, (Date.now() - timestamp) / 60_000);
      }
    }

    const postedAtText = normalizeText(
      input.candidate.timestamps?.postedAtText ?? '',
    );
    if (!postedAtText) return undefined;

    const relativeMatch = postedAtText.match(
      /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)/,
    );
    if (!relativeMatch) return undefined;

    const value = Number(relativeMatch[1]);
    const unit = relativeMatch[2];
    if (unit.startsWith('s')) return value / 60;
    if (unit.startsWith('m')) return value;
    if (unit.startsWith('h')) return value * 60;
    if (unit.startsWith('d')) return value * 1440;
    return undefined;
  }
}
