import { Injectable } from '@nestjs/common';
import { ReplyPack } from '../reply-pack/types/reply-pack.types';
import { AiConfigService } from './ai.config';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiReplyPackInput } from './ai.types';
import { ReplyPackJsonParser } from './parsers/reply-pack-json.parser';

@Injectable()
export class AiReplyPackService {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly parser: ReplyPackJsonParser,
  ) {}

  async generateReplyPack(input: AiReplyPackInput): Promise<ReplyPack> {
    const provider = this.providerRegistry.get(this.aiConfig.getTextProviderName());
    const content = await provider.generateReplyPack(input);
    const parsed = this.parser.parse(content);

    return {
      detectedLanguage: input.detectedLanguage,
      translationLanguage: input.dto.translationLanguage,
      translation: parsed.translation,
      summary: parsed.summary,
      context: parsed.context,
      theme: parsed.theme,
      topic: parsed.topic,
      sentiment: parsed.sentiment,
      commentStrategy: parsed.commentStrategy,
      suggestions: parsed.suggestions
        .slice(0, input.dto.maxSuggestions)
        .map((suggestion) => ({
          ...suggestion,
          tone: input.dto.tone,
          risk: suggestion.risk ?? 'low',
        })),
    };
  }
}
