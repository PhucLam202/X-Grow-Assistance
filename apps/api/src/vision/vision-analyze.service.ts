import { Injectable } from '@nestjs/common';
import { AiReplyPackService } from '../ai/ai-reply-pack.service';
import { AiVisionService } from '../ai/ai-vision.service';
import { LanguageDetectorService } from '../common/language/language-detector.service';
import { ImageFetchService } from '../image/image-fetch.service';
import { GenerateReplyPackDto } from '../reply-pack/dto/generate-reply-pack.dto';
import { buildContextualPostText, getTextForLanguageDetection } from '../reply-pack/post-context.builder';
import { ReplyPack } from '../reply-pack/types/reply-pack.types';
import { AnalyzeVisionDto } from './dto/analyze-vision.dto';
import { GenerateFromVisionContextDto } from './dto/generate-from-vision-context.dto';
import { VisionContext, VisionReplyPack } from './types/vision.types';

@Injectable()
export class VisionAnalyzeService {
  constructor(
    private readonly imageFetchService: ImageFetchService,
    private readonly aiVisionService: AiVisionService,
    private readonly aiReplyPackService: AiReplyPackService,
    private readonly languageDetector: LanguageDetectorService,
  ) {}

  async analyze(dto: AnalyzeVisionDto): Promise<VisionReplyPack> {
    const contextualDto = this.withContextualPostText(dto);
    const detectedLanguage = this.languageDetector.detect(
      getTextForLanguageDetection(dto.post.text, dto.postContext),
    );
    const targetLanguage =
      dto.options.targetCommentLanguage === 'same_as_original'
        ? detectedLanguage
        : dto.options.targetCommentLanguage;
    const translationLanguage = this.resolveTranslationLanguage(
      dto.options.explanationLanguage,
      detectedLanguage,
    );

    try {
      if (dto.media.length === 0) {
        throw new Error('No image media provided');
      }

      const images = await this.imageFetchService.fetchImages(
        dto.media.map((media) => ({
          url: media.url,
          altText: media.altText,
        })),
      );

      return this.aiVisionService.analyzeVision({
        dto: contextualDto,
        images,
        detectedLanguage,
        translationLanguage,
        targetLanguage,
      });
    } catch (error) {
      const fallback = await this.generateTextOnlyFallback(
        dto,
        detectedLanguage,
        targetLanguage,
        translationLanguage,
      );

      return this.toFallbackVisionReplyPack(fallback, error);
    }
  }

  async analyzeContext(dto: AnalyzeVisionDto): Promise<VisionContext> {
    const contextualDto = this.withContextualPostText(dto);
    const detectedLanguage = this.languageDetector.detect(
      getTextForLanguageDetection(dto.post.text, dto.postContext),
    );
    const targetLanguage =
      dto.options.targetCommentLanguage === 'same_as_original'
        ? detectedLanguage
        : dto.options.targetCommentLanguage;
    const translationLanguage = this.resolveTranslationLanguage(
      dto.options.explanationLanguage,
      detectedLanguage,
    );

    try {
      if (dto.media.length === 0) {
        throw new Error('No image media provided');
      }

      const images = await this.imageFetchService.fetchImages(
        dto.media.map((media) => ({
          url: media.url,
          altText: media.altText,
        })),
      );

      return this.aiVisionService.analyzeVisionContext({
        dto: contextualDto,
        images,
        detectedLanguage,
        translationLanguage,
        targetLanguage,
      });
    } catch (error) {
      const fallback = await this.generateTextOnlyFallback(
        dto,
        detectedLanguage,
        targetLanguage,
        translationLanguage,
      );

      return this.toFallbackVisionContext(fallback, error, detectedLanguage, translationLanguage);
    }
  }

  async generateFromContext(dto: GenerateFromVisionContextDto): Promise<VisionReplyPack> {
    const detectedLanguage = this.languageDetector.detect(
      getTextForLanguageDetection(dto.post.text, dto.postContext),
    );
    const targetLanguage =
      dto.options.targetCommentLanguage === 'same_as_original'
        ? detectedLanguage
        : dto.options.targetCommentLanguage;
    const translationLanguage = dto.options.explanationLanguage;
    const contextText = this.buildPostTextWithVisionContext(dto);
    const replyPackDto: GenerateReplyPackDto & { translationLanguage: 'vi' | 'en' } = {
      platform: dto.post.platform,
      postText: contextText,
      authorName: dto.post.authorName,
      authorHandle: dto.post.authorHandle,
      postUrl: dto.post.url,
      targetCommentLanguage: dto.options.targetCommentLanguage,
      tone: dto.options.tone,
      niche: dto.options.niche,
      maxSuggestions: dto.options.maxSuggestions,
      translationLanguage,
    };

    const replyPack = await this.aiReplyPackService.generateReplyPack({
      dto: replyPackDto,
      detectedLanguage,
      targetLanguage,
    });

    return {
      ...replyPack,
      analysisMode: 'vision',
      imageAnalysis: dto.visionContext.imageAnalysis,
      combinedContext: dto.visionContext.combinedContext,
    };
  }

