import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderName } from './ai.types';

export type ProviderConfig = {
  apiKey: string;
  model: string;
};

@Injectable()
export class AiConfigService {
  constructor(private readonly configService: ConfigService) {}

  getTextProviderName(): AiProviderName {
    const provider = this.getProviderNameFromEnv(
      'TEXT_AI_PROVIDER',
      'AI_PROVIDER',
      'deepseek',
    );

    return provider;
  }

  getVisionProviderName(): AiProviderName {
    const provider = this.getProviderNameFromEnv(
      'VISION_AI_PROVIDER',
      'AI_PROVIDER',
      'openai',
    );

    return provider;
  }

  getProviderName(): AiProviderName {
    return this.getTextProviderName();
  }

  private getProviderNameFromEnv(
    primaryEnvName: string,
    legacyEnvName: string,
    defaultProvider: AiProviderName,
  ): AiProviderName {
    const provider =
      this.configService.get<string>(primaryEnvName) ??
      this.configService.get<string>(legacyEnvName) ??
      defaultProvider;

    if (
      provider === 'openai' ||
      provider === 'deepseek' ||
      provider === 'gemini' ||
      provider === 'claude'
    ) {
      return provider;
    }

    throw new Error(`Unsupported ${primaryEnvName}: ${provider}`);
  }

  getOpenAiConfig(): ProviderConfig {
    return this.getProviderConfig(
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'gpt-4.1-mini',
    );
  }

  getOpenAiVisionConfig(): ProviderConfig {
    return this.getProviderConfig(
      'OPENAI_API_KEY',
      'OPENAI_VISION_MODEL',
      'gpt-5-nano',
    );
  }

  getDeepSeekConfig(): ProviderConfig {
    return this.getProviderConfig(
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_MODEL',
      'deepseek-chat',
    );
  }

  getGeminiConfig(): ProviderConfig {
    return this.getProviderConfig(
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'gemini-2.0-flash',
    );
  }

  getClaudeConfig(): ProviderConfig {
    return this.getProviderConfig(
      'CLAUDE_API_KEY',
      'CLAUDE_MODEL',
      'claude-3-5-sonnet-latest',
    );
  }

  private getProviderConfig(
    apiKeyEnvName: string,
    modelEnvName: string,
    defaultModel: string,
  ): ProviderConfig {
    const apiKey = this.configService.get<string>(apiKeyEnvName);
    if (!apiKey) {
      throw new Error(`${apiKeyEnvName} is missing`);
    }

    return {
      apiKey,
      model: this.configService.get<string>(modelEnvName, defaultModel),
    };
  }
}
