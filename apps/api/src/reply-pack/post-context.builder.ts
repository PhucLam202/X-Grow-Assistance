type PostRecord = {
  postUrl?: string;
  tweetId?: string;
  authorName?: string;
  username?: string;
  text?: string;
  media?: Array<Record<string, unknown>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toPostRecord(value: unknown): PostRecord | undefined {
  if (!isRecord(value)) return undefined;
  return {
    postUrl: toStringValue(value.postUrl),
    tweetId: toStringValue(value.tweetId),
    authorName: toStringValue(value.authorName),
    username: toStringValue(value.username),
    text: toStringValue(value.text),
    media: Array.isArray(value.media)
      ? value.media.filter(isRecord)
      : undefined,
  };
}

function describePost(label: string, post: PostRecord | undefined): string[] {
  if (!post) return [];
  const mediaCount = post.media?.length ?? 0;
  return [
    `${label}:`,
    `- Author: ${post.authorName ?? post.username ?? 'unknown'}`,
    `- URL: ${post.postUrl ?? ''}`,
    `- Tweet ID: ${post.tweetId ?? ''}`,
    `- Text: ${post.text ?? ''}`,
    `- Media count: ${mediaCount}`,
    ...(post.media ?? []).map((media, index) => {
      const type =
        toStringValue(media.type) ?? toStringValue(media.mediaType) ?? 'media';
      const url =
        toStringValue(media.url) ?? toStringValue(media.mediaUrl) ?? '';
      return `  - ${type} ${index + 1}: ${url}`;
    }),
  ];
}

export function buildContextualPostText(
  postText: string,
  postContext?: Record<string, unknown>,
): string {
  if (!postContext) return postText;

  const contextType = toStringValue(postContext.contextType) ?? 'unknown';
  const mainPost = toPostRecord(postContext.mainPost);
  const quotedPost = toPostRecord(postContext.quotedPost);
  const repostedPost = toPostRecord(postContext.repostedPost);
  const parentPost = toPostRecord(postContext.parentPost);
  const socialContext = isRecord(postContext.socialContext)
    ? postContext.socialContext
    : undefined;
  const extraction = isRecord(postContext.extraction)
    ? postContext.extraction
    : undefined;
  const warnings = Array.isArray(extraction?.warnings)
    ? extraction.warnings.filter(
        (item): item is string => typeof item === 'string',
      )
    : [];

  return [
    'STRUCTURED X POST CONTEXT',
    `Context type: ${contextType}`,
    `Visible social context: ${toStringValue(socialContext?.visibleContextText) ?? 'none'}`,
    `Self-repost/callback: ${socialContext?.isSelfRepost === true ? 'yes' : 'no or unknown'}`,
    `Extraction warnings: ${warnings.length > 0 ? warnings.join(', ') : 'none'}`,
    '',
    ...describePost(
      'MAIN POST - this is the primary comment target',
      mainPost ?? { text: postText },
    ),
    '',
    ...describePost('QUOTED POST - background context only', quotedPost),
    ...(quotedPost ? [''] : []),
    ...describePost(
      'REPOSTED / ORIGINAL POST - background context only',
      repostedPost,
    ),
    ...(repostedPost ? [''] : []),
    ...describePost('PARENT POST - conversation background only', parentPost),
    ...(parentPost ? [''] : []),
    'COMMENT TARGET RULES:',
    '- Reply to the MAIN POST author intent and emotion.',
    '- Use quoted/reposted/parent post only to understand background context.',
    '- If text and image point to different things, prioritize text + relationship context over visible objects.',
    '- For reposts of old posts, look for hindsight, regret, nostalgia, irony, update, or comparison over time.',
    '- For quote posts where the main post is a short reaction to an older post, infer the emotion from the relationship between the main text and the quoted post.',
    '- If the main post sounds like regret toward a past decision, reply to that regret/hindsight rather than praising objects shown in media.',
    '- Do not write a comment only about objects in the image unless the main post is actually about those objects.',
  ].join('\n');
}

export function getTextForLanguageDetection(
  postText: string,
  postContext?: Record<string, unknown>,
): string {
  const mainPost = toPostRecord(postContext?.mainPost);
  return mainPost?.text ?? postText;
}
