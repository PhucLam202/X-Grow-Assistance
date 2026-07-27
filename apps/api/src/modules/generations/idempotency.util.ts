import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { CreateReplyPackRequest } from './dto/create-reply-pack-request.dto';

export function validateIdempotencyKey(rawKey?: unknown): string | undefined {
  if (rawKey === undefined || rawKey === null) {
    return undefined;
  }

  if (typeof rawKey !== 'string') {
    throw new BadRequestException(
      'Idempotency-Key must be a non-empty string between 1 and 128 characters',
    );
  }

  const trimmed = rawKey.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new BadRequestException(
      'Idempotency-Key must be a non-empty string between 1 and 128 characters',
    );
  }

  return trimmed;
}

export function hashIdempotencyKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim()).digest('hex');
}

export function computeRequestHash(
  userId: string,
  request: CreateReplyPackRequest,
): string {
  const media = (request.post?.media ?? []).map((m) => ({
    type: m.type ?? '',
    url: m.url ?? '',
  }));

  const canonicalObject = {
    userId,
    postId: request.post?.postId ?? '',
    platform: request.post?.platform ?? '',
    text: request.post?.text ?? '',
    url: request.post?.url ?? '',
    authorName: request.post?.author?.name ?? '',
    authorHandle: request.post?.author?.handle ?? '',
    media,
    tone: request.options?.tone ?? '',
    niche: request.options?.niche ?? '',
    targetLanguage: request.options?.targetLanguage ?? '',
    maxSuggestions: request.options?.maxSuggestions ?? 3,
    explanationLanguage: request.options?.explanationLanguage ?? '',
    visionEnabled: Boolean(request.options?.visionEnabled),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalObject))
    .digest('hex');
}
