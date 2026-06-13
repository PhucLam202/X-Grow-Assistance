import type { GenerateReplyPackRequest, ReplyPack } from './types';

const CACHE_STORAGE_KEY = 'x_comment_assistant_reply_pack_cache_v1';
const MAX_CACHE_ITEMS = 30;

type CacheEntry = {
  key: string;
  replyPack: ReplyPack;
  createdAt: string;
};

function readCache(): CacheEntry[] {
  try {
    const rawCache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!rawCache) return [];

    const parsedCache = JSON.parse(rawCache) as CacheEntry[];
    return Array.isArray(parsedCache) ? parsedCache : [];
  } catch {
    return [];
  }
}

function writeCache(entries: CacheEntry[]): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_CACHE_ITEMS)));
  } catch {
    // Cache is optional. Ignore quota/private-mode errors.
  }
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function createReplyPackCacheKey(request: GenerateReplyPackRequest): string {
  const contextKey = request.postContext
    ? [
        request.postContext.contextType,
        request.postContext.quotedPost?.tweetId ?? request.postContext.quotedPost?.postUrl,
        request.postContext.repostedPost?.tweetId ?? request.postContext.repostedPost?.postUrl,
        request.postContext.parentPost?.tweetId ?? request.postContext.parentPost?.postUrl,
      ].filter(Boolean).join(':')
    : 'no_context';
  return [
    request.platform,
    request.postUrl ?? normalizeText(request.postText),
    contextKey,
    request.targetCommentLanguage,
    request.explanationLanguage,
    request.tone,
    request.niche,
    request.maxSuggestions,
  ].join('|');
}

export function getCachedReplyPack(key: string): ReplyPack | null {
  const entry = readCache().find((cacheEntry) => cacheEntry.key === key);
  return entry?.replyPack ?? null;
}

export function setCachedReplyPack(key: string, replyPack: ReplyPack): void {
  const entries = readCache().filter((cacheEntry) => cacheEntry.key !== key);
  writeCache([
    {
      key,
      replyPack,
      createdAt: new Date().toISOString(),
    },
    ...entries,
  ]);
}
