import { Injectable } from '@nestjs/common';
import { AiProviderName } from './ai.types';
import { AiProvider } from './providers/ai-provider.interface';
import { ClaudeProvider } from './providers/claude.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

@Injectable()
export class AiProviderRegistry {
  private readonly providers: Map<AiProviderName, AiProvider>;

  constructor(
    openAiProvider: OpenAiProvider,
    deepSeekProvider: DeepSeekProvider,
    geminiProvider: GeminiProvider,
    claudeProvider: ClaudeProvider,
    openRouterProvider: OpenRouterProvider,
  ) {
    this.providers = new Map(
      [openAiProvider, deepSeekProvider, geminiProvider, claudeProvider, openRouterProvider].map(
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
