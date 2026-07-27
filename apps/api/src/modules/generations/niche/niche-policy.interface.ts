import type { Niche } from '../types/niche.types';
import type { CommentIntent, Tone } from '../types/style.types';

/**
 * Contract của Phase 3 — niche policy registry.
 *
 * `NichePolicy` là thứ tác giả policy viết tay ở `policies/<niche>.policy.ts`.
 * `ResolvedNichePolicy` là kết quả resolver trả về cho một request cụ thể;
 * nó `extends NichePolicy` nên gán thẳng được vào chỗ Phase 4 khai báo
 * `nichePolicy: NichePolicy`, mà vẫn mang theo metadata của lần resolve.
 */

export interface NichePolicyExample {
  /** Bài post mẫu (rút gọn). */
  post: string;
  /** Reply đúng giọng niche này. */
  goodReply: string;
  /** Reply AI-slop điển hình cần tránh. */
  badReply: string;
  /** Vì sao good hơn bad — 1 câu. */
  reason: string;
}

/**
 * Bản máy chạy được của một `safetyRules` entry.
 *
 * `safetyRules` là văn xuôi cho prompt — model đọc được, code thì không. Phase 5
 * cần reject deterministic (không được phép gọi LLM thứ hai), nên mỗi rule đáng
 * chặn phải có thêm một pattern ở đây. Không phải rule nào cũng dịch được thành
 * regex, và đó là bình thường: phần không dịch được vẫn còn hiệu lực qua prompt.
 */
export interface NicheSafetyPattern {
  /** `<niche>.<slug>`, unique toàn registry. Đi vào reject reason và log. */
  id: string;
  /** KHÔNG mang flag `g` — pattern được tái dùng qua nhiều lần gọi. */
  pattern: RegExp;
  /** Vì sao bị chặn, 1 câu. Hiển thị được cho người đọc log. */
  reason: string;
  /** `reject` loại candidate; `penalty` chỉ trừ điểm ở Phase 6. */
  severity: 'reject' | 'penalty';
}

export interface NichePolicy {
  niche: Niche;
  /** Semver. Bắt buộc — validator reject policy không có version. */
  version: string;
  description: string;
  vocabularyHints: string[];
  avoidPhrases: string[];
  allowedSlang: string[];
  recommendedTones: Tone[];
  recommendedIntents: CommentIntent[];
  /** Bắt buộc non-empty. */
  safetyRules: string[];
  /**
   * Optional: niche rủi ro thấp không cần pattern riêng — Phase 5 vẫn áp
   * `GLOBAL_SAFETY_PATTERNS` cho mọi niche.
   */
  safetyPatterns?: NicheSafetyPattern[];
  styleRules: string[];
  examples: NichePolicyExample[];
}

export interface ResolveNichePolicyInput {
  primaryNiche: Niche;
  secondaryNiches: Niche[];
  confidence: number;
  needsGenerationTimeClassification: boolean;
  /**
   * `NicheDetectionResult.evidence`. Optional để caller không có cascade result
   * vẫn resolve được. Dùng để giữ vocabulary context khi primary niche không có
   * policy đăng ký (rule doc: unknown niche → general, nhưng không mất ngữ cảnh).
   */
  evidence?: string[];
}

export type NichePolicyDegradeReason =
  | 'low_confidence'
  | 'needs_generation_time_classification';

export interface NichePolicyVersionRef {
  niche: Niche;
  version: string;
}

export interface ResolvedNichePolicy extends NichePolicy {
  /** Đã merge primary + secondary, dedupe theo `id`. Non-optional: Phase 5 luôn
   * lặp trên field này mà không phải kiểm undefined. */
  safetyPatterns: NicheSafetyPattern[];
  /** `niche` (kế thừa) là niche hiệu lực — tức `general` sau khi fallback. */
  requestedPrimaryNiche: Niche;
  appliedSecondaryNiches: Niche[];
  confidence: number;
  /** `crypto@1.0.0+tech@1.0.0|degraded` — ổn định, sort được, dùng làm cache key được. */
  resolvedVersion: string;
  policyVersions: NichePolicyVersionRef[];
  /** Primary niche không có policy đăng ký → đã fallback về `general`. */
  fallbackUsed: boolean;
  /** Confidence thấp hoặc còn chờ Phase 4 chốt niche. */
  degraded: boolean;
  degradeReasons: NichePolicyDegradeReason[];
  /**
   * Phase 4 được phép ghi đè niche. Rộng hơn `degraded`: sau khi fallback về
   * `general` thì niche vẫn là phỏng đoán kể cả confidence bằng 1.0.
   */
  provisional: boolean;
  /** Vocabulary rút từ `evidence`, giữ lại kể cả khi đã fallback về general. */
  contextVocabularyHints: string[];
}

/**
 * Ngưỡng giảm cấp policy theo confidence.
 *
 * ⚠️ KHÔNG xoá nhánh dùng hằng số này vì "không reachable".
 * Hiện tại `niche-confidence.service.ts` đặt `NICHE_ACCEPT_THRESHOLD = 0.8`, và
 * `needsGenerationTimeClassification = confidence < 0.8`, nên mọi confidence
 * dưới 0.7 đã bật cờ kia rồi. Nhánh này sống lại ở Phase 4: khi model tự chốt
 * niche và trả `nicheConfidence`, cờ `needsGenerationTimeClassification` được
 * gỡ nhưng confidence có thể vẫn thấp — lúc đó chỉ còn ngưỡng này giữ degrade.
 */
export const POLICY_DEGRADE_CONFIDENCE_THRESHOLD = 0.7;

/** Doc Phase 2 đã cap secondary ở 2; policy resolver cap lại cho độc lập. */
export const MAX_SECONDARY_POLICIES = 2;

/** Tone không mang slang cộng đồng. Dùng khi lần resolve bị degrade. */
export const NEUTRAL_TONES: readonly Tone[] = [
  'short_native',
  'question_based',
  'insightful',
  'casual_supportive',
];

export const DEGRADED_STYLE_RULE =
  'The niche is not confirmed. Prefer neutral, widely-readable wording and ' +
  'avoid community-specific slang or in-jokes.';
