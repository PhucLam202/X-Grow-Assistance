export type RiskLevel = 'low' | 'medium' | 'high';

export type CommentTone =
  | 'short_native'
  | 'casual_supportive'
  | 'question_based'
  | 'insightful'
  | 'funny_light'
  | 'anime_fan'
  | 'crypto_casual'
  | 'football_fan'
  | 'congratulation';

export type TargetCommentLanguage = 'same_as_original' | 'ja' | 'en' | 'vi';

export type CommentSuggestion = {
  text: string;
  meaningVi: string;
  tone: CommentTone;
  risk: RiskLevel;
  whyItWorks: string;
};



export type ReplyPack = {
  detectedLanguage: string;
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

export type AnalysisMode = 'text' | 'vision';

export type ExtractedMedia = {
  type: 'image';
  url: string;
  altText?: string;
  photoIndex?: number;
  photoHref?: string;
};

export type ExtractedPost = {
  platform: 'x';
  postUrl?: string;
  tweetId?: string;
  authorName?: string;
  username?: string;
  text: string;
  media: ExtractedMedia[];
  detectedAt: string;
  source: 'click' | 'detail_page' | 'manual_button' | 'visible_cache';
};

export type SelectedPostMessage = {
  type: 'XCA_SELECTED_POST';
  post: ExtractedPost;
};

export type CachePostContextMessage = {
  type: 'XCA_CACHE_POST_CONTEXT';
  post: ExtractedPost;
};

export type GetSelectedPostMessage = {
  type: 'XCA_GET_SELECTED_POST';
};

export type DetectCurrentPostMessage = {
  type: 'XCA_DETECT_CURRENT_POST';
};

export type SelectedPostResponse = {
  post?: ExtractedPost;
  error?: string;
};

export const SELECTED_POST_STORAGE_KEY = 'x_comment_assistant_selected_post_v1';
export const POST_CONTEXT_CACHE_STORAGE_KEY = 'x_comment_assistant_post_context_cache_v1';

export type CachedPostContext = {
  key: string;
  post: ExtractedPost;
  extractedAt: string;
  expiresAt: string;
};

export type ExtensionMessage =
  | SelectedPostMessage
  | CachePostContextMessage
  | GetSelectedPostMessage
  | DetectCurrentPostMessage;

export type VisionImageAnalysis = {
  summary: string;
  visibleText: string;
  visualTone: string;
  importantObjects: string[];
  uncertainty?: string;
};

export type VisionCombinedContext = {
  topic: string;
  intent: string;
  sentiment: string;
  explanation: string;
  commentStrategy: string;
  avoid: string[];
};

export type VisionReplyPack = ReplyPack & {
  analysisMode: 'vision' | 'text_only_fallback';
  imageAnalysis?: VisionImageAnalysis;
  combinedContext: VisionCombinedContext;
  imageErrors?: string[];
};

export type VisionContext = {
  analysisMode: 'vision_context' | 'text_only_fallback';
  detectedLanguage: string;
  translationLanguage: 'vi' | 'en';
  translation: string;
  summary: string;
  context: string;
  theme: string;
  topic: string;
  sentiment: string;
  commentStrategy: string;
  imageAnalysis?: VisionImageAnalysis;
  combinedContext: VisionCombinedContext;
  imageErrors?: string[];
};

export type GenerateReplyPackRequest = {
  platform: 'x';
  postText: string;
  postUrl?: string;
  targetCommentLanguage: TargetCommentLanguage;
  tone: CommentTone;
  niche: string;
  maxSuggestions: number;
};

export type AnalyzeVisionRequest = {
  post: {
    platform: 'x';
    text: string;
    url?: string;
    authorName?: string;
    authorHandle?: string;
  };
  media: Array<{
    type: 'image';
    url: string;
    altText?: string;
  }>;
  options: {
    explanationLanguage: 'vi' | 'en';
    targetCommentLanguage: TargetCommentLanguage;
    tone: CommentTone;
    niche: string;
    maxSuggestions: number;
  };
};

export type GenerateFromVisionContextRequest = {
  post: AnalyzeVisionRequest['post'];
  visionContext: VisionContext;
  options: AnalyzeVisionRequest['options'];
};

export type UsageEventName =
  | 'analyze_started'
  | 'analyze_succeeded'
  | 'analyze_failed'
  | 'copy_clicked'
  | 'regenerate_clicked'
  | 'tone_changed'
  | 'feedback_submitted';

export type CommentFeedback = 'good' | 'bad' | 'too_generic' | 'wrong_context' | 'too_risky';

export type UsageEventRequest = {
  deviceId: string;
  eventName: UsageEventName;
  platform: 'x';
  postUrl?: string;
  tone?: string;
  niche?: string;
  translationLanguage?: string;
  targetCommentLanguage?: string;
  latencyMs?: number;
  errorMessage?: string;
  feedback?: CommentFeedback;
};

export type HistoryItem = {
  id: string;
  platform: 'x';
  postText: string;
  postUrl?: string;
  tone: CommentTone;
  targetCommentLanguage: TargetCommentLanguage;
  replyPack: ReplyPack;
  createdAt: string;
};
