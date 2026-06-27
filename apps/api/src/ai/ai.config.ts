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

  private getProviderNameFromEnv(
    primaryEnvName: string,
    legacyEnvName: string,
    defaultProvider: AiProviderName,
  ): AiProviderName {
    const providerValue =
      this.configService.get<string>(primaryEnvName) ??
      this.configService.get<string>(legacyEnvName) ??
      defaultProvider;

    const provider = this.normalizeProviderName(providerValue);

    if (
      provider === 'openai' ||
      provider === 'deepseek' ||
      provider === 'gemini' ||
      provider === 'claude' ||
      provider === 'openrouter'
    ) {
      return provider;
    }

    throw new Error(`Unsupported ${primaryEnvName}: ${provider}`);
  }

  // ponytail: prefix beats per-model cases; add a case only when prefix breaks
  private normalizeProviderName(value: string): string {
    const v = value.trim().toLowerCase();
    if (v.startsWith('gpt')) return 'openai';
    if (v.startsWith('gemini')) return 'gemini';
    if (v.startsWith('claude')) return 'claude';
    if (v.startsWith('deepseek')) return 'deepseek';
    return v;
  }

  getTextProviderEndpoint(): { apiUrl: string; apiKey: string; model: string } {
    const name = this.getTextProviderName();
    if (name === 'openrouter') {
      const { baseUrl, apiKey, model } = this.getOpenRouterConfig();
      return { apiUrl: `${baseUrl}/chat/completions`, apiKey, model };
    }
    if (name === 'deepseek') {
      const { apiKey, model } = this.getDeepSeekConfig();
      return { apiUrl: 'https://api.deepseek.com/v1/chat/completions', apiKey, model };
    }
    const { apiKey, model } = this.getOpenAiConfig();
    return { apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey, model };
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

  getOpenRouterConfig(): ProviderConfig & { baseUrl: string } {
    const config = this.getProviderConfig(
      'OPENROUTER_API_KEY',
      'OPENROUTER_VISION_MODEL',
      'qwen/qwen3-vl-30b-a3b-instruct',
    );
    return {
      ...config,
      baseUrl: this.configService.get<string>(
        'OPENROUTER_BASE_URL',
        'https://openrouter.ai/api/v1',
      ),
    };
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
