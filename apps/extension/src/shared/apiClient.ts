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

/**
 * The API's `GlobalExceptionFilter` reads `HttpException.message`, which Nest
 * flattens to "Bad Request Exception" for ValidationPipe failures — the
 * per-field codes (INVALID_NICHE, INVALID_TONE, …) never reach us. So the code
 * is the only actionable signal on a 400, and we translate it here.
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: "The request was rejected. Check your generation settings.",
  INVALID_POST_CONTEXT: "This post has no text and no image to work from.",
  INVALID_NICHE: "That niche is not supported. Pick another one in settings.",
  INVALID_TONE: "That tone is not supported. Pick another one in settings.",
  INVALID_INTENT: "That intent is not supported. Pick another one in settings.",
  INVALID_REPLY_COUNT: "Reply count must be 3 or 4.",
  BAD_REQUEST: "The request was rejected. Check your generation settings.",
  AUTH_REQUIRED: "Your session expired. Please log in again.",
  FORBIDDEN: "You do not have access to this action.",
  RATE_LIMITED: "Too many requests. Wait a moment and try again.",
  QUOTA_EXCEEDED: "You have reached your generation quota.",
  IMAGE_FETCH_FAILED: "Could not download the post image.",
  IMAGE_TOO_LARGE: "The post image is too large to analyze.",
  UNSUPPORTED_IMAGE_TYPE: "That image format is not supported.",
  VISION_PROVIDER_UNAVAILABLE: "Image analysis is unavailable right now.",
  AI_PROVIDER_TIMEOUT: "The AI provider timed out. Try again.",
  AI_PROVIDER_RATE_LIMITED: "The AI provider is rate limiting us. Try again shortly.",
  AI_PROVIDER_UNAVAILABLE: "The AI provider is unavailable right now.",
  AI_AUTHENTICATION_FAILED: "The server could not authenticate with the AI provider.",
  AI_INVALID_OUTPUT: "The AI returned an unusable response. Try again.",
  AI_OUTPUT_REPAIR_FAILED: "The AI returned an unusable response. Try again.",
  GENERATION_FAILED: "Generation failed. Try again.",
  INTERNAL_ERROR: "Something went wrong on the server.",
};

export type ApiErrorEnvelope = {
  code: string;
  message: string;
  retryable: boolean;
  requestId: string;
};

/** Thrown for every non-OK response so callers can branch on `code`. */
export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly status: number;

  constructor(
    message: string,
    options: { code: string; retryable: boolean; requestId?: string; status: number },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.requestId = options.requestId;
    this.status = options.status;
  }
}

async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: ApiErrorEnvelope | string;
      message?: string | string[];
    };

    // Current contract: { error: { code, message, retryable, requestId } }
    if (body.error && typeof body.error === "object") {
      const envelope = body.error;
      const mapped = ERROR_CODE_MESSAGES[envelope.code];
      const raw = typeof envelope.message === "string" ? envelope.message.trim() : "";
      // Nest's flattened "…Exception" text is noise; prefer the mapped copy.
      const useRaw = raw && !/Exception$/.test(raw);
      return new ApiError(mapped ?? (useRaw ? raw : fallback), {
        code: envelope.code,
        retryable: Boolean(envelope.retryable),
        requestId: envelope.requestId,
        status: response.status,
      });
    }

    // Legacy contract, still emitted by routes outside the global filter.
    if (Array.isArray(body.message) && body.message.length > 0) {
      return new ApiError(body.message.join("; "), {
        code: "VALIDATION_FAILED",
        retryable: false,
        status: response.status,
      });
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return new ApiError(body.message, {
        code: "UNKNOWN",
        retryable: false,
        status: response.status,
      });
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return new ApiError(body.error, {
        code: "UNKNOWN",
        retryable: false,
        status: response.status,
      });
    }
  } catch {
    // Some endpoints may return an empty or non-JSON error response.
  }

  return new ApiError(fallback, {
    code: "UNKNOWN",
    retryable: false,
    status: response.status,
  });
}

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  return (await toApiError(response, fallback)).message;
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

export async function generateReplyPack(
  payload: import("./types").CreateReplyPackPayload,
  options: { idempotencyKey?: string } = {},
): Promise<import("./types").ReplyPackApiResponse> {
  const response = await apiFetch(`/reply-packs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Lets the API de-duplicate a retried generation instead of billing twice.
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await toApiError(
      response,
      `Generate reply pack failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<import("./types").ReplyPackApiResponse>;
}
