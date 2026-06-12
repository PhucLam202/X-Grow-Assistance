import type {
  CachePostContextMessage,
  ExtensionMessage,
  ExtractedPost,
  SelectedPostMessage,
  SelectedPostResponse,
} from '../shared/types';
import { extractPostFromArticle, findClosestArticle } from './postExtractor';

type ChromeRuntime = {
  runtime?: {
    sendMessage(message: SelectedPostMessage | CachePostContextMessage): void;
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

function createPostKey(message: SelectedPostMessage): string {
  return [
    message.post.tweetId,
    message.post.postUrl,
    message.post.text,
    message.post.media.map((item) => item.url).join(','),
  ].join('|');
}

function sendSelectedPost(article: Element, source: SelectedPostMessage['post']['source']): void {
  const post = extractPostFromArticle(article, source);
  if (!post) return;

  const message: SelectedPostMessage = {
    type: 'XCA_SELECTED_POST',
    post,
  };
  const key = createPostKey(message);
  if (key === lastSentKey) return;
  lastSentKey = key;
  chrome.runtime?.sendMessage(message);
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
  if (location.pathname.includes('/status/')) {
    const detailArticle = document.querySelector('article');
    if (detailArticle) return detailArticle;
  }

  const articles = [...document.querySelectorAll('article')];
  let bestArticle: Element | null = null;
  let bestRatio = 0;

  articles.forEach((article) => {
    const ratio = getVisibleRatio(article);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestArticle = article;
    }
  });

  return bestRatio > 0.2 ? bestArticle : null;
}

function detectCurrentPost(): ExtractedPost | null {
  const article = findBestCurrentArticle();
  return article ? extractPostFromArticle(article, 'manual_button') : null;
}

function cacheVisiblePost(article: Element): void {
  if (cachedArticles.has(article)) return;
  const post = extractPostFromArticle(article, 'visible_cache');
  if (!post) return;
  cachedArticles.add(article);
  chrome.runtime?.sendMessage({
    type: 'XCA_CACHE_POST_CONTEXT',
    post,
  });
}

function detectDetailPagePost(): void {
  if (!location.pathname.includes('/status/')) return;
  const firstArticle = document.querySelector('article');
  if (!firstArticle) return;
  sendSelectedPost(firstArticle, 'detail_page');
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
    if (message.type !== 'XCA_DETECT_CURRENT_POST') return;

    const post = detectCurrentPost();
    if (!post) {
      sendResponse({ error: 'No visible X post found in the current tab.' });
      return;
    }

    chrome.runtime?.sendMessage({
      type: 'XCA_SELECTED_POST',
      post,
    });
    sendResponse({ post });
  });

  window.setTimeout(detectDetailPagePost, 800);
  window.addEventListener('popstate', () => window.setTimeout(detectDetailPagePost, 800));

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio >= 0.6) {
          if (visibleTimers.has(entry.target) || cachedArticles.has(entry.target)) return;
          const timer = window.setTimeout(() => {
            visibleTimers.delete(entry.target);
            cacheVisiblePost(entry.target);
          }, 1500);
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
    { threshold: [0, 0.6] },
  );

  function registerArticles(root: ParentNode = document): void {
    root.querySelectorAll('article').forEach((article) => {
      intersectionObserver.observe(article);
    });
  }

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('article')) {
          intersectionObserver.observe(node);
          return;
        }
        registerArticles(node);
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
