import { Injectable } from '@nestjs/common';
import type { OpportunityScoringInput } from '../types/opportunity.types';
import { clampScore, normalizeText } from './scorer.utils';

@Injectable()
export class NicheMatchScorer {
  score(input: OpportunityScoringInput): number {
    const niche = normalizeText(input.candidate.detectedNiche ?? 'general');
    const topic = normalizeText(input.candidate.detectedTopic ?? 'general');
    const text = normalizeText(input.candidate.text);
    const targets = (
      input.userContext?.targetNiches?.length
        ? input.userContext.targetNiches
        : ['anime_manga', 'anime', 'football', 'ai-tech', 'tech', 'business']
    ).map(normalizeText);

    if (niche === 'general' && topic === 'general') return 35;
    if (
      targets.some(
        (target) =>
          target === niche || niche.includes(target) || target.includes(niche),
      )
    ) {
      return 95;
    }
    if (
      targets.some(
        (target) =>
          text.includes(target.replace('-', ' ')) || topic.includes(target),
      )
    ) {
      return 82;
    }
    if (niche !== 'general') return 62;
    return clampScore(30);
  }
}
