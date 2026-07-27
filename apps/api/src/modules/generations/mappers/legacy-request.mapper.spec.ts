import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ApplicationError } from '../../../common/errors/application.error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { GenerateReplyPackDto } from '../../../reply-pack/dto/generate-reply-pack.dto';
import { CreateReplyPackRequest } from '../dto/create-reply-pack-request.dto';
import {
  fromGenerateReplyPackDto,
  normalizeReplyPackRequest,
  resolveReplyOptions,
} from './legacy-request.mapper';

const fullRequest = {
  post: {
    platform: 'x',
    id: 'post_123',
    text: 'AI agents are changing how developers build products.',
    language: 'en',
    hashtags: ['AI'],
    media: [],
  },
  options: {
    niche: 'auto',
    tone: 'insightful',
    intent: 'add_insight',
    length: 'short',
    energy: 'balanced',
    language: 'auto',
    emojiLevel: 'none',
    replyCount: 4,
  },
};

async function validateRequest(payload: unknown) {
  const instance = plainToInstance(CreateReplyPackRequest, payload);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('CreateReplyPackRequest validation', () => {
  it('accepts the full new-contract request', async () => {
    expect(await validateRequest(fullRequest)).toHaveLength(0);
  });

  it('accepts a request without options', async () => {
    expect(await validateRequest({ post: fullRequest.post })).toHaveLength(0);
  });

  it('rejects an unknown niche with INVALID_NICHE', async () => {
    const errors = await validateRequest({
      ...fullRequest,
      options: { ...fullRequest.options, niche: 'not_a_niche' },
    });

    expect(flatten(errors)).toContain(ErrorCodes.INVALID_NICHE);
  });

  it('rejects an unknown intent with INVALID_INTENT', async () => {
    const errors = await validateRequest({
      ...fullRequest,
      options: { ...fullRequest.options, intent: 'rant' },
    });

    expect(flatten(errors)).toContain(ErrorCodes.INVALID_INTENT);
  });

  it.each([1, 2, 5, 7])('rejects replyCount=%i', async (replyCount) => {
    const errors = await validateRequest({
      ...fullRequest,
      options: { ...fullRequest.options, replyCount },
    });

    expect(flatten(errors)).toContain(ErrorCodes.INVALID_REPLY_COUNT);
  });

  it.each([3, 4])('accepts replyCount=%i', async (replyCount) => {
    const errors = await validateRequest({
      ...fullRequest,
      options: { ...fullRequest.options, replyCount },
    });

    expect(errors).toHaveLength(0);
  });
});

describe('resolveReplyOptions', () => {
  it('applies every documented default', () => {
    expect(resolveReplyOptions()).toEqual({
      niche: 'auto',
      toneSelection: 'auto',
      tone: 'short_native',
      intent: 'auto',
      length: 'short',
      energy: 'balanced',
      language: 'auto',
      emojiLevel: 'none',
      replyCount: 4,
      explanationLanguage: 'vi',
      visionEnabled: false,
      targetLanguage: 'same_as_original',
      maxSuggestions: 4,
    });
  });

  it('derives language from the deprecated targetLanguage alias', () => {
    expect(resolveReplyOptions({ targetLanguage: 'ja' }).language).toBe('ja');
    expect(
      resolveReplyOptions({ targetLanguage: 'same_as_original' }).language,
    ).toBe('auto');
  });

  it('keeps the deprecated targetLanguage populated from the new field', () => {
    expect(resolveReplyOptions({ language: 'vi' }).targetLanguage).toBe('vi');
    expect(resolveReplyOptions({ language: 'auto' }).targetLanguage).toBe(
      'same_as_original',
    );
  });

  it('clamps the legacy maxSuggestions range into {3,4}', () => {
    expect(resolveReplyOptions({ maxSuggestions: 1 }).replyCount).toBe(3);
    expect(resolveReplyOptions({ maxSuggestions: 3 }).replyCount).toBe(3);
    expect(resolveReplyOptions({ maxSuggestions: 5 }).replyCount).toBe(4);
  });

  it('resolves tone=auto to a concrete tone but keeps the selection', () => {
    const resolved = resolveReplyOptions({ tone: 'auto' });

    expect(resolved.toneSelection).toBe('auto');
    expect(resolved.tone).toBe('short_native');
  });

  it('leaves an explicit tone untouched', () => {
    expect(resolveReplyOptions({ tone: 'insightful' }).tone).toBe('insightful');
  });
});

describe('normalizeReplyPackRequest', () => {
  it('normalizes the post id alias', () => {
    expect(normalizeReplyPackRequest(fullRequest as never).post.postId).toBe(
      'post_123',
    );
  });

  it('throws INVALID_POST_CONTEXT when there is no text and no media', () => {
    expect(() =>
      normalizeReplyPackRequest({
        post: { platform: 'x', postId: 'p1', text: '   ' },
      } as never),
    ).toThrow(
      expect.objectContaining({ code: ErrorCodes.INVALID_POST_CONTEXT }),
    );
  });

  it('accepts a media-only post and forces vision on', () => {
    const normalized = normalizeReplyPackRequest({
      post: {
        platform: 'x',
        postId: 'p1',
        media: [{ type: 'image', url: 'https://example.com/a.jpg' }],
      },
      options: { visionEnabled: false },
    } as never);

    expect(normalized.options.visionEnabled).toBe(true);
    expect(normalized.post.text).toBe('');
  });

  it('does not force vision on when the post has text', () => {
    expect(
      normalizeReplyPackRequest(fullRequest as never).options.visionEnabled,
    ).toBe(false);
  });
});

describe('fromGenerateReplyPackDto', () => {
  const legacy: GenerateReplyPackDto = {
    platform: 'x',
    postText: 'Legacy post body',
    authorName: 'Dev',
    authorHandle: 'dev',
    postUrl: 'https://x.com/dev/status/1',
    targetCommentLanguage: 'en',
    explanationLanguage: 'vi',
    tone: 'casual_supportive',
    niche: 'tech',
    maxSuggestions: 3,
  };

  it('maps a legacy request onto the new normalized contract', () => {
    const normalized = fromGenerateReplyPackDto(legacy);

    expect(normalized.post).toEqual(
      expect.objectContaining({
        platform: 'x',
        text: 'Legacy post body',
        url: 'https://x.com/dev/status/1',
        author: { name: 'Dev', handle: 'dev' },
      }),
    );
    expect(normalized.post.postId).toMatch(/^post_/);
    expect(normalized.options).toEqual(
      expect.objectContaining({
        tone: 'casual_supportive',
        niche: 'tech',
        language: 'en',
        targetLanguage: 'en',
        replyCount: 3,
        maxSuggestions: 3,
        explanationLanguage: 'vi',
        visionEnabled: false,
      }),
    );
  });

  it('rejects a legacy request with an empty post body', () => {
    expect(() => fromGenerateReplyPackDto({ ...legacy, postText: '' })).toThrow(
      ApplicationError,
    );
  });
});

function flatten(errors: Awaited<ReturnType<typeof validate>>): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flatten(error.children ?? []),
  ]);
}
