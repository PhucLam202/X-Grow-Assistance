import { Injectable } from '@nestjs/common';
import { ErrorCodes } from '../../common/errors/error-codes';
import { AiConfigService } from '../ai.config';
import {
  AiProviderError,
  AiProviderResult,
  AiReplyPackInput,
} from '../ai.types';
import { ReplyPackPromptBuilder } from '../prompt/reply-pack.prompt';
import { AiProvider, AiStructuredCallOptions } from './ai-provider.interface';
import { classifyHttpError } from './http.util';

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly promptBuilder: ReplyPackPromptBuilder,
  ) {}

  generateReplyPack(input: AiReplyPackInput): Promise<AiProviderResult> {
    return this.callModel(this.promptBuilder.build(input));
  }

  generateStructured(
    prompt: string,
    options?: AiStructuredCallOptions,
  ): Promise<AiProviderResult> {
    return this.callModel(prompt, options);
  }

  private async callModel(
    prompt: string,
    options?: AiStructuredCallOptions,
  ): Promise<AiProviderResult> {
    const { apiKey, model } = this.aiConfig.getGeminiConfig();

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: options?.temperature ?? 0.7,
              responseMimeType: 'application/json',
              ...(options?.maxTokens != null
                ? { maxOutputTokens: options.maxTokens }
                : {}),
            },
          }),
          ...(options?.timeoutMs != null
            ? { signal: AbortSignal.timeout(options.timeoutMs) }
            : {}),
        },
      );
    } catch (fetchError) {
      if (
        fetchError instanceof Error &&
        (fetchError.name === 'AbortError' || fetchError.name === 'TimeoutError')
      ) {
        throw new AiProviderError('Gemini fetch timed out', {
          providerName: 'gemini',
          code: ErrorCodes.AI_PROVIDER_TIMEOUT,
          isRetryable: true,
        });
      }
      throw new AiProviderError(
        `Gemini request failed: ${
          fetchError instanceof Error
            ? fetchError.message
            : 'Unknown network error'
        }`,
        {
          providerName: 'gemini',
          code: ErrorCodes.GENERATION_FAILED,
          isRetryable: false,
        },
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw classifyHttpError(response.status, 'gemini', errorText);
    }

    let payload: GeminiResponse;
    try {
      payload = (await response.json()) as GeminiResponse;
    } catch {
      throw new AiProviderError('Gemini returned invalid JSON payload', {
        providerName: 'gemini',
        code: ErrorCodes.AI_INVALID_OUTPUT,
        isRetryable: false,
      });
    }

    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new AiProviderError('Gemini returned an empty response', {
        providerName: 'gemini',
        code: ErrorCodes.AI_INVALID_OUTPUT,
        isRetryable: false,
      });
    }

    const usage = payload.usageMetadata
      ? {
          inputTokens: payload.usageMetadata.promptTokenCount,
          outputTokens: payload.usageMetadata.candidatesTokenCount,
          totalTokens: payload.usageMetadata.totalTokenCount,
        }
      : undefined;

    return { content, usage };
  }
}
