import { Injectable } from '@nestjs/common';
import { LanguageDetectorService } from '../../common/language/language-detector.service';
import {
  CommentStyle,
  DriverDecision,
  DriverInput,
} from '../types/comment-intelligence.types';
import {
  CommentNiche,
  CommentTone,
  TargetCommentLanguage,
} from '../../reply-pack/types/reply-pack.types';

@Injectable()
export class CommentStyleMapperService {
  constructor(private readonly languageDetector: LanguageDetectorService) {}

  getStyles(decision: DriverDecision): CommentStyle[] {
    if (!decision.shouldComment || decision.zone === 'risky_topic') {
      return ['safe', 'question'];
    }

    if (decision.zone === 'low_context') {
      return ['question', 'safe'];
    }

    if (decision.zone === 'technical_insight') {
      return ['value_add', 'question', 'safe'];
    }

    if (decision.zone === 'anime_meme') {
      return ['funny', 'safe', 'question'];
    }

    if (decision.zone === 'achievement_congrats') {
      return ['safe', 'value_add', 'question'];
    }

    if (decision.zone === 'emotional_support') {
      return ['safe', 'question'];
    }

    if (
      decision.zone === 'debate_hot_take' ||
      decision.zone === 'news_reaction'
    ) {
      return ['question', 'value_add', 'safe'];
    }

    return ['safe', 'question', 'value_add'];
  }

  toReplyPackTone(style: CommentStyle, decision: DriverDecision): CommentTone {
    if (style === 'funny')
      return decision.zone === 'anime_meme' ? 'anime_fan' : 'funny_light';
    if (style === 'question') return 'question_based';
    if (style === 'value_add') return 'insightful';
    if (decision.zone === 'achievement_congrats') return 'congratulation';
    if (decision.zone === 'emotional_support') return 'casual_supportive';
    if (decision.recommendedDepth === 'short') return 'short_native';
    return 'casual_supportive';
  }

  toReplyPackNiche(decision: DriverDecision): CommentNiche {
    if (decision.zone === 'anime_meme') return 'anime_manga';
    if (decision.zone === 'technical_insight') return 'tech';
    if (decision.zone === 'news_reaction') return 'news';
    return 'general';
  }

  toTargetLanguage(
    input: DriverInput,
    decision: DriverDecision,
  ): TargetCommentLanguage {
    // Detect from actual post text — avoids conflating user's account language
    // (e.g. 'vi') with the language of the post (e.g. 'en' for English football posts).
    const textLang = this.languageDetector.detect(input.mainPost.text ?? '');
    const language =
      textLang !== 'unknown'
        ? textLang
        : decision.recommendedLanguage || input.mainPost.language;
    if (language === 'ja' || language === 'en' || language === 'vi')
      return language;
    return 'same_as_original';
  }
}
