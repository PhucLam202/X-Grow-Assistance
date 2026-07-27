import { Injectable } from '@nestjs/common';
import { CommentSuggestion } from '../../reply-pack/types/reply-pack.types';
import {
  AiVisionContextPayload,
  AiVisionPayload,
  CombinedContext,
  VisionAnalysis,
} from '../../vision/types/vision.types';
import { jsonrepair } from 'jsonrepair';
import {
  clampScore,
  fallbackScore,
  normalizeScore,
} from './reply-pack-json.parser';

@Injectable()
export class VisionAnalysisJsonParser {
  parse(content: string): AiVisionPayload {
    const parsed = JSON.parse(jsonrepair(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim())) as Partial<AiVisionPayload>;

    if (
      typeof parsed.translation !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.context !== 'string' ||
      typeof parsed.theme !== 'string' ||
      typeof parsed.topic !== 'string' ||
      typeof parsed.sentiment !== 'string' ||
      typeof parsed.commentStrategy !== 'string' ||
      !isVisionAnalysis(parsed.imageAnalysis) ||
      !isCombinedContext(parsed.combinedContext) ||
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
      suggestions: parsed.suggestions.map(normalizeSuggestion),
    };
  }

  parseContext(content: string): AiVisionContextPayload {
    const parsed = JSON.parse(
      jsonrepair(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()),
    ) as Partial<AiVisionContextPayload>;
    const imageAnalysis = normalizeVisionAnalysis(parsed.imageAnalysis);
    const combinedContext = normalizeCombinedContext(parsed.combinedContext);

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
}

function isVisionAnalysis(value: unknown): value is VisionAnalysis {
  const a = value as Partial<VisionAnalysis> | undefined;
  return (
    !!a &&
    typeof a.summary === 'string' &&
    typeof a.visibleText === 'string' &&
    typeof a.visualTone === 'string' &&
    Array.isArray(a.importantObjects) &&
    a.importantObjects.every((item) => typeof item === 'string') &&
    (a.uncertainty === undefined || typeof a.uncertainty === 'string')
  );
}

function normalizeVisionAnalysis(value: unknown): VisionAnalysis {
  if (!isVisionAnalysis(value)) {
    return {
      summary: '',
      visibleText: '',
      visualTone: '',
      importantObjects: [],
      uncertainty: '',
    };
  }
  return { ...value, uncertainty: value.uncertainty ?? '' };
}

function isCombinedContext(value: unknown): value is CombinedContext {
  const c = value as Partial<CombinedContext> | undefined;
  return (
    !!c &&
    typeof c.topic === 'string' &&
    typeof c.intent === 'string' &&
    typeof c.sentiment === 'string' &&
    typeof c.explanation === 'string' &&
    typeof c.commentStrategy === 'string' &&
    Array.isArray(c.avoid) &&
    c.avoid.every((item) => typeof item === 'string')
  );
}

function normalizeCombinedContext(value: unknown): CombinedContext {
  if (!isCombinedContext(value)) {
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

function normalizeSuggestion(
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
    score: normalizeScore(
      suggestion.score,
      suggestion.text,
      suggestion.whyItWorks,
    ),
  };
}

export { normalizeScore };
