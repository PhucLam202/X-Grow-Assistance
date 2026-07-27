import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getCommentHistory,
  getMe,
  logCommentAction,
  login,
  register,
  logout,
  scoreFeedSnapshot,
  saveFullContext,
  submitFeedSnapshot,
  trackUsageEvent,
  generateReplyPack,
} from "../shared/apiClient";
import { copyTextToClipboard } from "../shared/clipboard";
import { X_OAUTH_AUTHORIZE_URL } from "../shared/config";
import { getDeviceId } from "../shared/deviceId";
import { getAuthSession, setAuthSession, type AuthSession } from "../shared/auth";
import { SELECTED_POST_STORAGE_KEY } from "../shared/types";
import {
  DEFAULT_GENERATION_SETTINGS,
  getGenerationSettings,
  resolveVisionEnabled,
  saveGenerationSettings,
  subscribeGenerationSettings,
  type GenerationSettings,
} from "../shared/settings";
import {
  CLASSIFICATION_METHOD_LABELS,
  COMMENT_INTENT_SELECTIONS,
  EMOJI_LABELS,
  EMOJI_LEVELS,
  ENERGY_LABELS,
  ENERGY_LEVELS,
  EXPLANATION_LANGUAGES,
  EXPLANATION_LANGUAGE_LABELS,
  INTENT_LABELS,
  LENGTH_LABELS,
  NICHE_LABELS,
  NICHE_SELECTIONS,
  REPLY_COUNTS,
  REPLY_LANGUAGES,
  REPLY_LANGUAGE_LABELS,
  REPLY_LENGTHS,
  TONE_LABELS,
  TONE_SELECTIONS,
  humanizeNiche,
  humanizeTone,
} from "../shared/generationOptions";
import { scoreOpportunity } from "../../../../packages/opportunity-scoring/src/index";
import type {
  CommentFeedback,
  CommentHistoryItem,
  CommentHistoryMedia,
  CommentTone,
  ExtensionMessage,
  ExtractedPost,
  ExtractedPostContext,
  FeedScanResponse,
  FeedSnapshotSubmitResponse,
  OpportunityPostScoreResponse,
  OpportunitySnapshotScoreResponse,
  OpportunityLabel,
  OpportunityScore,
  RecommendedAction,
  ReplyPackApiResponse,
  ReplyPackApiSuggestion,
  SaveFullContextResponse,
  SelectedPostResponse,
  TargetCommentLanguage,
  UsageEventName,
  CreateReplyPackPayload,
} from "../shared/types";

// ── Chrome API shim ─────────────────────────────────────────────────────────

type ChromeStorageChange = { newValue?: unknown };

type ChromeApi = {
  runtime?: {
    sendMessage(
      message: ExtensionMessage,
      callback?: (response: SelectedPostResponse | FeedScanResponse) => void,
    ): void;
    lastError?: { message?: string };
  };
  tabs?: {
    query(
      queryInfo: { active: boolean; currentWindow: boolean },
      callback: (tabs: Array<{ id?: number; url?: string }>) => void,
    ): void;
    sendMessage(
      tabId: number,
      message: ExtensionMessage,
      callback?: (response: SelectedPostResponse | FeedScanResponse) => void,
    ): void;
    onActivated?: {
      addListener(callback: (activeInfo: { tabId: number }) => void): void;
      removeListener(callback: (activeInfo: { tabId: number }) => void): void;
    };
    onUpdated?: {
      addListener(callback: (tabId: number, changeInfo: { status?: string; url?: string }) => void): void;
      removeListener(callback: (tabId: number, changeInfo: { status?: string; url?: string }) => void): void;
    };
  };
  scripting?: {
    executeScript(
      injection: { target: { tabId: number }; files: string[] },
      callback?: () => void,
    ): void;
  };
  storage?: {
    local?: {
      get(key: string, callback: (items: Record<string, unknown>) => void): void;
    };
    onChanged?: {
      addListener(
        callback: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
      ): void;
      removeListener(
        callback: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
      ): void;
    };
  };
};

declare const chrome: ChromeApi | undefined;

// ── Constants & local types ─────────────────────────────────────────────────

/** Only used to backfill history rows that predate per-suggestion tone. */
const DEFAULT_COMMENT_TONE: CommentTone = "short_native";
const DEFAULT_TARGET_LANGUAGE: TargetCommentLanguage = "same_as_original";

type CopyState =
  | { status: "idle" }
  | { status: "copying" }
  | { status: "copied" }
  | {
      status: "failed";
      reason: "empty_text" | "clipboard_unavailable" | "permission_denied" | "high_risk" | "unknown";
    };

type AuthMode = "login" | "create";
type AuthMessageType = "info" | "success" | "error";
type ActiveTab = "analyze" | "history" | "feed";

type PersistedGeneration = Pick<SaveFullContextResponse, "postId" | "analysisId" | "suggestionIds"> & {
  postUrl?: string;
  tweetId?: string;
};

// ── Pure helpers ────────────────────────────────────────────────────────────

function formatHandle(username?: string, authorName?: string): string | null {
  if (username) {
    const clean = username.replace(/^@+/, "");
    return clean ? `@${clean}` : null;
  }
  if (authorName) {
    const clean = authorName.replace(/^@+/, "");
    return clean ? `@${clean}` : null;
  }
  return null;
}

type HistoryRunGroup = {
  runId: string;
  postId: string;
  analysisId?: string;
  postText?: string;
  postUrl?: string;
  tweetId?: string;
  authorName?: string;
  username?: string;
  media: CommentHistoryMedia[];
  createdAt: string;
  suggestions: CommentHistoryItem[];
};

function groupHistoryItems(items: CommentHistoryItem[]): HistoryRunGroup[] {
  const groups: HistoryRunGroup[] = [];
  const map = new Map<string, HistoryRunGroup>();

  for (const item of items) {
    const timeKey = Math.floor(new Date(item.createdAt).getTime() / 5000);
    const key = item.analysisId ?? `${item.postId || "post"}_${timeKey}`;

    let group = map.get(key);
    if (!group) {
      group = {
        runId: key,
        postId: item.postId,
        analysisId: item.analysisId,
        postText: item.postText,
        postUrl: item.postUrl,
        tweetId: item.tweetId,
        authorName: item.authorName,
        username: item.username,
        media: item.media ?? [],
        createdAt: item.createdAt,
        suggestions: [],
      };
      map.set(key, group);
      groups.push(group);
    }
    if (!group.suggestions.some((s) => s.suggestionId === item.suggestionId)) {
      group.suggestions.push(item);
    }
  }

  return groups;
}

function formatRecommendedAction(action: RecommendedAction): string {
  return action.replaceAll("_", " ");
}

function getOpportunityLabelVi(label: OpportunityLabel): string {
  const labels: Record<OpportunityLabel, string> = {
    urgent: "Ưu tiên ngay",
    high: "Cơ hội tốt",
    medium: "Có thể thử",
    low: "Ưu tiên thấp",
    skip: "Nên bỏ qua",
  };
  return labels[label];
}

function getOpportunityVerdictVi(label: OpportunityLabel, total: number): string {
  if (total >= 85 || label === "urgent") return "Rất nên bình luận (Ưu tiên ngay)";
  if (total >= 70 || label === "high") return "Nên bình luận (Cơ hội tốt)";
  if (total >= 50 || label === "medium") return "Có thể thử bình luận";
  if (total >= 25 || label === "low") return "Ưu tiên thấp";
  return "Nên bỏ qua bài viết này";
}

function getDecisionLabel(label: OpportunityLabel): string {
  const map: Record<OpportunityLabel, string> = {
    urgent: "Strong opportunity",
    high: "Good opportunity",
    medium: "Good opportunity",
    low: "Low opportunity",
    skip: "Skip",
  };
  return map[label];
}

function getPostContentType(post: ExtractedPost): "text" | "image" | "image_meme_candidate" | "mixed" | "unknown" {
  const hasText = post.text.trim().length > 0;
  const hasMedia = post.media.length > 0;
  if (hasText && hasMedia && post.text.trim().length <= 140) return "image_meme_candidate";
  if (hasText && hasMedia) return "mixed";
  if (hasMedia) return "image";
  if (hasText) return "text";
  return "unknown";
}

function buildPostScoreCandidate(post: ExtractedPost) {
  return {
    id: post.tweetId ?? post.postUrl,
    postUrl: post.postUrl,
    tweetId: post.tweetId,
    username: post.username,
    authorName: post.authorName,
    text: post.text,
    contentType: getPostContentType(post),
    mediaCount: post.media.length,
    metrics: post.metrics,
    timestamps: post.timestamps,
    hasQuestion: /[?？]/.test(post.text),
    needsVisionAnalysis: post.media.length > 0,
  };
}

function pushPostOverlayToCurrentTab(post: ExtractedPost, score: OpportunityScore) {
  const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
  if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) return;
  chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id) return;
    chromeApi.tabs!.sendMessage(activeTab.id, { type: "XCA_RENDER_POST_OVERLAY", post, score });
  });
}

