import { Injectable } from '@nestjs/common';
import { AiReplyPackPayload } from '../ai.types';
import {
  CommentSuggestion,
  ReplyCandidateScore,
} from '../../reply-pack/types/reply-pack.types';
import { jsonrepair } from 'jsonrepair';

export function clampScore(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function fallbackScore(
  text: string,
  whyItWorks: string,
): ReplyCandidateScore {
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
    postFit * 0.25 +
      visibility * 0.25 +
      specificity * 0.2 +
      native * 0.15 +
      engagementHook * 0.15,
    60,
  );
  return {
    total,
    postFit,
    visibility,
    specificity,
    native,
    engagementHook,
    whyVisible:
      whyItWorks ||
      'Balanced fallback score based on specificity, naturalness, and hook strength.',
  };
}

export function normalizeScore(
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
  const engagementHook = clampScore(
    raw.engagementHook,
    fallback.engagementHook,
  );
  const calculatedTotal = clampScore(
    postFit * 0.25 +
      visibility * 0.25 +
      specificity * 0.2 +
      native * 0.15 +
      engagementHook * 0.15,
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
    const raw = JSON.parse(jsonrepair(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim())) as Record<string, unknown>;

    const translation = String(raw.translation ?? raw.translation_vi ?? '');
    const summary = String(
      raw.summary ?? raw.text_summary ?? raw.textSummary ?? '',
    );
    const context = String(
      raw.context ?? raw.combined_context ?? raw.combinedContext ?? '',
    );
    const theme = String(raw.theme ?? 'general');
    const topic = String(raw.topic ?? 'general');
    const sentiment = String(raw.sentiment ?? 'neutral');
    const commentStrategy = String(
      raw.commentStrategy ?? raw.comment_strategy ?? raw.strategy ?? '',
    );

    const rawSuggestions = Array.isArray(raw.suggestions)
      ? raw.suggestions
      : [];

    // ponytail: drop half-written items (truncated JSON) instead of failing the whole pack
    const suggestions: CommentSuggestion[] = rawSuggestions.flatMap((item) => {
      const s = (item && typeof item === 'object' ? item : {}) as Record<
        string,
        unknown
      >;
      const text = String(s.text ?? s.comment ?? s.content ?? '').trim();
      if (!text) return [];

      const meaningVi = String(
        s.meaningVi ?? s.meaning_vi ?? s.meaning ?? '',
      ).trim();
      const tone = String(s.tone ?? 'short_native').trim();
      const whyItWorks = String(
        s.whyItWorks ?? s.why_it_works ?? s.reason ?? '',
      ).trim();
      const risk = s.risk === 'medium' || s.risk === 'high' ? s.risk : 'low';

      return [
        {
          text,
          meaningVi,
          tone,
          risk,
          whyItWorks,
          score: normalizeScore(s.score, text, whyItWorks),
        },
      ];
    });

    if (suggestions.length === 0) {
      throw new Error('AI payload contains no suggestions');
    }

    return {
      translation,
      summary,
      context,
      theme,
      topic,
      sentiment,
      commentStrategy,
      suggestions,
    };
  }
}
