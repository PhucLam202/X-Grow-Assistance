/**
 * Mirror of the backend generation vocabulary.
 *
 * Source of truth lives in the API:
 *   apps/api/src/modules/generations/types/niche.types.ts
 *   apps/api/src/modules/generations/types/style.types.ts
 *
 * `POST /reply-packs` validates every one of these with `@IsIn(...)` and the
 * global pipe runs `forbidNonWhitelisted`, so an unknown value or an unknown
 * field is a 400 — not a silently ignored option. Keep these lists in sync.
 */

// ── Niche ───────────────────────────────────────────────────────────────────

export const NICHES = [
  "general",
  "tech",
  "ai_ml",
  "crypto",
  "business",
  "startup",
  "career",
  "anime_manga",
  "gaming",
  "football",
  "news",
  "health_fitness",
  "finance_personal",
  "education",
  "travel",
  "food",
  "music",
  "movies_tv",
  "science",
  "productivity",
] as const;

export type Niche = (typeof NICHES)[number];

export const NICHE_SELECTIONS = ["auto", ...NICHES] as const;
export type NicheSelection = (typeof NICHE_SELECTIONS)[number];

export const NICHE_LABELS: Record<NicheSelection, string> = {
  auto: "Auto-detect",
  general: "General",
  tech: "Tech",
  ai_ml: "AI / ML",
  crypto: "Crypto",
  business: "Business",
  startup: "Startup",
  career: "Career",
  anime_manga: "Anime & Manga",
  gaming: "Gaming",
  football: "Football",
  news: "News",
  health_fitness: "Health & Fitness",
  finance_personal: "Personal Finance",
  education: "Education",
  travel: "Travel",
  food: "Food",
  music: "Music",
  movies_tv: "Movies & TV",
  science: "Science",
  productivity: "Productivity",
};

// ── Style dimensions ────────────────────────────────────────────────────────

export const TONES = [
  "short_native",
  "casual_supportive",
  "question_based",
  "insightful",
  "funny_light",
  "anime_fan",
  "crypto_casual",
  "football_fan",
  "congratulation",
] as const;

export type Tone = (typeof TONES)[number];

export const TONE_SELECTIONS = ["auto", ...TONES] as const;
export type ToneSelection = (typeof TONE_SELECTIONS)[number];

export const TONE_LABELS: Record<ToneSelection, string> = {
  auto: "Auto",
  short_native: "Short & native",
  casual_supportive: "Casual supportive",
  question_based: "Question",
  insightful: "Insightful",
  funny_light: "Funny (light)",
  anime_fan: "Anime fan",
  crypto_casual: "Crypto casual",
  football_fan: "Football fan",
  congratulation: "Congratulation",
};

export const COMMENT_INTENTS = ["react", "ask", "support", "add_insight"] as const;
export type CommentIntent = (typeof COMMENT_INTENTS)[number];

export const COMMENT_INTENT_SELECTIONS = ["auto", ...COMMENT_INTENTS] as const;
export type CommentIntentSelection = (typeof COMMENT_INTENT_SELECTIONS)[number];

export const INTENT_LABELS: Record<CommentIntentSelection, string> = {
  auto: "Auto",
  react: "React",
  ask: "Ask",
  support: "Support",
  add_insight: "Add insight",
};

export const REPLY_LENGTHS = ["very_short", "short", "medium", "long"] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];

export const LENGTH_LABELS: Record<ReplyLength, string> = {
  very_short: "Very short",
  short: "Short",
  medium: "Medium",
  long: "Long",
};

export const ENERGY_LEVELS = ["calm", "balanced", "high"] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const ENERGY_LABELS: Record<EnergyLevel, string> = {
  calm: "Calm",
  balanced: "Balanced",
  high: "High",
};

export const REPLY_LANGUAGES = ["auto", "en", "vi", "ja"] as const;
export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number];

export const REPLY_LANGUAGE_LABELS: Record<ReplyLanguage, string> = {
  auto: "Same as post",
  en: "English",
  vi: "Tiếng Việt",
  ja: "日本語",
};

export const EMOJI_LEVELS = ["none", "minimal", "rich"] as const;
export type EmojiLevel = (typeof EMOJI_LEVELS)[number];

export const EMOJI_LABELS: Record<EmojiLevel, string> = {
  none: "None",
  minimal: "Minimal",
  rich: "Rich",
};

/** The API only accepts 3 or 4 — anything else is `INVALID_REPLY_COUNT`. */
export const REPLY_COUNTS = [3, 4] as const;
export type ReplyCount = (typeof REPLY_COUNTS)[number];

export const EXPLANATION_LANGUAGES = ["vi", "en"] as const;
export type ExplanationLanguageOption = (typeof EXPLANATION_LANGUAGES)[number];

export const EXPLANATION_LANGUAGE_LABELS: Record<ExplanationLanguageOption, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

// ── Analysis metadata (response side) ───────────────────────────────────────

export const NICHE_CLASSIFICATION_METHODS = [
  "manual",
  "deterministic",
  "lightweight",
  "generation_embedded",
  "general_fallback",
] as const;

export type NicheClassificationMethod = (typeof NICHE_CLASSIFICATION_METHODS)[number];

export const CLASSIFICATION_METHOD_LABELS: Record<NicheClassificationMethod, string> = {
  manual: "you picked it",
  deterministic: "strong signals",
  lightweight: "keyword match",
  generation_embedded: "decided while writing",
  general_fallback: "no clear signal",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export function humanizeNiche(value: string | undefined): string {
  if (!value) return "—";
  return (
    NICHE_LABELS[value as NicheSelection] ?? value.replaceAll("_", " ")
  );
}

export function humanizeTone(value: string | undefined): string {
  if (!value) return "—";
  return TONE_LABELS[value as ToneSelection] ?? value.replaceAll("_", " ");
}

export function isNicheSelection(value: unknown): value is NicheSelection {
  return (NICHE_SELECTIONS as readonly unknown[]).includes(value);
}
