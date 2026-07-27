import type {
  CandidatePostContext,
  CandidateUserStyle,
  CandidateVisionContext,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import type {
  CandidatePenalty,
  VisionAlignment,
} from '../validation/validation.types';

/**
 * Contract của Phase 6 — hybrid scoring + ranking.
 *
 * Không có LLM call. `modelSelfScore` là thứ Phase 4 đã trả kèm miễn phí trong
 * cùng một call, không phải một lượt LLM Judge riêng.
 */

export interface ScoringFeatures {
  postFit: number;
  specificity: number;
  naturalness: number;
  nicheFit: number;
  empathyFit: number;
  conversationPotential: number;
  safetyScore: number;
  userStyleFit: number;
}

export type ScoringMethod = 'rule_only' | 'rule_plus_self_score';

export interface CandidateScores extends ScoringFeatures {
  ruleScore: number;
  /**
   * Gộp từ `candidate.selfScore`. Vắng mặt nghĩa là model không tự chấm điểm —
   * KHÔNG phải 0, và cũng không phải 0.5.
   */
  modelSelfScore?: number;
  finalScore: number;
}

export interface ScoredCandidate extends GeneratedCandidate {
  scores: CandidateScores;
  scoringMethod: ScoringMethod;
  /** Vì sao ra điểm đó — đọc được, đủ để trace một lựa chọn. */
  scoreReasons: string[];
  /** Candidate có bám vào chi tiết chỉ có trong ảnh (Phase 5). */
  visionAligned: boolean;
}

export interface CandidateScoringInput {
  postContext: CandidatePostContext;
  visionContext?: CandidateVisionContext;
  nichePolicy: ResolvedNichePolicy;
  userStyle?: CandidateUserStyle;
  candidates: GeneratedCandidate[];
  /** Từ Phase 5 — penalty và alignment. */
  penalties: CandidatePenalty[];
  visionAlignment: VisionAlignment[];
}

/**
 * Trọng số rule của doc Phase 6. Tổng đúng `1.0` — `rule-scoring.service.spec`
 * kiểm điều này để một lần sửa tay không âm thầm làm lệch thang điểm.
 */
export const RULE_WEIGHTS: Readonly<Record<keyof ScoringFeatures, number>> = {
  postFit: 0.22,
  specificity: 0.18,
  naturalness: 0.15,
  nicheFit: 0.13,
  empathyFit: 0.12,
  conversationPotential: 0.1,
  safetyScore: 0.05,
  userStyleFit: 0.05,
};

/**
 * Doc Phase 6 viết `ruleScore * 0.70 + modelSelfScore * 0.20 +
 * userPreferenceScore * 0.10`, nhưng `userPreferenceScore` không được định
 * nghĩa ở đâu trong doc và codebase không có nguồn dữ liệu nào cho nó
 * (`UserMemory` chỉ có preferredTones/blockedPhrases, và cả hai đã được tính
 * thành `userStyleFit` BÊN TRONG ruleScore rồi — cộng lần nữa là tính hai lần).
 *
 * Nên nó bị bỏ, và 0.70/0.20 được renormalize về tổng 1.0 theo đúng tỷ lệ cũ:
 *   0.70 / 0.90 = 0.7778 → 0.78
 *   0.20 / 0.90 = 0.2222 → 0.22
 */
export const SELF_SCORE_BLEND = { rule: 0.78, selfScore: 0.22 } as const;

/**
 * Trọng số gộp 3 chiều self-score thành một số. Giữ đúng tỷ lệ tương đối của
 * `RULE_WEIGHTS` giữa ba chiều đó (0.22 / 0.15 / 0.12, tổng 0.49) để hai thang
 * điểm nói cùng một ngôn ngữ.
 */
export const SELF_SCORE_WEIGHTS = {
  postFit: 0.45,
  naturalness: 0.31,
  empathyFit: 0.24,
} as const;

/**
 * Trừ bao nhiêu cho mỗi loại penalty của Phase 5.
 *
 * Penalty safety mức mềm KHÔNG có ở đây: chúng đã đi vào feature `safetyScore`.
 * Để ở cả hai chỗ là trừ hai lần cho cùng một lỗi.
 */
export const PENALTY_WEIGHTS: Readonly<Record<string, number>> = {
  cliche_phrase: 0.12,
  batch_opener_repetition: 0.06,
};

/** Penalty đã được `safetyScore` tính, `applyPenalties` phải bỏ qua. */
export const SAFETY_PENALTY_CODES: readonly string[] = [
  'niche_safety_soft',
  'global_safety_soft',
];

/** Penalty lạ (code mới thêm mà quên khai báo) vẫn phải trừ một chút. */
export const DEFAULT_PENALTY_WEIGHT = 0.05;
