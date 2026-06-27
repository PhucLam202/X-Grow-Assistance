import { Injectable } from '@nestjs/common';
import {
  CommentDepth,
  ComposerInput,
  ComposerOutput,
  GeneratedComment,
} from '../types/comment-intelligence.types';

@Injectable()
export class CommentQualityRankerService {
  rank(
    composerInput: ComposerInput,
    candidates: GeneratedComment[],
  ): ComposerOutput {
    const warnings = [...composerInput.decision.warnings];
    const ranked = candidates
      .map((candidate) => this.rescore(composerInput, candidate))
      .sort((left, right) => right.score - left.score);

    if (ranked.length === 0) {
      return {
        bestPick: null,
        alternatives: [],
        warnings: [...warnings, 'composer_no_candidates'],
      };
    }

    const bestPick = { ...ranked[0], label: 'bestPick' };
    return {
      bestPick,
      alternatives: ranked.slice(1, 4),
      warnings,
    };
  }

  private rescore(
    input: ComposerInput,
    candidate: GeneratedComment,
  ): GeneratedComment {
    const text = candidate.text.trim();
    const lower = text.toLowerCase();
    let score = candidate.score;
    const penalties: string[] = [];

    if (/^(nice|great post|cool|wow|true|facts|love this)[.!]*$/i.test(text)) {
      score -= 35;
      penalties.push('too_generic');
    }

    if (/thanks for sharing|great post|so inspiring/i.test(text)) {
      score -= 25;
      penalties.push('generic_phrase');
    }

    if (this.isTooLong(text, input.decision.recommendedDepth)) {
      score -= 18;
      penalties.push('too_long_for_depth');
    }

    for (const avoid of input.decision.avoid) {
      if (avoid && lower.includes(avoid.toLowerCase())) {
        score -= 20;
        penalties.push('avoid_rule_match');
      }
    }

    if (candidate.risk === 'high') score -= 25;
    if (candidate.risk === 'medium') score -= 10;
    if (candidate.style === 'question' && text.includes('?')) score += 5;
    if (candidate.style === 'value_add' && text.length > 30) score += 4;
    if (input.decision.recommendedDepth === 'short' && text.length <= 80)
      score += 5;

    return {
      ...candidate,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reason:
        penalties.length > 0
          ? `${candidate.reason}; penalties=${penalties.join(',')}`
          : candidate.reason,
    };
  }

  private isTooLong(text: string, depth: CommentDepth): boolean {
    if (depth === 'short') return text.length > 120;
    if (depth === 'medium') return text.length > 220;
    return text.length > 360;
  }
}
