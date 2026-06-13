import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { clampScore, keywordScore, normalizeText } from './scorer.utils';

const HIGH_RISK_PATTERNS = [
  /\b(war|terror|terrorist|death|dead|killed|shooting|tragedy|disaster)\b/,
  /\b(politics|election|president|left wing|right wing|democrat|republican)\b/,
  /\b(racist|harassment|doxx|scam|fraud|misinformation|fake news)\b/,
  /\b(nsfl|graphic|abuse|assault)\b/,
];

@Injectable()
export class NegativeTopicRiskScorer {
  score(input: OpportunityScoringInput): number {
    const text = normalizeText(
      `${input.candidate.detectedTopic ?? ''} ${input.candidate.text}`,
    );
    return clampScore(keywordScore(text, HIGH_RISK_PATTERNS, 24, 6));
  }
}
