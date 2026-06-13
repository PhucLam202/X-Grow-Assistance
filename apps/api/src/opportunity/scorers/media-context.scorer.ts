import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { clampScore, keywordScore, normalizeText } from './scorer.utils';

const MEDIA_CONTEXT_PATTERNS = [
  /meme|😂|🤣|笑|ｗｗ|lol|lmao/,
  /chart|graph|screenshot|infographic|panel|manga|anime|before|after/,
  /image|photo|look at|visual|design|ui|ranking|tier list/,
];

@Injectable()
export class MediaContextScorer {
  score(input: OpportunityScoringInput): number {
    const mediaCount =
      input.candidate.mediaCount ?? input.candidate.media?.length ?? 0;
    if (mediaCount === 0) return 28;

    const text = normalizeText(input.candidate.text);
    let score = keywordScore(text, MEDIA_CONTEXT_PATTERNS, 14, 56);
    if (input.candidate.contentType === 'image_meme_candidate') score += 20;
    if (input.candidate.contentType === 'mixed') score += 12;
    if (mediaCount > 1) score += 8;

    return clampScore(score);
  }
}
