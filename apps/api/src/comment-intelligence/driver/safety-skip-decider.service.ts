import { Injectable } from '@nestjs/common';
import { CommentZone, DriverInput } from '../types/comment-intelligence.types';

@Injectable()
export class SafetySkipDeciderService {
  decide(
    input: DriverInput,
    zone: CommentZone,
  ): { shouldComment: boolean; avoid: string[] } {
    const avoid = [
      'Do not sound generic',
      'Do not ignore quote/parent context',
    ];
    if (zone === 'risky_topic') {
      return {
        shouldComment: false,
        avoid: [
          ...avoid,
          'Do not engage with unsafe, hateful, or highly political content',
        ],
      };
    }
    if (input.extraction.confidence < 0.35) {
      return {
        shouldComment: false,
        avoid: [
          ...avoid,
          'Do not comment when extraction confidence is too low',
        ],
      };
    }
    return { shouldComment: true, avoid };
  }
}
