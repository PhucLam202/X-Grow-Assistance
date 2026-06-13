import {
  POST_CONTEXT_CACHE_STORAGE_KEY,
  SELECTED_POST_STORAGE_KEY,
  type CachedPostContext,
  type ExtensionMessage,
  type ExtractedPost,
  type ExtractedPostContext,
  type SelectedPostResponse,
} from './shared/types';

type ChromeRuntime = {
  runtime?: {
    onInstalled?: {
      addListener(callback: () => void): void;
    };
    onMessage?: {
      addListener(
        callback: (
          message: ExtensionMessage,
          sender: unknown,
          sendResponse: (response: SelectedPostResponse) => void,
        ) => boolean | void,
      ): void;
    };
  };
  storage?: {
    local?: {
      get(key: string, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>): void;
    };
  };
  sidePanel?: {
    setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
  };
};

declare const chrome: ChromeRuntime;

let lastSelectedPost: ExtractedPost | undefined;
let lastSelectedPostContext: ExtractedPostContext | undefined;

const MAX_CONTEXT_CACHE_ITEMS = 200;
const CONTEXT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function createContextCacheKey(post: ExtractedPost): string | undefined {
  const key = post.tweetId ?? post.postUrl;
  return key ? `x:post-context:${key}` : undefined;
}

function isCachedPostContext(value: unknown): value is CachedPostContext {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'key' in value &&
      'post' in value &&
      'expiresAt' in value,
  );
}

function cachePostContext(post: ExtractedPost, postContext?: ExtractedPostContext): void {
  const key = createContextCacheKey(post);
  if (!key) return;

  chrome.storage?.local?.get(POST_CONTEXT_CACHE_STORAGE_KEY, (items) => {
    const now = Date.now();
    const existing = items[POST_CONTEXT_CACHE_STORAGE_KEY];
    const entries = Array.isArray(existing)
      ? existing.filter(isCachedPostContext).filter((entry) => Date.parse(entry.expiresAt) > now)
      : [];
    const nextEntry: CachedPostContext = {
      key,
      post,
      postContext,
      extractedAt: post.detectedAt,
      expiresAt: new Date(now + CONTEXT_CACHE_TTL_MS).toISOString(),
    };
    const nextEntries = [
      nextEntry,
      ...entries.filter((entry) => entry.key !== key),
    ].slice(0, MAX_CONTEXT_CACHE_ITEMS);

    chrome.storage?.local?.set({ [POST_CONTEXT_CACHE_STORAGE_KEY]: nextEntries });
  });
}

chrome.runtime?.onInstalled?.addListener(() => {
  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (message.type === 'XCA_SELECTED_POST') {
    lastSelectedPost = message.post;
    lastSelectedPostContext = message.postContext;
    chrome.storage?.local?.set({ [SELECTED_POST_STORAGE_KEY]: message.postContext ?? message.post });
    cachePostContext(message.post, message.postContext);
    return;
  }

  if (message.type === 'XCA_CACHE_POST_CONTEXT') {
    cachePostContext(message.post, message.postContext);
    return;
  }

  if (message.type === 'XCA_GET_SELECTED_POST') {
    sendResponse({ post: lastSelectedPost, postContext: lastSelectedPostContext });
  }
});
