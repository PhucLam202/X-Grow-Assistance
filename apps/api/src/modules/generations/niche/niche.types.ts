import type { Niche, NicheSelection } from '../types/niche.types';

/**
 * How the final niche was decided.
 *
 * There is deliberately no standalone `llm_fallback`: when the lightweight
 * classifier is not confident, classification is folded into the same LLM call
 * that generates candidates (Phase 4) and reported as `generation_embedded`.
 */
export const NICHE_CLASSIFICATION_METHODS = [
  'manual',
  'deterministic',
  'lightweight',
  'generation_embedded',
  'general_fallback',
] as const;

export type NicheClassificationMethod =
  (typeof NICHE_CLASSIFICATION_METHODS)[number];

/**
 * Every field except `requestedNiche` is optional on purpose. Callers populate
 * whatever context they have; later phases can start supplying richer sources
 * (quoted post, thread, author bio) without touching the cascade.
 */
export interface NicheClassificationInput {
  postText?: string;
  quotedPostText?: string;
  threadContext?: string[];
  hashtags?: string[];
  mentions?: string[];
  links?: string[];
  altText?: string;
  /** Text produced by the vision analysis that already ran for this request. */
  visionText?: string;
  authorBio?: string;
  recentAuthorTopics?: string[];
  /** `auto`, or the niche the user picked manually. */
  requestedNiche: NicheSelection;
}

export const NICHE_SIGNAL_SOURCES = [
  'manual',
  'post_text',
  'quoted_post',
  'thread',
  'hashtag',
  'mention',
  'link',
  'cashtag',
  'alt_text',
  'vision',
  'author_bio',
  'author_topics',
] as const;

export type NicheSignalSource = (typeof NICHE_SIGNAL_SOURCES)[number];

export interface NicheSourceSignal {
  source: NicheSignalSource;
  signal: string;
  weight: number;
}

export interface NicheDetectionResult {
  primaryNiche: Niche;
  secondaryNiches: Niche[];
  confidence: number;
  evidence: string[];
  sourceSignals: NicheSourceSignal[];
  classificationMethod: NicheClassificationMethod;
  /** `true` → Phase 4 must settle the niche itself while generating. */
  needsGenerationTimeClassification: boolean;
  fallbackUsed: boolean;
}

export type NicheKeywordLanguage = 'en' | 'vi' | 'ja' | 'any';

export interface NicheKeywordPattern {
  /** Must not carry the `g` flag — patterns are reused across calls. */
  pattern: RegExp;
  /** Short human-readable token used to build `evidence`. */
  label: string;
  lang: NicheKeywordLanguage;
}

/**
 * One niche's detection vocabulary. Registered through `signal-registry.ts`;
 * adding a niche never requires touching the cascade services.
 */
export interface NicheSignalDefinition {
  niche: Niche;
  version: string;
  /** Distinctive terms — a single hit is meaningful evidence. */
  strong: NicheKeywordPattern[];
  /** Supporting terms — meaningful only in pairs or alongside a strong hit. */
  weak: NicheKeywordPattern[];
  /** Hashtags (without `#`, lowercase) that map to this niche on their own. */
  hashtagAliases: string[];
  /** Cashtags (without `$`, uppercase) that map to this niche on their own. */
  cashtags: string[];
  /** Link hosts that map to this niche on their own. */
  domains: string[];
}

export interface NormalizedNicheContext {
  /** All textual sources, lowercased and whitespace-collapsed. */
  searchText: string;
  segments: Array<{ source: NicheSignalSource; text: string }>;
  /** Lowercase, `#` stripped. */
  hashtags: string[];
  /** Lowercase, `@` stripped. */
  mentions: string[];
  links: string[];
  /** Hostnames extracted from `links`, lowercase, `www.` stripped. */
  domains: string[];
  /** Uppercase, `$` stripped. */
  cashtags: string[];
  /** No usable context at all — nothing to classify. */
  isEmpty: boolean;
}

export interface NicheScore {
  niche: Niche;
  score: number;
  strongHits: number;
  weakHits: number;
  evidence: string[];
  sourceSignals: NicheSourceSignal[];
}

export interface DeterministicNicheMatch {
  niche: Niche;
  evidence: string[];
  sourceSignals: NicheSourceSignal[];
}
