import type {
  CachePostContextMessage,
  ExtensionMessage,
  FeedScanResponse,
  FeedSnapshot,
  FeedSnapshotSource,
  ExtractedPost,
  OpportunityScore,
  PendingPublishedComment,
  RenderPostOverlayMessage,
  SelectedPostMessage,
  SelectedPostResponse,
} from '../shared/types';
import { extractPostContextFromArticle, extractPostFromArticle, findClosestArticle } from './postExtractor';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const AUTH_SESSION_STORAGE_KEY = 'x_comment_assistant_auth_session_v1';

type ContentAuthSession = {
  accessToken: string;
};

type ChromeRuntime = {
  runtime?: {
    sendMessage(message: SelectedPostMessage | CachePostContextMessage): void;
    onMessage?: {
      addListener(
        callback: (
          message: ExtensionMessage,
          sender: unknown,
          sendResponse: (response: SelectedPostResponse | FeedScanResponse) => void,
        ) => boolean | void,
      ): void;
    };
  };
  storage?: {
    local?: {
      get(key: string): Promise<Record<string, unknown>>;
    };
  };
};

declare const chrome: ChromeRuntime;

const installState = globalThis as typeof globalThis & {
  __xcaContentScriptInstalled?: boolean;
  __xcaContentScriptVersion?: string;
};
const CONTENT_SCRIPT_VERSION = '2026-06-14-harness-detector-v2';
const shouldInstall = installState.__xcaContentScriptVersion !== CONTENT_SCRIPT_VERSION;

let lastSentKey: string | null = null;
let clickTimer: number | null = null;
let scrollEndTimer: number | null = null;
let lastUrl = location.href;
const visibleTimers = new WeakMap<Element, number>();
const cachedArticles = new WeakSet<Element>();
const autoSelectedArticles = new WeakSet<Element>();
const overlayNodes = new WeakMap<Element, HTMLDivElement>();
const pendingOverlayScores = new Map<string, OpportunityScore>();
const pendingComments: PendingPublishedComment[] = [];
// ponytail: cache article→key so findArticleKey never re-parses the DOM; articlesByKey enables O(1) overlay lookup
const articleKeyCache = new WeakMap<Element, string>();
const articlesByKey = new Map<string, Element>();

const AUTO_SELECT_VISIBLE_RATIO = 0.2;
const AUTO_SELECT_DELAY_MS = 300;
const PENDING_COMMENT_TTL_MS = 2 * 60 * 1000;

function isContentAuthSession(value: unknown): value is ContentAuthSession {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'accessToken' in value &&
      typeof (value as ContentAuthSession).accessToken === 'string',
  );
}

async function getContentAuthSession(): Promise<ContentAuthSession | null> {
  if (!chrome.storage?.local) return null;
  const items = await chrome.storage.local.get(AUTH_SESSION_STORAGE_KEY);
  const value = items[AUTH_SESSION_STORAGE_KEY];
  return isContentAuthSession(value) ? value : null;
}

function createPostKeyFromPost(post: ExtractedPost): string {
  return [
    post.tweetId,
    post.postUrl,
    post.text,
    post.media.map((item) => item.url).join(','),
  ].join('|');
}

function sendSelectedPost(article: Element, source: SelectedPostMessage['post']['source']): boolean {
  const postContext = extractPostContextFromArticle(article, source);
  const post = postContext?.mainPost ?? extractPostFromArticle(article, source);
  if (!post) return false;

  const message: SelectedPostMessage = {
    type: 'XCA_SELECTED_POST',
    post,
    postContext: postContext ?? undefined,
  };
  const key = createPostKeyFromPost(message.post);
  if (key === lastSentKey) return false;
  lastSentKey = key;
  chrome.runtime?.sendMessage(message);
  return true;
}

function getVisibleRatio(element: Element): number {
  const rect = element.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const visibleArea = visibleWidth * visibleHeight;
  const totalArea = rect.width * rect.height;
  return totalArea > 0 ? visibleArea / totalArea : 0;
}

function getStatusTweetIdFromUrl(): string | undefined {
  if (!location.pathname.includes('/status/')) return undefined;
  return location.pathname.match(/\/status\/(\d+)/)?.[1];
}

