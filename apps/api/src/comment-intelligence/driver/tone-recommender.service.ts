import { Injectable } from '@nestjs/common';
import { CommentZone } from '../types/comment-intelligence.types';

@Injectable()
export class ToneRecommenderService {
  recommend(zone: CommentZone): string {
    const tones: Record<CommentZone, string> = {
      anime_meme: 'funny_native',
      achievement_congrats: 'supportive_specific',
      emotional_support: 'warm_gentle',
      technical_insight: 'smart_specific',
      news_reaction: 'safe_observational',
      debate_hot_take: 'calm_balanced',
      low_context: 'curious_safe',
      risky_topic: 'safe_neutral',
      general: 'natural_native',
    };
    return tones[zone];
  }
}
