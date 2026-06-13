export type FeedSnapshotSource =
  | 'x_home_feed'
  | 'x_search_feed'
  | 'x_profile_feed'
  | 'x_unknown_feed';

export type FeedContentType =
  | 'text'
  | 'image'
  | 'image_meme_candidate'
  | 'mixed'
  | 'unknown';

export type FeedCandidateMetrics = {
  replies?: number;
  reposts?: number;
  likes?: number;
  views?: number;
};

export type FeedCandidateTimestamps = {
  postedAt?: string;
  postedAtText?: string;
  extractedAt: string;
};

export type FeedCandidateClassification = {
  language: string;
  niche: string;
  topic: string;
  contentType: FeedContentType;
  hasMedia: boolean;
  hasQuestion: boolean;
  needsVisionAnalysis: boolean;
};

export type FeedCandidateSummary = {
  id?: string;
  postUrl?: string;
  tweetId?: string;
  username?: string;
  authorName?: string;
  text: string;
  language?: string;
  niche: string;
  topic: string;
  contentType: FeedContentType;
  mediaCount?: number;
  metrics?: FeedCandidateMetrics;
  timestamps?: FeedCandidateTimestamps;
  score: number;
};

export type StoredFeedCandidate = FeedCandidateSummary & {
  id: string;
  snapshotId: string;
  tweetId?: string;
  language: string;
  hasQuestion: boolean;
  needsVisionAnalysis: boolean;
  rawTextLength: number;
  createdAt: string;
};

export type StoredFeedSnapshot = {
  id: string;
  source: string;
  capturedAt: string;
  visiblePostCount: number;
  acceptedPosts: number;
  ignoredPosts: number;
  candidates: StoredFeedCandidate[];
  createdAt: string;
};

export type FeedSnapshotResult = {
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
  topCandidates: FeedCandidateSummary[];
  next: {
    canScore: boolean;
    scoringEndpoint?: string;
  };
};
