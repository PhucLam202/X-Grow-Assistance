import { Injectable } from '@nestjs/common';
import { AiConfigService } from '../ai.config';
import {
  AiReplyPackInput,
  AiVisionInput,
  OpenAiCompatibleResponse,
} from '../ai.types';
import { ReplyPackPromptBuilder } from '../prompt/reply-pack.prompt';
import { VisionAnalysisPromptBuilder } from '../prompt/vision-analysis.prompt';
import { AiProvider } from './ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly promptBuilder: ReplyPackPromptBuilder,
    private readonly visionPromptBuilder: VisionAnalysisPromptBuilder,
  ) {}

  async generateReplyPack(input: AiReplyPackInput): Promise<string> {
    const { apiKey, model } = this.aiConfig.getOpenAiConfig();
    const prompt = this.promptBuilder.build(input);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
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
      throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned an empty response');
    }

    return content;
  }

  async analyzeVision(input: AiVisionInput): Promise<string> {
    return this.sendVisionRequest(
      this.visionPromptBuilder.build(input),
      input,
      'OpenAI vision request failed',
    );
  }

  async analyzeVisionContext(input: AiVisionInput): Promise<string> {
    return this.sendVisionRequest(
      this.visionPromptBuilder.buildContext(input),
      input,
      'OpenAI vision context request failed',
    );
  }

  private async sendVisionRequest(
    prompt: string,
    input: AiVisionInput,
    errorPrefix: string,
  ): Promise<string> {
    const { apiKey, model } = this.aiConfig.getOpenAiVisionConfig();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
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
      throw new Error('OpenAI vision returned an empty response');
    }

    return content;
  }
}
