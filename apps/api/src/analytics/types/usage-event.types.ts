export const USAGE_EVENT_NAMES = [
  'analyze_started',
  'analyze_succeeded',
  'analyze_failed',
  'copy_clicked',
  'regenerate_clicked',
  'tone_changed',
  'feedback_submitted',
] as const;

export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

export type StoredUsageEvent = {
  id: string;
  userId?: string;
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
  feedback?: string;
  createdAt: string;
};
