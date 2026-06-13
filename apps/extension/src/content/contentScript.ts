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
};

declare const chrome: ChromeRuntime;

const installState = globalThis as typeof globalThis & {
  __xcaContentScriptInstalled?: boolean;
};
const shouldInstall = !installState.__xcaContentScriptInstalled;
installState.__xcaContentScriptInstalled = true;

let lastSentKey: string | null = null;
let clickTimer: number | null = null;
let lastUrl = location.href;
const visibleTimers = new WeakMap<Element, number>();
const cachedArticles = new WeakSet<Element>();
const autoSelectedArticles = new WeakSet<Element>();
const overlayNodes = new WeakMap<Element, HTMLDivElement>();
const pendingOverlayScores = new Map<string, OpportunityScore>();
const pendingComments: PendingPublishedComment[] = [];

const AUTO_SELECT_VISIBLE_RATIO = 0.65;
const AUTO_SELECT_DELAY_MS = 1000;
const PENDING_COMMENT_TTL_MS = 2 * 60 * 1000;
const API_BASE_URL = 'http://127.0.0.1:3001/api/v1';

function createPostKey(message: SelectedPostMessage): string {
  return [
    message.post.tweetId,
    message.post.postUrl,
    message.post.text,
    message.post.media.map((item) => item.url).join(','),
  ].join('|');
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
  const key = createPostKey(message);
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

function findBestCurrentArticle(): Element | null {
  const articles = [...document.querySelectorAll('article')];
  let bestArticle: Element | null = null;
  let bestScore = 0;

  articles.forEach((article) => {
    const ratio = getVisibleRatio(article);
    const mediaCount = article.querySelectorAll(
      'img[src*="pbs.twimg.com/media"], img[src*="pbs.twimg.com/amplify_video_thumb"], [data-testid="tweetPhoto"]',
    ).length;
    const textLength =
      article.querySelector('[data-testid="tweetText"]')?.textContent?.trim().length ?? 0;
    const score = ratio * 100 + mediaCount * 45 + Math.min(textLength, 600) / 12;
    if (score > bestScore) {
      bestScore = score;
      bestArticle = article;
    }
  });

  return bestScore > 20 ? bestArticle : null;
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
  const post = extractPostFromArticle(article, 'visible_cache');
  if (!post) return;
  const postContext = extractPostContextFromArticle(article, 'visible_cache') ?? undefined;
  cachedArticles.add(article);
  chrome.runtime?.sendMessage({
    type: 'XCA_CACHE_POST_CONTEXT',
    post,
    postContext,
  });
}

function autoSelectVisiblePost(article: Element): void {
  if (autoSelectedArticles.has(article)) return;
  if (sendSelectedPost(article, 'auto_scroll')) {
    autoSelectedArticles.add(article);
  }
  cacheVisiblePost(article);
}

function getScoreAccentColor(label: OpportunityScore['label']): string {
  if (label === 'urgent') return '#d12f2f';
  if (label === 'high') return '#f08a24';
  if (label === 'medium') return '#1d9bf0';
  if (label === 'low') return '#7a8aa0';
  return '#a7b0bf';
}

function getScoreLabelVi(label: OpportunityScore['label']): string {
  if (label === 'urgent') return 'Ưu tiên ngay';
  if (label === 'high') return 'Cơ hội tốt';
  if (label === 'medium') return 'Có thể thử';
  if (label === 'low') return 'Ưu tiên thấp';
  return 'Nên bỏ qua';
}

function ensureRelativePosition(article: Element): void {
  if (window.getComputedStyle(article).position === 'static') {
    (article as HTMLElement).style.position = 'relative';
  }
}

function findArticleKey(article: Element): string | undefined {
  const post = extractPostFromArticle(article, 'visible_cache');
  return post ? createPostKeyFromPost(post) : undefined;
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

  const accent = getScoreAccentColor(score.label);
  overlay.style.background = `linear-gradient(135deg, ${accent}, rgba(17, 24, 39, 0.92))`;
  overlay.innerHTML = `
    <span style="display:inline-flex;align-items:center;justify-content:center;width:8px;height:30px;border-radius:999px;background:${accent};box-shadow:0 0 0 2px rgba(255,255,255,0.18);"></span>
    <span style="display:flex;flex-direction:column;line-height:1.05;gap:2px;">
      <strong style="font-size:13px;">${score.total}/100</strong>
      <span style="font-size:11px;opacity:0.92;">${getScoreLabelVi(score.label)}</span>
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

function applyPendingOverlays(root: ParentNode = document): void {
  root.querySelectorAll('article').forEach((article) => {
    applyOverlayToArticle(article);
  });
}

function detectDetailPagePost(): void {
  if (!location.pathname.includes('/status/')) return;
  const bestArticle = findBestCurrentArticle();
  if (!bestArticle) return;
  sendSelectedPost(bestArticle, 'detail_page');
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
  await fetch(`${API_BASE_URL}/analytics/published-comments/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
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

  window.setTimeout(detectDetailPagePost, 800);
  window.addEventListener('popstate', () => window.setTimeout(detectDetailPagePost, 800));

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio >= AUTO_SELECT_VISIBLE_RATIO) {
          if (visibleTimers.has(entry.target) || autoSelectedArticles.has(entry.target)) return;
          const timer = window.setTimeout(() => {
            visibleTimers.delete(entry.target);
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
