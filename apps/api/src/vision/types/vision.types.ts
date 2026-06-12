import { DetectedLanguage } from '../../common/language/language.types';
import { CommentSuggestion, ReplyPack } from '../../reply-pack/types/reply-pack.types';

export type VisionMediaInput = {
  type: 'image';
  url: string;
  altText?: string;
};

export type VisionAnalysis = {
  summary: string;
  visibleText: string;
  visualTone: string;
  importantObjects: string[];
  uncertainty?: string;
};

export type CombinedContext = {
  topic: string;
  intent: string;
  sentiment: string;
  explanation: string;
  commentStrategy: string;
  avoid: string[];
};

export type VisionReplyPack = ReplyPack & {
  analysisMode: 'vision' | 'text_only_fallback';
  imageAnalysis?: VisionAnalysis;
  combinedContext: CombinedContext;
  imageErrors?: string[];
};

export type VisionContext = {
  analysisMode: 'vision_context' | 'text_only_fallback';
  detectedLanguage: DetectedLanguage;
  translationLanguage: 'vi' | 'en';
  translation: string;
  summary: string;
  context: string;
  theme: string;
  topic: string;
  sentiment: string;
  commentStrategy: string;
  imageAnalysis?: VisionAnalysis;
  combinedContext: CombinedContext;
  imageErrors?: string[];
};

export type AiVisionPayload = {
  translation: string;
  summary: string;
  context: string;
  theme: string;
  topic: string;
  sentiment: string;
  commentStrategy: string;
  imageAnalysis: VisionAnalysis;
  combinedContext: CombinedContext;
  suggestions: CommentSuggestion[];
};

export type AiVisionContextPayload = Omit<AiVisionPayload, 'suggestions'>;

export type VisionLanguageContext = {
  detectedLanguage: DetectedLanguage;
  translationLanguage: 'vi' | 'en';
  targetLanguage: string;
};
