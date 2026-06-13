import type {
  FeedCandidateMetrics,
  FeedCandidateTimestamps,
  FeedContentType,
  StoredFeedCandidate,
} from '../../feed-intelligence/types/feed-intelligence.types';

export type OpportunityLabel = 'skip' | 'low' | 'medium' | 'high' | 'urgent';

export type RecommendedAction =
  | 'skip'
  | 'like_only'
  | 'comment_short'
  | 'comment_with_question'
  | 'quote_post'
  | 'save_as_content_idea';

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

export type OpportunityMedia = {
  type: 'image';
  url: string;
  altText?: string;
};

export type OpportunityCandidate = {
  id?: string;
  postUrl?: string;
  tweetId?: string;
  username?: string;
  authorName?: string;
  text: string;
  detectedLanguage?: string;
  detectedNiche?: string;
  detectedTopic?: string;
  contentType?: FeedContentType | string;
  media?: OpportunityMedia[];
  mediaCount?: number;
  metrics?: FeedCandidateMetrics;
  timestamps?: FeedCandidateTimestamps;
  hasQuestion?: boolean;
  needsVisionAnalysis?: boolean;
  feedScore?: number;
};

export type OpportunityUserContext = {
  targetNiches?: string[];
  preferredCommentLanguages?: string[];
  recentUsedComments?: string[];
};

export type OpportunityScoringInput = {
  candidate: OpportunityCandidate;
  userContext?: OpportunityUserContext;
};

export type OpportunitySnapshotItem = {
  candidateId: string;
  postUrl?: string;
  username?: string;
  authorName?: string;
  text: string;
  detectedNiche?: string;
  detectedTopic?: string;
  contentType?: string;
  score: OpportunityScore;
};

export type OpportunitySnapshotSummary = Record<OpportunityLabel, number> & {
  totalCandidates: number;
};

export function candidateFromStoredFeedCandidate(
  candidate: StoredFeedCandidate,
): OpportunityCandidate {
  return {
    id: candidate.id,
    postUrl: candidate.postUrl,
    tweetId: candidate.tweetId,
    username: candidate.username,
    authorName: candidate.authorName,
    text: candidate.text,
    detectedLanguage: candidate.language,
    detectedNiche: candidate.niche,
    detectedTopic: candidate.topic,
    contentType: candidate.contentType,
    mediaCount: candidate.mediaCount,
    metrics: candidate.metrics,
    timestamps: candidate.timestamps,
    hasQuestion: candidate.hasQuestion,
    needsVisionAnalysis: candidate.needsVisionAnalysis,
    feedScore: candidate.score,
  };
}
