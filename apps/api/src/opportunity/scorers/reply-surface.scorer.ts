import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { clampScore, keywordScore, normalizeText } from './scorer.utils';

const SURFACE_PATTERNS = [
  /\?/,
  /\b(why|how|what|which|should|would you|do you|agree|thoughts)\b/,
  /\b(rank|ranking|top \d+|tier list|prediction|hot take|unpopular opinion)\b/,
  /\b(before|after|vs|versus|compare|chart|graph|data)\b/,
  /\b(won|launched|built|hit|reached|milestone|congrats|achievement)\b/,
  /😂|🤣|笑|ｗｗ|lol|lmao/,
];

@Injectable()
export class ReplySurfaceScorer {
  score(input: OpportunityScoringInput): number {
    const text = normalizeText(input.candidate.text);
    const length = text.length;
    let score = keywordScore(text, SURFACE_PATTERNS, 12, 30);

    if (input.candidate.hasQuestion) score += 24;
    if (length >= 40 && length <= 280) score += 14;
    if (length > 280 && length <= 700) score += 8;
    if (length < 20 && !input.candidate.mediaCount) score -= 18;
    if (input.candidate.contentType === 'image_meme_candidate') score += 16;
    if (input.candidate.contentType === 'mixed') score += 10;

    return clampScore(score);
  }
}
