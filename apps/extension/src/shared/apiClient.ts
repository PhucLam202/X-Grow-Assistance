import type {
  AnalyzeVisionRequest,
  FeedSnapshot,
  FeedSnapshotSubmitResponse,
  GenerateFromVisionContextRequest,
  DetectPublishedCommentRequest,
  OpportunityPostScoreResponse,
  GenerateReplyPackRequest,
  CommentOverview,
  LogCommentActionRequest,
  OpportunitySnapshotScoreResponse,
  ReplyPack,
  SaveFullContextRequest,
  SaveFullContextResponse,
  UsageEventRequest,
  VisionContext,
  VisionReplyPack,
} from "./types";

const API_BASE_URL = "http://127.0.0.1:3001/api/v1";

export async function generateReplyPack(
  request: GenerateReplyPackRequest,
): Promise<ReplyPack> {
  const response = await fetch(`${API_BASE_URL}/generate-reply-pack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json() as Promise<ReplyPack>;
}

export async function analyzeVision(
  request: AnalyzeVisionRequest,
): Promise<VisionReplyPack> {
  const response = await fetch(`${API_BASE_URL}/analyze/vision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Vision API request failed with status ${response.status}`);
  }

  return response.json() as Promise<VisionReplyPack>;
}

export async function analyzeVisionContext(
  request: AnalyzeVisionRequest,
): Promise<VisionContext> {
  const response = await fetch(`${API_BASE_URL}/analyze/vision/context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Vision context API request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<VisionContext>;
}

export async function generateFromVisionContext(
  request: GenerateFromVisionContextRequest,
): Promise<VisionReplyPack> {
  const sanitizedRequest = {
    post: request.post,
    visionContext: {
      detectedLanguage: request.visionContext.detectedLanguage,
      translationLanguage: request.visionContext.translationLanguage,
      translation: request.visionContext.translation,
      summary: request.visionContext.summary,
      context: request.visionContext.context,
      theme: request.visionContext.theme,
      topic: request.visionContext.topic,
      sentiment: request.visionContext.sentiment,
      commentStrategy: request.visionContext.commentStrategy,
      imageAnalysis: request.visionContext.imageAnalysis,
      combinedContext: request.visionContext.combinedContext,
    },
    options: request.options,
  };

  const response = await fetch(
    `${API_BASE_URL}/analyze/vision/context/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sanitizedRequest),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Vision context comments API request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<VisionReplyPack>;
}

export async function trackUsageEvent(event: UsageEventRequest): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/analytics/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Analytics must never break the core generate/copy flow.
  }
}

export async function saveFullContext(
  request: SaveFullContextRequest,
): Promise<SaveFullContextResponse> {
  const response = await fetch(`${API_BASE_URL}/analytics/full-context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Save full context failed with status ${response.status}`);
  }

  return response.json() as Promise<SaveFullContextResponse>;
}

export async function logCommentAction(
  request: LogCommentActionRequest,
): Promise<{ success: boolean; actionId: string }> {
  const response = await fetch(`${API_BASE_URL}/analytics/comment-actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Log comment action failed with status ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean; actionId: string }>;
}

export async function detectPublishedComment(
  request: DetectPublishedCommentRequest,
): Promise<{ success: boolean; publishedCommentId: string; commentTweetId: string | null }> {
  const response = await fetch(`${API_BASE_URL}/analytics/published-comments/detect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Detect published comment failed with status ${response.status}`);
  }

  return response.json() as Promise<{
    success: boolean;
    publishedCommentId: string;
    commentTweetId: string | null;
  }>;
}

export async function getCommentOverview(userId?: string): Promise<CommentOverview> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const response = await fetch(`${API_BASE_URL}/analytics/comment-overview${params}`);

  if (!response.ok) {
    throw new Error(`Comment overview failed with status ${response.status}`);
  }

  return response.json() as Promise<CommentOverview>;
}

export async function submitFeedSnapshot(
  snapshot: FeedSnapshot,
): Promise<FeedSnapshotSubmitResponse> {
  const sanitizedSnapshot: FeedSnapshot = {
    ...snapshot,
    posts: snapshot.posts.map((post) => ({
      ...post,
      media: post.media.map((media) => ({
        type: media.type,
        url: media.url,
        altText: media.altText,
      })),
    })),
  };

  const response = await fetch(`${API_BASE_URL}/feed/snapshot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sanitizedSnapshot),
  });

  if (!response.ok) {
    throw new Error(
      `Feed snapshot API request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<FeedSnapshotSubmitResponse>;
}

export async function scoreFeedSnapshot(
  snapshotId: string,
): Promise<OpportunitySnapshotScoreResponse> {
  const response = await fetch(`${API_BASE_URL}/opportunities/score-snapshot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ snapshotId }),
  });

  if (!response.ok) {
    throw new Error(
      `Opportunity scoring API request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<OpportunitySnapshotScoreResponse>;
}

export async function scorePost(request: {
  candidate: {
    id?: string;
    postUrl?: string;
    tweetId?: string;
    username?: string;
    authorName?: string;
    text: string;
    contentType?: "text" | "image" | "image_meme_candidate" | "mixed" | "unknown";
    mediaCount?: number;
    metrics?: {
      replies?: number;
      reposts?: number;
      likes?: number;
      views?: number;
    };
    timestamps?: {
      postedAt?: string;
      postedAtText?: string;
      extractedAt: string;
    };
    hasQuestion?: boolean;
    needsVisionAnalysis?: boolean;
  };
}): Promise<OpportunityPostScoreResponse> {
  const response = await fetch(`${API_BASE_URL}/opportunities/score-post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Post opportunity scoring failed with status ${response.status}`);
  }

  return response.json() as Promise<OpportunityPostScoreResponse>;
}
