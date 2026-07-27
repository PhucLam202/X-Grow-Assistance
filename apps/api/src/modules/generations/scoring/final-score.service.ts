import { Injectable } from '@nestjs/common';
import type {
  CandidateSelfScore,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import { RuleScoringService } from './rule-scoring.service';
import { ScoringFeatureExtractor } from './scoring-feature.extractor';
import {
  SELF_SCORE_BLEND,
  SELF_SCORE_WEIGHTS,
  type CandidateScoringInput,
  type ScoredCandidate,
} from './scoring.types';

/**
 * Chấm điểm cuối cho từng candidate.
 *
 * Không có LLM call thứ hai. `modelSelfScore` là dữ liệu Phase 4 đã trả kèm
 * trong cùng một call — nếu thiếu, công thức rơi về `rule_only` chứ không đợi
 * ai chấm hộ.
 */
@Injectable()
export class FinalScoreService {
  constructor(
    private readonly extractor: ScoringFeatureExtractor,
    private readonly ruleScoring: RuleScoringService,
  ) {}

  scoreAll(input: CandidateScoringInput): ScoredCandidate[] {
    return input.candidates.map((candidate) => this.scoreOne(candidate, input));
  }

  private scoreOne(
    candidate: GeneratedCandidate,
    input: CandidateScoringInput,
  ): ScoredCandidate {
    const penaltyCodes = input.penalties
      .filter((penalty) => penalty.candidateId === candidate.id)
      .map((penalty) => penalty.code);

    const visionAligned =
      input.visionAlignment.find((entry) => entry.candidateId === candidate.id)
        ?.aligned ?? false;

    // `selfScore` bị bỏ khỏi object trước khi vào extractor — xem
    // `CandidateForFeatures`.
    const { selfScore, ...forFeatures } = candidate;

    const features = this.extractor.extract({
      candidate: forFeatures,
      postContext: input.postContext,
      visionContext: input.visionContext,
      nichePolicy: input.nichePolicy,
      userStyle: input.userStyle,
      visionAligned,
      penaltyCodes,
    });

    const { ruleScore, reasons } = this.ruleScoring.score(
      features,
      penaltyCodes,
    );

    const modelSelfScore = aggregateSelfScore(selfScore);
    const scoreReasons = [...reasons];

    let finalScore: number;
    let scoringMethod: ScoredCandidate['scoringMethod'];

    if (modelSelfScore === undefined) {
      finalScore = ruleScore;
      scoringMethod = 'rule_only';
      scoreReasons.push(
        'The model returned no self-score, so only rule scoring was used.',
      );
    } else {
      finalScore =
        ruleScore * SELF_SCORE_BLEND.rule +
        modelSelfScore * SELF_SCORE_BLEND.selfScore;
      scoringMethod = 'rule_plus_self_score';
      scoreReasons.push(
        `Blended with the model's own score (${modelSelfScore.toFixed(2)}).`,
      );
    }

    return {
      ...candidate,
      scores: {
        ...features,
        ruleScore,
        ...(modelSelfScore === undefined ? {} : { modelSelfScore }),
        finalScore: clamp(finalScore),
      },
      scoringMethod,
      scoreReasons,
      visionAligned,
    };
  }
}

/**
 * Gộp 3 chiều self-score thành một số.
 *
 * `undefined` vào thì `undefined` ra — đó là toàn bộ lý do `selfScore` được để
 * optional ở Phase 4: "model không tự chấm" khác hẳn "model chấm 0.5".
 */
export function aggregateSelfScore(
  selfScore?: CandidateSelfScore,
): number | undefined {
  if (!selfScore) return undefined;

  const value =
    selfScore.postFit * SELF_SCORE_WEIGHTS.postFit +
    selfScore.naturalness * SELF_SCORE_WEIGHTS.naturalness +
    selfScore.empathyFit * SELF_SCORE_WEIGHTS.empathyFit;

  return Number.isFinite(value) ? clamp(value) : undefined;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