function findBestCurrentArticle(): Element | null {
  const articles = [...document.querySelectorAll('article')];
  if (articles.length === 0) return null;

  const currentStatusId = getStatusTweetIdFromUrl();

  if (currentStatusId) {
    // On a status detail page (x.com/user/status/123456), the main post is the focal tweet of this URL.
    for (const article of articles) {
      const statusLinks = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]');
      for (const link of statusLinks) {
        if (link.href.includes(`/status/${currentStatusId}`)) {
          return article;
        }
      }
    }
    // Fallback: on a status page, the first article is always the main focal tweet
    return articles[0];
  }

  // On feed pages (/home, /search, /profile): find the article best positioned in viewport
  let bestArticle: Element | null = null;
  let bestScore = -9999;

  articles.forEach((article) => {
    const ratio = getVisibleRatio(article);
    const rect = article.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    const topDistancePenalty = Math.max(0, rect.top) / 10;
    const mediaCount = article.querySelectorAll(
      'img[src*="pbs.twimg.com/media"], img[src*="pbs.twimg.com/amplify_video_thumb"], [data-testid="tweetPhoto"]',
    ).length;
    const textLength =
      article.querySelector('[data-testid="tweetText"]')?.textContent?.trim().length ?? 0;

    const score = ratio * 100 - topDistancePenalty + Math.min(mediaCount, 2) * 10 + Math.min(textLength, 200) / 20;

    if (score > bestScore) {
      bestScore = score;
      bestArticle = article;
    }
  });

  return bestArticle ?? articles[0] ?? null;
}

function detectCurrentPost(): ExtractedPost | null {
  const article = findBestCurrentArticle();
  return article ? extractPostFromArticle(article, 'manual_button') : null;
}

function detectCurrentPostContext() {
  const article = findBestCurrentArticle();
  return article ? extractPostContextFromArticle(article, 'manual_button') : null;
}

function createFeedLocalId(post: ExtractedPost, index: number): string {
  return post.tweetId ?? post.postUrl ?? `${post.text.slice(0, 80)}:${index}`;
}

function detectFeedSource(): FeedSnapshotSource {
  if (location.pathname === '/home') return 'x_home_feed';
  if (location.pathname.includes('/search')) return 'x_search_feed';
  if (location.pathname.split('/').filter(Boolean).length === 1) return 'x_profile_feed';
  return 'x_unknown_feed';
}

function scanVisibleFeed(): FeedSnapshot {
  const posts = [...document.querySelectorAll('article')]
    .filter((article) => getVisibleRatio(article) >= 0.2)
    .map((article) => extractPostFromArticle(article, 'feed_scan'))
    .filter((post): post is ExtractedPost => Boolean(post));
  const seen = new Set<string>();
  const candidates = posts.flatMap((post, index) => {
    const localId = createFeedLocalId(post, index);
    if (seen.has(localId)) return [];
    seen.add(localId);
    return [{ ...post, localId }];
  });
  const capturedAt = new Date().toISOString();

  return {
    snapshotId: `feed_${Date.now().toString(36)}`,
    source: detectFeedSource(),
    capturedAt,
    visiblePostCount: candidates.length,
    posts: candidates,
  };
}

function cacheVisiblePost(article: Element): void {
  if (cachedArticles.has(article)) return;
  const postContext = extractPostContextFromArticle(article, 'visible_cache') ?? undefined;
  const post = postContext?.mainPost;
  if (!post) return;
  cachedArticles.add(article);
  chrome.runtime?.sendMessage({ type: 'XCA_CACHE_POST_CONTEXT', post, postContext });
}

function autoSelectVisiblePost(article: Element): void {
  if (autoSelectedArticles.has(article)) return;
  if (sendSelectedPost(article, 'auto_scroll')) {
    autoSelectedArticles.add(article);
  }
  cacheVisiblePost(article);
}

const SCORE_COLOR: Record<string, string> = {
  urgent: '#d12f2f', high: '#f08a24', medium: '#1d9bf0', low: '#7a8aa0',
};
const SCORE_LABEL_VI: Record<string, string> = {
  urgent: 'Ưu tiên ngay', high: 'Cơ hội tốt', medium: 'Có thể thử', low: 'Ưu tiên thấp',
};

function ensureRelativePosition(article: Element): void {
  if (window.getComputedStyle(article).position === 'static') {
    (article as HTMLElement).style.position = 'relative';
  }
}

function findArticleKey(article: Element): string | undefined {
  const cached = articleKeyCache.get(article);
  if (cached) return cached;
  const post = extractPostFromArticle(article, 'visible_cache');
  if (!post) return undefined;
  const key = createPostKeyFromPost(post);
  articleKeyCache.set(article, key);
  articlesByKey.set(key, article);
  return key;
}

