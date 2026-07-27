import type {
  CommentIntent,
  CommentIntentSelection,
  EmojiLevel,
  EnergyLevel,
  Niche,
  NicheClassificationMethod,
  NicheSelection,
  ReplyCount,
  ReplyLanguage,
  ReplyLength,
  ToneSelection,
} from "./generationOptions";

export type RiskLevel = "low" | "medium" | "high";

export type ReplyCandidateScore = {
  total: number;
  postFit: number;
  visibility: number;
  specificity: number;
  native: number;
  engagementHook: number;
  whyVisible: string;
};

export type CommentTone =
  | "short_native"
  | "casual_supportive"
  | "question_based"
  | "insightful"
  | "funny_light"
  | "anime_fan"
  | "crypto_casual"
  | "football_fan"
  | "congratulation";

export type TargetCommentLanguage = "same_as_original" | "ja" | "en" | "vi";
export type ExplanationLanguage = "vi" | "en";

export type CommentSuggestion = {
  text: string;
  meaningVi: string;
  tone: CommentTone;
  risk: RiskLevel;
  whyItWorks: string;
  score?: ReplyCandidateScore;
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

export type AnalysisMode = "text" | "vision";

export type ExtractedMedia = {
  type: "image";
  url: string;
  altText?: string;
  photoIndex?: number;
  photoHref?: string;
};

export type ExtractedPostMetrics = {
  replies?: number;
  reposts?: number;
  likes?: number;
  views?: number;
};

export type ExtractedPostTimestamps = {
  postedAt?: string;
  postedAtText?: string;
  extractedAt: string;
};

export type ExtractedPost = {
  platform: "x";
  postUrl?: string;
  tweetId?: string;
  authorName?: string;
  username?: string;
  text: string;
  media: ExtractedMedia[];
  metrics?: ExtractedPostMetrics;
  timestamps?: ExtractedPostTimestamps;
  detectedAt: string;
  source:
    | "click"
    | "detail_page"
    | "manual_button"
    | "auto_scroll"
    | "visible_cache"
    | "feed_scan";
};

export type ExtractedPostContextType =
  | "original_post"
  | "quote_post"
  | "repost"
  | "reply"
  | "thread_post"
  | "unknown";

export type ExtractedRelatedPostRole = "quoted" | "reposted" | "parent";

export type ExtractedPostContext = {
  platform: "x";
  contextType: ExtractedPostContextType;
  mainPost: ExtractedPost;
  quotedPost?: ExtractedPost;
  repostedPost?: ExtractedPost;
  parentPost?: ExtractedPost;
  socialContext?: {
    repostedBy?: string;
    repostedByUsername?: string;
    replyingTo?: string[];
    isSelfRepost?: boolean;
    visibleContextText?: string;
  };
  extraction: {
    confidence: number;
    warnings: string[];
    raw?: Record<string, unknown>;
  };
};

export type FeedSnapshotSource =
  | "x_home_feed"
  | "x_search_feed"
  | "x_profile_feed"
  | "x_unknown_feed";

export type FeedPostCandidate = ExtractedPost & {
  localId: string;
};

export type FeedSnapshot = {
  snapshotId: string;
  source: FeedSnapshotSource;
  capturedAt: string;
  visiblePostCount: number;
  posts: FeedPostCandidate[];
};

export type SelectedPostMessage = {
  type: "XCA_SELECTED_POST";
  post: ExtractedPost;
  postContext?: ExtractedPostContext;
};

export type CachePostContextMessage = {
  type: "XCA_CACHE_POST_CONTEXT";
  post: ExtractedPost;
  postContext?: ExtractedPostContext;
};

export type GetSelectedPostMessage = {
  type: "XCA_GET_SELECTED_POST";
};

export type DetectCurrentPostMessage = {
  type: "XCA_DETECT_CURRENT_POST";
};

export type PingDetectorMessage = {
  type: "XCA_PING";
};

export type ScanVisibleFeedMessage = {
  type: "XCA_SCAN_VISIBLE_FEED";
};

export type RenderPostOverlayMessage = {
  type: "XCA_RENDER_POST_OVERLAY";
  post: ExtractedPost;
  score: OpportunityScore;
};

export type PendingPublishedComment = {
  postId: string;
  suggestionId?: string;
  parentPostUrl?: string;
  parentTweetId?: string;
  commentText: string;
  commentLanguage?: string;
  createdAt: number;
};

export type TrackPendingCommentMessage = {
  type: "XCA_TRACK_PENDING_COMMENT";
  pending: PendingPublishedComment;
};

export type SelectedPostResponse = {
  post?: ExtractedPost;
  postContext?: ExtractedPostContext;
  ok?: boolean;
  error?: string;
};

export type FeedScanResponse = {
  snapshot?: FeedSnapshot;
  error?: string;
};

export const SELECTED_POST_STORAGE_KEY = "x_comment_assistant_selected_post_v1";
export const POST_CONTEXT_CACHE_STORAGE_KEY =
  "x_comment_assistant_post_context_cache_v1";

export type CachedPostContext = {
  key: string;
  post: ExtractedPost;
  postContext?: ExtractedPostContext;
  extractedAt: string;
  expiresAt: string;
};

export type ExtensionMessage =
  | SelectedPostMessage
  | CachePostContextMessage
  | GetSelectedPostMessage
  | DetectCurrentPostMessage
  | PingDetectorMessage
  | ScanVisibleFeedMessage
  | RenderPostOverlayMessage
  | TrackPendingCommentMessage;

export type FeedSnapshotSubmitResponse = {
  snapshotId: string;
  acceptedPosts: number;
  ignoredPosts: number;
  summary: {
    visiblePostCount: number;
    usefulCandidates: number;
    byNiche: Record<string, number>;
    byContentType: Record<string, number>;
    averageScore: number;
    bestScore: number;
    readyForScoring: boolean;
  };
  topCandidates: Array<{
    postUrl?: string;
    username?: string;
    authorName?: string;
    text: string;
    niche: string;
    topic: string;
    contentType: string;
    mediaCount?: number;
    metrics?: ExtractedPostMetrics;
    timestamps?: ExtractedPostTimestamps;
    score: number;
  }>;
  next: {
    canScore: boolean;
    scoringEndpoint?: string;
  };
};

export type OpportunityLabel = "skip" | "low" | "medium" | "high" | "urgent";

export type RecommendedAction =
  | "skip"
  | "like_only"
  | "comment_short"
  | "comment_with_question"
  | "quote_post"
  | "save_as_content_idea";

export type OpportunityDimensions = {
  nicheMatch: number;
  freshness: number;
  engagementVelocity: number;
  replySurface: number;
  mediaContext: number;
  authorQuality: number;
  competitionLevel: number;
  spamRisk: number;
  negativeTopicRisk: number;
};

export type OpportunityScore = {
  total: number;
  label: OpportunityLabel;
  dimensions: OpportunityDimensions;
  recommendedAction: RecommendedAction;
  suggestedCommentAngle: string;
  reasonVi: string[];
  warnings: string[];
};

export type OpportunitySnapshotScoreResponse = {
  snapshotId: string;
  topOpportunities: Array<{
    candidateId: string;
    postUrl?: string;
    username?: string;
    authorName?: string;
    text: string;
    detectedNiche?: string;
    detectedTopic?: string;
    contentType?: string;
    score: OpportunityScore;
  }>;
  summary: Record<OpportunityLabel, number> & {
    totalCandidates: number;
  };
};

export type OpportunityPostScoreResponse = {
  postUrl?: string;
  score: OpportunityScore;
};

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
  analysisMode: "vision" | "text_only_fallback";
  imageAnalysis?: VisionImageAnalysis;
  combinedContext: VisionCombinedContext;
  imageErrors?: string[];
};

