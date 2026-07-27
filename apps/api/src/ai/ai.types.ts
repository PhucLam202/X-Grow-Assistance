import { DetectedLanguage } from '../common/language/language.types';
import { NormalizedImage } from '../image/image.types';
import { GenerateReplyPackDto } from '../reply-pack/dto/generate-reply-pack.dto';
import { CommentSuggestion } from '../reply-pack/types/reply-pack.types';
import { AnalyzeVisionDto } from '../vision/dto/analyze-vision.dto';

export type AiProviderName =
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'claude'
  | 'openrouter';

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

export interface AiUsageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiProviderResult {
  content: string;
  usage?: AiUsageMetadata;
}

export type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export interface AiExecutionMetadata {
  primaryProvider: string;
  primaryModel: string;
  finalProvider: string;
  finalModel: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  attemptCount: number;
  replyPackUsage?: AiUsageMetadata;
  visionUsage?: AiUsageMetadata;
}

export interface AiExecutionResult<T> {
  data: T;
  execution: AiExecutionMetadata;
}

export interface AiProviderErrorOptions {
  providerName: string;
  code: string;
  isRetryable: boolean;
  statusCode?: number;
  sanitizedCause?: string;
}

export class AiProviderError extends Error {
  public readonly providerName: string;
  public readonly code: string;
  public readonly isRetryable: boolean;
  public readonly statusCode?: number;
  public readonly sanitizedCause?: string;

  constructor(message: string, options: AiProviderErrorOptions) {
    super(message);
    this.name = 'AiProviderError';
    this.providerName = options.providerName;
    this.code = options.code;
    this.isRetryable = options.isRetryable;
    this.statusCode = options.statusCode;
    this.sanitizedCause = options.sanitizedCause;
  }
}