function isExtractedPost(value: unknown): value is ExtractedPost {
  return Boolean(value && typeof value === "object" && "platform" in value && "text" in value && "media" in value);
}

function isExtractedPostContext(value: unknown): value is ExtractedPostContext {
  return Boolean(
    value && typeof value === "object" && "platform" in value && "contextType" in value && "mainPost" in value,
  );
}

function buildPostFromHistoryItem(item: CommentHistoryItem): ExtractedPost {
  return {
    platform: "x",
    postUrl: item.postUrl,
    tweetId: item.tweetId,
    authorName: item.authorName,
    username: item.username,
    text: item.postText ?? "",
    media: item.media
      .filter((m) => m.mediaUrl)
      .map((m, i) => ({ type: "image" as const, url: m.mediaUrl!, altText: m.altText, photoIndex: i + 1 })),
    detectedAt: item.createdAt,
    source: "visible_cache",
  };
}

// Map the new unified API response suggestions to a display-friendly shape
function mapApiSuggestion(s: ReplyPackApiSuggestion): ReplyPackApiSuggestion {
  return s;
}

// ── Main App ────────────────────────────────────────────────────────────────

export function App() {
  const { t } = useTranslation();
  const [deviceId] = useState(() => getDeviceId());

  // ── Auth ────────────────────────────────────────────────────────────────
  const [authSession, setAuthSessionState] = useState<AuthSession | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authMessageType, setAuthMessageType] = useState<AuthMessageType>("info");
  const [rememberMe, setRememberMe] = useState(true);

  // ── Navigation ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("analyze");

  // ── Post detection ──────────────────────────────────────────────────────
  const [selectedPost, setSelectedPost] = useState<ExtractedPost | null>(null);
  const [selectedPostContext, setSelectedPostContext] = useState<ExtractedPostContext | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);

  // ── Opportunity scoring ─────────────────────────────────────────────────
  const [postScoreResult, setPostScoreResult] = useState<OpportunityPostScoreResponse | null>(null);
  const [isScoringPost, setIsScoringPost] = useState(false);

  // ── Generation ──────────────────────────────────────────────────────────
  const [replyPackResult, setReplyPackResult] = useState<ReplyPackApiResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<string, CopyState>>({});
  const [persistedGeneration, setPersistedGeneration] = useState<PersistedGeneration | null>(null);
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);

  // ── History ─────────────────────────────────────────────────────────────
  const [historyItems, setHistoryItems] = useState<CommentHistoryItem[]>([]);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyCopyStates, setHistoryCopyStates] = useState<Record<string, "idle" | "copying" | "copied" | "failed">>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);

  // ── Feed ─────────────────────────────────────────────────────────────────
  const [feedSnapshotResult, setFeedSnapshotResult] = useState<FeedSnapshotSubmitResponse | null>(null);
  const [opportunityResult, setOpportunityResult] = useState<OpportunitySnapshotScoreResponse | null>(null);
  const [feedScanMessage, setFeedScanMessage] = useState<string | null>(null);
  const [isScanningFeed, setIsScanningFeed] = useState(false);

  // ── Settings ─────────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_GENERATION_SETTINGS);

  useEffect(() => {
    void getGenerationSettings().then(setSettings);
    return subscribeGenerationSettings(setSettings);
  }, []);

  function updateSetting<K extends keyof GenerationSettings>(
    key: K,
    value: GenerationSettings[K],
  ) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      void saveGenerationSettings(next);
      return next;
    });
  }

  function resetSettings() {
    setSettings(DEFAULT_GENERATION_SETTINGS);
    void saveGenerationSettings(DEFAULT_GENERATION_SETTINGS);
  }

  // ── Auth init ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getAuthSession()
      .then(async (session) => {
        if (!session) return null;
        const user = await getMe();
        return { ...session, user };
      })
      .then((session) => {
        if (cancelled) return;
        setAuthSessionState(session);
        setAuthMessageType("success");
        setAuthMessage(session ? null : null);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthSessionState(null);
          setAuthMessageType("error");
          setAuthMessage("Session expired. Please login again.");
        }
      })
      .finally(() => { if (!cancelled) setIsAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Auth handlers ────────────────────────────────────────────────────────
  async function handleAuthSubmit() {
    const email = loginEmail.trim() || undefined;
    const phone = authMode === "create" ? loginPhone.trim() || undefined : undefined;
    if (!email && !phone) { setAuthMessageType("error"); setAuthMessage(t("auth.enterEmailOrPhone")); return; }
    if (loginPassword.length < 8) { setAuthMessageType("error"); setAuthMessage(t("auth.passwordLength")); return; }
    setIsAuthLoading(true);
    setAuthMessage(null);
    try {
      const session = authMode === "create"
        ? await register({ email, phone, name: loginName.trim() || undefined, password: loginPassword })
        : await login({ email, phone, password: loginPassword });
      await setAuthSession(session, rememberMe);
      setAuthSessionState(session);
      setAuthMessageType("success");
      setAuthMessage(authMode === "create" ? t("auth.accountCreated") : t("auth.loggedIn"));
    } catch (err) {
      setAuthMessageType("error");
      setAuthMessage(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    setIsAuthLoading(true);
    try { await logout(); } finally {
      setAuthSessionState(null);
      setPersistedGeneration(null);
      setAuthMessageType("info");
      setAuthMessage("Logged out.");
      setIsAuthLoading(false);
      setShowSettings(false);
    }
  }

  function handleXOAuth() {
    if (!X_OAUTH_AUTHORIZE_URL) {
      setAuthMessageType("error");
      setAuthMessage("X OAuth is not configured yet.");
      return;
    }
    window.open(X_OAUTH_AUTHORIZE_URL, "_blank", "noopener,noreferrer");
    setAuthMessage("Opened X OAuth. Complete the flow, then return here.");
  }

  // ── History ──────────────────────────────────────────────────────────────
  async function loadCommentHistory() {
    setIsLoadingHistory(true);
    setHistoryMessage(null);
    try {
      const history = await getCommentHistory(20);
      setHistoryItems(history.items);
      setHistoryMessage(history.items.length > 0 ? null : "No saved generation history yet.");
    } catch (err) {
      setHistoryMessage(err instanceof Error ? err.message : "Could not load comment history.");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (!authSession) { setHistoryItems([]); setHistoryMessage(null); return; }
    void loadCommentHistory();
  }, [authSession?.accessToken]);

  function loadHistoryRun(group: HistoryRunGroup) {
    const firstItem = group.suggestions[0];
    const postText = group.postText || firstItem?.postText;
    if (!postText?.trim() && group.suggestions.length === 0) {
      setGenerateError("This history item does not include source post text.");
      return;
    }

    const post: ExtractedPost = {
      platform: "x",
      postUrl: group.postUrl,
      tweetId: group.tweetId,
      authorName: group.authorName,
      username: group.username,
      text: postText || "",
      media: (group.media ?? [])
        .filter((m) => m.mediaUrl)
        .map((m, i) => ({ type: "image" as const, url: m.mediaUrl!, altText: m.altText, photoIndex: i + 1 })),
      detectedAt: group.createdAt,
      source: "visible_cache",
    };

    setSelectedPost(post);
    setSelectedPostContext(null);

    const restoredReplyPack: ReplyPackApiResponse = {
      generationRunId: group.analysisId ?? group.postId,
      analysisMode: (firstItem?.analysis?.mode as any) ?? "text",
      detectedLanguage: firstItem?.language ?? "en",
      translation: "",
      summary: firstItem?.analysis?.textSummary ?? "",
      context: firstItem?.analysis?.combinedContext ?? "",
      theme: "discussion",
      topic: firstItem?.analysis?.topic ?? "general",
      sentiment: "neutral",
      commentStrategy: firstItem?.analysis?.commentStrategy ?? "",
      suggestions: group.suggestions.map((s) => ({
        suggestionId: s.suggestionId,
        text: s.text,
        meaningVi: s.meaningVi,
        tone: s.tone ?? DEFAULT_COMMENT_TONE,
        niche: "auto",
        risk: s.risk ?? "low",
        whyItWorks: s.optimizationReason?.[0] ?? "",
        score: {
          total: s.optimizationScore ?? 80,
          postFit: s.optimizationScore ?? 80,
          visibility: 80,
          specificity: 80,
          native: 80,
          engagementHook: 80,
        },
      })),
      metadata: {
        provider: "restored_history",
        model: "deepseek-v4-flash",
        promptVersion: "1.0",
        latencyMs: 0,
        fallbackUsed: false,
      },
    };

    setReplyPackResult(restoredReplyPack);
    setPostScoreResult(null);
    setGenerateError(null);
    setGenerateMessage("Restored saved analysis from history.");
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setPersistedGeneration({
      postId: group.postId,
      analysisId: group.analysisId ?? null,
      suggestionIds: group.suggestions.map((s) => s.suggestionId),
      postUrl: group.postUrl,
      tweetId: group.tweetId,
    });

    setActiveTab("analyze");
  }

  // ── Post detection ───────────────────────────────────────────────────────
  function applyDetectedPost(post: ExtractedPost, postContext?: ExtractedPostContext) {
    setSelectedPost(post);
    setSelectedPostContext(postContext ?? null);
    setReplyPackResult(null);
    setPostScoreResult(null);
    setGenerateError(null);
    setGenerateMessage(null);
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setPersistedGeneration(null);
  }

  function detectCurrentTabPost(options: { silent?: boolean; retryAfterInject?: boolean } = {}) {
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    if (!options.silent) setDetectionMessage("Detecting current X post...");
    if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) {
      setDetectionMessage("Chrome tabs API is unavailable. Reload the extension from dist.");
      return;
    }
    const api = chromeApi;
    api.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) { setDetectionMessage("No active tab found. Focus an X tab, then try again."); return; }
      const url = activeTab.url ?? "";
      if (!url.includes("x.com") && !url.includes("twitter.com")) {
        setDetectionMessage("Active tab is not X/Twitter. Open a post on X, then try again."); return;
      }

      function injectDetectorAndRetry(reason: string) {
        if (options.retryAfterInject || !api.scripting?.executeScript) {
          setDetectionMessage(`Could not reach X detector: ${reason}. Refresh the X tab and reload the extension.`); return;
        }
        if (!options.silent) setDetectionMessage("Injecting X detector into the current tab...");
        api.scripting.executeScript({ target: { tabId: activeTab.id! }, files: ["assets/contentScript.js"] }, () => {
          const injectionError = api.runtime?.lastError?.message;
          if (injectionError) { setDetectionMessage(`Could not inject X detector: ${injectionError}.`); return; }
          window.setTimeout(() => detectCurrentTabPost({ ...options, retryAfterInject: true }), 300);
        });
      }

      function sendDetectMessage() {
        api.tabs!.sendMessage(activeTab.id!, { type: "XCA_DETECT_CURRENT_POST" }, (response) => {
          const runtimeError = api.runtime?.lastError?.message;
          if (runtimeError) { injectDetectorAndRetry(runtimeError); return; }
          if (response && "post" in response && response.post) {
            applyDetectedPost(response.post, response.postContext);
            setDetectionMessage(null);
            return;
          }
          setDetectionMessage(response?.error ?? "No visible X post found. Click or scroll to a post, then retry.");
        });
      }

      api.tabs!.sendMessage(activeTab.id!, { type: "XCA_PING" }, () => {
        const runtimeError = api.runtime?.lastError?.message;
        if (runtimeError) { injectDetectorAndRetry(runtimeError); return; }
        sendDetectMessage();
      });
    });
  }

  // ── Storage listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    chromeApi?.runtime?.sendMessage({ type: "XCA_GET_SELECTED_POST" }, (response) => {
      if (response && "post" in response && response.post) applyDetectedPost(response.post, response.postContext);
    });
    chromeApi?.storage?.local?.get(SELECTED_POST_STORAGE_KEY, (items) => {
      const v = items[SELECTED_POST_STORAGE_KEY];
      if (isExtractedPostContext(v)) { applyDetectedPost(v.mainPost, v); return; }
      if (isExtractedPost(v)) applyDetectedPost(v);
    });

    const autoDetectTimer = window.setTimeout(() => detectCurrentTabPost({ silent: true }), 300);

    const handleStorageChange = (changes: Record<string, ChromeStorageChange>, areaName: string) => {
      if (areaName !== "local") return;
      if (isGeneratingRef.current) return;
      const next = changes[SELECTED_POST_STORAGE_KEY]?.newValue;
      if (isExtractedPostContext(next)) { applyDetectedPost(next.mainPost, next); return; }
      if (isExtractedPost(next)) applyDetectedPost(next);
    };
    chromeApi?.storage?.onChanged?.addListener(handleStorageChange);
    return () => {
      window.clearTimeout(autoDetectTimer);
      chromeApi?.storage?.onChanged?.removeListener(handleStorageChange);
    };
  }, []);

  // ── Auto-detect triggers on tab switch / navigation ───────────────────────
  useEffect(() => {
    if (activeTab === "analyze" && !isGeneratingRef.current) {
      detectCurrentTabPost({ silent: true });
    }
  }, [activeTab]);

  useEffect(() => {
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    if (!chromeApi?.tabs) return;

    const handleTabActivated = () => {
      if (activeTab === "analyze" && !isGeneratingRef.current) {
        detectCurrentTabPost({ silent: true });
      }
    };

    const handleTabUpdated = (_tabId: number, changeInfo: { status?: string; url?: string }) => {
      if (activeTab === "analyze" && !isGeneratingRef.current && (changeInfo.status === "complete" || changeInfo.url)) {
        detectCurrentTabPost({ silent: true });
      }
    };

    chromeApi.tabs.onActivated?.addListener(handleTabActivated);
    chromeApi.tabs.onUpdated?.addListener(handleTabUpdated);

    return () => {
      chromeApi.tabs?.onActivated?.removeListener(handleTabActivated);
      chromeApi.tabs?.onUpdated?.removeListener(handleTabUpdated);
    };
  }, [activeTab]);

  // ── Local opportunity scoring ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPost) return;
    setIsScoringPost(true);
    const localScore = scoreOpportunity({ candidate: buildPostScoreCandidate(selectedPost) });
    setPostScoreResult({ postUrl: selectedPost.postUrl, score: localScore });
    pushPostOverlayToCurrentTab(selectedPost, localScore);
    setIsScoringPost(false);
  }, [selectedPost]);

  // ── Generate (unified endpoint) ──────────────────────────────────────────
  function trackEvent(eventName: UsageEventName, details: { latencyMs?: number; errorMessage?: string } = {}) {
    void trackUsageEvent({
      deviceId, eventName, platform: "x",
      postUrl: selectedPost?.postUrl,
      tone: settings.tone === "auto" ? DEFAULT_COMMENT_TONE : settings.tone,
      niche: settings.niche,
      targetCommentLanguage:
        settings.language === "auto" ? DEFAULT_TARGET_LANGUAGE : settings.language,
      ...details,
    });
  }

  async function handleGenerate() {
    if (!authSession) { setGenerateError("Login before generating so the result can be saved to your DB history."); return; }
    if (!selectedPost?.text.trim()) { setGenerateError("No post detected. Please detect or select an X post first."); return; }

    const postText = selectedPost.text;
    const contentType = getPostContentType(selectedPost);
    const hasMedia = selectedPost.media.length > 0;

    const payload: CreateReplyPackPayload = {
      post: {
        platform: "x",
        postId: selectedPost.tweetId ?? selectedPost.postUrl ?? crypto.randomUUID(),
        url: selectedPost.postUrl,
        text: postText,
        author: selectedPost.authorName || selectedPost.username
          ? { name: selectedPost.authorName, handle: selectedPost.username }
          : undefined,
        media: hasMedia
          ? selectedPost.media.slice(0, 4).map((m) => ({ type: "image" as const, url: m.url }))
          : undefined,
        contentType: contentType === "image_meme_candidate" ? "mixed" : contentType,
        postType: selectedPostContext?.contextType === "reply" ? "reply"
          : selectedPostContext?.contextType === "quote_post" ? "quote"
          : selectedPostContext?.contextType === "repost" ? "repost"
          : "original",
        capturedAt: selectedPost.detectedAt,
        extractorVersion: "1.0",
      },
      options: {
        niche: settings.niche,
        tone: settings.tone,
        intent: settings.intent,
        length: settings.length,
        energy: settings.energy,
        language: settings.language,
        emojiLevel: settings.emojiLevel,
        replyCount: settings.replyCount,
        explanationLanguage: settings.explanationLanguage,
        visionEnabled: resolveVisionEnabled(settings.visionMode, hasMedia),
      },
    };

    const startedAt = performance.now();
    setIsGenerating(true);
    isGeneratingRef.current = true;
    setGenerateError(null);
    setGenerateMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    trackEvent("analyze_started");

    try {
      // One click = one generation. A transport-level retry reuses the key and
      // is de-duplicated server-side; "Regenerate" mints a fresh one.
      const result = await generateReplyPack(payload, {
        idempotencyKey: crypto.randomUUID(),
      });

      if (result.suggestions.length === 0) {
        throw new Error("No comment candidates were generated for this post.");
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      setReplyPackResult(result);

      // Persist to DB
      let savedToDb = true;
      try {
        const persisted = await saveFullContext({
          platform: "x",
          postUrl: selectedPost.postUrl,
          tweetId: selectedPost.tweetId,
          postType: selectedPostContext?.contextType ?? "unknown",
          authorName: selectedPost.authorName,
          username: selectedPost.username,
          text: postText,
          language: result.detectedLanguage,
          rawContext: { generationRunId: result.generationRunId, analysisMode: result.analysisMode },
          extractionConfidence: selectedPostContext ? Math.round(selectedPostContext.extraction.confidence * 100) : 90,
          extractionWarnings: selectedPostContext?.extraction.warnings ?? [],
          media: selectedPost.media.slice(0, 4),
          analysis: {
            mode: result.analysisMode,
            detectedLanguage: result.detectedLanguage,
            translation: result.translation,
            textSummary: result.summary,
            combinedContext: result.context,
            topic: result.topic,
            tone: result.suggestions[0]?.tone ?? DEFAULT_COMMENT_TONE,
            sentiment: result.sentiment,
            commentStrategy: result.commentStrategy,
          },
          suggestions: result.suggestions.map((s, i) => ({
            text: s.text,
            language: result.detectedLanguage,
            tone: s.tone,
            meaningVi: s.meaningVi,
            risk: s.risk,
            optimizationScore: s.score.total,
            optimizationReason: s.whyItWorks ? [s.whyItWorks] : [],
            isBestPick: i === 0,
          })),
        });

        setPersistedGeneration({
          postId: persisted.postId,
          analysisId: persisted.analysisId,
          suggestionIds: persisted.suggestionIds,
          postUrl: selectedPost.postUrl,
          tweetId: selectedPost.tweetId,
        });

        // Optimistic prepend to local history
        const now = new Date().toISOString();
        const newItems: CommentHistoryItem[] = result.suggestions
          .slice(0, persisted.suggestionIds.length)
          .map((s, i) => ({
            suggestionId: persisted.suggestionIds[i] ?? "",
            postId: persisted.postId,
            analysisId: persisted.analysisId ?? undefined,
            postType: selectedPostContext?.contextType ?? "unknown",
            postUrl: selectedPost.postUrl,
            tweetId: selectedPost.tweetId,
            postText,
            authorName: selectedPost.authorName,
            username: selectedPost.username,
            media: [],
            text: s.text,
            language: result.detectedLanguage,
            tone: s.tone,
            meaningVi: s.meaningVi,
            risk: s.risk,
            optimizationScore: s.score.total,
            optimizationReason: s.whyItWorks ? [s.whyItWorks] : [],
            used: false,
            actions: [],
            analysis: { mode: result.analysisMode, textSummary: result.summary, commentStrategy: result.commentStrategy },
            createdAt: now,
          }));
        setHistoryItems((prev) => [...newItems, ...prev].slice(0, 20));
      } catch { savedToDb = false; }

      const modeLabel = result.analysisMode === "vision" ? " with image analysis" : result.analysisMode === "text_only_fallback" ? " (vision unavailable, text only)" : "";
      setGenerateMessage(!savedToDb ? "Generated suggestions. DB save failed — check login status." : `Generated${modeLabel} and saved to DB.`);
      trackEvent("analyze_succeeded", { latencyMs });
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const errorMessage = err instanceof Error ? err.message : "Could not generate suggestions.";
      setGenerateError(errorMessage);
      trackEvent("analyze_failed", { latencyMs, errorMessage });
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  }

  // ── Copy suggestion ──────────────────────────────────────────────────────
  async function handleCopy(suggestionId: string, text: string, risk: string, index: number) {
    if (risk === "high") {
      setCopyStates((c) => ({ ...c, [suggestionId]: { status: "failed", reason: "high_risk" } }));
      return;
    }
    setCopyStates((c) => ({ ...c, [suggestionId]: { status: "copying" } }));
    const result = await copyTextToClipboard(text);
    if (result.ok) {
      setCopyStates((c) => ({ ...c, [suggestionId]: { status: "copied" } }));
      setManualCopyText(null);
      trackEvent("copy_clicked");
      if (persistedGeneration?.postId) {
        void logCommentAction({
          postId: persistedGeneration.postId,
          suggestionId: persistedGeneration.suggestionIds[index],
          actionType: "copied",
          commentText: text,
          metadata: { position: index + 1, source: "side_panel" },
        });
        // Notify content script
        const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
        const tabsApi = chromeApi?.tabs;
        if (tabsApi?.query) {
          tabsApi.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTabInfo = tabs[0];
            if (!activeTabInfo?.id) return;
            tabsApi.sendMessage(activeTabInfo.id, {
              type: "XCA_TRACK_PENDING_COMMENT",
              pending: {
                postId: persistedGeneration.postId,
                suggestionId: persistedGeneration.suggestionIds[index],
                parentPostUrl: persistedGeneration.postUrl ?? selectedPost?.postUrl,
                parentTweetId: persistedGeneration.tweetId ?? selectedPost?.tweetId,
                commentText: text,
                createdAt: Date.now(),
              },
            });
          });
        }
      }
      window.setTimeout(() => setCopyStates((c) => ({ ...c, [suggestionId]: { status: "idle" } })), 2500);
    } else {
      setCopyStates((c) => ({ ...c, [suggestionId]: { status: "failed", reason: result.reason } }));
      setManualCopyText(text);
    }
  }

  // ── History copy ─────────────────────────────────────────────────────────
  function handleHistoryCopy(item: CommentHistoryItem) {
    const st = historyCopyStates[item.suggestionId] ?? "idle";
    if (st === "copying") return;
    setHistoryCopyStates((p) => ({ ...p, [item.suggestionId]: "copying" }));
    copyTextToClipboard(item.text)
      .then((result) => {
        setHistoryCopyStates((p) => ({ ...p, [item.suggestionId]: result.ok ? "copied" : "failed" }));
        if (result.ok) window.setTimeout(() => setHistoryCopyStates((p) => ({ ...p, [item.suggestionId]: "idle" })), 2500);
      })
      .catch(() => setHistoryCopyStates((p) => ({ ...p, [item.suggestionId]: "failed" })));
  }

  // ── Feed scan ────────────────────────────────────────────────────────────
  function scanVisibleFeed(options: { retryAfterInject?: boolean } = {}) {
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    setFeedScanMessage("Scanning visible X feed...");
    setIsScanningFeed(true);
    if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) {
      setFeedScanMessage("Chrome tabs API is unavailable. Reload the extension from dist.");
      setIsScanningFeed(false);
      return;
    }
    const api = chromeApi;
    api.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const tabInfo = tabs[0];
      if (!tabInfo?.id) { setFeedScanMessage("No active tab found."); setIsScanningFeed(false); return; }
      const url = tabInfo.url ?? "";
      if (!url.includes("x.com") && !url.includes("twitter.com")) {
        setFeedScanMessage("Active tab is not X/Twitter."); setIsScanningFeed(false); return;
      }
      function sendScanMessage() {
        api.tabs!.sendMessage(tabInfo.id!, { type: "XCA_SCAN_VISIBLE_FEED" }, (response) => {
          const runtimeError = api.runtime?.lastError?.message;
          if (runtimeError) {
            if (!options.retryAfterInject && api.scripting?.executeScript) {
              setFeedScanMessage("Injecting X feed scanner...");
              api.scripting.executeScript({ target: { tabId: tabInfo.id! }, files: ["assets/contentScript.js"] }, () => {
                const injectErr = api.runtime?.lastError?.message;
                if (injectErr) { setFeedScanMessage(`Injection failed: ${injectErr}`); setIsScanningFeed(false); return; }
                window.setTimeout(() => scanVisibleFeed({ retryAfterInject: true }), 150);
              });
              return;
            }
            setFeedScanMessage(`Could not reach X feed scanner: ${runtimeError}`);
            setIsScanningFeed(false);
            return;
          }
          if (!response || !("snapshot" in response) || !response.snapshot) {
            setFeedScanMessage(response && "error" in response && response.error ? response.error : "No visible X feed posts found.");
            setIsScanningFeed(false);
            return;
          }
          setFeedScanMessage(`Found ${response.snapshot.visiblePostCount} visible posts. Sending snapshot...`);
          void submitFeedSnapshot(response.snapshot)
            .then(async (result) => {
              setFeedSnapshotResult(result);
              setOpportunityResult(null);
              if (!result.next.canScore) { setFeedScanMessage("Feed analyzed, but no candidates are ready for scoring."); return; }
              setFeedScanMessage("Scoring opportunities...");
              const scored = await scoreFeedSnapshot(result.snapshotId);
              setOpportunityResult(scored);
              setFeedScanMessage(`Scored ${scored.topOpportunities.length} opportunities.`);
            })
            .catch((err) => setFeedScanMessage(err instanceof Error ? err.message : "Could not analyze feed snapshot."))
            .finally(() => setIsScanningFeed(false));
        });
      }
      sendScanMessage();
    });
  }

  function applyOpportunityPost(opportunity: OpportunitySnapshotScoreResponse["topOpportunities"][number]) {
    const post: ExtractedPost = {
      platform: "x",
      postUrl: opportunity.postUrl,
      authorName: opportunity.authorName,
      username: opportunity.username,
      text: opportunity.text,
      media: [],
      detectedAt: new Date().toISOString(),
      source: "visible_cache",
    };
    applyDetectedPost(post);
    setActiveTab("analyze");
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const analyzeState: "no_post" | "post_detected" | "loading_opp" | "ready_to_generate" | "generating" | "vision_fallback" | "failed" | "loaded" | "offline" =
    isGenerating ? "generating"
    : generateError?.toLowerCase().includes("network") || generateError?.toLowerCase().includes("fetch") ? "offline"
    : generateError ? "failed"
    : replyPackResult?.analysisMode === "text_only_fallback" ? "vision_fallback"
    : replyPackResult ? "loaded"
    : isScoringPost ? "loading_opp"
    : postScoreResult ? "ready_to_generate"
    : selectedPost ? "post_detected"
    : "no_post";

  // ── Auth screen ──────────────────────────────────────────────────────────
  if (!authSession && !isAuthLoading) {
    return (
      <main className="shell authShell">
        <section className="hero authHero">
          <p className="eyebrow">X Comment Assistant</p>
          <h1>{t("auth.heroSubtitle")}</h1>
          <p className="heroText">{t("auth.heroText")}</p>
        </section>

        <section className="safetyBanner">
          {t("auth.safetyBanner")}
        </section>

        <section className="panel authPanel">
          <div className="authGate">
            <div className="authTabs" role="tablist" aria-label="Account mode">
              <button className="authTab" type="button" data-selected={authMode === "login"}
                onClick={() => { setAuthMode("login"); setLoginPhone(""); setLoginName(""); setAuthMessage(null); }}>
                {t("auth.loginTab")}
              </button>
              <button className="authTab" type="button" data-selected={authMode === "create"}
                onClick={() => { setAuthMode("create"); setAuthMessage(null); }}>
                {t("auth.registerTab")}
              </button>
            </div>
            <div className="authForm">
              <label className="field">{t("auth.emailLabel")}
                <input type="email" value={loginEmail} placeholder="you@example.com" onChange={(e) => setLoginEmail(e.target.value)} />
              </label>
              {authMode === "create" ? (
                <>
                  <label className="field">{t("auth.phoneLabel")}
                    <input type="tel" value={loginPhone} placeholder="+84901234567" onChange={(e) => setLoginPhone(e.target.value)} />
                  </label>
                  <label className="field">{t("auth.nameLabel")}
                    <input type="text" value={loginName} placeholder="Display name" onChange={(e) => setLoginName(e.target.value)} />
                  </label>
                </>
              ) : null}
              <label className="field">{t("auth.passwordLabel")}
                <input type="password" value={loginPassword} placeholder={t("auth.passwordPlaceholder")} onChange={(e) => setLoginPassword(e.target.value)} />
              </label>
              
              <label className="rememberMeContainer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>{t("auth.rememberMe")}</span>
              </label>

              <button className="primaryButton" type="button" disabled={isAuthLoading} onClick={() => void handleAuthSubmit()}>
                {isAuthLoading ? t("auth.checking") : authMode === "create" ? t("auth.registerBtn") : t("auth.loginBtn")}
              </button>

              {authMode === "login" ? (
                <button
                  className="authToggleLink"
                  type="button"
                  onClick={() => {
                    setAuthMode("create");
                    setAuthMessage(null);
                  }}
                >
                  {t("auth.noAccount")}
                </button>
              ) : (
                <button
                  className="authToggleLink"
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setLoginPhone("");
                    setLoginName("");
                    setAuthMessage(null);
                  }}
                >
                  {t("auth.hasAccount")}
                </button>
              )}
            </div>
          </div>
          {authMessage ? (
            <p className={authMessageType === "error" ? "errorText" : authMessageType === "success" ? "successText" : "muted"}>
              {authMessage}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  if (isAuthLoading) {
    return <main className="shell authShell"><p className="muted" style={{ padding: "32px 18px" }}>Loading session…</p></main>;
  }

  // ── Auth identity ────────────────────────────────────────────────────────
  const authIdentity = authSession?.user.email ?? authSession?.user.phone ?? "account";
  const authDisplayName = authSession?.user.name || authIdentity;
  const authInitial = authDisplayName.slice(0, 1).toUpperCase();
  const isConnected = Boolean(authSession);

  // ── Main shell ───────────────────────────────────────────────────────────
  return (
    <main className="shell mainShell">

      {/* ── Compact Header ── */}
      <header className="appHeader">
        <div className="appHeaderLeft">
          <span className="appHeaderTitle">X Comment Assistant</span>
          <span className={`connectionDot ${isConnected ? "connectionDot--on" : "connectionDot--off"}`} title={isConnected ? "Connected" : "Offline"} />
        </div>
        <div className="appHeaderRight">
          {authSession ? (
            <button className="accountPill" type="button" onClick={() => setShowSettings((s) => !s)} title={authDisplayName}>
              <span className="accountPillAvatar">{authInitial}</span>
              <span className="accountPillName">{authDisplayName}</span>
            </button>
          ) : null}
        </div>
      </header>

      {/* ── Settings dropdown ── */}
      {showSettings ? (
        <div className="settingsDropdown panel">
          <div className="settingsSection">
            <h3 className="settingsSectionTitle">Generation</h3>

            <label className="settingsField">
              <span className="settingsLabel">Niche</span>
              <select
                className="settingsSelect"
                value={settings.niche}
                onChange={(e) => updateSetting("niche", e.target.value as GenerationSettings["niche"])}
              >
                {NICHE_SELECTIONS.map((niche) => (
                  <option key={niche} value={niche}>{NICHE_LABELS[niche]}</option>
                ))}
              </select>
            </label>
            <p className="settingsHint">
              Auto-detect lets the server classify the post and apply that niche&apos;s
              safety and vocabulary rules.
            </p>

            <label className="settingsField">
              <span className="settingsLabel">Tone</span>
              <select
                className="settingsSelect"
                value={settings.tone}
                onChange={(e) => updateSetting("tone", e.target.value as GenerationSettings["tone"])}
              >
                {TONE_SELECTIONS.map((tone) => (
                  <option key={tone} value={tone}>{TONE_LABELS[tone]}</option>
                ))}
              </select>
            </label>

            <label className="settingsField">
              <span className="settingsLabel">Intent</span>
              <select
                className="settingsSelect"
                value={settings.intent}
                onChange={(e) => updateSetting("intent", e.target.value as GenerationSettings["intent"])}
              >
                {COMMENT_INTENT_SELECTIONS.map((intent) => (
                  <option key={intent} value={intent}>{INTENT_LABELS[intent]}</option>
                ))}
              </select>
            </label>

            <div className="settingsField">
              <span className="settingsLabel">Length</span>
              <div className="settingsSegmented">
                {REPLY_LENGTHS.map((length) => (
                  <button
                    key={length}
                    type="button"
                    className="settingsSegment"
                    aria-pressed={settings.length === length}
                    onClick={() => updateSetting("length", length)}
                  >
                    {LENGTH_LABELS[length]}
                  </button>
                ))}
              </div>
            </div>

            <div className="settingsField">
              <span className="settingsLabel">Energy</span>
              <div className="settingsSegmented">
                {ENERGY_LEVELS.map((energy) => (
                  <button
                    key={energy}
                    type="button"
                    className="settingsSegment"
                    aria-pressed={settings.energy === energy}
                    onClick={() => updateSetting("energy", energy)}
                  >
                    {ENERGY_LABELS[energy]}
                  </button>
                ))}
              </div>
            </div>

            <div className="settingsField">
              <span className="settingsLabel">Emoji</span>
              <div className="settingsSegmented">
                {EMOJI_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className="settingsSegment"
                    aria-pressed={settings.emojiLevel === level}
                    onClick={() => updateSetting("emojiLevel", level)}
                  >
                    {EMOJI_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>

            <label className="settingsField">
              <span className="settingsLabel">Reply language</span>
              <select
                className="settingsSelect"
                value={settings.language}
                onChange={(e) => updateSetting("language", e.target.value as GenerationSettings["language"])}
              >
                {REPLY_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{REPLY_LANGUAGE_LABELS[lang]}</option>
                ))}
              </select>
            </label>

            <label className="settingsField">
              <span className="settingsLabel">Explanation language</span>
              <select
                className="settingsSelect"
                value={settings.explanationLanguage}
                onChange={(e) =>
                  updateSetting(
                    "explanationLanguage",
                    e.target.value as GenerationSettings["explanationLanguage"],
                  )
                }
              >
                {EXPLANATION_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{EXPLANATION_LANGUAGE_LABELS[lang]}</option>
                ))}
              </select>
            </label>

            <div className="settingsField">
              <span className="settingsLabel">Replies per generation</span>
              <div className="settingsSegmented">
                {REPLY_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    className="settingsSegment"
                    aria-pressed={settings.replyCount === count}
                    onClick={() => updateSetting("replyCount", count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="settingsField">
              <span className="settingsLabel">Image analysis</span>
              <div className="settingsSegmented">
                {(["auto", "always", "never"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="settingsSegment"
                    aria-pressed={settings.visionMode === mode}
                    onClick={() => updateSetting("visionMode", mode)}
                  >
                    {mode === "auto" ? "Auto" : mode === "always" ? "Always" : "Never"}
                  </button>
                ))}
              </div>
            </div>
            <p className="settingsHint">Auto turns vision on only when the post has media.</p>

            <button className="secondaryButton settingsReset" type="button" onClick={resetSettings}>
              Reset to defaults
            </button>
          </div>

          <div className="settingsSection">
            <h3 className="settingsSectionTitle">Account</h3>
            <p className="muted" style={{ margin: 0, fontSize: "12px" }}>Signed in as <strong>{authIdentity}</strong></p>
            <button className="secondaryButton" type="button" disabled={isAuthLoading} onClick={() => void handleLogout()} style={{ width: "100%", marginTop: "8px" }}>
              {isAuthLoading ? "Logging out…" : "Logout"}
            </button>
            {authMessage ? (
              <p className={authMessageType === "error" ? "errorText" : "successText"} style={{ margin: "8px 0 0", fontSize: "12px" }}>{authMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Tab bar ── */}
      <nav className="tabBar" role="tablist" aria-label="Main navigation">
        <button className="tabBtn" type="button" role="tab" aria-selected={activeTab === "analyze"} onClick={() => setActiveTab("analyze")}>
          Analyze
        </button>
        <button className="tabBtn" type="button" role="tab" aria-selected={activeTab === "history"} onClick={() => { setActiveTab("history"); void loadCommentHistory(); }}>
          History
        </button>
        <button className="tabBtn" type="button" role="tab" aria-selected={activeTab === "feed"} onClick={() => setActiveTab("feed")}>
          Feed
        </button>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════
          ANALYZE TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "analyze" ? (
        <>
          {/* ── Post Card ── */}
          <section className="panel postCard">
            {selectedPost ? (
              <>
                <div className="postCardHeader">
                  <div className="postCardAuthor">
                    <span className="postCardHandle">
                      {selectedPost.username
                        ? `@${selectedPost.username.replace(/^@+/, "")}`
                        : selectedPost.authorName ?? "unknown"}
                    </span>
                    {selectedPost.authorName && selectedPost.username ? (
                      <span className="postCardName">{selectedPost.authorName}</span>
                    ) : null}
                  </div>
                  <div className="postCardMeta">
                    {selectedPost.media.length > 0 ? (
                      <span className="metaBadge">📷 {selectedPost.media.length}</span>
                    ) : null}
                    <span className="metaBadge">{getPostContentType(selectedPost).replaceAll("_", " ")}</span>
                  </div>
                </div>

                <p className="postCardText">{selectedPost.text}</p>

                {/* Thumbnail strip — max 4, 72–96px */}
                {selectedPost.media.length > 0 ? (
                  <div className="thumbnailStrip">
                    {selectedPost.media.slice(0, 4).map((m, i) => (
                      <img
                        key={m.url}
                        className="thumbnail"
                        src={m.url}
                        alt={m.altText || `Image ${i + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="noPostState">
                <p className="noPostIcon">📭</p>
                <p className="noPostTitle">No post detected</p>
                <p className="muted">Open X and click or scroll to a post, then tap Detect below.</p>
              </div>
            )}

            {/* Manual detect — always available, prominent only when no post */}
            <button
              className={`detectBtn ${selectedPost ? "detectBtn--secondary" : "detectBtn--primary"}`}
              type="button"
              onClick={() => detectCurrentTabPost()}
            >
              {selectedPost ? "Re-detect post" : "Detect current X post"}
            </button>

            {detectionMessage ? <p className="muted" style={{ marginTop: "6px", fontSize: "12px" }}>{detectionMessage}</p> : null}
          </section>

          {/* ── Opportunity Card ── */}
          {selectedPost ? (
            <section className="panel opportunityPanel" data-label={postScoreResult?.score.label ?? "pending"}>
              <div className="opportunityPanelHeader">
                <div>
                  <p className="eyebrow" style={{ marginBottom: "4px" }}>Đánh Giá Tương Tác (Growth Decision)</p>
                  {postScoreResult ? (
                    <span className={`decisionLabel decisionLabel--${postScoreResult.score.label}`}>
                      {getOpportunityVerdictVi(postScoreResult.score.label, postScoreResult.score.total)}
                    </span>
                  ) : (
                    <span className="decisionLabel decisionLabel--pending">Đang tính điểm…</span>
                  )}
                </div>
                <span className="opportunityScore">
                  {isScoringPost ? "…" : postScoreResult ? `${postScoreResult.score.total}` : "–"}
                  <small>/100</small>
                </span>
              </div>

              {postScoreResult ? (
                <>
                  {/* ≤3 reasons */}
                  {postScoreResult.score.reasonVi.length > 0 ? (
                    <ul className="opportunityReasonList">
                      {postScoreResult.score.reasonVi.slice(0, 3).map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}

                  {/* Recommended action */}
                  <div className="opportunityActionRow">
                    <span className="opportunityActionLabel">Hành động:</span>
                    <span className="opportunityActionText">{formatRecommendedAction(postScoreResult.score.recommendedAction)}</span>
                    {/* Risk as secondary badge */}
                    {postScoreResult.score.warnings.length > 0 ? (
                      <span className="riskBadge high" title={postScoreResult.score.warnings.join("; ")}>⚠ {postScoreResult.score.warnings[0]}</span>
                    ) : null}
                  </div>

                  {/* Comment angle */}
                  {postScoreResult.score.suggestedCommentAngle ? (
                    <p className="contextStrategy" style={{ marginTop: "6px" }}>
                      💡 <strong>Góc tiếp cận:</strong> {postScoreResult.score.suggestedCommentAngle}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="muted">Đang phân tích cơ hội tương tác cho bài viết này…</p>
              )}
            </section>
          ) : null}

          {/* ── Active generation settings ── */}
          {selectedPost ? (
            <button
              className="settingsSummary"
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              title="Change generation settings"
            >
              <span className="settingsSummaryChip">{NICHE_LABELS[settings.niche]}</span>
              <span className="settingsSummaryChip">{TONE_LABELS[settings.tone]}</span>
              <span className="settingsSummaryChip">{LENGTH_LABELS[settings.length]}</span>
              <span className="settingsSummaryChip">×{settings.replyCount}</span>
              <span className="settingsSummaryEdit">Edit</span>
            </button>
          ) : null}

          {/* ── Generate CTA ── */}
          {selectedPost ? (
            <button
              id="generate-cta"
              className="generateCTA"
              type="button"
              disabled={isGenerating || !authSession}
              onClick={() => void handleGenerate()}
            >
              {isGenerating
                ? "Generating…"
                : replyPackResult
                  ? "Regenerate replies"
                  : selectedPost.media.length > 0
                    ? "Analyze & generate"
                    : "Generate replies"}
            </button>
          ) : null}

          {/* ── State messages ── */}
          {generateError ? <p className="errorText">{generateError}</p> : null}
          {generateMessage && !generateError ? (
            <p className={generateMessage.includes("failed") ? "errorText" : "successText"}>{generateMessage}</p>
          ) : null}
          {replyPackResult?.analysisMode === "text_only_fallback" ? (
            <p className="visionFallbackBanner">ℹ Vision unavailable — suggestions generated from text only.</p>
          ) : null}
          {replyPackResult?.warnings?.length ? (
            <p className="muted" style={{ fontSize: "11px" }}>⚠ {replyPackResult.warnings.join("; ")}</p>
          ) : null}

          {/* ── Niche analysis ── */}
          {replyPackResult?.analysis ? (
            <section className="panel nicheAnalysis">
              <div className="nicheAnalysisHeader">
                <span className="nicheBadge nicheBadge--primary">
                  {humanizeNiche(replyPackResult.analysis.primaryNiche)}
                </span>
                {replyPackResult.analysis.secondaryNiches.map((niche) => (
                  <span className="nicheBadge" key={niche}>{humanizeNiche(niche)}</span>
                ))}
                <span className="nicheConfidence">
                  {Math.round(replyPackResult.analysis.nicheConfidence * 100)}% confident
                </span>
              </div>
              <p className="nicheAnalysisMeta">
                {CLASSIFICATION_METHOD_LABELS[replyPackResult.analysis.classificationMethod] ??
                  replyPackResult.analysis.classificationMethod}
                {replyPackResult.analysis.visionUsed ? " · used the image" : ""}
                {replyPackResult.analysis.fallbackUsed ? " · fell back to general" : ""}
              </p>
              {replyPackResult.analysis.nicheEvidence?.length ? (
                <p className="nicheEvidence">
                  Signals: {replyPackResult.analysis.nicheEvidence.slice(0, 4).join(", ")}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ── Suggestion cards ── */}
          {replyPackResult ? (
            <section className="suggestionList">
              {replyPackResult.suggestions.map((s, i) => {
                const sid = s.suggestionId ?? `${i}`;
                const copyState = copyStates[sid] ?? { status: "idle" };
                const isHighRisk = s.risk === "high";

                return (
                  <article className="suggestionCard" key={sid}>
                    <div className="suggestionHeader">
                      <span className={`riskBadge ${s.risk}`}>{s.risk}</span>
                      <span className="toneBadge">{humanizeTone(s.tone)}</span>
                      {s.intent ? (
                        <span className="intentBadge">{INTENT_LABELS[s.intent] ?? s.intent}</span>
                      ) : null}
                      {s.niche && s.niche !== "auto" ? (
                        <span className="nicheBadge">{humanizeNiche(s.niche)}</span>
                      ) : null}
                      {s.score ? (
                        <span className="replyScoreBadge">{s.score.total}/100</span>
                      ) : null}
                    </div>

                    {/* Comment block */}
                    <div className="commentBlock">
                      <pre className="commentBlockText">{s.text}</pre>
                      <div className="commentBlockFooter">
                        {copyState.status === "copied" ? (
                          <span className="commentBlockCopied">✓ Copied!</span>
                        ) : copyState.status === "failed" && !isHighRisk ? (
                          <span className="commentBlockError">Clipboard failed — copy manually</span>
                        ) : null}
                        <button
                          className="commentBlockCopyBtn"
                          type="button"
                          disabled={copyState.status === "copying" || isHighRisk}
                          onClick={() => void handleCopy(sid, s.text, s.risk, i)}
                        >
                          {isHighRisk ? t("actions.highRisk") : copyState.status === "copying" ? "Copying…" : `⎘ ${t("actions.copy")}`}
                        </button>
                      </div>
                    </div>

                    {/* Vietnamese meaning */}
                    {s.meaningVi ? <p className="meaningText">{s.meaningVi}</p> : null}

                    {/* Why it works */}
                    {s.whyItWorks ? <p className="riskHelp">{s.whyItWorks}</p> : null}

                    {/* What in the post this reply anchors to */}
                    {s.referencedConcept ? (
                      <p className="referencedConcept">↳ {s.referencedConcept}</p>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : null}

          {/* ── Generation metadata ── */}
          {replyPackResult ? (
            <details className="generationMeta">
              <summary className="generationMetaSummary">
                {replyPackResult.metadata.model}
                {replyPackResult.metadata.latencyMs
                  ? ` · ${(replyPackResult.metadata.latencyMs / 1000).toFixed(1)}s`
                  : ""}
                {replyPackResult.metadata.fallbackUsed ? " · fallback" : ""}
              </summary>
              <dl className="generationMetaList">
                <div><dt>Provider</dt><dd>{replyPackResult.metadata.provider}</dd></div>
                <div><dt>Prompt</dt><dd>{replyPackResult.metadata.promptVersion}</dd></div>
                {replyPackResult.metadata.estimatedCostUsd != null ? (
                  <div>
                    <dt>Cost</dt>
                    <dd>${replyPackResult.metadata.estimatedCostUsd.toFixed(4)}</dd>
                  </div>
                ) : null}
                {replyPackResult.metadata.inputTokens != null ? (
                  <div>
                    <dt>Tokens</dt>
                    <dd>
                      {replyPackResult.metadata.inputTokens} in
                      {replyPackResult.metadata.outputTokens != null
                        ? ` / ${replyPackResult.metadata.outputTokens} out`
                        : ""}
                    </dd>
                  </div>
                ) : null}
                {replyPackResult.metadata.pipeline ? (
                  <div>
                    <dt>Pipeline</dt>
                    <dd>
                      {replyPackResult.metadata.pipeline.generated} generated ·{" "}
                      {replyPackResult.metadata.pipeline.rejected} rejected ·{" "}
                      {replyPackResult.metadata.pipeline.duplicates} duplicate
                      {replyPackResult.metadata.pipeline.retryUsed ? " · retried" : ""}
                    </dd>
                  </div>
                ) : null}
                <div><dt>Run</dt><dd className="generationMetaId">{replyPackResult.generationRunId}</dd></div>
              </dl>
            </details>
          ) : null}

          {/* Manual copy fallback */}
          {manualCopyText ? (
            <section className="panel manualCopy">
              <h2 style={{ fontSize: "13px", marginBottom: "6px" }}>Manual copy fallback</h2>
              <textarea readOnly value={manualCopyText} rows={4} />
            </section>
          ) : null}

          {/* ── Recent History (collapsed by default) ── */}
          {historyItems.length > 0 ? (
            <section className="panel recentHistoryPanel">
              <button
                className="recentHistoryToggle"
                type="button"
                onClick={() => setHistoryCollapsed((c) => !c)}
                aria-expanded={!historyCollapsed}
              >
                <span>Recent history</span>
                <span className="historyItemChevron" aria-hidden="true">{historyCollapsed ? "▼" : "▲"}</span>
              </button>

              {!historyCollapsed ? (
                <div className="historyList">
                  {groupHistoryItems(historyItems).slice(0, 3).map((group) => {
                    const isExpanded = expandedHistoryId === group.runId;
                    const primaryItem = group.suggestions[0];
                    const handle = formatHandle(group.username, group.authorName);
                    const displayTitle = group.postText || primaryItem?.text || "Saved generation";

                    return (
                      <article className={`historyItem${isExpanded ? " historyItemExpanded" : ""}`} key={group.runId}>
                        {/* ── Card Header ── */}
                        <button
                          className="historyItemHeader"
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedHistoryId(isExpanded ? null : group.runId)}
                        >
                          <span className="historyItemPreviewText">{displayTitle}</span>
                          <span className="historyItemChevron" aria-hidden="true">{isExpanded ? "▲" : "▼"}</span>
                        </button>

                        {/* ── Card Meta ── */}
                        <div className="historyItemMeta">
                          <span>{new Date(group.createdAt).toLocaleString()}</span>
                          {handle ? <span className="historyMetaBadge">{handle}</span> : null}
                          <span className="historyMetaBadge historyScoreBadge">
                            {group.suggestions.length} {group.suggestions.length === 1 ? "comment" : "comments"}
                          </span>
                        </div>

                        {/* ── Expanded Content ── */}
                        {isExpanded ? (
                          <div className="historyExpandedPanel">
                            {/* 1. Original Post Details */}
                            {group.postText || group.media.length > 0 ? (
                              <div className="historyPostContext" style={{ background: "#eef4fd", padding: "10px", borderRadius: "10px" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                                  <span className="historyContextLabel" style={{ background: "#1d9bf0", color: "#fff" }}>Original Post</span>
                                  {handle ? <span style={{ fontSize: "11px", fontWeight: "700", color: "#1d9bf0" }}>{handle}</span> : null}
                                </div>
                                {group.postText ? <p style={{ margin: "4px 0", fontWeight: "500" }}>{group.postText}</p> : null}
                                {group.media.length > 0 ? (
                                  <div className="thumbnailStrip" style={{ marginTop: "6px" }}>
                                    {group.media.filter((m) => m.mediaUrl).slice(0, 4).map((m, i) => (
                                      <img
                                        key={m.mediaUrl || i}
                                        className="thumbnail"
                                        src={m.mediaUrl}
                                        alt={m.altText || `Image ${i + 1}`}
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                      />
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {/* 2. All Suggested Comments List */}
                            <div style={{ display: "grid", gap: "10px", marginTop: "4px" }}>
                              <span style={{ fontSize: "11px", fontWeight: "800", color: "#5d6b82", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                Generated Comments ({group.suggestions.length})
                              </span>

                              {group.suggestions.map((s, idx) => {
                                const cs = historyCopyStates[s.suggestionId] ?? "idle";
                                return (
                                  <div className="historyCommentBlock" key={s.suggestionId || idx}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 0" }}>
                                      <div style={{ display: "flex", gap: "4px" }}>
                                        {s.tone ? <span className="toneBadge" style={{ fontSize: "10px" }}>{s.tone.replaceAll("_", " ")}</span> : null}
                                        {s.risk ? <span className={`riskBadge ${s.risk}`} style={{ fontSize: "10px" }}>{s.risk}</span> : null}
                                      </div>
                                      {s.optimizationScore != null ? (
                                        <span className="replyScoreBadge" style={{ fontSize: "10px" }}>{s.optimizationScore}/100</span>
                                      ) : null}
                                    </div>
                                    <p className="historyCommentText">{s.text}</p>
                                    {s.meaningVi ? (
                                      <p className="historyMeaning" style={{ margin: "0 10px 8px", background: "rgba(255,255,255,0.08)", color: "#93c5fd" }}>
                                        {s.meaningVi}
                                      </p>
                                    ) : null}
                                    <div className="historyCommentFooter">
                                      {cs === "copied" ? (
                                        <span className="historyCommentCopied">✓ Copied</span>
                                      ) : cs === "failed" ? (
                                        <span className="historyCommentFailed">Copy failed</span>
                                      ) : null}
                                      <button
                                        className={`historyBigCopy${cs === "copied" ? " historyBigCopied" : ""}`}
                                        type="button"
                                        disabled={cs === "copying"}
                                        onClick={() => handleHistoryCopy(s)}
                                      >
                                        {cs === "copied" ? "✓ Copied" : cs === "copying" ? "Copying…" : "Copy comment"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* 3. Action Buttons */}
                            <div className="historyActions" style={{ marginTop: "6px" }}>
                              <button
                                className="primaryButton"
                                type="button"
                                onClick={() => loadHistoryRun(group)}
                                style={{ flex: 1, fontSize: "12px" }}
                              >
                                Load source post into Analyze tab
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="historyCollapsedCopy">
                            <button
                              className="historyInlineCopy"
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setExpandedHistoryId(group.runId); }}
                            >
                              View details
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  <button
                    className="viewAllBtn"
                    type="button"
                    onClick={() => { setActiveTab("history"); void loadCommentHistory(); }}
                  >
                    View all history →
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {/* ════════════════════════════════════════════════════════════════════
          HISTORY TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "history" ? (
        <section className="panel historyPanel">
          <div className="historyHeader">
            <div>
              <h2>Saved comments</h2>
              <p className="muted">Your generated reply history.</p>
            </div>
            <button className="secondaryButton" type="button" disabled={isLoadingHistory} onClick={() => void loadCommentHistory()}>
              {isLoadingHistory ? "Loading…" : "Refresh"}
            </button>
          </div>

          {historyMessage ? <p className="muted">{historyMessage}</p> : null}

          {historyItems.length > 0 ? (
            <div className="historyList">
              {groupHistoryItems(historyItems).map((group) => {
                const isExpanded = expandedHistoryId === group.runId;
                const primaryItem = group.suggestions[0];
                const handle = formatHandle(group.username, group.authorName);
                const displayTitle = group.postText || primaryItem?.text || "Saved generation";

                return (
                  <article className={`historyItem${isExpanded ? " historyItemExpanded" : ""}`} key={group.runId}>
                    {/* ── Card Header ── */}
                    <button
                      className="historyItemHeader"
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedHistoryId(isExpanded ? null : group.runId)}
                    >
                      <span className="historyItemPreviewText">{displayTitle}</span>
                      <span className="historyItemChevron" aria-hidden="true">{isExpanded ? "▲" : "▼"}</span>
                    </button>

                    {/* ── Card Meta ── */}
                    <div className="historyItemMeta">
                      <span>{new Date(group.createdAt).toLocaleString()}</span>
                      {handle ? <span className="historyMetaBadge">{handle}</span> : null}
                      <span className="historyMetaBadge historyScoreBadge">
                        {group.suggestions.length} {group.suggestions.length === 1 ? "comment" : "comments"}
                      </span>
                      {primaryItem?.optimizationScore != null ? (
                        <span className="historyMetaBadge historyScoreBadge">score {primaryItem.optimizationScore}</span>
                      ) : null}
                      {primaryItem?.risk ? (
                        <span className={`historyMetaBadge historyRisk--${primaryItem.risk}`}>{primaryItem.risk}</span>
                      ) : null}
                    </div>

                    {/* ── Expanded Content ── */}
                    {isExpanded ? (
                      <div className="historyExpandedPanel">
                        {/* 1. Original Post Details */}
                        {group.postText || group.media.length > 0 ? (
                          <div className="historyPostContext" style={{ background: "#eef4fd", padding: "10px", borderRadius: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                              <span className="historyContextLabel" style={{ background: "#1d9bf0", color: "#fff" }}>Original Post</span>
                              {handle ? <span style={{ fontSize: "11px", fontWeight: "700", color: "#1d9bf0" }}>{handle}</span> : null}
                            </div>
                            {group.postText ? <p style={{ margin: "4px 0", fontWeight: "500" }}>{group.postText}</p> : null}
                            {group.media.length > 0 ? (
                              <div className="thumbnailStrip" style={{ marginTop: "6px" }}>
                                {group.media.filter((m) => m.mediaUrl).slice(0, 4).map((m, i) => (
                                  <img
                                    key={m.mediaUrl || i}
                                    className="thumbnail"
                                    src={m.mediaUrl}
                                    alt={m.altText || `Image ${i + 1}`}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {/* 2. All Suggested Comments List */}
                        <div style={{ display: "grid", gap: "10px", marginTop: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: "800", color: "#5d6b82", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Generated Comments ({group.suggestions.length})
                          </span>

                          {group.suggestions.map((s, idx) => {
                            const cs = historyCopyStates[s.suggestionId] ?? "idle";
                            return (
                              <div className="historyCommentBlock" key={s.suggestionId || idx}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 0" }}>
                                  <div style={{ display: "flex", gap: "4px" }}>
                                    {s.tone ? <span className="toneBadge" style={{ fontSize: "10px" }}>{s.tone.replaceAll("_", " ")}</span> : null}
                                    {s.risk ? <span className={`riskBadge ${s.risk}`} style={{ fontSize: "10px" }}>{s.risk}</span> : null}
                                  </div>
                                  {s.optimizationScore != null ? (
                                    <span className="replyScoreBadge" style={{ fontSize: "10px" }}>{s.optimizationScore}/100</span>
                                  ) : null}
                                </div>
                                <p className="historyCommentText">{s.text}</p>
                                {s.meaningVi ? (
                                  <p className="historyMeaning" style={{ margin: "0 10px 8px", background: "rgba(255,255,255,0.08)", color: "#93c5fd" }}>
                                    {s.meaningVi}
                                  </p>
                                ) : null}
                                <div className="historyCommentFooter">
                                  {cs === "copied" ? (
                                    <span className="historyCommentCopied">✓ Copied</span>
                                  ) : cs === "failed" ? (
                                    <span className="historyCommentFailed">Copy failed</span>
                                  ) : null}
                                  <button
                                    className={`historyBigCopy${cs === "copied" ? " historyBigCopied" : ""}`}
                                    type="button"
                                    disabled={cs === "copying"}
                                    onClick={() => handleHistoryCopy(s)}
                                  >
                                    {cs === "copied" ? "✓ Copied" : cs === "copying" ? "Copying…" : "Copy comment"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* 3. Action Buttons */}
                        <div className="historyActions" style={{ marginTop: "6px" }}>
                          <button
                            className="primaryButton"
                            type="button"
                            onClick={() => loadHistoryRun(group)}
                            style={{ flex: 1, fontSize: "12px" }}
                          >
                            Load source post into Analyze tab
                          </button>
                          {group.postUrl ? (
                            <a
                              className="secondaryButton"
                              href={group.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ textDecoration: "none", display: "inline-block", fontSize: "12px" }}
                            >
                              Open post on X ↗
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="historyCollapsedCopy">
                        <button
                          className="historyInlineCopy"
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedHistoryId(group.runId); }}
                        >
                          View details
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ════════════════════════════════════════════════════════════════════
          FEED TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "feed" ? (
        <section className="panel feedPanel">
          <div className="historyHeader">
            <div>
              <h2>Feed Intelligence</h2>
              <p className="muted">Scan visible posts, score opportunities, pick the best.</p>
            </div>
          </div>

          <button
            className="secondaryButton detectButton"
            type="button"
            disabled={isScanningFeed}
            onClick={() => scanVisibleFeed()}
          >
            {isScanningFeed ? "Scanning feed…" : "Scan visible feed"}
          </button>

          {feedScanMessage ? <p className="muted">{feedScanMessage}</p> : null}

          {feedSnapshotResult ? (
            <div className="feedSummary">
              <div className="feedStatsGrid">
                <div className="feedStatCard"><span>Visible</span><strong>{feedSnapshotResult.summary.visiblePostCount}</strong></div>
                <div className="feedStatCard"><span>Useful</span><strong>{feedSnapshotResult.summary.usefulCandidates}</strong></div>
                <div className="feedStatCard"><span>Best</span><strong>{feedSnapshotResult.summary.bestScore}</strong></div>
              </div>

              {opportunityResult ? (
                <div className="opportunitySummary">
                  <div className="metaRow">
                    <span className="metaBadge">Total: {opportunityResult.summary.totalCandidates}</span>
                    {opportunityResult.summary.urgent > 0 ? <span className="metaBadge urgent">Urgent: {opportunityResult.summary.urgent}</span> : null}
                    {opportunityResult.summary.high > 0 ? <span className="metaBadge high">High: {opportunityResult.summary.high}</span> : null}
                    {opportunityResult.summary.medium > 0 ? <span className="metaBadge medium">Medium: {opportunityResult.summary.medium}</span> : null}
                  </div>

                  {opportunityResult.topOpportunities.length > 0 ? (
                    <div className="opportunityList">
                      <h2 style={{ fontSize: "14px", marginBottom: "8px" }}>Top opportunities</h2>
                      {opportunityResult.topOpportunities.map((opp, index) => (
                        <article className="opportunityCard" key={`${opp.candidateId}-${index}`} data-label={opp.score.label}>
                          <div className="feedCandidateTopRow">
                            <strong>{opp.username ?? opp.authorName ?? "Unknown"}</strong>
                            <span className="scoreBadge">{opp.score.total}/100</span>
                          </div>
                          <div className="metaRow">
                            <span className={`opportunityLabel ${opp.score.label}`}>{getDecisionLabel(opp.score.label)}</span>
                            <span className="metaBadge">{formatRecommendedAction(opp.score.recommendedAction)}</span>
                          </div>
                          <p>{opp.text}</p>
                          {opp.score.reasonVi.slice(0, 3).length > 0 ? (
                            <ul className="opportunityReasons">
                              {opp.score.reasonVi.slice(0, 3).map((r) => <li key={r}>{r}</li>)}
                            </ul>
                          ) : null}
                          <button className="secondaryButton" type="button" onClick={() => applyOpportunityPost(opp)}>
                            Use this post
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── Safety banner (always at bottom) ── */}
      <section className="safetyBanner">
        This extension never sends replies automatically and never touches the X reply box.
      </section>
    </main>
  );
}
