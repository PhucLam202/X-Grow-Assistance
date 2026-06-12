import { Injectable } from '@nestjs/common';
import { AiConfigService } from '../ai.config';
import { AiReplyPackInput, OpenAiCompatibleResponse } from '../ai.types';
import { ReplyPackPromptBuilder } from '../prompt/reply-pack.prompt';
import { AiProvider } from './ai-provider.interface';

@Injectable()
export class DeepSeekProvider implements AiProvider {
  readonly name = 'deepseek' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly promptBuilder: ReplyPackPromptBuilder,
  ) {}

  async generateReplyPack(input: AiReplyPackInput): Promise<string> {
    const { apiKey, model } = this.aiConfig.getDeepSeekConfig();
    const prompt = this.promptBuilder.build(input);

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an assistant that returns only valid JSON for X comment reply packs. Do not add markdown or extra text.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DeepSeek request failed: ${response.status} ${errorText}`,
      );
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('DeepSeek returned an empty response');
    }

    return content;
  }
}
