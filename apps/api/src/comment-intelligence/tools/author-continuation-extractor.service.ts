import { Injectable } from '@nestjs/common';
import {
  AuthorContinuation,
  DriverInput,
} from '../types/comment-intelligence.types';

@Injectable()
export class AuthorContinuationExtractorService {
  extract(input: DriverInput): AuthorContinuation[] {
    const mainUsername = this.normalizeUsername(input.mainPost.username);
    const replies = input.availableReplies ?? [];

    return replies
      .filter((reply) => {
        const sameAuthor =
          !mainUsername ||
          this.normalizeUsername(reply.username) === mainUsername;
        return sameAuthor && this.isMeaningfulContinuation(reply.text);
      })
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .slice(0, 4)
      .map((reply, index) => ({ ...reply, orderIndex: index }));
  }

  private isMeaningfulContinuation(text?: string): boolean {
    const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
    if (normalized.length < 8) return false;
    if (/^(thanks|thank you|lol|lmao|haha|ｗｗ|笑)$/i.test(normalized)) {
      return false;
    }
    return true;
  }

  private normalizeUsername(username?: string): string | undefined {
    return username?.replace(/^@/, '').trim().toLowerCase() || undefined;
  }
}
