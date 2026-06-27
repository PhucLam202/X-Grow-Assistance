import { Injectable } from '@nestjs/common';
import { CommentZone, DriverInput } from '../types/comment-intelligence.types';

@Injectable()
export class IntentClassifierService {
  classify(input: DriverInput, zone: CommentZone): string {
    const text = input.mainPost.text ?? '';
    if (/[?？]/.test(text)) return 'question_reply';
    if (zone === 'anime_meme') return 'joke_reaction';
    if (zone === 'achievement_congrats') return 'congratulate';
    if (zone === 'emotional_support') return 'support_emotion';
    if (zone === 'technical_insight') return 'value_add';
    if (zone === 'news_reaction') return 'timely_reaction';
    if (zone === 'debate_hot_take') return 'careful_positioning';
    if (zone === 'risky_topic') return 'avoid_or_safe_reply';
    if (zone === 'low_context') return 'context_probe';
    return 'natural_reaction';
  }
}
