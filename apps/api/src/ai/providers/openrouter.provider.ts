import { Injectable } from '@nestjs/common';
import { AiConfigService } from '../ai.config';
import { AiReplyPackInput, AiVisionInput, OpenAiCompatibleResponse } from '../ai.types';
import { VisionAnalysisPromptBuilder } from '../prompt/vision-analysis.prompt';
import { AiProvider } from './ai-provider.interface';

@Injectable()
export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly visionPromptBuilder: VisionAnalysisPromptBuilder,
  ) {}

  // OpenRouter is vision-only in this setup; text requests fall back to text provider
  async generateReplyPack(_input: AiReplyPackInput): Promise<string> {
    throw new Error('OpenRouter provider is configured for vision only. Set TEXT_AI_PROVIDER to a text provider.');
  }

  async analyzeVision(input: AiVisionInput): Promise<string> {
    return this.sendVisionRequest(
      this.visionPromptBuilder.build(input),
      input,
      'OpenRouter vision request failed',
    );
  }

  async analyzeVisionContext(input: AiVisionInput): Promise<string> {
    return this.sendVisionRequest(
      this.visionPromptBuilder.buildContext(input),
      input,
      'OpenRouter vision context request failed',
    );
  }

  private async sendVisionRequest(
    prompt: string,
    input: AiVisionInput,
    errorPrefix: string,
  ): Promise<string> {
    const { apiKey, model, baseUrl } = this.aiConfig.getOpenRouterConfig();

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/x-comment-assistant',
        'X-Title': 'X Comment Assistant',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a vision-capable assistant that returns only valid JSON for X post image analysis. Do not add markdown or extra text.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...input.images.map((image) => ({
                type: 'image_url',
                image_url: {
                  url: `data:${image.contentType};base64,${image.base64}`,
                  detail: 'auto',
                },
              })),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${errorPrefix}: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenRouter returned an empty response');
    }

    return content;
  }
}
