import { Injectable } from '@nestjs/common';
import {
  CommentDepth,
  CommentZone,
  DriverInput,
} from '../types/comment-intelligence.types';

@Injectable()
export class CommentStrategyWriterService {
  write(input: {
    driverInput: DriverInput;
    zone: CommentZone;
    intent: string;
    language: string;
    tone: string;
    depth: CommentDepth;
  }): string {
    const contextHint = this.contextHint(input.driverInput);
    return [
      `Write a ${input.depth} ${input.language} reply for ${input.zone}.`,
      `Intent: ${input.intent}. Tone: ${input.tone}.`,
      contextHint,
      'Be specific to the main post and avoid over-explaining.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private contextHint(input: DriverInput): string | undefined {
    const sources = input.contextState?.expansionSources ?? [];
    if (sources.length === 0) return undefined;
    return `Use expanded context from: ${sources.join(', ')}.`;
  }
}
