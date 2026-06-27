import { Module } from '@nestjs/common';
import { AiConfigService } from './ai.config';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiReplyPackService } from './ai-reply-pack.service';
import { AiVisionService } from './ai-vision.service';
import { ReplyPackJsonParser } from './parsers/reply-pack-json.parser';
import { VisionAnalysisJsonParser } from './parsers/vision-analysis-json.parser';
import { ReplyPackPromptBuilder } from './prompt/reply-pack.prompt';
import { VisionAnalysisPromptBuilder } from './prompt/vision-analysis.prompt';
import { ClaudeProvider } from './providers/claude.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

@Module({
  providers: [
    AiConfigService,
    AiProviderRegistry,
    AiReplyPackService,
    AiVisionService,
    ReplyPackJsonParser,
    VisionAnalysisJsonParser,
    ReplyPackPromptBuilder,
    VisionAnalysisPromptBuilder,
    OpenAiProvider,
    DeepSeekProvider,
    GeminiProvider,
    ClaudeProvider,
    OpenRouterProvider,
  ],
  exports: [AiReplyPackService, AiVisionService],
})
export class AiModule {}
