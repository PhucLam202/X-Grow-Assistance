import { Injectable } from '@nestjs/common';
import { AiConfigService } from '../ai.config';
import { AiProviderResult, AiReplyPackInput, AiVisionInput } from '../ai.types';
import { ReplyPackPromptBuilder } from '../prompt/reply-pack.prompt';
import { VisionAnalysisPromptBuilder } from '../prompt/vision-analysis.prompt';
import { AiProvider, AiStructuredCallOptions } from './ai-provider.interface';
import { postOpenAiCompat, postOpenAiVision } from './http.util';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export const STRUCTURED_SYSTEM_PROMPT =
  'You return only valid JSON matching the schema in the user message. ' +
  'No markdown, no commentary, no code fences.';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly promptBuilder: ReplyPackPromptBuilder,
    private readonly visionPromptBuilder: VisionAnalysisPromptBuilder,
  ) {}

  generateReplyPack(input: AiReplyPackInput): Promise<AiProviderResult> {
    const { apiKey, model } = this.aiConfig.getOpenAiConfig();
    return postOpenAiCompat(
      OPENAI_URL,
      apiKey,
      model,
      this.promptBuilder.build(input),
      { providerName: 'openai' },
    );
  }

  generateStructured(
    prompt: string,
    options?: AiStructuredCallOptions,
  ): Promise<AiProviderResult> {
    const { apiKey, model } = this.aiConfig.getOpenAiConfig();
    return postOpenAiCompat(OPENAI_URL, apiKey, model, prompt, {
      ...options,
      providerName: 'openai',
      systemPrompt: STRUCTURED_SYSTEM_PROMPT,
    });
  }

  analyzeVision(input: AiVisionInput): Promise<AiProviderResult> {
    const { apiKey, model } = this.aiConfig.getOpenAiVisionConfig();
    return postOpenAiVision(
      OPENAI_URL,
      apiKey,
      model,
      this.visionPromptBuilder.build(input),
      input.images,
      { providerName: 'openai' },
    );
  }

  analyzeVisionContext(input: AiVisionInput): Promise<AiProviderResult> {
    const { apiKey, model } = this.aiConfig.getOpenAiVisionConfig();
    return postOpenAiVision(
      OPENAI_URL,
      apiKey,
      model,
      this.visionPromptBuilder.buildContext(input),
      input.images,
      { providerName: 'openai' },
    );
  }
}
