import { AiUsageMetadata } from '../../../ai/ai.types';

export type GenerationRunStatus = 'processing' | 'completed' | 'failed';

export type PersistedSuggestion = {
  suggestionId: string;
  text: string;
  meaningVi?: string;
  whyItWorks?: string;
  score: {
    total: number;
    postFit: number;
    visibility: number;
    specificity: number;
    native: number;
    engagementHook: number;
  };
  risk: 'low' | 'medium' | 'high';
  tone: string;
  niche: string;
  /** Phase 6, thang 0–1. Additive — run cũ trong Mongo không có field này. */
  scores?: Record<string, number | string>;
  referencedConcept?: string;
};

export type GenerationRun = {
  id: string;
  requestId: string;
  postId: string;
  status: GenerationRunStatus;
  suggestions: PersistedSuggestion[];
  provider: string;
  model: string;
  primaryProvider?: string;
  primaryModel?: string;
  promptVersion: string;
  latencyMs: number;
  aiLatencyMs?: number;
  visionLatencyMs?: number;
  analysisMode?: 'text' | 'vision' | 'text_only_fallback';
  /**
   * Niche detection outcome. Persisted so the rule-based classifier can be
   * measured against real traffic — the accept threshold cannot be tuned
   * without it.
   */
  primaryNiche?: string;
  nicheConfidence?: number;
  nicheClassificationMethod?: string;
  /**
   * Số liệu pipeline Phase 4–6. Không có cách nào tune ngưỡng validation mà
   * không đo được bao nhiêu candidate bị loại vì lý do gì trên traffic thật.
   */
  candidatesGenerated?: number;
  candidatesRejected?: number;
  duplicatesDetected?: number;
  retryUsed?: boolean;
  scoringMethod?: string;
  /** `crypto@1.0.0+tech@1.0.0|degraded` — policy nào đã sinh ra pack này. */
  resolvedPolicyVersion?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  attemptCount?: number;
  errorCode?: string;
  replyPackUsage?: AiUsageMetadata;
  visionUsage?: AiUsageMetadata;
  createdAt: string;
};
