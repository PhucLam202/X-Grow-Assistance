import { Injectable } from '@nestjs/common';
import { AiConfigService } from '../ai.config';
import { AiReplyPackInput } from '../ai.types';
import { ReplyPackPromptBuilder } from '../prompt/reply-pack.prompt';
import { AiProvider } from './ai-provider.interface';

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly promptBuilder: ReplyPackPromptBuilder,
  ) {}

  async generateReplyPack(input: AiReplyPackInput): Promise<string> {
    const { apiKey, model } = this.aiConfig.getGeminiConfig();
    const prompt = this.promptBuilder.build(input);

    const response = await fetch(
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
            temperature: 0.7,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as GeminiResponse;
    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Gemini returned an empty response');
    }

    return content;
  }
}
