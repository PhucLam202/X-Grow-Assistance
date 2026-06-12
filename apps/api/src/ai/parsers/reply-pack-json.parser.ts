import { Injectable } from '@nestjs/common';
import { AiReplyPackPayload } from '../ai.types';
import { CommentSuggestion } from '../../reply-pack/types/reply-pack.types';

@Injectable()
export class ReplyPackJsonParser {
  parse(content: string): AiReplyPackPayload {
    const normalized = content.trim();
    const json = normalized.startsWith('```')
      ? normalized.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      : normalized;

    const parsed = JSON.parse(json) as Partial<AiReplyPackPayload> & {
      suggestions?: Array<Partial<CommentSuggestion>>;
    };

    if (
      typeof parsed.translation !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.context !== 'string' ||
      typeof parsed.theme !== 'string' ||
      typeof parsed.topic !== 'string' ||
      typeof parsed.sentiment !== 'string' ||
      typeof parsed.commentStrategy !== 'string' ||
      !Array.isArray(parsed.suggestions)
    ) {
      throw new Error('AI payload has an invalid shape');
    }

    return {
      translation: parsed.translation,
      summary: parsed.summary,
      context: parsed.context,
      theme: parsed.theme,
      topic: parsed.topic,
      sentiment: parsed.sentiment,
      commentStrategy: parsed.commentStrategy,
      suggestions: parsed.suggestions.map((suggestion) => {
        if (
          typeof suggestion.text !== 'string' ||
          typeof suggestion.meaningVi !== 'string' ||
          typeof suggestion.tone !== 'string' ||
          typeof suggestion.whyItWorks !== 'string'
        ) {
          throw new Error('AI suggestion has an invalid shape');
        }

        return {
          text: suggestion.text,
          meaningVi: suggestion.meaningVi,
          tone: suggestion.tone,
          risk:
            suggestion.risk === 'medium' || suggestion.risk === 'high'
              ? suggestion.risk
              : 'low',
          whyItWorks: suggestion.whyItWorks,
        };
      }),
    };
  }
}
