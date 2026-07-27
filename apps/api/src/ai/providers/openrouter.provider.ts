import { Injectable } from '@nestjs/common';
import { ErrorCodes } from '../../common/errors/error-codes';
import { AiConfigService } from '../ai.config';
import {
  AiProviderError,
  AiProviderResult,
  AiReplyPackInput,
  AiVisionInput,
} from '../ai.types';
import { VisionAnalysisPromptBuilder } from '../prompt/vision-analysis.prompt';
import { AiProvider } from './ai-provider.interface';
import { postOpenAiVision } from './http.util';

const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://github.com/x-comment-assistant',
  'X-Title': 'X Comment Assistant',
};

@Injectable()
export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly visionPromptBuilder: VisionAnalysisPromptBuilder,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generateReplyPack(_input: AiReplyPackInput): Promise<AiProviderResult> {
    throw new AiProviderError(
      'OpenRouter provider is configured for vision only. Set TEXT_AI_PROVIDER to a text provider.',
      {
        providerName: 'openrouter',
        code: ErrorCodes.AI_UNSUPPORTED_CAPABILITY,
        isRetryable: false,
      },
    );
  }

  analyzeVision(input: AiVisionInput): Promise<AiProviderResult> {
    const { apiKey, model, baseUrl } = this.aiConfig.getOpenRouterConfig();
    return postOpenAiVision(
      `${baseUrl}/chat/completions`,
      apiKey,
      model,
      this.promptBuilderBuild(input),
      input.images,
      {
        maxTokens: 4096,
        extraHeaders: OPENROUTER_HEADERS,
        providerName: 'openrouter',
      },
    );
  }

  analyzeVisionContext(input: AiVisionInput): Promise<AiProviderResult> {
    const { apiKey, model, baseUrl } = this.aiConfig.getOpenRouterConfig();
    return postOpenAiVision(
      `${baseUrl}/chat/completions`,
      apiKey,
      model,
      this.visionPromptBuilder.buildContext(input),
      input.images,
      {
        maxTokens: 600,
        extraHeaders: OPENROUTER_HEADERS,
        providerName: 'openrouter',
      },
    );
  }

  private promptBuilderBuild(input: AiVisionInput): string {
    return this.visionPromptBuilder.build(input);
  }
}
