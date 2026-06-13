import { Injectable } from '@nestjs/common';
import { VisionContext, VisionReplyPack } from '../vision/types/vision.types';
import { AiConfigService } from './ai.config';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiVisionInput } from './ai.types';
import { VisionAnalysisJsonParser } from './parsers/vision-analysis-json.parser';

@Injectable()
export class AiVisionService {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly parser: VisionAnalysisJsonParser,
  ) {}

  async analyzeVision(input: AiVisionInput): Promise<VisionReplyPack> {
    const provider = this.providerRegistry.get(this.aiConfig.getVisionProviderName());

    if (!provider.analyzeVision) {
      throw new Error(`AI provider ${provider.name} does not support vision analysis`);
    }

    const content = await provider.analyzeVision(input);
    const parsed = this.parser.parse(content);

    return {
      analysisMode: 'vision',
      detectedLanguage: input.detectedLanguage,
      translationLanguage: input.translationLanguage,
      translation: parsed.translation,
      summary: parsed.summary,
      context: parsed.context,
      theme: parsed.theme,
      topic: parsed.topic,
      sentiment: parsed.sentiment,
      commentStrategy: parsed.commentStrategy,
      imageAnalysis: parsed.imageAnalysis,
      combinedContext: parsed.combinedContext,
      suggestions: parsed.suggestions
        .sort((left, right) => (right.score?.total ?? 0) - (left.score?.total ?? 0))
        .slice(0, input.dto.options.maxSuggestions)
        .map((suggestion) => ({
          ...suggestion,
          tone: input.dto.options.tone,
          risk: suggestion.risk ?? 'low',
        })),
    };
  }

  async analyzeVisionContext(input: AiVisionInput): Promise<VisionContext> {
    const provider = this.providerRegistry.get(this.aiConfig.getVisionProviderName());

    const analyzeContext = provider.analyzeVisionContext ?? provider.analyzeVision;
    if (!analyzeContext) {
      throw new Error(`AI provider ${provider.name} does not support vision context analysis`);
    }

    const content = await analyzeContext.call(provider, input);
    const parsed = provider.analyzeVisionContext
      ? this.parseVisionContextOrFallback(content)
      : this.parser.parse(content);

    return {
      analysisMode: 'vision_context',
      detectedLanguage: input.detectedLanguage,
      translationLanguage: input.translationLanguage,
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

  private parseVisionContextOrFallback(content: string) {
    try {
      return this.parser.parseContext(content);
    } catch {
      return this.parser.parse(content);
    }
  }
}
