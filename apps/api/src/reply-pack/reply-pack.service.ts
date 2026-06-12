import { Injectable } from '@nestjs/common';
import { AiReplyPackService } from '../ai/ai-reply-pack.service';
import { LanguageDetectorService } from '../common/language/language-detector.service';
import { GenerateReplyPackDto } from './dto/generate-reply-pack.dto';
import { ReplyPack } from './types/reply-pack.types';

@Injectable()
export class ReplyPackService {
  constructor(
    private readonly aiReplyPackService: AiReplyPackService,
    private readonly languageDetector: LanguageDetectorService,
  ) {}

  async generate(dto: GenerateReplyPackDto): Promise<ReplyPack> {
    const detectedLanguage = this.languageDetector.detect(dto.postText);
    const targetLanguage =
      dto.targetCommentLanguage === 'same_as_original'
        ? detectedLanguage
        : dto.targetCommentLanguage;

    // Derive translationLanguage from targetCommentLanguage.
    // If the user explicitly chose vi or en for their comment, use that same
    // language for translations/summaries. Otherwise fall back to the detected
    // post language (capped to vi | en since those are the only supported
    // translation languages).
    const translationLanguage: 'vi' | 'en' =
      dto.targetCommentLanguage === 'vi'
        ? 'vi'
        : dto.targetCommentLanguage === 'en'
          ? 'en'
          : detectedLanguage === 'en'
            ? 'en'
            : 'vi';

    return this.aiReplyPackService.generateReplyPack({
      dto: { ...dto, translationLanguage },
      detectedLanguage,
      targetLanguage,
    });
  }
}
