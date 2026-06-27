const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

function getToken(): string | null {
  return localStorage.getItem('accessToken');
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401) localStorage.removeItem('accessToken');
    throw new Error(`API ${response.status}: ${path}`);
  }
  return response.json() as Promise<T>;
}

export type AuthUser = {
  userId: string;
  email?: string;
  name?: string;
};

export type TimelinePoint = {
  date: string;
  actions: number;
  analyzed: number;
  avgLatencyMs: number;
};

export type GrowthReport = {
  period: number;
  timeline: TimelinePoint[];
  totals: { actions: number; analyzed: number; usageRate: number };
  toneBreakdown: { tone: string; count: number }[];
  actionTypeBreakdown: { actionType: string; count: number }[];
};

export type CommentHistoryItem = {
  suggestionId: string;
  postId: string;
  postType?: string;
  postUrl?: string;
  tweetId?: string;
  postText?: string;
  authorName?: string;
  username?: string;
  media: { mediaType: string; mediaUrl?: string; altText?: string }[];
  text: string;
  language: string;
  tone: string;
  meaningVi?: string;
  risk?: string;
  optimizationScore?: number;
  optimizationReason?: string[];
  avoidReason?: string[];
  used: boolean;
  actions: { actionType: string; createdAt: string }[];
  analysis?: {
    mode?: string;
    textSummary?: string;
    imageSummary?: string;
    topic?: string;
    intent?: string;
    commentStrategy?: string;
    warnings?: string[];
  };
  createdAt: string;
};

export type CommentHistory = {
  userId: string;
  items: CommentHistoryItem[];
};

export type PersonalProfile = {
  targetNiches: string[];
  strongNiches: string[];
  weakNiches: string[];
  preferredLanguages: string[];
  bestLanguages: string[];
  tonePreferences: string[];
  successfulTones: string[];
  accountWatchlist: { username: string; priority: 'high' | 'medium' | 'low'; successScore: number }[];
  commentMemory: {
    preferredLanguages: string[];
    preferredTones: string[];
    commonPostTypes: string[];
    styleNotes?: string;
  } | null;
};

export type CommentMemoryProfile = {
  userId: string;
  profile: {
    preferredLanguages: string[];
    preferredTones: string[];
    commonPostTypes: string[];
    blockedPhrases?: string[];
    styleNotes?: string;
  } | null;
  recentUsedComments: unknown[];
  patterns: unknown[];
};

export async function login(email: string, password: string): Promise<string> {
  const res = await apiFetch<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem('accessToken', res.accessToken);
  return res.accessToken;
}

export async function getMe(): Promise<AuthUser> {
  const res = await apiFetch<{ user: AuthUser }>('/auth/me');
  return res.user;
}

export async function getGrowthReport(days = 30): Promise<GrowthReport> {
  return apiFetch<GrowthReport>(`/analytics/growth-report?days=${days}`);
}

export async function getCommentHistory(params: {
  limit?: number;
  used?: boolean;
  tone?: string;
} = {}): Promise<CommentHistory> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.used !== undefined) qs.set('used', String(params.used));
  if (params.tone) qs.set('tone', params.tone);
  return apiFetch<CommentHistory>(`/analytics/comment-history?${qs}`);
}

export async function draftPost(params: {
  topic?: string;
  language: string;
  count?: number;
}): Promise<{ drafts: string[] }> {
  return apiFetch('/analytics/draft-post', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getPersonalProfile(): Promise<PersonalProfile> {
  return apiFetch<PersonalProfile>('/personal-profile');
}

export async function getCommentMemory(): Promise<CommentMemoryProfile> {
  return apiFetch<CommentMemoryProfile>('/comment-memory');
}
