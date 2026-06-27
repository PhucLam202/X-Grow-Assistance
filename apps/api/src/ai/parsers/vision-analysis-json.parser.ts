import { Injectable } from '@nestjs/common';
import {
  CommentSuggestion,
  ReplyCandidateScore,
} from '../../reply-pack/types/reply-pack.types';
import {
  AiVisionContextPayload,
  AiVisionPayload,
  CombinedContext,
  VisionAnalysis,
} from '../../vision/types/vision.types';

@Injectable()
export class VisionAnalysisJsonParser {
  parse(content: string): AiVisionPayload {
    const normalized = content.trim();
    const json = normalized.startsWith('```')
      ? normalized.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      : normalized;
    const parsed = JSON.parse(json) as Partial<AiVisionPayload>;

    if (
      typeof parsed.translation !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.context !== 'string' ||
      typeof parsed.theme !== 'string' ||
      typeof parsed.topic !== 'string' ||
      typeof parsed.sentiment !== 'string' ||
      typeof parsed.commentStrategy !== 'string' ||
      !this.isVisionAnalysis(parsed.imageAnalysis) ||
      !this.isCombinedContext(parsed.combinedContext) ||
      !Array.isArray(parsed.suggestions)
    ) {
      throw new Error('AI vision payload has an invalid shape');
    }

    return {
      translation: parsed.translation,
      summary: parsed.summary,
      context: parsed.context,
      theme: parsed.theme,
      topic: parsed.topic,
      sentiment: parsed.sentiment,
      commentStrategy: parsed.commentStrategy,
      imageAnalysis: parsed.imageAnalysis,
      combinedContext: parsed.combinedContext,
      suggestions: parsed.suggestions.map((suggestion) =>
        this.normalizeSuggestion(suggestion),
      ),
    };
  }

  parseContext(content: string): AiVisionContextPayload {
    const normalized = content.trim();
    const json = normalized.startsWith('```')
      ? normalized.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      : normalized;
    const parsed = JSON.parse(json) as Partial<AiVisionContextPayload>;

    const imageAnalysis = this.normalizeVisionAnalysis(parsed.imageAnalysis);
    const combinedContext = this.normalizeCombinedContext(
      parsed.combinedContext,
    );

    if (
      typeof parsed.translation !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.context !== 'string' ||
      typeof parsed.theme !== 'string' ||
      typeof parsed.topic !== 'string' ||
      typeof parsed.sentiment !== 'string' ||
      typeof parsed.commentStrategy !== 'string' ||
      !imageAnalysis ||
      !combinedContext
    ) {
      throw new Error('AI vision context payload has an invalid shape');
    }

    return {
      translation: parsed.translation,
      summary: parsed.summary,
      context: parsed.context,
      theme: parsed.theme,
      topic: parsed.topic,
      sentiment: parsed.sentiment,
      commentStrategy: parsed.commentStrategy,
      imageAnalysis,
      combinedContext,
    };
  }

  private isVisionAnalysis(value: unknown): value is VisionAnalysis {
    const analysis = value as Partial<VisionAnalysis> | undefined;

    return (
      !!analysis &&
      typeof analysis.summary === 'string' &&
      typeof analysis.visibleText === 'string' &&
      typeof analysis.visualTone === 'string' &&
      Array.isArray(analysis.importantObjects) &&
      analysis.importantObjects.every((item) => typeof item === 'string') &&
      (analysis.uncertainty === undefined ||
        typeof analysis.uncertainty === 'string')
    );
  }

  private normalizeVisionAnalysis(value: unknown): VisionAnalysis {
    if (!this.isVisionAnalysis(value)) {
      return {
        summary: '',
        visibleText: '',
        visualTone: '',
        importantObjects: [],
        uncertainty: '',
      };
    }

    return {
      summary: value.summary,
      visibleText: value.visibleText,
      visualTone: value.visualTone,
      importantObjects: value.importantObjects,
      uncertainty: value.uncertainty ?? '',
    };
  }

  private isCombinedContext(value: unknown): value is CombinedContext {
    const context = value as Partial<CombinedContext> | undefined;

    return (
      !!context &&
      typeof context.topic === 'string' &&
      typeof context.intent === 'string' &&
      typeof context.sentiment === 'string' &&
      typeof context.explanation === 'string' &&
      typeof context.commentStrategy === 'string' &&
      Array.isArray(context.avoid) &&
      context.avoid.every((item) => typeof item === 'string')
    );
  }

  private normalizeCombinedContext(value: unknown): CombinedContext {
    if (!this.isCombinedContext(value)) {
      return {
        topic: '',
        intent: '',
        sentiment: '',
        explanation: '',
        commentStrategy: '',
        avoid: [],
      };
    }

    return value;
  }

  private normalizeSuggestion(
    suggestion: Partial<CommentSuggestion>,
  ): CommentSuggestion {
    if (
      typeof suggestion.text !== 'string' ||
      typeof suggestion.meaningVi !== 'string' ||
      typeof suggestion.tone !== 'string' ||
      typeof suggestion.whyItWorks !== 'string'
    ) {
      throw new Error('AI vision suggestion has an invalid shape');
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
      score: this.normalizeScore(
        suggestion.score,
        suggestion.text,
        suggestion.whyItWorks,
      ),
    };
  }

  private normalizeScore(
    score: unknown,
    text: string,
    whyItWorks: string,
  ): ReplyCandidateScore {
    const fallback = this.fallbackScore(text, whyItWorks);
    if (!score || typeof score !== 'object') return fallback;
    const raw = score as Partial<Record<keyof ReplyCandidateScore, unknown>>;
    const postFit = this.clampScore(raw.postFit, fallback.postFit);
    const visibility = this.clampScore(raw.visibility, fallback.visibility);
    const specificity = this.clampScore(raw.specificity, fallback.specificity);
    const native = this.clampScore(raw.native, fallback.native);
    const engagementHook = this.clampScore(
      raw.engagementHook,
      fallback.engagementHook,
    );
    const calculatedTotal = this.clampScore(
      postFit * 0.25 +
        visibility * 0.25 +
        specificity * 0.2 +
        native * 0.15 +
        engagementHook * 0.15,
      fallback.total,
    );

    return {
      total: this.clampScore(raw.total, calculatedTotal),
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

  private fallbackScore(text: string, whyItWorks: string): ReplyCandidateScore {
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
    const total = this.clampScore(
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

  private clampScore(value: unknown, fallback: number): number {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(0, Math.min(100, Math.round(numberValue)));
  }
}
