import type {
  ExtractedMedia,
  ExtractedPost,
  ExtractedPostContext,
  ExtractedPostMetrics,
} from "../shared/types";

function getTextContent(element: Element | null): string | undefined {
  const text = element?.textContent?.trim().replace(/\s+/g, " ");
  return text || undefined;
}

function parseTweetId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.match(/\/status\/(\d+)/)?.[1];
}

function normalizePostUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = url.match(/^(https:\/\/[^/]+\/[^/]+\/status\/\d+)/);
  return match?.[1] ?? url;
}

function absoluteXUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, "https://x.com").toString();
  } catch {
    return undefined;
  }
}

function normalizeMediaDedupeKey(url: string): string {
  return url.split("?")[0];
}

function parseBackgroundImageUrl(
  styleValue: string | null,
): string | undefined {
  if (!styleValue) return undefined;
  return styleValue.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
}

function parsePhotoIndex(href: string | undefined): number | undefined {
  const rawIndex = href?.match(/\/photo\/(\d+)/)?.[1];
  return rawIndex ? Number(rawIndex) : undefined;
}

function parseCompactNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([kmb])?/);
  if (!match) return undefined;

  const amount = Number(match[1]);
  const multiplier =
    match[2] === "k"
      ? 1_000
      : match[2] === "m"
        ? 1_000_000
        : match[2] === "b"
          ? 1_000_000_000
          : 1;
  return Math.round(amount * multiplier);
}

function extractMetricFromNode(
  article: Element,
  testId: string,
): number | undefined {
  const node = article.querySelector(`[data-testid="${testId}"]`);
  const labelValue = parseCompactNumber(
    node?.getAttribute("aria-label") ?? undefined,
  );
  if (labelValue !== undefined) return labelValue;
  return parseCompactNumber(getTextContent(node));
}

function extractViews(article: Element): number | undefined {
  const analyticsNode = article.querySelector(
    'a[href$="/analytics"], a[href*="/analytics"]',
  );
  const analyticsText = [
    analyticsNode?.getAttribute("aria-label") ?? undefined,
    getTextContent(analyticsNode),
  ].find((text) => text?.toLowerCase().includes("view"));
  const parsedAnalytics = parseCompactNumber(analyticsText);
  if (parsedAnalytics !== undefined) return parsedAnalytics;

  const viewTextNode = [...article.querySelectorAll("[aria-label], span")]
    .map((node) => node.getAttribute("aria-label") ?? getTextContent(node))
    .find((text) => text?.toLowerCase().includes("views"));
  return parseCompactNumber(viewTextNode);
}

function extractMetrics(article: Element): ExtractedPostMetrics | undefined {
  const metrics: ExtractedPostMetrics = {
    replies: extractMetricFromNode(article, "reply"),
    reposts: extractMetricFromNode(article, "retweet"),
    likes: extractMetricFromNode(article, "like"),
    views: extractViews(article),
  };

  return Object.values(metrics).some((value) => value !== undefined)
    ? metrics
    : undefined;
}

function extractTimestamps(article: Element): ExtractedPost["timestamps"] {
  const timeNode = article.querySelector<HTMLTimeElement>("time");
  return {
    postedAt: timeNode?.dateTime || undefined,
    postedAtText: getTextContent(timeNode) ?? undefined,
    extractedAt: new Date().toISOString(),
  };
}

function extractPostUrl(article: Element): string | undefined {
  const statusLinks = [
    ...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
  ];
  const statusHref = statusLinks
    .map((link) => link.getAttribute("href") ?? undefined)
    .find((href) => href?.includes("/status/") && !href.includes("/photo/"));
  const fallbackHref = statusLinks[0]?.getAttribute("href") ?? undefined;
  return normalizePostUrl(absoluteXUrl(statusHref ?? fallbackHref));
}