function mountOverlay(article: Element, score: OpportunityScore): void {
  ensureRelativePosition(article);

  let overlay = overlayNodes.get(article);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.dataset.xcaOverlay = 'true';
    overlay.style.position = 'absolute';
    overlay.style.top = '12px';
    overlay.style.right = '12px';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.gap = '8px';
    overlay.style.padding = '7px 10px';
    overlay.style.borderRadius = '999px';
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.style.boxShadow = '0 10px 26px rgba(0, 0, 0, 0.28)';
    overlay.style.pointerEvents = 'none';
    overlay.style.fontFamily = 'Inter, system-ui, sans-serif';
    overlay.style.fontSize = '12px';
    overlay.style.fontWeight = '800';
    overlay.style.letterSpacing = '0.01em';
    overlay.style.color = '#ffffff';
    (article as HTMLElement).appendChild(overlay);
    overlayNodes.set(article, overlay);
  }

  const accent = SCORE_COLOR[score.label] ?? '#a7b0bf';
  overlay.style.background = `linear-gradient(135deg, ${accent}, rgba(17, 24, 39, 0.92))`;
  overlay.innerHTML = `
    <span style="display:inline-flex;align-items:center;justify-content:center;width:8px;height:30px;border-radius:999px;background:${accent};box-shadow:0 0 0 2px rgba(255,255,255,0.18);"></span>
    <span style="display:flex;flex-direction:column;line-height:1.05;gap:2px;">
      <strong style="font-size:13px;">${score.total}/100</strong>
      <span style="font-size:11px;opacity:0.92;">${SCORE_LABEL_VI[score.label] ?? 'Nên bỏ qua'}</span>
    </span>
  `;
}

function applyOverlayToArticle(article: Element): boolean {
  const key = findArticleKey(article);
  if (!key) return false;
  const score = pendingOverlayScores.get(key);
  if (!score) return false;

  mountOverlay(article, score);
  return true;
}

function applyPendingOverlays(): void {
  pendingOverlayScores.forEach((score, key) => {
    const article = articlesByKey.get(key);
    if (article) mountOverlay(article, score);
  });
}

function detectDetailPagePost(): void {
  if (!location.pathname.includes('/status/')) return;
  const bestArticle = findBestCurrentArticle();
  if (bestArticle) {
    sendSelectedPost(bestArticle, 'detail_page');
    return;
  }
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const article = findBestCurrentArticle();
    if (article) {
      sendSelectedPost(article, 'detail_page');
      window.clearInterval(timer);
    } else if (attempts >= 6) {
      window.clearInterval(timer);
    }
  }, 350);
}

function normalizeComparableText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s\n\r]+/g, ' ')
    .replace(/[😂🤣😭🔥✨.!?。！？、,]/gu, '');
}

