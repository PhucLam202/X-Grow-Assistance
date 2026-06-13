import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { clampScore, normalizeText } from './scorer.utils';

const GENERIC_PATTERNS = [
  /^(nice|cool|great|wow|amazing|interesting|true|facts)[.!]*$/,
  /\b(check dm|follow me|giveaway|airdrop|free money|100x|guaranteed)\b/,
  /🔥{3,}|😂{3,}|🚀{3,}/,
];

@Injectable()
export class SpamRiskScorer {
  score(input: OpportunityScoringInput): number {
    const text = normalizeText(input.candidate.text);
    let score = 18;

    if (text.length < 20 && !input.candidate.mediaCount) score += 24;
    if (text.length > 900) score += 12;
    if (GENERIC_PATTERNS.some((pattern) => pattern.test(text))) score += 34;
    if (input.candidate.contentType === 'image' && !text) score += 16;
    if (
      input.userContext?.recentUsedComments?.some((comment) =>
        normalizeText(comment).includes(text.slice(0, 40)),
      )
    ) {
      score += 24;
    }

    return clampScore(score);
  }
}
