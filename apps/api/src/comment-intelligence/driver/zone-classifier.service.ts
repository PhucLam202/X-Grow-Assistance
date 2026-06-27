import { Injectable } from '@nestjs/common';
import { CommentZone, DriverInput } from '../types/comment-intelligence.types';

@Injectable()
export class ZoneClassifierService {
  classify(input: DriverInput): CommentZone {
    const text = this.allText(input);

    if (
      /war|death|killed|racis|religion|politic|nsfw|suicide|scam/i.test(text)
    ) {
      return 'risky_topic';
    }
    if (
      /anime|manga|one piece|naruto|jujutsu|vtuber|アニメ|漫画|マンガ|推し/i.test(
        text,
      )
    ) {
      return /meme|😂|🤣|ｗｗ|笑|lol|lmao/i.test(text) ||
        (input.media?.length ?? 0) > 0
        ? 'anime_meme'
        : 'general';
    }
    if (
      /congrats|congratulations|shipped|launched|milestone|won|passed|achieved/i.test(
        text,
      )
    ) {
      return 'achievement_congrats';
    }
    if (
      /sad|sorry|tired|burnout|heartbroken|miss you|つらい|悲しい/i.test(text)
    ) {
      return 'emotional_support';
    }
    if (
      /typescript|react|api|database|ai|llm|openai|claude|code|bug|deploy/i.test(
        text,
      )
    ) {
      return 'technical_insight';
    }
    if (/breaking|news|announced|report|update|速報/i.test(text)) {
      return 'news_reaction';
    }
    if (
      /hot take|unpopular opinion|debate|wrong|agree|disagree|controversial/i.test(
        text,
      )
    ) {
      return 'debate_hot_take';
    }
    if (
      this.mainText(input).length < 30 &&
      !input.quotedPost &&
      !input.parentPost
    ) {
      return 'low_context';
    }
    return 'general';
  }

  private allText(input: DriverInput): string {
    return [
      input.mainPost.text,
      input.quotedPost?.text,
      input.repostedPost?.text,
      input.parentPost?.text,
      ...(input.authorContinuations ?? []).map((item) => item.text),
      ...(input.media ?? []).flatMap((media) => [media.altText, media.ocrText]),
    ]
      .filter(Boolean)
      .join(' ');
  }

  private mainText(input: DriverInput): string {
    return input.mainPost.text?.replace(/\s+/g, ' ').trim() ?? '';
  }
}
