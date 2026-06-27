import { Injectable } from '@nestjs/common';
import {
  ContinuationSignalResult,
  DriverInput,
} from '../types/comment-intelligence.types';

@Injectable()
export class ContinuationSignalDetectorService {
  detect(input: DriverInput): ContinuationSignalResult {
    const text = this.normalize(input.mainPost.text);
    const signals: string[] = [];

    if (
      /\b(thread|continued below|below|part\s*[12]|\d+\s*\/\s*\d*)\b/i.test(
        text,
      )
    ) {
      signals.push('explicit_thread_marker');
    }
    if (/(\.\.\.|…|👇|⬇️)/.test(text)) signals.push('continuation_hint');
    if (this.hasShortLowContextText(text)) signals.push('low_context_text');
    if ((input.availableReplies?.length ?? 0) > 0) {
      signals.push('same_page_replies_available');
    }
    if (input.extraction.missingFields.length > 0) {
      signals.push('extraction_missing_fields');
    }

    return {
      hasSignal: signals.length > 0,
      signals,
      confidence: Math.min(0.95, 0.35 + signals.length * 0.15),
    };
  }

  private hasShortLowContextText(text: string): boolean {
    return text.length > 0 && text.length < 40 && !/[?？!！]/.test(text);
  }

  private normalize(text?: string): string {
    return (text ?? '').replace(/\s+/g, ' ').trim();
  }
}
