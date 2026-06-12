import { Injectable } from '@nestjs/common';
import { CommentSuggestion } from '../../reply-pack/types/reply-pack.types';
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

    if (
      typeof parsed.translation !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.context !== 'string' ||
      typeof parsed.theme !== 'string' ||
      typeof parsed.topic !== 'string' ||
      typeof parsed.sentiment !== 'string' ||
      typeof parsed.commentStrategy !== 'string' ||
      !this.isVisionAnalysis(parsed.imageAnalysis) ||
      !this.isCombinedContext(parsed.combinedContext)
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
      imageAnalysis: parsed.imageAnalysis,
      combinedContext: parsed.combinedContext,
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
      (analysis.uncertainty === undefined || typeof analysis.uncertainty === 'string')
    );
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

  private normalizeSuggestion(suggestion: Partial<CommentSuggestion>): CommentSuggestion {
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
    };
  }
}
