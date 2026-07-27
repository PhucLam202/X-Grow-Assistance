/**
 * Các style dimension ổn định của một reply (hiếm khi thêm giá trị mới).
 * `Niche` cố tình nằm riêng ở `niche.types.ts` vì tần suất thay đổi cao hơn hẳn.
 */

export const TONES = [
  'short_native',
  'casual_supportive',
  'question_based',
  'insightful',
  'funny_light',
  'anime_fan',
  'crypto_casual',
  'football_fan',
  'congratulation',
] as const;

export type Tone = (typeof TONES)[number];

export const TONE_SELECTIONS = ['auto', ...TONES] as const;
export type ToneSelection = (typeof TONE_SELECTIONS)[number];

/** Tone dùng khi user để `auto` và chưa có tầng nào chốt tone cụ thể. */
export const DEFAULT_TONE: Tone = 'short_native';

/**
 * Ý đồ của reply. Khớp với default strategy slots ở Phase 4:
 * react / ask / support / add_insight.
 */
export const COMMENT_INTENTS = [
  'react',
  'ask',
  'support',
  'add_insight',
] as const;

export type CommentIntent = (typeof COMMENT_INTENTS)[number];

export const COMMENT_INTENT_SELECTIONS = ['auto', ...COMMENT_INTENTS] as const;
export type CommentIntentSelection = (typeof COMMENT_INTENT_SELECTIONS)[number];

export const REPLY_LENGTHS = ['very_short', 'short', 'medium', 'long'] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];

export const ENERGY_LEVELS = ['calm', 'balanced', 'high'] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const REPLY_LANGUAGES = ['auto', 'en', 'vi', 'ja'] as const;
export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number];

export const EMOJI_LEVELS = ['none', 'minimal', 'rich'] as const;
export type EmojiLevel = (typeof EMOJI_LEVELS)[number];

/** `replyCount` là mục tiêu (3 hoặc 4), không phải cam kết cứng — xem Phase 4/6. */
export const REPLY_COUNTS = [3, 4] as const;
export type ReplyCount = (typeof REPLY_COUNTS)[number];

export const DEFAULT_REPLY_COUNT: ReplyCount = 4;
export const MIN_REPLY_COUNT: ReplyCount = 3;

export function isTone(value: unknown): value is Tone {
  return (TONES as readonly unknown[]).includes(value);
}

export function isCommentIntent(value: unknown): value is CommentIntent {
  return (COMMENT_INTENTS as readonly unknown[]).includes(value);
}

/**
 * Ngôn ngữ đích ở contract cũ. `same_as_original` tương đương `auto` của
 * `ReplyLanguage`.
 * @deprecated Dùng `REPLY_LANGUAGES` / `ReplyLanguage`.
 */
export const TARGET_COMMENT_LANGUAGES = [
  'same_as_original',
  'ja',
  'en',
  'vi',
] as const;

/** @deprecated Dùng `ReplyLanguage`. */
export type TargetCommentLanguage = (typeof TARGET_COMMENT_LANGUAGES)[number];

/** @deprecated Dùng `TONES` / `TONE_SELECTIONS`. */
export const COMMENT_TONES = TONES;

/** @deprecated Dùng `Tone`. */
export type CommentTone = Tone;

export function toReplyLanguage(legacy: string | undefined): ReplyLanguage {
  if (legacy === 'en' || legacy === 'vi' || legacy === 'ja') return legacy;
  return 'auto';
}

export function toTargetCommentLanguage(
  language: string | undefined,
): TargetCommentLanguage {
  if (language === 'en' || language === 'vi' || language === 'ja')
    return language;
  return 'same_as_original';
}

export {
  COMMENT_NICHES,
  DEFAULT_NICHE,
  NICHES,
  NICHE_SELECTIONS,
  isNiche,
  isNicheSelection,
} from './niche.types';
export type { CommentNiche, Niche, NicheSelection } from './niche.types';
