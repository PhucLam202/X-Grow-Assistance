import { Injectable } from '@nestjs/common';
import { AiReplyPackPayload } from '../ai.types';
import {
  CommentSuggestion,
  ReplyCandidateScore,
} from '../../reply-pack/types/reply-pack.types';

function clampScore(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function fallbackScore(text: string, whyItWorks: string): ReplyCandidateScore {
  const normalized = text.trim();
  const length = normalized.length;
  const hasHook = /\?|😂|🤣|lol|lmao|why|how|this|that/i.test(normalized);
  const isSpecific = length >= 18 && length <= 180;
  const generic = /^(nice|great|cool|wow|true|facts)[.!]*$/i.test(normalized);
  const postFit = generic ? 35 : isSpecific ? 72 : 58;
  const visibility = generic ? 28 : hasHook ? 74 : 62;
  const specificity = generic ? 24 : isSpecific ? 76 : 56;
  const native = length <= 220 ? 78 : 58;
  const engagementHook = hasHook ? 76 : 58;
  const total = clampScore(
    postFit * 0.25 + visibility * 0.25 + specificity * 0.2 + native * 0.15 + engagementHook * 0.15,
    60,
  );

  return {
    total,
    postFit,
    visibility,
    specificity,
    native,
    engagementHook,
    whyVisible: whyItWorks || 'Balanced fallback score based on specificity, naturalness, and hook strength.',
  };
}

function normalizeScore(
  score: unknown,
  text: string,
  whyItWorks: string,
): ReplyCandidateScore {
  const fallback = fallbackScore(text, whyItWorks);
  if (!score || typeof score !== 'object') return fallback;
  const raw = score as Partial<Record<keyof ReplyCandidateScore, unknown>>;
  const postFit = clampScore(raw.postFit, fallback.postFit);
  const visibility = clampScore(raw.visibility, fallback.visibility);
  const specificity = clampScore(raw.specificity, fallback.specificity);
  const native = clampScore(raw.native, fallback.native);
  const engagementHook = clampScore(raw.engagementHook, fallback.engagementHook);
  const calculatedTotal = clampScore(
    postFit * 0.25 + visibility * 0.25 + specificity * 0.2 + native * 0.15 + engagementHook * 0.15,
    fallback.total,
  );

  return {
    total: clampScore(raw.total, calculatedTotal),
    postFit,
    visibility,
    specificity,
    native,
    engagementHook,
    whyVisible:
      typeof raw.whyVisible === 'string' && raw.whyVisible.trim()
        ? raw.whyVisible
        : fallback.whyVisible,
  };
}

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
          score: normalizeScore(
            (suggestion as Partial<CommentSuggestion>).score,
            suggestion.text,
            suggestion.whyItWorks,
          ),
        };
      }),
    };
  }
}
