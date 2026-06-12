import type { ExtractedMedia, ExtractedPost } from '../shared/types';

function getTextContent(element: Element | null): string | undefined {
  const text = element?.textContent?.trim().replace(/\s+/g, ' ');
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
    return new URL(href, 'https://x.com').toString();
  } catch {
    return undefined;
  }
}

function normalizeMediaDedupeKey(url: string): string {
  return url.split('?')[0];
}

function parseBackgroundImageUrl(styleValue: string | null): string | undefined {
  if (!styleValue) return undefined;
  return styleValue.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
}

function parsePhotoIndex(href: string | undefined): number | undefined {
  const rawIndex = href?.match(/\/photo\/(\d+)/)?.[1];
  return rawIndex ? Number(rawIndex) : undefined;
}

function extractPostUrl(article: Element): string | undefined {
  const statusLinks = [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')];
  const statusHref = statusLinks
    .map((link) => link.getAttribute('href') ?? undefined)
    .find((href) => href?.includes('/status/') && !href.includes('/photo/'));
  const fallbackHref = statusLinks[0]?.getAttribute('href') ?? undefined;
  return normalizePostUrl(absoluteXUrl(statusHref ?? fallbackHref));
}

function extractAuthor(article: Element): Pick<ExtractedPost, 'authorName' | 'username'> {
  const usernameLink = article.querySelector<HTMLAnchorElement>('a[href^="/"][href*="/status/"]');
  const usernameFromStatus = usernameLink?.getAttribute('href')?.match(/^\/([^/]+)\/status\//)?.[1];
  const userNameBlock = article.querySelector('[data-testid="User-Name"]');
  const userNameText = getTextContent(userNameBlock);
  const handleMatch = userNameText?.match(/@([A-Za-z0-9_]+)/);
  const username = handleMatch?.[1] ?? usernameFromStatus;
  const authorName = userNameText
    ?.replace(/@[^\s]+.*/, '')
    .replace(/·.*/, '')
    .trim();

  return {
    authorName: authorName || undefined,
    username: username ? `@${username.replace(/^@/, '')}` : undefined,
  };
}

function addMedia(
  media: ExtractedMedia[],
  seen: Set<string>,
  candidate: ExtractedMedia,
): void {
  if (!candidate.url.includes('pbs.twimg.com/media')) return;
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
    const photoLink = photoBlock.closest<HTMLAnchorElement>('a[href*="/photo/"]');
    const rawPhotoHref = photoLink?.getAttribute('href') ?? undefined;
    const photoHref = absoluteXUrl(rawPhotoHref);
    const photoIndex = parsePhotoIndex(rawPhotoHref);
    const image = photoBlock.querySelector<HTMLImageElement>('img[src*="pbs.twimg.com/media"]');

    if (image?.src) {
      addMedia(media, seen, {
        type: 'image',
        url: image.src,
        altText: image.alt || undefined,
        photoIndex,
        photoHref,
      });
    }

    const backgroundNodes = photoBlock.querySelectorAll<HTMLElement>('[style*="background-image"]');
    backgroundNodes.forEach((node) => {
      const backgroundUrl = parseBackgroundImageUrl(node.getAttribute('style'));
      if (!backgroundUrl) return;
      addMedia(media, seen, {
        type: 'image',
        url: backgroundUrl,
        photoIndex,
        photoHref,
      });
    });
  });

  article
    .querySelectorAll<HTMLImageElement>('a[href*="/status/"][href*="/photo/"] img[src*="pbs.twimg.com/media"]')
    .forEach((image) => {
      const photoLink = image.closest<HTMLAnchorElement>('a[href*="/photo/"]');
      const rawPhotoHref = photoLink?.getAttribute('href') ?? undefined;
      const photoHref = absoluteXUrl(rawPhotoHref);
      addMedia(media, seen, {
        type: 'image',
        url: image.src,
        altText: image.alt || undefined,
        photoIndex: parsePhotoIndex(rawPhotoHref),
        photoHref,
      });
    });

  return media.sort((a, b) => (a.photoIndex ?? 99) - (b.photoIndex ?? 99));
}

export function extractPostFromArticle(
  article: Element,
  source: ExtractedPost['source'],
): ExtractedPost | null {
  const text = getTextContent(article.querySelector('[data-testid="tweetText"]')) ?? '';
  const postUrl = extractPostUrl(article);
  const author = extractAuthor(article);
  const media = extractMedia(article);

  if (!text && media.length === 0) return null;

  return {
    platform: 'x',
    postUrl,
    tweetId: parseTweetId(postUrl),
    ...author,
    text,
    media,
    detectedAt: new Date().toISOString(),
    source,
  };
}

export function findClosestArticle(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest('article') : null;
}