export type VisionContext = {
  analysisMode: "vision_context" | "text_only_fallback";
  detectedLanguage: string;
  translationLanguage: "vi" | "en";
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

export type HarnessCommentDepth = "short" | "medium" | "deep";
export type HarnessStatus = "started" | "completed" | "failed" | "skipped";
export type HarnessToolStatus = "success" | "skipped" | "failed";

export type HarnessPostSegment = {
  text?: string;
  authorName?: string;
  username?: string;
  language?: string;
  url?: string;
};

export type HarnessMediaContext = {
  type: "image" | "video_thumbnail" | "gif" | "unknown";
  altText?: string;
  ocrText?: string;
};

export type HarnessAuthorContinuation = HarnessPostSegment & {
  orderIndex: number;
};

export type HarnessDriverInput = {
  platform: "x";
  mainPost: HarnessPostSegment;
  media?: HarnessMediaContext[];
  quotedPost?: HarnessPostSegment;
  repostedPost?: HarnessPostSegment;
  parentPost?: HarnessPostSegment;
  authorContinuations?: HarnessAuthorContinuation[];
  availableReplies?: HarnessAuthorContinuation[];
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

export type HarnessDriverDecision = {
  zone: string;
  intent: string;
  shouldComment: boolean;
  recommendedLanguage: string;
  recommendedTone: string;
  recommendedDepth: HarnessCommentDepth;
  commentStrategy: string;
  avoid: string[];
  requiredTools: string[];
  needsContextExpansion: boolean;
  contextReasons: string[];
  decisionStage: "initial" | "final";
  confidence: number;
  warnings: string[];
};

export type HarnessGeneratedComment = {
  text: string;
  label: string;
  style: "best_pick" | "safe" | "funny" | "question" | "value_add";
  score: number;
  reason: string;
  risk: RiskLevel;
};

export type HarnessComposerOutput = {
  bestPick: HarnessGeneratedComment | null;
  alternatives: HarnessGeneratedComment[];
  warnings: string[];
};

export type HarnessToolCallRecord = {
  toolName: string;
  status: HarnessToolStatus;
  critical: boolean;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
};

export type HarnessState = {
  runId: string;
  status: HarnessStatus;
  input: HarnessDriverInput;
  enrichedInput: HarnessDriverInput;
  initialDecision?: HarnessDriverDecision;
  finalDecision?: HarnessDriverDecision;
  composerOutput?: HarnessComposerOutput;
  toolCalls: HarnessToolCallRecord[];
  warnings: string[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
};

export type GenerateReplyPackRequest = {
  platform: "x";
  postText: string;
  postUrl?: string;
  postContext?: ExtractedPostContext;
  targetCommentLanguage: TargetCommentLanguage;
  explanationLanguage: ExplanationLanguage;
  tone: CommentTone;
  niche: string;
  maxSuggestions: number;
};

export type AnalyzeVisionRequest = {
  post: {
    platform: "x";
    text: string;
    url?: string;
    authorName?: string;
    authorHandle?: string;
  };
  media: Array<{
    type: "image";
    url: string;
    altText?: string;
  }>;
  postContext?: ExtractedPostContext;
  options: {
    explanationLanguage: ExplanationLanguage;
    targetCommentLanguage: TargetCommentLanguage;
    tone: CommentTone;
    niche: string;
    maxSuggestions: number;
  };
};

export type GenerateFromVisionContextRequest = {
  post: AnalyzeVisionRequest["post"];
  postContext?: ExtractedPostContext;
  visionContext: VisionContext;
  options: AnalyzeVisionRequest["options"];
};

export type UsageEventName =
  | "analyze_started"
  | "analyze_succeeded"
  | "analyze_failed"
  | "copy_clicked"
  | "regenerate_clicked"
  | "tone_changed"
  | "feedback_submitted";

export type CommentFeedback =
  | "good"
  | "bad"
  | "too_generic"
  | "wrong_context"
  | "too_risky";

export type UsageEventRequest = {
  deviceId: string;
  eventName: UsageEventName;
  platform: "x";
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
  platform: "x";
  postText: string;
  postUrl?: string;
  tone: CommentTone;
  targetCommentLanguage: TargetCommentLanguage;
  replyPack: ReplyPack;
  createdAt: string;
};

export type CommentHistoryMedia = {
  mediaType?: string;
  mediaUrl?: string;
  altText?: string;
  ocrText?: string;
};

export type CommentHistoryItem = {
  suggestionId: string;
  postId: string;
  analysisId?: string;
  postType?: FullContextPostType;
  postUrl?: string;
  tweetId?: string;
  postText?: string;
  authorName?: string;
  username?: string;
  media: CommentHistoryMedia[];
  text: string;
  language?: string;
  tone?: string;
  meaningVi?: string;
  risk?: RiskLevel;
  optimizationScore?: number;
  optimizationReason?: string[];
  avoidReason?: string[];
  used: boolean;
  actions: Array<Record<string, unknown>>;
  analysis?: {
    mode?: string;
    textSummary?: string;
    imageSummary?: string;
    combinedContext?: string;
    topic?: string;
    tone?: string;
    intent?: string;
    commentStrategy?: string;
    warnings?: string[];
  };
  createdAt: string;
};

export type CommentHistoryResponse = {
  userId: string;
  items: CommentHistoryItem[];
};

export type FullContextPostType =
  | "original_post"
  | "reply"
  | "quote_post"
  | "repost"
  | "thread_post"
  | "unknown";

export type SaveFullContextRequest = {
  userId?: string;
  platform?: "x";
  postUrl?: string;
  tweetId?: string;
  postType: FullContextPostType;
  authorName?: string;
  username?: string;
  text?: string;
  language?: string;
  rawContext?: Record<string, unknown>;
  extractionConfidence?: number;
  extractionWarnings?: string[];
  media?: Array<Record<string, unknown>>;
  relatedPosts?: Array<Record<string, unknown>>;
  relations?: Array<Record<string, unknown>>;
  analysis?: Record<string, unknown>;
  suggestions?: Array<Record<string, unknown>>;
};

export type SaveFullContextResponse = {
  success: boolean;
  postId: string;
  analysisId: string | null;
  mediaCount: number;
  suggestionIds: string[];
  warnings: string[];
};

export type CommentActionType =
  | "generated"
  | "copied"
  | "inserted"
  | "edited"
  | "sent_manually"
  | "sent_detected"
  | "mark_as_sent"
  | "skipped"
  | "saved"
  | "regenerated";

export type LogCommentActionRequest = {
  userId?: string;
  postId: string;
  suggestionId?: string;
  actionType: CommentActionType;
  commentText?: string;
  metadata?: Record<string, unknown>;
};

export type DetectPublishedCommentRequest = {
  userId?: string;
  postId: string;
  suggestionId?: string;
  parentPostUrl?: string;
  parentTweetId?: string;
  commentText: string;
  commentUrl?: string;
  commentTweetId?: string;
  commentLanguage?: string;
  wasAiGenerated?: boolean;
  wasEdited?: boolean;
  detectedBy: "dom_after_send" | "manual_paste" | "user_confirmed";
  detectionConfidence?: number;
  rawDetection?: Record<string, unknown>;
};

export type CommentOverview = {
  userId: string;
  postsAnalyzed: number;
  commentsGenerated: number;
  actions: Record<string, number>;
  postTypes: Array<{ _id: string; count: number; warnings: number }>;
  extractionWarningCount: number;
  bestPickUsage: {
    bestSuggestions: number;
    usedBestSuggestions: number;
    usageRate: number;
  };
};

// ── Unified reply-packs endpoint types ──────────────────────────────────────

export type CreateReplyPackPayload = {
  post: {
    platform: "x";
    postId: string;
    url?: string;
    text: string;
    author?: { name?: string; handle?: string };
    media?: Array<{ type: "image" | "video" | "gif"; url: string }>;
    contentType: "text" | "image" | "video" | "mixed" | "unknown";
    postType: "original" | "reply" | "quote" | "repost";
    capturedAt: string;
    extractorVersion: string;
  };
  /**
   * Mirrors `ReplyOptionsDto`. Every field is optional server-side (defaults
   * come from `resolveReplyOptions()`), but unknown fields are rejected by
   * `forbidNonWhitelisted` — do not add anything the DTO does not declare.
   */
  options: {
    niche?: NicheSelection;
    tone?: ToneSelection;
    intent?: CommentIntentSelection;
    length?: ReplyLength;
    energy?: EnergyLevel;
    language?: ReplyLanguage;
    emojiLevel?: EmojiLevel;
    replyCount?: ReplyCount;
    explanationLanguage?: ExplanationLanguage;
    visionEnabled?: boolean;
    /** @deprecated superseded by `language` */
    targetLanguage?: TargetCommentLanguage;
    /** @deprecated superseded by `replyCount` */
    maxSuggestions?: number;
  };
};

/** Phase 6 scores, 0–1 scale. Absent on older generations. */
export type ReplyCandidateScores = {
  postFit: number;
  specificity: number;
  naturalness: number;
  nicheFit: number;
  empathyFit: number;
  conversationPotential: number;
  safetyScore: number;
  userStyleFit: number;
  ruleScore: number;
  /** Absent means the model did not self-score — not zero. */
  modelSelfScore?: number;
  finalScore: number;
  scoringMethod: "rule_only" | "rule_plus_self_score";
};

export type ReplyPackApiSuggestion = {
  suggestionId: string;
  text: string;
  meaningVi?: string;
  whyItWorks?: string;
  /** Legacy 0–100 scale; still required by the API contract. */
  score: {
    total: number;
    postFit: number;
    visibility: number;
    specificity: number;
    native: number;
    engagementHook: number;
  };
  risk: RiskLevel;
  tone: string;
  niche: string;
  intent?: CommentIntent;
  length?: ReplyLength;
  energy?: EnergyLevel;
  scores?: ReplyCandidateScores;
  /** The specific detail in the post this reply anchors to. */
  referencedConcept?: string;
};

/** How the API resolved the niche for this generation. */
export type ReplyPackAnalysis = {
  detectedLanguage: string;
  primaryNiche: Niche;
  secondaryNiches: Niche[];
  nicheConfidence: number;
  classificationMethod: NicheClassificationMethod;
  analysisMode: "text_only" | "text_and_vision";
  visionUsed: boolean;
  fallbackUsed: boolean;
  nicheEvidence?: string[];
  needsGenerationTimeClassification?: boolean;
};

export type ReplyPackPipelineMetadata = {
  generated: number;
  rejected: number;
  duplicates: number;
  retryUsed: boolean;
  scoringMethod: "rule_only" | "rule_plus_self_score" | "mixed";
};

export type ReplyPackApiResponse = {
  generationRunId: string;
  requestId?: string;
  analysisMode: "text" | "vision" | "text_only_fallback";
  analysis?: ReplyPackAnalysis;
  detectedLanguage?: string;
  translation?: string;
  summary?: string;
  context?: string;
  theme?: string;
  topic?: string;
  sentiment?: string;
  commentStrategy?: string;
  suggestions: ReplyPackApiSuggestion[];
  metadata: {
    provider: string;
    model: string;
    promptVersion: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
    fallbackUsed: boolean;
    pipeline?: ReplyPackPipelineMetadata;
  };
  warnings?: string[];
};

