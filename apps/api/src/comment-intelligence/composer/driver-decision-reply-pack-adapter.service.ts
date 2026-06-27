import { Injectable } from '@nestjs/common';
import { GenerateReplyPackDto } from '../../reply-pack/dto/generate-reply-pack.dto';
import { CommentStyleMapperService } from './comment-style-mapper.service';
import {
  CommentStyle,
  ComposerInput,
  DriverInput,
} from '../types/comment-intelligence.types';

@Injectable()
export class DriverDecisionReplyPackAdapterService {
  constructor(private readonly styleMapper: CommentStyleMapperService) {}

  toDto(
    composerInput: ComposerInput,
    style: CommentStyle,
  ): GenerateReplyPackDto {
    const { input, decision } = composerInput;
    return {
      platform: 'x',
      postText: this.buildPostText(input),
      postContext: {
        driverDecision: decision,
        requestedComposerStyle: style,
        strategySource: 'comment-intelligence-driver',
        strictInstruction:
          'Use the driverDecision as the source of truth. Do not choose a new strategy.',
      },
      authorName: input.mainPost.authorName,
      authorHandle: input.mainPost.username,
      postUrl: input.mainPost.url,
      targetCommentLanguage: this.styleMapper.toTargetLanguage(input, decision),
      explanationLanguage: 'vi',
      tone: this.styleMapper.toReplyPackTone(style, decision),
      niche: this.styleMapper.toReplyPackNiche(decision),
      maxSuggestions: 3,
    };
  }

  private buildPostText(input: DriverInput): string {
    const parts = [
      input.mainPost.text,
      input.quotedPost?.text
        ? `Quoted post: ${input.quotedPost.text}`
        : undefined,
      input.repostedPost?.text
        ? `Reposted post: ${input.repostedPost.text}`
        : undefined,
      input.parentPost?.text
        ? `Parent post: ${input.parentPost.text}`
        : undefined,
      ...(input.authorContinuations ?? []).map(
        (item) =>
          `Author continuation ${item.orderIndex + 1}: ${item.text ?? ''}`,
      ),
      ...(input.media ?? []).map((media) =>
        [
          media.altText ? `Image alt: ${media.altText}` : undefined,
          media.ocrText ? `Image OCR: ${media.ocrText}` : undefined,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    ];

    return parts.filter(Boolean).join('\n\n') || 'No post text extracted.';
  }
}
