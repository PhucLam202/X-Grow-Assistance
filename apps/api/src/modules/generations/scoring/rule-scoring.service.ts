import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PENALTY_WEIGHT,
  PENALTY_WEIGHTS,
  RULE_WEIGHTS,
  SAFETY_PENALTY_CODES,
  type ScoringFeatures,
} from './scoring.types';

export interface RuleScoreResult {
  ruleScore: number;
  reasons: string[];
}

/** Feature dưới mức này thì đáng nói ra trong `scoreReasons`. */
const WEAK_FEATURE_THRESHOLD = 0.45;

/** Feature trên mức này cũng vậy — nhưng theo hướng ngược lại. */
const STRONG_FEATURE_THRESHOLD = 0.75;

/**
 * Tổng có trọng số của 8 feature, rồi trừ penalty của Phase 5.
 *
 * `scoreReasons` không phải log cho vui: nó là thứ duy nhất giải thích được vì
 * sao candidate A thắng candidate B sau khi request đã trả về, và nó đi thẳng
 * vào `whyItWorks` của response.
 */
@Injectable()
export class RuleScoringService {
  score(features: ScoringFeatures, penaltyCodes: string[]): RuleScoreResult {
    let total = 0;

    for (const [key, weight] of Object.entries(RULE_WEIGHTS)) {
      total += features[key as keyof ScoringFeatures] * weight;
    }

    const reasons = this.explain(features);
    const penalty = this.applyPenalties(penaltyCodes, reasons);

    return { ruleScore: clamp(total - penalty), reasons };
  }

  private explain(features: ScoringFeatures): string[] {
    const reasons: string[] = [];

    // Xếp theo trọng số giảm dần: lý do đầu tiên luôn là thứ ảnh hưởng nhiều
    // nhất tới điểm, không phải thứ tình cờ đứng trước trong object.
    const ordered = (
      Object.keys(RULE_WEIGHTS) as Array<keyof ScoringFeatures>
    ).sort((a, b) => RULE_WEIGHTS[b] - RULE_WEIGHTS[a]);

    for (const key of ordered) {
      const value = features[key];
      if (value >= STRONG_FEATURE_THRESHOLD) {
        reasons.push(`${LABELS[key]} is strong (${value.toFixed(2)}).`);
      } else if (value < WEAK_FEATURE_THRESHOLD) {
        reasons.push(`${LABELS[key]} is weak (${value.toFixed(2)}).`);
      }
    }

    return reasons;
  }

  private applyPenalties(codes: string[], reasons: string[]): number {
    let penalty = 0;

    for (const code of codes) {
      // Safety mềm đã nằm trong feature `safetyScore` — trừ lần nữa là tính hai
      // lần cho một lỗi.
      if (SAFETY_PENALTY_CODES.includes(code)) continue;

      const weight = PENALTY_WEIGHTS[code] ?? DEFAULT_PENALTY_WEIGHT;
      penalty += weight;
      reasons.push(`Penalty ${code} (-${weight.toFixed(2)}).`);
    }

    return penalty;
  }
}

const LABELS: Readonly<Record<keyof ScoringFeatures, string>> = {
  postFit: 'Fit with the post',
  specificity: 'Specificity',
  naturalness: 'Naturalness',
  nicheFit: 'Niche voice',
  empathyFit: 'Empathy',
  conversationPotential: 'Conversation potential',
  safetyScore: 'Safety',
  userStyleFit: 'Match with your style',
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
