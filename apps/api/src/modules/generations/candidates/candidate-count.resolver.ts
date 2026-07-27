import { MIN_REPLY_COUNT } from '../types/style.types';
import type { ReplyCount } from '../types/style.types';
import type {
  CandidatePostContext,
  CandidateVisionContext,
} from './candidate.types';

/**
 * Dưới ngưỡng này, và không có ảnh, thì không đủ tín hiệu để dựng 4 góc nhìn
 * khác nhau — slot thứ tư sẽ chỉ là bản diễn đạt lại của slot khác.
 */
export const RICH_CONTEXT_MIN_CHARS = 80;

export interface CandidateCountInput {
  postContext: CandidatePostContext;
  visionContext?: CandidateVisionContext;
  /** `options.replyCount` — mục tiêu, không phải cam kết cứng. */
  requested: ReplyCount;
}

function usefulTextLength(post: CandidatePostContext): number {
  return [post.text, post.quotedPostText, ...(post.threadContext ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .trim().length;
}

/**
 * Chọn 3 hay 4 candidate. Không bao giờ vượt `requested` — user xin 3 thì
 * context giàu tới đâu cũng vẫn là 3.
 */
export function resolveCandidateCount(input: CandidateCountInput): ReplyCount {
  if (input.requested <= MIN_REPLY_COUNT) return MIN_REPLY_COUNT;

  const hasVision = Boolean(input.visionContext?.summary?.trim());
  const isRich =
    usefulTextLength(input.postContext) >= RICH_CONTEXT_MIN_CHARS || hasVision;

  return isRich ? input.requested : MIN_REPLY_COUNT;
}
