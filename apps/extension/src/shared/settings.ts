import {
  COMMENT_INTENT_SELECTIONS,
  EMOJI_LEVELS,
  ENERGY_LEVELS,
  EXPLANATION_LANGUAGES,
  NICHE_SELECTIONS,
  REPLY_COUNTS,
  REPLY_LANGUAGES,
  REPLY_LENGTHS,
  TONE_SELECTIONS,
  type CommentIntentSelection,
  type EmojiLevel,
  type EnergyLevel,
  type ExplanationLanguageOption,
  type NicheSelection,
  type ReplyCount,
  type ReplyLanguage,
  type ReplyLength,
  type ToneSelection,
} from "./generationOptions";

export const GENERATION_SETTINGS_STORAGE_KEY = "x_comment_assistant_generation_settings_v1";

/**
 * User-controlled half of `ReplyOptionsDto`. Every field maps 1:1 to an option
 * the API validates, except `visionMode` which resolves to the boolean
 * `visionEnabled` at request time (see `resolveVisionEnabled`).
 */
export type GenerationSettings = {
  niche: NicheSelection;
  tone: ToneSelection;
  intent: CommentIntentSelection;
  length: ReplyLength;
  energy: EnergyLevel;
  language: ReplyLanguage;
  emojiLevel: EmojiLevel;
  replyCount: ReplyCount;
  explanationLanguage: ExplanationLanguageOption;
  visionMode: "auto" | "always" | "never";
};

/** Matches the API's own `resolveReplyOptions()` defaults. */
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  niche: "auto",
  tone: "auto",
  intent: "auto",
  length: "short",
  energy: "balanced",
  language: "auto",
  emojiLevel: "none",
  replyCount: 4,
  explanationLanguage: "vi",
  visionMode: "auto",
};

type ChromeStorageLocal = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type ChromeStorageChange = { newValue?: unknown };

type ChromeStorageApi = {
  local?: ChromeStorageLocal;
  onChanged?: {
    addListener(
      cb: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
    ): void;
    removeListener(
      cb: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
    ): void;
  };
};

function getChromeStorage(): ChromeStorageApi | undefined {
  return (globalThis as { chrome?: { storage?: ChromeStorageApi } }).chrome?.storage;
}

function pick<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/**
 * Never trust what is on disk: a stale key from an older build would otherwise
 * reach the API and trip `forbidNonWhitelisted` / `@IsIn`.
 */
export function normalizeGenerationSettings(value: unknown): GenerationSettings {
  const raw = (value ?? {}) as Partial<Record<keyof GenerationSettings, unknown>>;
  const d = DEFAULT_GENERATION_SETTINGS;

  return {
    niche: pick(raw.niche, NICHE_SELECTIONS, d.niche),
    tone: pick(raw.tone, TONE_SELECTIONS, d.tone),
    intent: pick(raw.intent, COMMENT_INTENT_SELECTIONS, d.intent),
    length: pick(raw.length, REPLY_LENGTHS, d.length),
    energy: pick(raw.energy, ENERGY_LEVELS, d.energy),
    language: pick(raw.language, REPLY_LANGUAGES, d.language),
    emojiLevel: pick(raw.emojiLevel, EMOJI_LEVELS, d.emojiLevel),
    replyCount: pick(raw.replyCount, REPLY_COUNTS, d.replyCount),
    explanationLanguage: pick(
      raw.explanationLanguage,
      EXPLANATION_LANGUAGES,
      d.explanationLanguage,
    ),
    visionMode: pick(raw.visionMode, ["auto", "always", "never"] as const, d.visionMode),
  };
}

export async function getGenerationSettings(): Promise<GenerationSettings> {
  const storage = getChromeStorage()?.local;
  if (!storage) return { ...DEFAULT_GENERATION_SETTINGS };
  const items = await storage.get(GENERATION_SETTINGS_STORAGE_KEY);
  return normalizeGenerationSettings(items[GENERATION_SETTINGS_STORAGE_KEY]);
}

export async function saveGenerationSettings(
  settings: GenerationSettings,
): Promise<void> {
  await getChromeStorage()?.local?.set({
    [GENERATION_SETTINGS_STORAGE_KEY]: settings,
  });
}

/** Fires when another surface (or another window) edits the settings. */
export function subscribeGenerationSettings(
  callback: (settings: GenerationSettings) => void,
): () => void {
  const onChanged = getChromeStorage()?.onChanged;
  if (!onChanged) return () => {};

  const listener = (
    changes: Record<string, ChromeStorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    const change = changes[GENERATION_SETTINGS_STORAGE_KEY];
    if (!change) return;
    callback(normalizeGenerationSettings(change.newValue));
  };

  onChanged.addListener(listener);
  return () => onChanged.removeListener(listener);
}

/** `auto` keeps the previous behaviour: vision only when the post has media. */
export function resolveVisionEnabled(
  visionMode: GenerationSettings["visionMode"],
  hasMedia: boolean,
): boolean {
  if (visionMode === "always") return true;
  if (visionMode === "never") return false;
  return hasMedia;
}
