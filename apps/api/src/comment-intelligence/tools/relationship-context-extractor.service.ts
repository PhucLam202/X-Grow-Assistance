import { Injectable } from '@nestjs/common';
import { DriverInput, PostSegment } from '../types/comment-intelligence.types';

@Injectable()
export class RelationshipContextExtractorService {
  extract(input: DriverInput): {
    parentPost?: PostSegment;
    quotedPost?: PostSegment;
    repostedPost?: PostSegment;
    sources: string[];
  } {
    const sources: string[] = [];
    const quotedPost = this.cleanSegment(input.quotedPost);
    const repostedPost = this.cleanSegment(input.repostedPost);
    const parentPost = this.cleanSegment(input.parentPost);

    if (quotedPost) sources.push('quoted_post');
    if (repostedPost) sources.push('reposted_post');
    if (parentPost) sources.push('parent_post');

    return { quotedPost, repostedPost, parentPost, sources };
  }

  private cleanSegment(segment?: PostSegment): PostSegment | undefined {
    const text = segment?.text?.replace(/\s+/g, ' ').trim();
    if (!text && !segment?.username && !segment?.url) return undefined;
    return { ...segment, text };
  }
}
