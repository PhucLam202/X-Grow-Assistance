import type {
  AnalyzeVisionRequest,
  FeedSnapshot,
  FeedSnapshotSubmitResponse,
  CommentHistoryResponse,
  OpportunityPostScoreResponse,
  HarnessDriverInput,
  HarnessState,
  LogCommentActionRequest,
  OpportunitySnapshotScoreResponse,
  SaveFullContextRequest,
  SaveFullContextResponse,
  UsageEventRequest,
  VisionContext,
} from "./types";
import { clearAuthSession, getAuthSession, type AuthSession } from "./auth";
import { API_BASE_URL } from "./config";

type ApiRequestInit = RequestInit & {
  skipAuth?: boolean;
};

async function apiFetch(path: string, init: ApiRequestInit = {}): Promise<Response> {
  const { skipAuth, headers, ...requestInit } = init;
  const session = skipAuth ? null : await getAuthSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers: {
      ...(headers ?? {}),
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
  });

  if (response.status === 401 && !skipAuth) {
    await clearAuthSession();
  }

  return response;
}

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(body.message) && body.message.length > 0) return body.message.join("; ");
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Some endpoints may return an empty or non-JSON error response.
  }

  return fallback;
}

export async function login(request: {
  email?: string;
  phone?: string;
  password: string;
}): Promise<AuthSession> {
  const response = await apiFetch("/auth/login", {
    method: "POST",
    skipAuth: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, `Login failed with status ${response.status}`),
    );
  }

  return response.json() as Promise<AuthSession>;
}

export async function register(request: {
  email?: string;
  phone?: string;
  name?: string;
  password: string;
}): Promise<AuthSession> {
  const response = await apiFetch("/auth/register", {
    method: "POST",
    skipAuth: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, `Register failed with status ${response.status}`),
    );
  }

  return response.json() as Promise<AuthSession>;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    await clearAuthSession();
  }
}

export async function getMe(): Promise<AuthSession["user"]> {
  const response = await apiFetch("/auth/me");

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, `Auth check failed with status ${response.status}`),
    );
  }

  const result = (await response.json()) as { user: AuthSession["user"] };
  return result.user;
}

export async function runCommentHarness(
  request: HarnessDriverInput,
): Promise<HarnessState> {
  const response = await apiFetch(`/comment-intelligence/harness/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, `Harness request failed with status ${response.status}`),
    );
  }

  return response.json() as Promise<HarnessState>;
}

export async function analyzeVisionContext(
  request: AnalyzeVisionRequest,
): Promise<VisionContext> {
  const response = await apiFetch(`/analyze/vision/context`, {
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

export async function trackUsageEvent(event: UsageEventRequest): Promise<void> {
  try {
    await apiFetch(`/analytics/events`, {
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
  const response = await apiFetch(`/analytics/full-context`, {
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
  const response = await apiFetch(`/analytics/comment-actions`, {
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

export async function getCommentHistory(limit = 20): Promise<CommentHistoryResponse> {
  const response = await apiFetch(`/analytics/comment-history?limit=${limit}`);

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, `Comment history failed with status ${response.status}`),
    );
  }

  return response.json() as Promise<CommentHistoryResponse>;
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

  const response = await apiFetch(`/feed/snapshot`, {
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
  const response = await apiFetch(`/opportunities/score-snapshot`, {
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
  const response = await apiFetch(`/opportunities/score-post`, {
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