  private async generateTextOnlyFallback(
    dto: AnalyzeVisionDto,
    detectedLanguage: ReturnType<LanguageDetectorService['detect']>,
    targetLanguage: string,
    translationLanguage: 'vi' | 'en',
  ): Promise<ReplyPack> {
    const replyPackDto: GenerateReplyPackDto & { translationLanguage: 'vi' | 'en' } = {
      platform: dto.post.platform,
      postText: buildContextualPostText(dto.post.text, dto.postContext),
      authorName: dto.post.authorName,
      authorHandle: dto.post.authorHandle,
      postUrl: dto.post.url,
      targetCommentLanguage: dto.options.targetCommentLanguage,
      tone: dto.options.tone,
      niche: dto.options.niche,
      maxSuggestions: dto.options.maxSuggestions,
      translationLanguage,
    };

    return this.aiReplyPackService.generateReplyPack({
      dto: replyPackDto,
      detectedLanguage,
      targetLanguage,
    });
  }

  private toFallbackVisionReplyPack(
    replyPack: ReplyPack,
    error: unknown,
  ): VisionReplyPack {
    return {
      ...replyPack,
      analysisMode: 'text_only_fallback',
      combinedContext: {
        topic: replyPack.topic,
        intent: replyPack.theme,
        sentiment: replyPack.sentiment,
        explanation: replyPack.context,
        commentStrategy: replyPack.commentStrategy,
        avoid: ['Image could not be analyzed. Do not reference visual details.'],
      },
      imageErrors: [error instanceof Error ? error.message : 'Image analysis failed'],
    };
  }

  private toFallbackVisionContext(
    replyPack: ReplyPack,
    error: unknown,
    detectedLanguage: ReturnType<LanguageDetectorService['detect']>,
    translationLanguage: 'vi' | 'en',
  ): VisionContext {
    return {
      analysisMode: 'text_only_fallback',
      detectedLanguage,
      translationLanguage,
      translation: replyPack.translation,
      summary: replyPack.summary,
      context: replyPack.context,
      theme: replyPack.theme,
      topic: replyPack.topic,
      sentiment: replyPack.sentiment,
      commentStrategy: replyPack.commentStrategy,
      combinedContext: {
        topic: replyPack.topic,
        intent: replyPack.theme,
        sentiment: replyPack.sentiment,
        explanation: replyPack.context,
        commentStrategy: replyPack.commentStrategy,
        avoid: ['Image could not be analyzed. Do not reference visual details.'],
      },
      imageErrors: [error instanceof Error ? error.message : 'Image analysis failed'],
    };
  }

  private buildPostTextWithVisionContext(dto: GenerateFromVisionContextDto): string {
    const imageAnalysis = dto.visionContext.imageAnalysis;
    const structuredPostContext = buildContextualPostText(dto.post.text, dto.postContext);
    return [
      structuredPostContext,
      '',
      'Cached visual context for selected images:',
      '- Treat visual analysis as supporting evidence, not the sole context.',
      '- If the image belongs to a quoted/reposted/old post, use it as background only.',
      `- Post summary: ${dto.visionContext.summary}`,
      `- Visual summary: ${imageAnalysis?.summary ?? 'No image summary available.'}`,
      `- Visible text/OCR: ${imageAnalysis?.visibleText ?? 'None'}`,
      `- Visual tone: ${imageAnalysis?.visualTone ?? 'Unknown'}`,
      `- Important objects: ${imageAnalysis?.importantObjects.join(', ') ?? 'None'}`,
      `- Combined explanation: ${dto.visionContext.combinedContext.explanation}`,
      `- Comment strategy: ${dto.visionContext.combinedContext.commentStrategy}`,
      `- Avoid: ${dto.visionContext.combinedContext.avoid.join(', ')}`,
      '',
      'Use the cached visual context above. Do not invent new image details.',
    ].join('\n');
  }

  private resolveTranslationLanguage(
    explanationLanguage: 'vi' | 'en',
    detectedLanguage: ReturnType<LanguageDetectorService['detect']>,
  ): 'vi' | 'en' {
    if (explanationLanguage === 'en' || explanationLanguage === 'vi') {
      return explanationLanguage;
    }

    return detectedLanguage === 'en' ? 'en' : 'vi';
  }

  private withContextualPostText(dto: AnalyzeVisionDto): AnalyzeVisionDto {
    return {
      ...dto,
      post: {
        ...dto.post,
        text: buildContextualPostText(dto.post.text, dto.postContext),
      },
    };
  }
}
