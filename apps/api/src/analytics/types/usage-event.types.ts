export const USAGE_EVENT_NAMES = [
  'analyze_started',
  'analyze_succeeded',
  'analyze_failed',
  'copy_clicked',
  'regenerate_clicked',
  'tone_changed',
  'feedback_submitted',
  'generation_completed',
  'generation_failed',
] as const;

export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

export type StoredUsageEvent = {
  id: string;
  requestId?: string;
  generationRunId?: string;
  userId?: string;
  deviceId?: string;
  postId?: string;
  eventName: UsageEventName;
  platform?: 'x';
  postUrl?: string;
  analysisMode?: 'text' | 'vision' | 'text_only_fallback';
  fallbackUsed?: boolean;
  provider?: string;
  model?: string;
  errorCode?: string;
  tone?: string;
  /** Final niche the request resolved to (manual pick or classifier result). */
  niche?: string;
  nicheConfidence?: number;
  nicheClassificationMethod?: string;
  /** `true` when Phase 4's generation call had to settle the niche itself. */
  needsGenerationTimeClassification?: boolean;
  /** Phase 4–6 pipeline counters. */
  candidatesGenerated?: number;
  candidatesRejected?: number;
  duplicatesDetected?: number;
  retryUsed?: boolean;
  scoringMethod?: string;
  resolvedPolicyVersion?: string;
  translationLanguage?: string;
  targetCommentLanguage?: string;
  latencyMs?: number;
  errorMessage?: string;
  feedback?: string;
  createdAt: string;
};
