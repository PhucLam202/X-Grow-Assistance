import { Injectable } from '@nestjs/common';
import { AiConfigService } from '../ai.config';
import { AiProviderResult, AiReplyPackInput } from '../ai.types';
import { ReplyPackPromptBuilder } from '../prompt/reply-pack.prompt';
import { AiProvider, AiStructuredCallOptions } from './ai-provider.interface';
import { postOpenAiCompat } from './http.util';
import { STRUCTURED_SYSTEM_PROMPT } from './openai.provider';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

@Injectable()
export class DeepSeekProvider implements AiProvider {
  readonly name = 'deepseek' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly promptBuilder: ReplyPackPromptBuilder,
  ) {}

  generateReplyPack(input: AiReplyPackInput): Promise<AiProviderResult> {
    const { apiKey, model } = this.aiConfig.getDeepSeekConfig();
    return postOpenAiCompat(
      DEEPSEEK_URL,
      apiKey,
      model,
      this.promptBuilder.build(input),
      // ponytail: 1500 truncated CJK reply packs mid-JSON; raise if 4 suggestions still get cut
      { temperature: 0.7, maxTokens: 3000, providerName: 'deepseek' },
    );
  }

  generateStructured(
    prompt: string,
    options?: AiStructuredCallOptions,
  ): Promise<AiProviderResult> {
    const { apiKey, model } = this.aiConfig.getDeepSeekConfig();
    return postOpenAiCompat(DEEPSEEK_URL, apiKey, model, prompt, {
      temperature: 0.7,
      // ponytail: analysis.translation của post CJK dài + 4 candidate vượt 1500
      // → JSON đứt trước mảng candidates → AI_INVALID_OUTPUT.
      maxTokens: 4000,
      ...options,
      providerName: 'deepseek',
      systemPrompt: STRUCTURED_SYSTEM_PROMPT,
    });
  }
}
