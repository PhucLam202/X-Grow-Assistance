import { Injectable } from '@nestjs/common';
import { AiProviderName } from './ai.types';
import { AiProvider } from './providers/ai-provider.interface';
import { ClaudeProvider } from './providers/claude.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Injectable()
export class AiProviderRegistry {
  private readonly providers: Map<AiProviderName, AiProvider>;

  constructor(
    openAiProvider: OpenAiProvider,
    deepSeekProvider: DeepSeekProvider,
    geminiProvider: GeminiProvider,
    claudeProvider: ClaudeProvider,
  ) {
    this.providers = new Map(
      [openAiProvider, deepSeekProvider, geminiProvider, claudeProvider].map(
        (provider) => [provider.name, provider],
      ),
    );
  }

  get(providerName: AiProviderName): AiProvider {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Unsupported AI provider: ${providerName}`);
    }

    return provider;
  }
}
