import type { AnalyzeVisionRequest, VisionContext } from './types';

const CACHE_STORAGE_KEY = 'x_comment_assistant_vision_context_cache_v1';
const MAX_CACHE_ITEMS = 100;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CacheEntry = {
  key: string;
  visionContext: VisionContext;
  createdAt: string;
  expiresAt: string;
};

function readCache(): CacheEntry[] {
  try {
    const rawCache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!rawCache) return [];
    const parsedCache = JSON.parse(rawCache) as CacheEntry[];
    const now = Date.now();
    return Array.isArray(parsedCache)
      ? parsedCache.filter((entry) => Date.parse(entry.expiresAt) > now)
      : [];
  } catch {
    return [];
  }
}

function writeCache(entries: CacheEntry[]): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_CACHE_ITEMS)));
  } catch {
    // Vision context cache is optional. Ignore quota/private-mode errors.
  }
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeMediaUrl(url: string): string {
  return url.split('?')[0];
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function createVisionContextCacheKey(request: AnalyzeVisionRequest): string {
  const postKey = request.post.url ?? normalizeText(request.post.text);
  const textHash = hashString(normalizeText(request.post.text));
  const mediaFingerprint = request.media
    .map((item) => normalizeMediaUrl(item.url))
    .sort()
    .join(',');

  return ['vision-context', postKey, textHash, mediaFingerprint].join('|');
}

export function getCachedVisionContext(key: string): VisionContext | null {
  const entry = readCache().find((cacheEntry) => cacheEntry.key === key);
  return entry?.visionContext ?? null;
}

export function setCachedVisionContext(key: string, visionContext: VisionContext): void {
  const now = Date.now();
  const entries = readCache().filter((cacheEntry) => cacheEntry.key !== key);
  writeCache([
    {
      key,
      visionContext,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
    },
    ...entries,
  ]);
}

export function deleteCachedVisionContext(key: string): void {
  writeCache(readCache().filter((cacheEntry) => cacheEntry.key !== key));
}