function calculateTextSimilarity(left: string, right: string): number {
  const a = normalizeComparableText(left);
  const b = normalizeComparableText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function extractArticleText(article: Element): string {
  return article.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
}

function extractStatusUrl(article: Element): string | undefined {
  const links = [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')];
  const href = links
    .map((link) => link.getAttribute('href') ?? undefined)
    .find((value) => value?.includes('/status/') && !value.includes('/photo/'));
  if (!href) return undefined;
  try {
    const url = new URL(href, 'https://x.com');
    const match = url.toString().match(/^(https:\/\/[^/]+\/[^/]+\/status\/\d+)/);
    return match?.[1] ?? url.toString();
  } catch {
    return undefined;
  }
}

function extractTweetId(url: string | undefined): string | undefined {
  return url?.match(/\/status\/(\d+)/)?.[1];
}

async function saveDetectedPublishedComment(request: {
  postId: string;
  suggestionId?: string;
  parentPostUrl?: string;
  parentTweetId?: string;
  commentText: string;
  commentUrl?: string;
  commentTweetId?: string;
  commentLanguage?: string;
  wasAiGenerated?: boolean;
  detectedBy: 'dom_after_send';
  detectionConfidence?: number;
  rawDetection?: Record<string, unknown>;
}): Promise<void> {
  const session = await getContentAuthSession();
  await fetch(`${API_BASE_URL}/analytics/published-comments/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: JSON.stringify(request),
  });
}

function prunePendingComments(): void {
  const cutoff = Date.now() - PENDING_COMMENT_TTL_MS;
  for (let index = pendingComments.length - 1; index >= 0; index -= 1) {
    if (pendingComments[index].createdAt < cutoff) {
      pendingComments.splice(index, 1);
    }
  }
}

function trackPendingComment(pending: PendingPublishedComment): void {
  prunePendingComments();
  pendingComments.unshift(pending);
  pendingComments.splice(10);
}

function detectPublishedCommentFromArticle(article: Element): void {
  prunePendingComments();
  if (pendingComments.length === 0) return;

  const text = extractArticleText(article);
  const url = extractStatusUrl(article);
  if (!text || !url) return;

  let bestMatch:
    | { pending: PendingPublishedComment; similarity: number; index: number }
    | undefined;

  pendingComments.forEach((pending, index) => {
    const similarity = calculateTextSimilarity(text, pending.commentText);
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { pending, similarity, index };
    }
  });

  if (!bestMatch || bestMatch.similarity < 0.8) return;

  pendingComments.splice(bestMatch.index, 1);
  void saveDetectedPublishedComment({
    postId: bestMatch.pending.postId,
    suggestionId: bestMatch.pending.suggestionId,
    parentPostUrl: bestMatch.pending.parentPostUrl,
    parentTweetId: bestMatch.pending.parentTweetId,
    commentText: text,
    commentUrl: url,
    commentTweetId: extractTweetId(url),
    commentLanguage: bestMatch.pending.commentLanguage,
    wasAiGenerated: true,
    detectedBy: 'dom_after_send',
    detectionConfidence: bestMatch.similarity,
    rawDetection: {
      matchedText: text,
      expectedText: bestMatch.pending.commentText,
      similarity: bestMatch.similarity,
      href: url,
    },
  }).catch(() => {
    // Detection is best-effort and must never break the X page.
  });
}

if (shouldInstall) {
  document.addEventListener(
    'click',
    (event) => {
      const article = findClosestArticle(event.target);
      if (!article) return;

      if (clickTimer) window.clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => {
        sendSelectedPost(article, 'click');
      }, 120);
    },
    true,
  );

  // Scroll-end fallback: when scrolling stops, pick the best visible article.
  // Catches posts the IntersectionObserver may miss during fast scroll.
  window.addEventListener(
    'scroll',
    () => {
      if (scrollEndTimer) window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        scrollEndTimer = null;
        const article = findBestCurrentArticle();
        if (!article) return;
        if (autoSelectedArticles.has(article)) return;
        autoSelectVisiblePost(article);
      }, AUTO_SELECT_DELAY_MS);
    },
    { passive: true },
  );

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message.type === 'XCA_PING') {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'XCA_RENDER_POST_OVERLAY') {
      const overlayMessage = message as RenderPostOverlayMessage;
      pendingOverlayScores.set(
        createPostKeyFromPost(overlayMessage.post),
        overlayMessage.score,
      );
      applyPendingOverlays();
      sendResponse({ post: overlayMessage.post });
      return;
    }

    if (message.type === 'XCA_TRACK_PENDING_COMMENT') {
      trackPendingComment(message.pending);
      const postContext = detectCurrentPostContext() ?? undefined;
      sendResponse({ post: postContext?.mainPost ?? detectCurrentPost() ?? undefined, postContext });
      return;
    }

    if (message.type === 'XCA_SCAN_VISIBLE_FEED') {
      const snapshot = scanVisibleFeed();
      if (snapshot.posts.length === 0) {
        sendResponse({ error: 'No visible X feed posts found in the current tab.' });
        return;
      }

      sendResponse({ snapshot });
      return;
    }

    if (message.type !== 'XCA_DETECT_CURRENT_POST') return;

    const postContext = detectCurrentPostContext();
    const post = postContext?.mainPost ?? detectCurrentPost();
    if (!post) {
      sendResponse({ error: 'No visible X post found in the current tab.' });
      return;
    }

    chrome.runtime?.sendMessage({
      type: 'XCA_SELECTED_POST',
      post,
      postContext: postContext ?? undefined,
    });
      sendResponse({ post, postContext: postContext ?? undefined });
  });

  installState.__xcaContentScriptInstalled = true;
  installState.__xcaContentScriptVersion = CONTENT_SCRIPT_VERSION;

  window.setTimeout(detectDetailPagePost, 800);
  window.addEventListener('popstate', () => window.setTimeout(detectDetailPagePost, 800));

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio >= AUTO_SELECT_VISIBLE_RATIO) {
          if (visibleTimers.has(entry.target) || autoSelectedArticles.has(entry.target)) return;
          const timer = window.setTimeout(() => {
            visibleTimers.delete(entry.target);
            if (!document.contains(entry.target)) return;
            autoSelectVisiblePost(entry.target);
          }, AUTO_SELECT_DELAY_MS);
          visibleTimers.set(entry.target, timer);
          return;
        }

        const timer = visibleTimers.get(entry.target);
        if (timer) {
          window.clearTimeout(timer);
          visibleTimers.delete(entry.target);
        }
      });
    },
    { threshold: [0, AUTO_SELECT_VISIBLE_RATIO] },
  );

  function registerArticles(root: ParentNode = document): void {
    root.querySelectorAll('article').forEach((article) => {
      intersectionObserver.observe(article);
      applyOverlayToArticle(article);
    });
  }

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('article')) {
          intersectionObserver.observe(node);
          applyOverlayToArticle(node);
          detectPublishedCommentFromArticle(node);
          return;
        }
        registerArticles(node);
        node.querySelectorAll('article').forEach((article) => {
          detectPublishedCommentFromArticle(article);
        });
      });
    });

    if (location.href !== lastUrl) {
      lastUrl = location.href;
      window.setTimeout(detectDetailPagePost, 800);
    }
  });

  registerArticles();
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}
