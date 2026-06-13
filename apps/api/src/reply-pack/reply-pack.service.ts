import { Injectable } from '@nestjs/common';
import { AiReplyPackService } from '../ai/ai-reply-pack.service';
import { LanguageDetectorService } from '../common/language/language-detector.service';
import { GenerateReplyPackDto } from './dto/generate-reply-pack.dto';
import { buildContextualPostText, getTextForLanguageDetection } from './post-context.builder';
import { ReplyPack } from './types/reply-pack.types';

@Injectable()
export class ReplyPackService {
  constructor(
    private readonly aiReplyPackService: AiReplyPackService,
    private readonly languageDetector: LanguageDetectorService,
  ) {}

  async generate(dto: GenerateReplyPackDto): Promise<ReplyPack> {
    const detectedLanguage = this.languageDetector.detect(
      getTextForLanguageDetection(dto.postText, dto.postContext),
    );
    const targetLanguage =
      dto.targetCommentLanguage === 'same_as_original'
        ? detectedLanguage
        : dto.targetCommentLanguage;

    // Prefer the explicit analysis language. Otherwise derive the analysis
    // language from the requested comment language or detected post language.
    const translationLanguage: 'vi' | 'en' =
      dto.explanationLanguage === 'vi' || dto.explanationLanguage === 'en'
        ? dto.explanationLanguage
        : dto.targetCommentLanguage === 'vi'
        ? 'vi'
        : dto.targetCommentLanguage === 'en'
          ? 'en'
          : detectedLanguage === 'en'
            ? 'en'
            : 'vi';

    return this.aiReplyPackService.generateReplyPack({
      dto: {
        ...dto,
        postText: buildContextualPostText(dto.postText, dto.postContext),
        translationLanguage,
      },
      detectedLanguage,
      targetLanguage,
    });
  }
}
