export type CommentZone =
  | 'anime_meme'
  | 'achievement_congrats'
  | 'emotional_support'
  | 'technical_insight'
  | 'news_reaction'
  | 'debate_hot_take'
  | 'low_context'
  | 'risky_topic'
  | 'general';

export type CommentDepth = 'short' | 'medium' | 'deep';
export type DriverDecisionStage = 'initial' | 'final';

export type PostSegment = {
  text?: string;
  authorName?: string;
  username?: string;
  language?: string;
  url?: string;
};

export type MediaContext = {
  type: 'image' | 'video_thumbnail' | 'gif' | 'unknown';
  altText?: string;
  ocrText?: string;
};

export type AuthorContinuation = PostSegment & {
  orderIndex: number;
};

export type DriverInput = {
  platform: 'x';
  userId?: string;
  mainPost: PostSegment;
  media?: MediaContext[];
  quotedPost?: PostSegment;
  repostedPost?: PostSegment;
  parentPost?: PostSegment;
  authorContinuations?: AuthorContinuation[];
  availableReplies?: AuthorContinuation[];
  extraction: {
    confidence: number;
    warnings: string[];
    missingFields: string[];
  };
  contextState?: {
    isExpanded: boolean;
    expansionSources: string[];
    needsMoreContext?: boolean;
  };
};

export type DriverDecision = {
  zone: CommentZone;
  intent: string;
  shouldComment: boolean;
  recommendedLanguage: string;
  recommendedTone: string;
  recommendedDepth: CommentDepth;
  commentStrategy: string;
  avoid: string[];
  requiredTools: string[];
  needsContextExpansion: boolean;
  contextReasons: string[];
  decisionStage: DriverDecisionStage;
  confidence: number;
  warnings: string[];
};

export type CommentStyle =
  | 'best_pick'
  | 'safe'
  | 'funny'
  | 'question'
  | 'value_add';

export type GeneratedComment = {
  text: string;
  label: string;
  style: CommentStyle;
  score: number;
  reason: string;
  risk: 'low' | 'medium' | 'high';
};

export type UserMemoryRef = {
  preferredTones: string[];
  blockedPhrases: string[];
  styleNotes?: string;
};

export type ComposerInput = {
  input: DriverInput;
  decision: DriverDecision;
  userMemory?: UserMemoryRef;
};

export type ComposerOutput = {
  bestPick: GeneratedComment | null;
  alternatives: GeneratedComment[];
  warnings: string[];
};

export type ContinuationSignalResult = {
  hasSignal: boolean;
  signals: string[];
  confidence: number;
};

export type ContinuationContext = {
  authorContinuations: AuthorContinuation[];
  parentPost?: PostSegment;
  quotedPost?: PostSegment;
  repostedPost?: PostSegment;
  extraction: {
    confidence: number;
    warnings: string[];
    missingFields: string[];
    needsMoreContext: boolean;
  };
  expansionSources: string[];
};

export type StrategyEngineResult = {
  initialDecision: DriverDecision;
  continuationContext?: ContinuationContext;
  enrichedInput: DriverInput;
  finalDecision: DriverDecision;
};
