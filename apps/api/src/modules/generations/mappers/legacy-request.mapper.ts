import { randomUUID } from 'crypto';

import { ApplicationError } from '../../../common/errors/application.error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { GenerateReplyPackDto } from '../../../reply-pack/dto/generate-reply-pack.dto';
import { CreateReplyPackRequest } from '../dto/create-reply-pack-request.dto';
import { PostDto } from '../dto/post.dto';
import { ReplyOptionsDto } from '../dto/reply-options.dto';
import type { ResolvedReplyOptions } from '../dto/reply-options.dto';
import type { NicheSelection } from '../types/niche.types';
import {
  DEFAULT_REPLY_COUNT,
  DEFAULT_TONE,
  MIN_REPLY_COUNT,
  isTone,
  toReplyLanguage,
  toTargetCommentLanguage,
} from '../types/style.types';
import type { ReplyCount } from '../types/style.types';

/**
 * Request nội bộ sau khi chuẩn hoá: `postId` chắc chắn có, options đã đủ mọi
 * field. Generation flow chỉ làm việc với type này.
 */
export interface NormalizedReplyPackRequest {
  post: PostDto & { postId: string; text: string };
  options: ResolvedReplyOptions;
}

/**
 * Áp default và bridge alias cũ ↔ mới theo cả hai chiều, để client mới
 * (`language`/`replyCount`) và generation flow hiện tại
 * (`targetLanguage`/`maxSuggestions`) cùng đọc được.
 */
export function resolveReplyOptions(
  raw?: ReplyOptionsDto | null,
): ResolvedReplyOptions {
  const options = raw ?? {};

  const language =
    options.language ?? toReplyLanguage(options.targetLanguage) ?? 'auto';

  const replyCount = resolveReplyCount(
    options.replyCount ?? options.maxSuggestions,
  );

  const toneSelection = options.tone ?? 'auto';
  const tone = isTone(toneSelection) ? toneSelection : DEFAULT_TONE;

  return {
    niche: options.niche ?? 'auto',
    toneSelection,
    tone,
    intent: options.intent ?? 'auto',
    length: options.length ?? 'short',
    energy: options.energy ?? 'balanced',
    language,
    emojiLevel: options.emojiLevel ?? 'none',
    replyCount,
    explanationLanguage: options.explanationLanguage ?? 'vi',
    visionEnabled: options.visionEnabled ?? false,
    targetLanguage: toTargetCommentLanguage(language),
    maxSuggestions: replyCount,
  };
}

/**
 * `replyCount` là mục tiêu, không phải cam kết cứng. Giá trị ngoài {3,4} tới từ
 * `maxSuggestions` (1..5) của contract cũ nên được kẹp thay vì reject; giá trị
 * gửi trực tiếp qua `replyCount` đã bị DTO chặn từ trước.
 */
function resolveReplyCount(value?: number): ReplyCount {
  if (value === undefined) return DEFAULT_REPLY_COUNT;
  return value <= MIN_REPLY_COUNT ? MIN_REPLY_COUNT : DEFAULT_REPLY_COUNT;
}

/**
 * Post phải có ít nhất một nguồn ngữ cảnh: text, hoặc media (sẽ được vision
 * phân tích). Không có gì cả → `INVALID_POST_CONTEXT`.
 */
export function assertPostContext(post: PostDto): void {
  const hasText = (post.text ?? '').trim().length > 0;
  const hasMedia = (post.media ?? []).length > 0;

  if (!hasText && !hasMedia) {
    throw new ApplicationError(
      ErrorCodes.INVALID_POST_CONTEXT,
      'Post must contain text or at least one media item.',
      false,
      400,
    );
  }
}

export function normalizeReplyPackRequest(
  request: CreateReplyPackRequest,
): NormalizedReplyPackRequest {
  const post = request.post ?? ({} as PostDto);
  assertPostContext(post);

  const options = resolveReplyOptions(request.options);
  const hasText = (post.text ?? '').trim().length > 0;

  return {
    post: {
      ...post,
      postId: post.postId ?? post.id ?? `post_${randomUUID()}`,
      text: post.text ?? '',
    },
    options: {
      ...options,
      // Post không có text thì ngữ cảnh duy nhất nằm ở ảnh — bắt buộc bật vision,
      // nếu không generation sẽ chạy nhánh text với chuỗi rỗng.
      visionEnabled: hasText ? options.visionEnabled : true,
    },
  };
}

/**
 * Contract cũ (`POST /reply-pack`) → request chuẩn hoá của module generations.
 */
export function fromGenerateReplyPackDto(
  legacy: GenerateReplyPackDto,
): NormalizedReplyPackRequest {
  return normalizeReplyPackRequest({
    post: {
      platform: legacy.platform,
      text: legacy.postText,
      url: legacy.postUrl,
      author: {
        name: legacy.authorName,
        handle: legacy.authorHandle,
      },
      contentType: 'text',
      postType: 'original',
    },
    options: {
      tone: legacy.tone as ReplyOptionsDto['tone'],
      niche: legacy.niche as NicheSelection,
      targetLanguage:
        legacy.targetCommentLanguage as ReplyOptionsDto['targetLanguage'],
      explanationLanguage: legacy.explanationLanguage,
      maxSuggestions: legacy.maxSuggestions,
      visionEnabled: false,
    },
  });
}
