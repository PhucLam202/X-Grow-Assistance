import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ErrorCodes } from '../../../common/errors/error-codes';
import { NICHE_SELECTIONS } from '../types/niche.types';
import type { NicheSelection } from '../types/niche.types';
import {
  COMMENT_INTENT_SELECTIONS,
  EMOJI_LEVELS,
  ENERGY_LEVELS,
  REPLY_COUNTS,
  REPLY_LANGUAGES,
  REPLY_LENGTHS,
  TARGET_COMMENT_LANGUAGES,
  TONE_SELECTIONS,
} from '../types/style.types';
import type {
  CommentIntentSelection,
  EmojiLevel,
  EnergyLevel,
  ReplyCount,
  ReplyLanguage,
  ReplyLength,
  TargetCommentLanguage,
  Tone,
  ToneSelection,
} from '../types/style.types';

/**
 * Mọi field đều optional: default được áp ở `resolveReplyOptions()` chứ không
 * dựa vào class-transformer (global pipe đang chạy `whitelist` +
 * `forbidNonWhitelisted` và không bật `exposeDefaultValues`).
 */
export class ReplyOptionsDto {
  @IsOptional()
  @IsIn(NICHE_SELECTIONS, { message: ErrorCodes.INVALID_NICHE })
  niche?: NicheSelection;

  @IsOptional()
  @IsIn(TONE_SELECTIONS, { message: ErrorCodes.INVALID_TONE })
  tone?: ToneSelection;

  @IsOptional()
  @IsIn(COMMENT_INTENT_SELECTIONS, { message: ErrorCodes.INVALID_INTENT })
  intent?: CommentIntentSelection;

  @IsOptional()
  @IsIn(REPLY_LENGTHS)
  length?: ReplyLength;

  @IsOptional()
  @IsIn(ENERGY_LEVELS)
  energy?: EnergyLevel;

  @IsOptional()
  @IsIn(REPLY_LANGUAGES)
  language?: ReplyLanguage;

  @IsOptional()
  @IsIn(EMOJI_LEVELS)
  emojiLevel?: EmojiLevel;

  @IsOptional()
  @IsIn(REPLY_COUNTS, { message: ErrorCodes.INVALID_REPLY_COUNT })
  replyCount?: ReplyCount;

  @IsOptional()
  @IsIn(['en', 'vi'])
  explanationLanguage?: 'en' | 'vi';

  @IsOptional()
  @IsBoolean()
  visionEnabled?: boolean;

  /** @deprecated Dùng `language`. Giữ để client cũ không vỡ. */
  @IsOptional()
  @IsIn(TARGET_COMMENT_LANGUAGES)
  targetLanguage?: TargetCommentLanguage;

  /** @deprecated Dùng `replyCount`. Giữ để client cũ không vỡ. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxSuggestions?: number;
}

/**
 * Options sau khi áp default và bridge alias cũ ↔ mới. Cả hai bộ tên đều được
 * populate để generation flow hiện tại (Phase 4–6 mới đổi) chạy nguyên trạng.
 */
export interface ResolvedReplyOptions {
  niche: NicheSelection;
  /** Tone người dùng chọn, có thể là `auto`. */
  toneSelection: ToneSelection;
  /** Tone cụ thể đã chốt — `auto` được resolve về `DEFAULT_TONE`. */
  tone: Tone;
  intent: CommentIntentSelection;
  length: ReplyLength;
  energy: EnergyLevel;
  language: ReplyLanguage;
  emojiLevel: EmojiLevel;
  replyCount: ReplyCount;
  explanationLanguage: 'en' | 'vi';
  visionEnabled: boolean;
  /** @deprecated Alias của `language`. */
  targetLanguage: TargetCommentLanguage;
  /** @deprecated Alias của `replyCount`. */
  maxSuggestions: number;
}
