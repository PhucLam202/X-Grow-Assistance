import { Injectable } from '@nestjs/common';
import { AiConfigService } from '../ai.config';
import { AiReplyPackInput } from '../ai.types';
import { ReplyPackPromptBuilder } from '../prompt/reply-pack.prompt';
import { AiProvider } from './ai-provider.interface';

type ClaudeResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

@Injectable()
export class ClaudeProvider implements AiProvider {
  readonly name = 'claude' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly promptBuilder: ReplyPackPromptBuilder,
  ) {}

  async generateReplyPack(input: AiReplyPackInput): Promise<string> {
    const { apiKey, model } = this.aiConfig.getClaudeConfig();
    const prompt = this.promptBuilder.build(input);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as ClaudeResponse;
    const content = payload.content?.find((part) => part.type === 'text')?.text;

    if (!content) {
      throw new Error('Claude returned an empty response');
    }

    return content;
  }
}
