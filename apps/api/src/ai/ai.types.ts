import { DetectedLanguage } from '../common/language/language.types';
import { NormalizedImage } from '../image/image.types';
import { GenerateReplyPackDto } from '../reply-pack/dto/generate-reply-pack.dto';
import { CommentSuggestion } from '../reply-pack/types/reply-pack.types';
import { AnalyzeVisionDto } from '../vision/dto/analyze-vision.dto';

export type AiProviderName = 'openai' | 'deepseek' | 'gemini' | 'claude' | 'openrouter';

export type UserMemory = {
  preferredTones: string[];
  blockedPhrases: string[];
  styleNotes?: string;
};

export type AiReplyPackInput = {
  dto: GenerateReplyPackDto & { translationLanguage: 'vi' | 'en' };
  detectedLanguage: DetectedLanguage;
  targetLanguage: string;
  userMemory?: UserMemory;
};

export type AiReplyPackPayload = {
  translation: string;
  summary: string;
  context: string;
  theme: string;
  topic: string;
  sentiment: string;
  commentStrategy: string;
  suggestions: CommentSuggestion[];
};

export type AiVisionInput = {
  dto: AnalyzeVisionDto;
  images: NormalizedImage[];
  detectedLanguage: DetectedLanguage;
  translationLanguage: 'vi' | 'en';
  targetLanguage: string;
};

export type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};
