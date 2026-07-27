/**
 * Nguồn chân lý duy nhất cho danh sách niche.
 *
 * Thêm niche mới = thêm 1 key ở đây, rồi tạo policy tương ứng ở
 * `src/modules/generations/niche/policies/<niche>.policy.ts` (Phase 3).
 * Không định nghĩa lại danh sách niche ở bất kỳ file nào khác.
 */
export const NICHES = [
  'general',
  'tech',
  'ai_ml',
  'crypto',
  'business',
  'startup',
  'career',
  'anime_manga',
  'gaming',
  'football',
  'news',
  'health_fitness',
  'finance_personal',
  'education',
  'travel',
  'food',
  'music',
  'movies_tv',
  'science',
  'productivity',
] as const;

export type Niche = (typeof NICHES)[number];

/** Giá trị user chọn ở UI: một niche cụ thể hoặc để hệ thống tự phát hiện. */
export const NICHE_SELECTIONS = ['auto', ...NICHES] as const;

export type NicheSelection = (typeof NICHE_SELECTIONS)[number];

/** Dùng khi cascade detection (Phase 2) không chốt được niche nào. */
export const DEFAULT_NICHE: Niche = 'general';

export function isNiche(value: unknown): value is Niche {
  return (NICHES as readonly unknown[]).includes(value);
}

export function isNicheSelection(value: unknown): value is NicheSelection {
  return (NICHE_SELECTIONS as readonly unknown[]).includes(value);
}

/**
 * @deprecated Dùng `NICHE_SELECTIONS`. Giữ lại cho các import cũ trong giai đoạn transition.
 */
export const COMMENT_NICHES = NICHE_SELECTIONS;

/**
 * @deprecated Dùng `NicheSelection`.
 */
export type CommentNiche = NicheSelection;
