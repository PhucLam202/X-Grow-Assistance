import { Injectable } from '@nestjs/common';
import { ErrorCodes } from '../common/errors/error-codes';
import { ReplyPack } from '../reply-pack/types/reply-pack.types';
import { AiConfigService } from './ai.config';
import { AiProviderRegistry } from './ai-provider.registry';
import {
  AiExecutionResult,
  AiProviderError,
  AiReplyPackInput,
  OpenAiCompatibleResponse,
} from './ai.types';
import { ReplyPackJsonParser } from './parsers/reply-pack-json.parser';

@Injectable()
export class AiReplyPackService {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly parser: ReplyPackJsonParser,
  ) {}

  async generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const { apiUrl, apiKey, model } = this.aiConfig.getTextProviderEndpoint();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
      }),
    });
    if (!response.ok)
      throw new Error(`generateText: provider responded ${response.status}`);
    const text = ((await response.json()) as OpenAiCompatibleResponse)
      .choices?.[0]?.message?.content;
    if (!text) throw new Error('generateText: empty response from provider');
    return text;
  }

  async generateReplyPack(
    input: AiReplyPackInput,
  ): Promise<AiExecutionResult<ReplyPack>> {
    const primaryName = this.aiConfig.getTextProviderName();
    const primaryEndpoint = this.aiConfig.getTextProviderEndpoint();
    const primaryModel = primaryEndpoint.model;

    const fallbackConfig = this.aiConfig.getTextFallbackConfig();
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
      providerResult = await primaryProvider.generateReplyPack(input);
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
        if (!fallbackProvider.generateReplyPack) {
          throw new AiProviderError(
            `Fallback provider ${fallbackConfig.provider} does not support text generation`,
            {
              providerName: fallbackConfig.provider,
              code: ErrorCodes.AI_UNSUPPORTED_CAPABILITY,
              isRetryable: false,
            },
          );
        }
        providerResult = await fallbackProvider.generateReplyPack(input);
        finalProviderName = fallbackConfig.provider;
        finalModelName = fallbackConfig.model;
      } else {
        throw primaryError;
      }
    }

    const parsed = this.parser.parse(providerResult.content);

    const data: ReplyPack = {
      detectedLanguage: input.detectedLanguage,
      translationLanguage: input.dto.translationLanguage,
      translation: parsed.translation,
      summary: parsed.summary,
      context: parsed.context,
      theme: parsed.theme,
      topic: parsed.topic,
      sentiment: parsed.sentiment,
      commentStrategy: parsed.commentStrategy,
      suggestions: parsed.suggestions
        .sort(
          (left, right) => (right.score?.total ?? 0) - (left.score?.total ?? 0),
        )
        .slice(0, input.dto.maxSuggestions)
        .map((suggestion) => ({
          ...suggestion,
          tone: input.dto.tone,
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
        replyPackUsage: providerResult.usage,
      },
    };
  }
}
