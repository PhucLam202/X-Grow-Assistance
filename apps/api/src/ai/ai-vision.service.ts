import { Injectable, Logger } from '@nestjs/common';
import { VisionContext, VisionReplyPack } from '../vision/types/vision.types';
import { ErrorCodes } from '../common/errors/error-codes';
import { AiConfigService } from './ai.config';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiExecutionResult, AiProviderError, AiVisionInput } from './ai.types';
import { VisionAnalysisJsonParser } from './parsers/vision-analysis-json.parser';

@Injectable()
export class AiVisionService {
  private readonly logger = new Logger(AiVisionService.name);

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly parser: VisionAnalysisJsonParser,
  ) {}

  async analyzeVision(
    input: AiVisionInput,
  ): Promise<AiExecutionResult<VisionReplyPack>> {
    const primaryName = this.aiConfig.getVisionProviderName();
    const primaryModel =
      this.aiConfig.getProviderDefaultVisionModel(primaryName);

    const fallbackConfig = this.aiConfig.getVisionFallbackConfig();
    const canAttemptFallback =
      fallbackConfig !== null && fallbackConfig.provider !== primaryName;

    let finalProviderName = primaryName;
    let finalModelName = primaryModel;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    let attemptCount = 1;
    let providerResult: {
      content: string;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
    };

    try {
      const primaryProvider = this.providerRegistry.get(primaryName);
      if (!primaryProvider.analyzeVision) {
        throw new AiProviderError(
          `AI provider ${primaryProvider.name} does not support vision analysis`,
          {
            providerName: primaryProvider.name,
            code: ErrorCodes.AI_UNSUPPORTED_CAPABILITY,
            isRetryable: false,
          },
        );
      }
      providerResult = await primaryProvider.analyzeVision(input);
    } catch (primaryError) {
      const isRetryable =
        primaryError instanceof AiProviderError && primaryError.isRetryable;

      if (isRetryable && canAttemptFallback && fallbackConfig) {
        fallbackUsed = true;
        attemptCount = 2;
        fallbackReason =
          primaryError instanceof AiProviderError
            ? primaryError.message
            : (primaryError as Error).message;

        const fallbackProvider = this.providerRegistry.get(
          fallbackConfig.provider,
        );
        if (!fallbackProvider.analyzeVision) {
          throw new AiProviderError(
            `Fallback vision provider ${fallbackConfig.provider} does not support vision analysis`,
            {
              providerName: fallbackConfig.provider,
              code: ErrorCodes.AI_UNSUPPORTED_CAPABILITY,
              isRetryable: false,
            },
          );
        }
        providerResult = await fallbackProvider.analyzeVision(input);
        finalProviderName = fallbackConfig.provider;
        finalModelName = fallbackConfig.model;
      } else {
        throw primaryError;
      }
    }

    const parsed = this.parser.parse(providerResult.content);

    const data: VisionReplyPack = {
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
        .sort(
          (left, right) => (right.score?.total ?? 0) - (left.score?.total ?? 0),
        )
        .slice(0, input.dto.options.maxSuggestions)
        .map((suggestion) => ({
          ...suggestion,
          tone: input.dto.options.tone,
          risk: suggestion.risk ?? 'low',
        })),
    };

    return {
      data,
      execution: {
        primaryProvider: primaryName,
        primaryModel,
        finalProvider: finalProviderName,
        finalModel: finalModelName,
        fallbackUsed,
        fallbackReason,
        attemptCount,
        visionUsage: providerResult.usage,
      },
    };
  }

  async analyzeVisionContext(
    input: AiVisionInput,
  ): Promise<AiExecutionResult<VisionContext>> {
    const primaryName = this.aiConfig.getVisionProviderName();
    const primaryModel =
      this.aiConfig.getProviderDefaultVisionModel(primaryName);

    const fallbackConfig = this.aiConfig.getVisionFallbackConfig();
    const canAttemptFallback =
      fallbackConfig !== null && fallbackConfig.provider !== primaryName;

    let finalProviderName = primaryName;
    let finalModelName = primaryModel;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    let attemptCount = 1;
    let providerResult: {
      content: string;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
    };
    let usedContextMethodOnProvider = false;

    try {
      const primaryProvider = this.providerRegistry.get(primaryName);
      const analyzeContextFn =
        primaryProvider.analyzeVisionContext ?? primaryProvider.analyzeVision;
      if (!analyzeContextFn) {
        throw new AiProviderError(
          `AI provider ${primaryProvider.name} does not support vision context analysis`,
          {
            providerName: primaryProvider.name,
            code: ErrorCodes.AI_UNSUPPORTED_CAPABILITY,
            isRetryable: false,
          },
        );
      }
      usedContextMethodOnProvider = !!primaryProvider.analyzeVisionContext;
      providerResult = await analyzeContextFn.call(primaryProvider, input);
    } catch (primaryError) {
      const isRetryable =
        primaryError instanceof AiProviderError && primaryError.isRetryable;

      if (isRetryable && canAttemptFallback && fallbackConfig) {
        fallbackUsed = true;
        attemptCount = 2;
        fallbackReason =
          primaryError instanceof AiProviderError
            ? primaryError.message
            : (primaryError as Error).message;

        const fallbackProvider = this.providerRegistry.get(
          fallbackConfig.provider,
        );
        const fallbackContextFn =
          fallbackProvider.analyzeVisionContext ??
          fallbackProvider.analyzeVision;
        if (!fallbackContextFn) {
          throw new AiProviderError(
            `Fallback vision provider ${fallbackConfig.provider} does not support vision context analysis`,
            {
              providerName: fallbackConfig.provider,
              code: ErrorCodes.AI_UNSUPPORTED_CAPABILITY,
              isRetryable: false,
            },
          );
        }
        usedContextMethodOnProvider = !!fallbackProvider.analyzeVisionContext;
        providerResult = await fallbackContextFn.call(fallbackProvider, input);
        finalProviderName = fallbackConfig.provider;
        finalModelName = fallbackConfig.model;
      } else {
        throw primaryError;
      }
    }

    const parsed = usedContextMethodOnProvider
      ? this.parseVisionContextOrFallback(providerResult.content)
      : this.parser.parse(providerResult.content);

    const data: VisionContext = {
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

    return {
      data,
      execution: {
        primaryProvider: primaryName,
        primaryModel,
        finalProvider: finalProviderName,
        finalModel: finalModelName,
        fallbackUsed,
        fallbackReason,
        attemptCount,
        visionUsage: providerResult.usage,
      },
    };
  }

  private parseVisionContextOrFallback(content: string) {
    try {
      return this.parser.parseContext(content);
    } catch (e1) {
      this.logger.warn(
        `parseContext failed (${(e1 as Error).message}), raw length=${content.length}, snippet=${content.slice(0, 300)}`,
      );
      return this.parser.parse(content);
    }
  }
}