function extractPostUrlFromNode(node: Element): string | undefined {
  const statusLinks = [...node.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')];
  const statusHref = statusLinks
    .map((link) => link.getAttribute("href") ?? undefined)
    .find((href) => href?.includes("/status/") && !href.includes("/photo/"));
  return normalizePostUrl(absoluteXUrl(statusHref));
}

function getTweetTextFromNode(node: Element): string {
  const tweetTextNode = node.matches('[data-testid="tweetText"]')
    ? node
    : node.querySelector('[data-testid="tweetText"]');
  return getTextContent(tweetTextNode) ?? "";
}

function extractAuthor(
  article: Element,
): Pick<ExtractedPost, "authorName" | "username"> {
  const usernameLink = article.querySelector<HTMLAnchorElement>(
    'a[href^="/"][href*="/status/"]',
  );
  const usernameFromStatus = usernameLink
    ?.getAttribute("href")
    ?.match(/^\/([^/]+)\/status\//)?.[1];
  const userNameBlock = article.querySelector('[data-testid="User-Name"]');
  const userNameText = getTextContent(userNameBlock);
  const handleMatch = userNameText?.match(/@([A-Za-z0-9_]+)/);
  const username = handleMatch?.[1] ?? usernameFromStatus;
  const authorName = userNameText
    ?.replace(/@[^\s]+.*/, "")
    .replace(/·.*/, "")
    .trim();

  return {
    authorName: authorName || undefined,
    username: username ? `@${username.replace(/^@/, "")}` : undefined,
  };
}

function addMedia(
  media: ExtractedMedia[],
  seen: Set<string>,
  candidate: ExtractedMedia,
): void {
  if (
    !candidate.url.includes("pbs.twimg.com/media") &&
    !candidate.url.includes("pbs.twimg.com/amplify_video_thumb")
  ) {
    return;
  }
  const key = normalizeMediaDedupeKey(candidate.url);
  if (seen.has(key)) return;
  seen.add(key);
  media.push(candidate);
}

export function extractMedia(article: Element): ExtractedMedia[] {
  const media: ExtractedMedia[] = [];
  const seen = new Set<string>();
  const photoBlocks = article.querySelectorAll('[data-testid="tweetPhoto"]');

  photoBlocks.forEach((photoBlock) => {
    const photoLink =
      photoBlock.closest<HTMLAnchorElement>('a[href*="/photo/"]');
    const rawPhotoHref = photoLink?.getAttribute("href") ?? undefined;
    const photoHref = absoluteXUrl(rawPhotoHref);
    const photoIndex = parsePhotoIndex(rawPhotoHref);
    const image = photoBlock.querySelector<HTMLImageElement>(
      'img[src*="pbs.twimg.com/media"]',
    );

    const imageUrl = image?.currentSrc || image?.src;
    if (imageUrl) {
      addMedia(media, seen, {
        type: "image",
        url: imageUrl,
        altText: image.alt || undefined,
        photoIndex,
        photoHref,
      });
    }

    const backgroundNodes = photoBlock.querySelectorAll<HTMLElement>(
      '[style*="background-image"]',
    );
    backgroundNodes.forEach((node) => {
      const backgroundUrl = parseBackgroundImageUrl(node.getAttribute("style"));
      if (!backgroundUrl) return;
      addMedia(media, seen, {
        type: "image",
        url: backgroundUrl,
        photoIndex,
        photoHref,
      });
    });
  });

  article
    .querySelectorAll<HTMLImageElement>(
      'a[href*="/status/"][href*="/photo/"] img[src*="pbs.twimg.com/media"]',
    )
    .forEach((image) => {
      const photoLink = image.closest<HTMLAnchorElement>('a[href*="/photo/"]');
      const rawPhotoHref = photoLink?.getAttribute("href") ?? undefined;
      const photoHref = absoluteXUrl(rawPhotoHref);
      const imageUrl = image.currentSrc || image.src;
      if (!imageUrl) return;
      addMedia(media, seen, {
        type: "image",
        url: imageUrl,
        altText: image.alt || undefined,
        photoIndex: parsePhotoIndex(rawPhotoHref),
        photoHref,
      });
    });

  article
    .querySelectorAll<HTMLImageElement>(
      'img[src*="pbs.twimg.com/media"], img[src*="pbs.twimg.com/amplify_video_thumb"]',
    )
    .forEach((image) => {
      const photoLink = image.closest<HTMLAnchorElement>('a[href*="/photo/"]');
      const rawPhotoHref = photoLink?.getAttribute("href") ?? undefined;
      const photoHref = absoluteXUrl(rawPhotoHref);
      const imageUrl = image.currentSrc || image.src;
      if (!imageUrl) return;
      addMedia(media, seen, {
        type: "image",
        url: imageUrl,
        altText: image.alt || undefined,
        photoIndex: parsePhotoIndex(rawPhotoHref),
        photoHref,
      });
    });

  return media.sort((a, b) => (a.photoIndex ?? 99) - (b.photoIndex ?? 99));
}

export function extractPostFromArticle(
  article: Element,
  source: ExtractedPost["source"],
): ExtractedPost | null {
  const text =
    getTextContent(article.querySelector('[data-testid="tweetText"]')) ?? "";
  const postUrl = extractPostUrl(article);
  const author = extractAuthor(article);
  const media = extractMedia(article);
  const extractedAt = new Date().toISOString();

  if (!text && media.length === 0) return null;

  return {
    platform: "x",
    postUrl,
    tweetId: parseTweetId(postUrl),
    ...author,
    text,
    media,
    metrics: extractMetrics(article),
    timestamps: {
      ...extractTimestamps(article),
      extractedAt,
    },
    detectedAt: extractedAt,
    source,
  };
}

function createPostFromNode(
  node: Element,
  source: ExtractedPost["source"],
  fallbackUrl?: string,
): ExtractedPost | null {
  const text = getTweetTextFromNode(node);
  const postUrl = extractPostUrlFromNode(node) ?? fallbackUrl;
  const author = extractAuthor(node);
  const media = extractMedia(node);
  const extractedAt = new Date().toISOString();

  if (!text && media.length === 0) return null;

  return {
    platform: "x",
    postUrl,
    tweetId: parseTweetId(postUrl),
    ...author,
    text,
    media,
    metrics: extractMetrics(node),
    timestamps: {
      ...extractTimestamps(node),
      extractedAt,
    },
    detectedAt: extractedAt,
    source,
  };
}

function findBestNestedContainer(article: Element, tweetTextNode: Element): Element {
  let current: Element | null = tweetTextNode;
  let best: Element = tweetTextNode;

  while (current && current.parentElement && current.parentElement !== article) {
    const hasStatusLink = Boolean(current.querySelector('a[href*="/status/"]'));
    const hasAuthor = Boolean(current.querySelector('[data-testid="User-Name"]'));
    const hasMedia = current.querySelectorAll('img[src*="pbs.twimg.com/media"], [data-testid="tweetPhoto"]').length > 0;

    if (hasStatusLink || hasAuthor || hasMedia) {
      best = current;
    }

    current = current.parentElement;
  }

  return best;
}

function findSocialContextText(article: Element): string | undefined {
  const candidates = [
    article.querySelector('[data-testid="socialContext"]'),
    ...article.querySelectorAll('[dir="ltr"]'),
  ];
  return candidates
    .map((node) => getTextContent(node))
    .find((text) => {
      const value = text?.toLowerCase() ?? "";
      return value.includes("reposted") || value.includes("retweeted") || value.includes("replying to");
    });
}

function findNestedContextNode(article: Element, mainPostUrl?: string): Element | null {
  const tweetTextNodes = [...article.querySelectorAll('[data-testid="tweetText"]')];
  if (tweetTextNodes.length > 1) {
    return findBestNestedContainer(article, tweetTextNodes[1]);
  }

  const statusCards = [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')]
    .map((link) => link.closest('div[role="link"], div'))
    .filter((node): node is Element => Boolean(node));

  const mainTweetId = parseTweetId(mainPostUrl);
  return statusCards.find((node) => {
    const url = extractPostUrlFromNode(node);
    const tweetId = parseTweetId(url);
    if (tweetId && mainTweetId && tweetId === mainTweetId) return false;
    const hasText = Boolean(node.querySelector('[data-testid="tweetText"]'));
    const hasMedia = node.querySelectorAll('img[src*="pbs.twimg.com/media"], [data-testid="tweetPhoto"]').length > 0;
    return hasText || hasMedia;
  }) ?? null;
}

function detectContextType(article: Element, mainPost: ExtractedPost, nestedPost: ExtractedPost | null, socialText?: string): ExtractedPostContext["contextType"] {
  const lowerSocial = socialText?.toLowerCase() ?? "";
  if (lowerSocial.includes("replying to")) return "reply";
  if (lowerSocial.includes("reposted") || lowerSocial.includes("retweeted")) return "repost";
  if (nestedPost) {
    return mainPost.text.trim().length > 0 ? "quote_post" : "repost";
  }
  return "original_post";
}

function extractReplyingTo(article: Element): string[] {
  return [...article.querySelectorAll<HTMLSpanElement>('button span, a span')]
    .map((node) => getTextContent(node))
    .filter((text): text is string => Boolean(text?.startsWith('@')));
}

export function extractPostContextFromArticle(
  article: Element,
  source: ExtractedPost["source"],
): ExtractedPostContext | null {
  const mainPost = extractPostFromArticle(article, source);
  if (!mainPost) return null;

  const warnings: string[] = [];
  const socialText = findSocialContextText(article);
  const nestedNode = findNestedContextNode(article, mainPost.postUrl);
  const nestedPost = nestedNode ? createPostFromNode(nestedNode, source) : null;
  const contextType = detectContextType(article, mainPost, nestedPost, socialText);
  const isSelfRepost = Boolean(
    nestedPost?.username &&
      mainPost.username &&
      nestedPost.username.replace(/^@/, '').toLowerCase() === mainPost.username.replace(/^@/, '').toLowerCase(),
  );

  if ((contextType === "quote_post" || contextType === "repost") && !nestedPost) {
    warnings.push("related_post_missing");
  }
  if (!socialText && contextType !== "original_post") {
    warnings.push("social_context_missing");
  }

  return {
    platform: "x",
    contextType,
    mainPost,
    quotedPost: contextType === "quote_post" ? nestedPost ?? undefined : undefined,
    repostedPost: contextType === "repost" ? nestedPost ?? undefined : undefined,
    socialContext: {
      visibleContextText: socialText,
      isSelfRepost,
      replyingTo: contextType === "reply" ? extractReplyingTo(article) : undefined,
    },
    extraction: {
      confidence: warnings.length === 0 ? 0.88 : 0.62,
      warnings,
      raw: {
        tweetTextCount: article.querySelectorAll('[data-testid="tweetText"]').length,
        statusLinkCount: article.querySelectorAll('a[href*="/status/"]').length,
      },
    },
  };
}

export function findClosestArticle(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest("article") : null;
}
