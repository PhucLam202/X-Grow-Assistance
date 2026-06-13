import { DetectedLanguage } from '../../common/language/language.types';

export const COMMENT_TONES = [
  'short_native',
  'casual_supportive',
  'question_based',
  'insightful',
  'funny_light',
  'anime_fan',
  'crypto_casual',
  'football_fan',
  'congratulation',
] as const;

export const COMMENT_NICHES = [
  'auto',
  'anime_manga',
  'crypto',
  'football',
  'tech',
  'business',
  'gaming',
  'music',
  'news',
  'general',
] as const;

export const TARGET_COMMENT_LANGUAGES = [
  'same_as_original',
  'ja',
  'en',
  'vi',
] as const;

export type CommentTone = (typeof COMMENT_TONES)[number];
export type CommentNiche = (typeof COMMENT_NICHES)[number];
export type TargetCommentLanguage = (typeof TARGET_COMMENT_LANGUAGES)[number];
export type RiskLevel = 'low' | 'medium' | 'high';

export type ReplyCandidateScore = {
  total: number;
  postFit: number;
  visibility: number;
  specificity: number;
  native: number;
  engagementHook: number;
  whyVisible: string;
};

export type CommentSuggestion = {
  text: string;
  meaningVi: string;
  tone: string;
  risk: RiskLevel;
  whyItWorks: string;
  score?: ReplyCandidateScore;
};

export type ReplyPack = {
  detectedLanguage: DetectedLanguage;
  translationLanguage: string;
  translation: string;
  summary: string;
  context: string;
  theme: string;
  topic: string;
  sentiment: string;
  commentStrategy: string;
  suggestions: CommentSuggestion[];
};
