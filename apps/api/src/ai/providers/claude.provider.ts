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

type ClaudeResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

@Injectable()
export class ClaudeProvider implements AiProvider {
  readonly name = 'claude' as const;

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
    const { apiKey, model } = this.aiConfig.getClaudeConfig();

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: options?.maxTokens ?? 1200,
          temperature: options?.temperature ?? 0.7,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        ...(options?.timeoutMs != null
          ? { signal: AbortSignal.timeout(options.timeoutMs) }
          : {}),
      });
    } catch (fetchError) {
      if (
        fetchError instanceof Error &&
        (fetchError.name === 'AbortError' || fetchError.name === 'TimeoutError')
      ) {
        throw new AiProviderError('Claude fetch timed out', {
          providerName: 'claude',
          code: ErrorCodes.AI_PROVIDER_TIMEOUT,
          isRetryable: true,
        });
      }
      throw new AiProviderError(
        `Claude request failed: ${
          fetchError instanceof Error
            ? fetchError.message
            : 'Unknown network error'
        }`,
        {
          providerName: 'claude',
          code: ErrorCodes.GENERATION_FAILED,
          isRetryable: false,
        },
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw classifyHttpError(response.status, 'claude', errorText);
    }

    let payload: ClaudeResponse;
    try {
      payload = (await response.json()) as ClaudeResponse;
    } catch {
      throw new AiProviderError('Claude returned invalid JSON payload', {
        providerName: 'claude',
        code: ErrorCodes.AI_INVALID_OUTPUT,
        isRetryable: false,
      });
    }

    const content = payload.content?.find((part) => part.type === 'text')?.text;

    if (!content) {
      throw new AiProviderError('Claude returned an empty response', {
        providerName: 'claude',
        code: ErrorCodes.AI_INVALID_OUTPUT,
        isRetryable: false,
      });
    }

    const inputTokens = payload.usage?.input_tokens;
    const outputTokens = payload.usage?.output_tokens;
    const totalTokens =
      inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined;

    const usage =
      inputTokens !== undefined || outputTokens !== undefined
        ? { inputTokens, outputTokens, totalTokens }
        : undefined;

    return { content, usage };
  }
}
