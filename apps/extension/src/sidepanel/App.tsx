import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  analyzeVisionContext,
  getCommentHistory,
  getMe,
  logCommentAction,
  login,
  register,
  logout,
  runCommentHarness,
  scoreFeedSnapshot,
  saveFullContext,
  submitFeedSnapshot,
  trackUsageEvent,
} from "../shared/apiClient";
import { copyTextToClipboard } from "../shared/clipboard";
import { DEFAULT_MAX_SUGGESTIONS, X_OAUTH_AUTHORIZE_URL } from "../shared/config";
import { getDeviceId } from "../shared/deviceId";
import { getAuthSession, setAuthSession, type AuthSession } from "../shared/auth";
import { SELECTED_POST_STORAGE_KEY } from "../shared/types";
import { scoreOpportunity } from "../../../../packages/opportunity-scoring/src/index";
import type {
  AnalyzeVisionRequest,
  CommentFeedback,
  CommentHistoryItem,
  CommentSuggestion,
  CommentTone,
  ExplanationLanguage,
  AnalysisMode,
  ExtensionMessage,
  ExtractedPost,
  ExtractedPostContext,
  FeedScanResponse,
  FeedSnapshotSubmitResponse,
  GenerateReplyPackRequest,
  HarnessDriverInput,
  HarnessGeneratedComment,
  HarnessPostSegment,
  HarnessState,
  OpportunityPostScoreResponse,
  OpportunitySnapshotScoreResponse,
  OpportunityLabel,
  OpportunityScore,
  RecommendedAction,
  ReplyPack,
  SaveFullContextResponse,
  SelectedPostResponse,
  TargetCommentLanguage,
  UsageEventName,
  VisionContext,
  VisionReplyPack,
} from "../shared/types";

type ChromeStorageChange = {
  newValue?: unknown;
};

type ChromeApi = {
  runtime?: {
    sendMessage(
      message: ExtensionMessage,
      callback?: (response: SelectedPostResponse | FeedScanResponse) => void,
    ): void;
    lastError?: {
      message?: string;
    };
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
  };
  scripting?: {
    executeScript(
      injection: { target: { tabId: number }; files: string[] },
      callback?: () => void,
    ): void;
  };
  storage?: {
    local?: {
      get(
        key: string,
        callback: (items: Record<string, unknown>) => void,
      ): void;
    };
    onChanged?: {
      addListener(
        callback: (
          changes: Record<string, ChromeStorageChange>,
          areaName: string,
        ) => void,
      ): void;
      removeListener(
        callback: (
          changes: Record<string, ChromeStorageChange>,
          areaName: string,
        ) => void,
      ): void;
    };
  };
};

declare const chrome: ChromeApi | undefined;

type CopyState =
  | { status: "idle" }
  | { status: "copying" }
  | { status: "copied" }
  | {
      status: "failed";
      reason:
        | "empty_text"
        | "clipboard_unavailable"
        | "permission_denied"
        | "high_risk"
        | "unknown";
    };

type PersistedGeneration = Pick<
  SaveFullContextResponse,
  "postId" | "analysisId" | "suggestionIds"
> & {
  postUrl?: string;
  tweetId?: string;
};

type AuthMode = "login" | "create";
type AuthMessageType = "info" | "success" | "error";

function getCopyLabel(state: CopyState): string {
  if (state.status === "copying") return "Copying...";
  if (state.status === "copied") return "Copied";
  if (state.status === "failed") return "Copy failed";
  return "Copy";
}

function getRiskHelp(
  suggestion: CommentSuggestion,
  t: (key: string) => string,
): string {
  if (suggestion.risk === "high")
    return t("risk.highHelp");
  if (suggestion.risk === "medium") return t("risk.mediumHelp");
  return t("risk.lowHelp");
}

function getReplyScoreLabel(
  score: number | undefined,
  t: (key: string) => string,
): string {
  if (score === undefined) return t("score.unscored");
  if (score >= 85) return t("score.strongHook");
  if (score >= 72) return t("score.goodVisibility");
  if (score >= 60) return t("score.usable");
  return t("score.weakHook");
}

function formatRecommendedAction(action: RecommendedAction): string {
  return action.replaceAll("_", " ");
}

function getOpportunityLabelText(label: OpportunityLabel): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
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

function getPostContentType(post: ExtractedPost):
  | "text"
  | "image"
  | "image_meme_candidate"
  | "mixed"
  | "unknown" {
  const hasText = post.text.trim().length > 0;
  const hasMedia = post.media.length > 0;

  if (hasText && hasMedia && post.text.trim().length <= 140) {
    return "image_meme_candidate";
  }
  if (hasText && hasMedia) return "mixed";
  if (hasMedia) return "image";
  if (hasText) return "text";
  return "unknown";
}

function getPostThemeLabel(post: ExtractedPost): string {
  const contentType = getPostContentType(post);
  if (contentType === "image_meme_candidate") return "Theme: Meme/Image";
  if (contentType === "mixed") return "Theme: Text + Media";
  if (contentType === "image") return "Theme: Visual Post";
  if (/[?？]/.test(post.text)) return "Theme: Question";
  if (post.metrics?.views && post.metrics.views >= 10000) return "Theme: Viral Surface";
  return "Theme: Text Post";
}

function getDetectionSourceLabel(post: ExtractedPost): string {
  if (post.source === "auto_scroll") return "Auto-scroll detected";
  if (post.source === "detail_page") return "Detail page";
  if (post.source === "manual_button") return "Manual detect";
  if (post.source === "feed_scan") return "Feed scan";
  if (post.source === "visible_cache") return "Cached visible post";
  return "Clicked post";
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


function pushPostOverlayToCurrentTab(
  post: ExtractedPost,
  score: OpportunityScore,
) {
  const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
  if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) return;

  chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id) return;

    chromeApi.tabs!.sendMessage(activeTab.id, {
      type: "XCA_RENDER_POST_OVERLAY",
      post,
      score,
    });
  });
}

const defaultPostText = "これはかなり面白いですね";
const DEFAULT_ANALYSIS_MODE: AnalysisMode = "text";
const DEFAULT_COMMENT_TONE: CommentTone = "short_native";
const DEFAULT_TARGET_LANGUAGE: TargetCommentLanguage = "same_as_original";
const DEFAULT_EXPLANATION_LANGUAGE: ExplanationLanguage = "vi";

function isExtractedPost(value: unknown): value is ExtractedPost {
  return Boolean(
    value &&
    typeof value === "object" &&
    "platform" in value &&
    "text" in value &&
    "media" in value,
  );
}

function isExtractedPostContext(value: unknown): value is ExtractedPostContext {
  return Boolean(
    value &&
      typeof value === "object" &&
      "platform" in value &&
      "contextType" in value &&
      "mainPost" in value,
  );
}

function truncateForHarness(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function toHarnessPostSegment(post?: ExtractedPost | null): HarnessPostSegment | undefined {
  if (!post) return undefined;
  return {
    text: truncateForHarness(post.text, 4000),
    authorName: truncateForHarness(post.authorName, 120),
    username: truncateForHarness(post.username, 80),
    url: truncateForHarness(post.postUrl, 500),
  };
}

function buildHarnessSuggestion(
  comment: HarnessGeneratedComment,
  tone: CommentTone,
): CommentSuggestion {
  return {
    text: comment.text,
    meaningVi: comment.reason,
    tone,
    risk: comment.risk,
    whyItWorks: comment.reason,
    score: {
      total: comment.score,
      postFit: comment.score,
      visibility: comment.score,
      specificity: comment.score,
      native: comment.score,
      engagementHook: comment.score,
      whyVisible: comment.reason,
    },
  };
}

function mapHarnessToReplyPack(
  harness: HarnessState,
  postTextValue: string,
  visionContext?: VisionContext,
): ReplyPack | VisionReplyPack {
  const decision = harness.finalDecision ?? harness.initialDecision;
  const comments = [
    harness.composerOutput?.bestPick,
    ...(harness.composerOutput?.alternatives ?? []),
  ].filter(Boolean) as HarnessGeneratedComment[];
  const tone = DEFAULT_COMMENT_TONE;
  const suggestions = comments.map((comment) => buildHarnessSuggestion(comment, tone));
  const base: ReplyPack = {
    detectedLanguage:
      visionContext?.detectedLanguage ?? decision?.recommendedLanguage ?? "unknown",
    translationLanguage: visionContext?.translationLanguage ?? "vi",
    translation: visionContext?.translation ?? "",
    summary: visionContext?.summary ?? postTextValue,
    context: visionContext?.context ?? decision?.commentStrategy ?? "",
    theme: visionContext?.theme ?? decision?.zone ?? "general",
    topic: visionContext?.topic ?? decision?.intent ?? "auto",
    sentiment: visionContext?.sentiment ?? "auto",
    commentStrategy:
      visionContext?.commentStrategy ?? decision?.commentStrategy ?? "Harness generated reply candidates.",
    suggestions,
  };

  if (!visionContext) return base;

  return {
    ...base,
    analysisMode:
      visionContext.analysisMode === "vision_context" ? "vision" : "text_only_fallback",
    imageAnalysis: visionContext.imageAnalysis,
    combinedContext: visionContext.combinedContext,
    imageErrors: visionContext.imageErrors,
  };
}

function buildReplyPackFromHistoryItems(items: CommentHistoryItem[]): ReplyPack {
  const primary = items[0];
  return {
    detectedLanguage: primary.language ?? "unknown",
    translationLanguage: "vi",
    translation: primary.meaningVi ?? "",
    summary:
      primary.analysis?.textSummary ??
      primary.analysis?.combinedContext ??
      primary.postText ??
      "Saved DB history item.",
    context: primary.analysis?.combinedContext ?? primary.postText ?? "",
    theme: primary.postType ?? "history",
    topic: primary.analysis?.topic ?? primary.analysis?.intent ?? "saved_comment",
    sentiment: primary.analysis?.tone ?? "saved",
    commentStrategy:
      primary.analysis?.commentStrategy ?? "Previewing saved comments from DB history.",
    suggestions: items.map((item) => {
      const score = item.optimizationScore ?? 0;
      const whyItWorks =
        item.optimizationReason?.join("; ") ||
        item.analysis?.commentStrategy ||
        "Saved comment from DB history.";
      return {
        text: item.text,
        meaningVi: item.meaningVi ?? "",
        tone: (item.tone as CommentTone | undefined) ?? DEFAULT_COMMENT_TONE,
        risk: item.risk ?? "low",
        whyItWorks,
        score: score
          ? {
              total: score,
              postFit: score,
              visibility: score,
              specificity: score,
              native: score,
              engagementHook: score,
              whyVisible: whyItWorks,
            }
          : undefined,
      };
    }),
  };
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
      .filter((media) => media.mediaUrl)
      .map((media, index) => ({
        type: "image" as const,
        url: media.mediaUrl!,
        altText: media.altText,
        photoIndex: index + 1,
      })),
    detectedAt: item.createdAt,
    source: "visible_cache",
  };
}

function getHarnessSkipMessage(harness: HarnessState): string {
  const decision = harness.finalDecision ?? harness.initialDecision;
  const reasons = [
    decision?.zone ? `zone=${decision.zone}` : undefined,
    decision?.shouldComment === false ? "driver_recommended_skip" : undefined,
    ...(decision?.contextReasons ?? []),
    ...(decision?.avoid ?? []),
    ...(harness.composerOutput?.warnings ?? []),
    ...harness.warnings,
  ]
    .filter(Boolean)
    .map((reason) => String(reason))
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, 6);

  return reasons.length > 0
    ? `Harness skipped this post. Reason: ${reasons.join("; ")}`
    : "Harness skipped this post because it could not find a safe, context-aware comment angle.";
}

export function App() {
  const { t } = useTranslation();
  const [deviceId] = useState(() => getDeviceId());
  const [postText, setPostText] = useState(defaultPostText);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAltText, setImageAltText] = useState("");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(DEFAULT_ANALYSIS_MODE);
  const [tone] = useState<CommentTone>(DEFAULT_COMMENT_TONE);
  const [targetLanguage] = useState<TargetCommentLanguage>(DEFAULT_TARGET_LANGUAGE);
  const [explanationLanguage] = useState<ExplanationLanguage>(DEFAULT_EXPLANATION_LANGUAGE);
  const [maxSuggestions] = useState(DEFAULT_MAX_SUGGESTIONS);
  const [replyPack, setReplyPack] = useState<
    ReplyPack | VisionReplyPack | null
  >(null);
  const [selectedPost, setSelectedPost] = useState<ExtractedPost | null>(null);
  const [selectedPostContext, setSelectedPostContext] =
    useState<ExtractedPostContext | null>(null);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [authSession, setAuthSessionState] = useState<AuthSession | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authMessageType, setAuthMessageType] = useState<AuthMessageType>("info");
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<number, CopyState>>({});
  const [feedbackStates, setFeedbackStates] = useState<
    Record<number, CommentFeedback>
  >({});
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);
  const [feedSnapshotResult, setFeedSnapshotResult] =
    useState<FeedSnapshotSubmitResponse | null>(null);
  const [opportunityResult, setOpportunityResult] =
    useState<OpportunitySnapshotScoreResponse | null>(null);
  const [postScoreResult, setPostScoreResult] =
    useState<OpportunityPostScoreResponse | null>(null);
  const [postScoreMessage, setPostScoreMessage] = useState<string | null>(null);
  const [feedScanMessage, setFeedScanMessage] = useState<string | null>(null);
  const [isScanningFeed, setIsScanningFeed] = useState(false);
  const [isScoringPost, setIsScoringPost] = useState(false);
  const [historyItems, setHistoryItems] = useState<CommentHistoryItem[]>([]);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyCopyStates, setHistoryCopyStates] = useState<Record<string, "idle" | "copying" | "copied" | "failed">>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const [persistedGeneration, setPersistedGeneration] =
    useState<PersistedGeneration | null>(null);

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
        setAuthMessage(session ? "Logged in. DB sync is enabled." : null);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthSessionState(null);
          setAuthMessageType("error");
          setAuthMessage("Session expired. Please login again.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsAuthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAuthSubmit() {
    const email = loginEmail.trim() || undefined;
    const phone = authMode === "create" ? loginPhone.trim() || undefined : undefined;
    if (!email && !phone) {
      setAuthMessageType("error");
      setAuthMessage("Enter an email or phone number.");
      return;
    }

    if (loginPassword.length < 8) {
      setAuthMessageType("error");
      setAuthMessage("Password must be at least 8 characters.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage(null);
    try {
      const session =
        authMode === "create"
          ? await register({
              email,
              phone,
              name: loginName.trim() || undefined,
              password: loginPassword,
            })
          : await login({
              email,
              phone,
              password: loginPassword,
            });
      await setAuthSession(session);
      setAuthSessionState(session);
      setAuthMessageType("success");
      setAuthMessage(
        authMode === "create"
          ? "Account created. New generations will be saved to DB."
          : "Logged in. New generations will be saved to DB.",
      );
    } catch (loginError) {
      setAuthMessageType("error");
      setAuthMessage(
        loginError instanceof Error ? loginError.message : "Login failed.",
      );
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    setIsAuthLoading(true);
    try {
      await logout();
    } finally {
      setAuthSessionState(null);
      setPersistedGeneration(null);
      setAuthMessageType("info");
      setAuthMessage("Logged out. Login is required before generating.");
      setIsAuthLoading(false);
    }
  }

  function handleXOAuth() {
    if (!X_OAUTH_AUTHORIZE_URL) {
      setAuthMessageType("error");
      setAuthMessage(
        "X OAuth is not configured yet. Set VITE_X_OAUTH_AUTHORIZE_URL to enable this button.",
      );
      return;
    }

    window.open(X_OAUTH_AUTHORIZE_URL, "_blank", "noopener,noreferrer");
    setAuthMessage("Opened X OAuth. Complete the flow, then return here.");
  }

  function renderAuthPanel() {
    const authIdentity = authSession?.user.email ?? authSession?.user.phone ?? "this account";

    return (
      <section className="panel authPanel">
        <div>
          <p className="eyebrow">Account</p>
          <h2>{authSession ? "Logged in" : "Login or create account"}</h2>
          <p className="muted">
            {authSession
              ? `Saving all generated comments to DB as ${authIdentity}.`
              : "Sign in before using the assistant. Every request will include your JWT and every generation will be saved by user ID."}
          </p>
        </div>

        {authSession ? (
          <div className="authRow">
            <div className="authAvatar">
              {(authSession.user.name ?? authIdentity).slice(0, 1).toUpperCase()}
            </div>
            <div className="authIdentity">
              <strong>{authSession.user.name || authIdentity}</strong>
              <span>{authSession.user.userId}</span>
            </div>
            <button
              className="secondaryButton"
              type="button"
              disabled={isAuthLoading}
              onClick={() => void handleLogout()}
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="authGate">
            <div className="authTabs" role="tablist" aria-label="Account mode">
              <button
                className="authTab"
                type="button"
                data-selected={authMode === "login"}
                onClick={() => {
                  setAuthMode("login");
                  setLoginPhone("");
                  setLoginName("");
                  setAuthMessage(null);
                }}
              >
                Login
              </button>
              <button
                className="authTab"
                type="button"
                data-selected={authMode === "create"}
                onClick={() => {
                  setAuthMode("create");
                  setAuthMessage(null);
                }}
              >
                Create account
              </button>
            </div>

            <button
              className="xOAuthButton"
              type="button"
              disabled={isAuthLoading}
              onClick={handleXOAuth}
            >
              Continue with X
            </button>

            <div className="authDivider"><span>or use email</span></div>

            <div className="authForm">
              <label className="field">
                Email
                <input
                  type="email"
                  value={loginEmail}
                  placeholder="you@example.com"
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </label>
              {authMode === "create" ? (
                <>
                  <label className="field">
                    Phone optional
                    <input
                      type="tel"
                      value={loginPhone}
                      placeholder="+84901234567"
                      onChange={(event) => setLoginPhone(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Display name optional
                    <input
                      type="text"
                      value={loginName}
                      placeholder="Display name"
                      onChange={(event) => setLoginName(event.target.value)}
                    />
                  </label>
                </>
              ) : null}
              <label className="field">
                Password
                <input
                  type="password"
                  value={loginPassword}
                  placeholder="At least 8 characters"
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>
              <button
                className="primaryButton"
                type="button"
                disabled={isAuthLoading}
                onClick={() => void handleAuthSubmit()}
              >
                {isAuthLoading
                  ? "Checking session..."
                  : authMode === "create"
                    ? "Create account"
                    : "Login"}
              </button>
            </div>
          </div>
        )}

        {authMessage ? (
          <p
            className={
              authMessageType === "error"
                ? "errorText"
                : authMessageType === "success"
                  ? "successText"
                  : "muted"
            }
          >
            {authMessage}
          </p>
        ) : null}
      </section>
    );
  }

  async function loadCommentHistory() {
    setIsLoadingHistory(true);
    setHistoryMessage(null);
    try {
      const history = await getCommentHistory(20);
      setHistoryItems(history.items);
      setHistoryMessage(
        history.items.length > 0 ? null : "No saved generation history yet.",
      );
    } catch (historyError) {
      setHistoryMessage(
        historyError instanceof Error
          ? historyError.message
          : "Could not load comment history.",
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (!authSession) {
      setHistoryItems([]);
      setHistoryMessage(null);
      return;
    }

    void loadCommentHistory();
  }, [authSession?.accessToken]);

  function trackEvent(
    eventName: UsageEventName,
    details: Partial<GenerateReplyPackRequest> & {
      latencyMs?: number;
      errorMessage?: string;
      feedback?: CommentFeedback;
    } = {},
  ) {
    void trackUsageEvent({
      deviceId,
      eventName,
      platform: "x",
      postUrl: details.postUrl,
      tone: details.tone ?? tone,
      niche: details.niche ?? "auto",
      targetCommentLanguage: details.targetCommentLanguage ?? targetLanguage,
      latencyMs: details.latencyMs,
      errorMessage: details.errorMessage,
      feedback: details.feedback,
    });
  }

  function applyDetectedPost(post: ExtractedPost, postContext?: ExtractedPostContext) {
    setSelectedPost(post);
    setSelectedPostContext(postContext ?? null);
    setPostText(post.text);
    if (post.media.length > 0) {
      const defaultMedia = post.media.slice(0, 4);
      setAnalysisMode("vision");
      setSelectedImageUrls(defaultMedia.map((item) => item.url));
      setImageUrl(defaultMedia[0]?.url ?? "");
      setImageAltText(defaultMedia[0]?.altText ?? "");
    } else {
      setAnalysisMode("text");
      setSelectedImageUrls([]);
      setImageUrl("");
      setImageAltText("");
    }
    setReplyPack(null);
    setPostScoreResult(null);
    setPostScoreMessage(null);
    setError(null);
    setCacheMessage(
      post.source === "auto_scroll"
        ? "Auto-detected from scroll. Scoring growth opportunity..."
        : "Post detected from X. Scoring growth opportunity...",
    );
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setFeedbackStates({});
    setPersistedGeneration(null);
  }

  function previewHistoryItem(item: CommentHistoryItem) {
    const siblings = item.analysisId
      ? historyItems.filter((h) => h.analysisId === item.analysisId)
      : [item];
    const group = siblings.length > 0 ? siblings : [item];
    setReplyPack(buildReplyPackFromHistoryItems(group));
    setError(null);
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setFeedbackStates({});
    setPersistedGeneration({
      postId: item.postId,
      analysisId: item.analysisId ?? null,
      suggestionIds: group.map((h) => h.suggestionId),
      postUrl: item.postUrl,
      tweetId: item.tweetId,
    });
    setCacheMessage(`Previewing ${group.length} saved suggestion${group.length !== 1 ? "s" : ""} from DB history.`);
  }

  function loadHistoryPost(item: CommentHistoryItem) {
    if (!item.postText?.trim()) {
      setCacheMessage(null);
      setError("This history item does not include source post text.");
      return;
    }

    const post = buildPostFromHistoryItem(item);
    setSelectedPost(post);
    setSelectedPostContext(null);
    setPostText(post.text);
    if (post.media.length > 0) {
      setAnalysisMode("vision");
      setSelectedImageUrls(post.media.slice(0, 4).map((media) => media.url));
      setImageUrl(post.media[0]?.url ?? "");
      setImageAltText(post.media[0]?.altText ?? "");
    } else {
      setAnalysisMode("text");
      setSelectedImageUrls([]);
      setImageUrl("");
      setImageAltText("");
    }
    setReplyPack(null);
    setPostScoreResult(null);
    setPostScoreMessage(null);
    setError(null);
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setFeedbackStates({});
    setPersistedGeneration(null);
    setCacheMessage("Loaded source post from DB history. You can generate fresh comments for it now.");
  }

  function getPostTypeForPersistence() {
    return selectedPostContext?.contextType ?? "unknown";
  }

  function getRelatedPostsForPersistence() {
    if (!selectedPostContext) return [];
    return [
      selectedPostContext.quotedPost
        ? {
            role: "quoted",
            relationType: "quote",
            postType: "original_post",
            ...selectedPostContext.quotedPost,
          }
        : undefined,
      selectedPostContext.repostedPost
        ? {
            role: "reposted",
            relationType: "repost",
            postType: "original_post",
            ...selectedPostContext.repostedPost,
          }
        : undefined,
      selectedPostContext.parentPost
        ? {
            role: "parent",
            relationType: "reply_to",
            postType: "original_post",
            ...selectedPostContext.parentPost,
          }
        : undefined,
    ].filter(Boolean) as Array<Record<string, unknown>>;
  }

  function getRelationsForPersistence() {
    if (!selectedPostContext) return [];
    return getRelatedPostsForPersistence().map((post) => ({
      relationType: post.relationType,
      role: post.role,
      targetTweetId: post.tweetId,
      targetPostUrl: post.postUrl,
      metadata: {
        socialContext: selectedPostContext.socialContext,
        extraction: selectedPostContext.extraction,
      },
    }));
  }

  function getCurrentMediaForPersistence() {
    if (selectedPost?.media.length) {
      return selectedPost.media.filter(
        (item) => analysisMode !== "vision" || selectedImageUrls.includes(item.url),
      );
    }

    if (imageUrl.trim()) {
      return [
        {
          type: "image" as const,
          url: imageUrl.trim(),
          altText: imageAltText.trim() || undefined,
        },
      ];
    }

    return [];
  }

  function buildHarnessMedia(visionContext?: VisionContext) {
    const selectedMedia = selectedPost?.media.length
      ? selectedPost.media
          .filter((item) => selectedImageUrls.includes(item.url))
          .slice(0, 4)
      : imageUrl.trim()
        ? [
            {
              type: "image" as const,
              url: imageUrl.trim(),
              altText: imageAltText.trim() || undefined,
            },
          ]
        : [];

    if (visionContext?.imageAnalysis) {
      return selectedMedia.map((media) => ({
        type: "image" as const,
        altText: truncateForHarness(
          [
            media.altText,
            visionContext.imageAnalysis?.summary
              ? `Vision summary: ${visionContext.imageAnalysis.summary}`
              : undefined,
            visionContext.imageAnalysis?.visualTone
              ? `Visual tone: ${visionContext.imageAnalysis.visualTone}`
              : undefined,
            visionContext.combinedContext?.explanation
              ? `Combined context: ${visionContext.combinedContext.explanation}`
              : undefined,
          ]
            .filter(Boolean)
            .join("\n"),
          1000,
        ),
        ocrText: truncateForHarness(visionContext.imageAnalysis?.visibleText, 2000),
      }));
    }

    return selectedMedia.map((media) => ({
      type: "image" as const,
      altText: truncateForHarness(media.altText, 1000),
    }));
  }

  function buildHarnessInput(visionContext?: VisionContext): HarnessDriverInput {
    const missingFields = [
      selectedPost?.postUrl ? undefined : "post_url",
      selectedPost?.authorName && selectedPost?.username ? undefined : "author_identity",
    ].filter(Boolean) as string[];
    const media = buildHarnessMedia(visionContext);

    return {
      platform: "x",
      mainPost: {
        text: truncateForHarness(postText, 4000),
        authorName: truncateForHarness(selectedPost?.authorName, 120),
        username: truncateForHarness(selectedPost?.username, 80),
        language: truncateForHarness(visionContext?.detectedLanguage, 20),
        url: truncateForHarness(selectedPost?.postUrl, 500),
      },
      media: media.length > 0 ? media : undefined,
      quotedPost: toHarnessPostSegment(selectedPostContext?.quotedPost),
      repostedPost: toHarnessPostSegment(selectedPostContext?.repostedPost),
      parentPost: toHarnessPostSegment(selectedPostContext?.parentPost),
      extraction: {
        confidence: selectedPostContext
          ? selectedPostContext.extraction.confidence
          : selectedPost
            ? 0.9
            : 0.5,
        warnings: [
          ...(selectedPostContext?.extraction.warnings ?? []),
          ...(selectedPost ? [] : ["manual_text_input"]),
          ...(visionContext?.imageErrors ?? []),
        ],
        missingFields,
      },
      contextState: {
        isExpanded: Boolean(selectedPostContext || visionContext),
        expansionSources: [
          selectedPostContext ? "x_dom_context" : undefined,
          visionContext ? "vision_context" : undefined,
        ].filter(Boolean) as string[],
        needsMoreContext: !selectedPostContext && !visionContext,
      },
    };
  }

  function getSuggestionScoreTotal(suggestion: CommentSuggestion): number | undefined {
    return suggestion.score?.total;
  }

  async function persistGeneratedContent(
    result: ReplyPack | VisionReplyPack,
    harness?: HarnessState,
  ) {
    const response = await saveFullContext({
      platform: "x",
      postUrl: selectedPost?.postUrl,
      tweetId: selectedPost?.tweetId,
      postType: getPostTypeForPersistence(),
      authorName: selectedPost?.authorName,
      username: selectedPost?.username,
      text: postText,
      language: result.detectedLanguage,
      rawContext: {
        selectedPost,
        selectedPostContext,
        analysisMode,
        targetLanguage,
        tone,
        postScore: postScoreResult?.score,
        harnessRunId: harness?.runId,
        harnessFinalDecision: harness?.finalDecision,
        harnessWarnings: harness?.warnings,
      },
      extractionConfidence: selectedPostContext
        ? Math.round(selectedPostContext.extraction.confidence * 100)
        : selectedPost
          ? 90
          : 50,
      extractionWarnings: selectedPostContext?.extraction.warnings ?? (selectedPost ? [] : ["manual_text_input"]),
      media: getCurrentMediaForPersistence(),
      relatedPosts: getRelatedPostsForPersistence(),
      relations: getRelationsForPersistence(),
      analysis: {
        mode: "analysisMode" in result ? result.analysisMode : analysisMode,
        detectedLanguage: result.detectedLanguage,
        translation: result.translation,
        textSummary: result.summary,
        imageSummary:
          "imageAnalysis" in result ? result.imageAnalysis?.summary : undefined,
        combinedContext:
          "combinedContext" in result
            ? result.combinedContext.explanation
            : result.context,
        topic: result.topic,
        tone: harness?.finalDecision?.recommendedTone ?? tone,
        intent: harness?.finalDecision?.intent ?? result.theme,
        sentiment: result.sentiment,
        commentStrategy: result.commentStrategy,
        warnings: "imageErrors" in result ? result.imageErrors : [],
        raw: result,
      },
      suggestions: result.suggestions.map((suggestion, index) => ({
        text: suggestion.text,
        language:
          targetLanguage === "same_as_original"
            ? result.detectedLanguage
            : targetLanguage,
        tone: suggestion.tone,
        meaningVi: suggestion.meaningVi,
        risk: suggestion.risk,
        optimizationScore: getSuggestionScoreTotal(suggestion),
        optimizationReason: [suggestion.whyItWorks],
        isBestPick: index === 0,
      })),
    });

    setPersistedGeneration({
      postId: response.postId,
      analysisId: response.analysisId,
      suggestionIds: response.suggestionIds,
      postUrl: selectedPost?.postUrl,
      tweetId: selectedPost?.tweetId,
    });
    return response;
  }

  function prependHistoryItems(
    result: ReplyPack | VisionReplyPack,
    persisted: SaveFullContextResponse,
  ) {
    const now = new Date().toISOString();
    const newItems: CommentHistoryItem[] = result.suggestions
      .slice(0, persisted.suggestionIds.length)
      .map((suggestion, index) => ({
        suggestionId: persisted.suggestionIds[index] ?? "",
        postId: persisted.postId,
        analysisId: persisted.analysisId ?? undefined,
        postType: selectedPostContext?.contextType ?? "unknown",
        postUrl: selectedPost?.postUrl,
        tweetId: selectedPost?.tweetId,
        postText: postText,
        authorName: selectedPost?.authorName,
        username: selectedPost?.username,
        media: [],
        text: suggestion.text,
        language: result.detectedLanguage,
        tone: suggestion.tone,
        meaningVi: suggestion.meaningVi,
        risk: suggestion.risk,
        optimizationScore: suggestion.score?.total,
        optimizationReason: suggestion.whyItWorks ? [suggestion.whyItWorks] : [],
        used: false,
        actions: [],
        analysis: {
          mode: "analysisMode" in result ? result.analysisMode : analysisMode,
          textSummary: result.summary,
          combinedContext: result.context,
          topic: result.topic,
          tone: suggestion.tone,
          sentiment: result.sentiment,
          commentStrategy: result.commentStrategy,
        },
        createdAt: now,
      }));

    // Prepend newest items, cap at 20 to match server default.
    setHistoryItems((prev) => [...newItems, ...prev].slice(0, 20));
  }

  function sendPendingCommentToCurrentTab(
    suggestion: CommentSuggestion,
    suggestionId?: string,
  ) {
    if (!persistedGeneration?.postId) return;
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) return;

    chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;
      chromeApi.tabs!.sendMessage(activeTab.id, {
        type: "XCA_TRACK_PENDING_COMMENT",
        pending: {
          postId: persistedGeneration.postId,
          suggestionId,
          parentPostUrl: persistedGeneration.postUrl ?? selectedPost?.postUrl,
          parentTweetId: persistedGeneration.tweetId ?? selectedPost?.tweetId,
          commentText: suggestion.text,
          commentLanguage:
            targetLanguage === "same_as_original" ? undefined : targetLanguage,
          createdAt: Date.now(),
        },
      });
    });
  }

  function applyOpportunityPost(
    opportunity: OpportunitySnapshotScoreResponse["topOpportunities"][number],
  ) {
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
    setAnalysisMode("text");
    setCacheMessage(
      `Opportunity selected: ${formatRecommendedAction(opportunity.score.recommendedAction)}. ${opportunity.score.suggestedCommentAngle}`,
    );
  }

  function detectCurrentTabPost(
    options: { silent?: boolean; retryAfterInject?: boolean } = {},
  ) {
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    if (!options.silent) {
      setDetectionMessage("Detecting current X post...");
    }

    if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) {
      setDetectionMessage(
        "Chrome tabs API is unavailable. Reload the extension from dist.",
      );
      return;
    }

    const api = chromeApi;

    api.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        setDetectionMessage(
          "No active tab found. Focus an X tab, then try again.",
        );
        return;
      }

      const url = activeTab.url ?? "";
      if (!url.includes("x.com") && !url.includes("twitter.com")) {
        setDetectionMessage(
          "Active tab is not X/Twitter. Open a post on X, then try again.",
        );
        return;
      }

      function injectDetectorAndRetry(reason: string) {
        if (options.retryAfterInject || !api.scripting?.executeScript) {
          setDetectionMessage(
            `Could not reach X detector: ${reason}. Refresh the X tab and reload the extension.`,
          );
          return;
        }

        if (!options.silent) {
          setDetectionMessage("Injecting X detector into the current tab...");
        }

        api.scripting.executeScript(
          {
            target: { tabId: activeTab.id! },
            files: ["assets/contentScript.js"],
          },
          () => {
            const injectionError = api.runtime?.lastError?.message;
            if (injectionError) {
              setDetectionMessage(
                `Could not inject X detector: ${injectionError}. Reload the extension and refresh X.`,
              );
              return;
            }

            window.setTimeout(
              () =>
                detectCurrentTabPost({
                  ...options,
                  retryAfterInject: true,
                }),
              300,
            );
          },
        );
      }

      function sendDetectMessage() {
        api.tabs!.sendMessage(
          activeTab.id!,
          { type: "XCA_DETECT_CURRENT_POST" },
          (response) => {
            const runtimeError = api.runtime?.lastError?.message;
            if (runtimeError) {
              injectDetectorAndRetry(runtimeError);
              return;
            }

            if (response && "post" in response && response.post) {
              applyDetectedPost(response.post, response.postContext);
              setDetectionMessage("Detected current visible X post.");
              return;
            }

            setDetectionMessage(
              response?.error ??
                "No visible X post found. Click or scroll to a post, then retry.",
            );
          },
        );
      }

      api.tabs!.sendMessage(activeTab.id!, { type: "XCA_PING" }, () => {
        const runtimeError = api.runtime?.lastError?.message;
        if (runtimeError) {
          injectDetectorAndRetry(runtimeError);
          return;
        }

        sendDetectMessage();
      });
    });
  }

  function scanVisibleFeed(options: { retryAfterInject?: boolean } = {}) {
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    setFeedScanMessage("Scanning visible X feed...");
    setIsScanningFeed(true);

    if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) {
      setFeedScanMessage(
        "Chrome tabs API is unavailable. Reload the extension from dist.",
      );
      setIsScanningFeed(false);
      return;
    }

    const api = chromeApi;

    api.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        setFeedScanMessage(
          "No active tab found. Focus an X feed tab, then try again.",
        );
        setIsScanningFeed(false);
        return;
      }

      const url = activeTab.url ?? "";
      if (!url.includes("x.com") && !url.includes("twitter.com")) {
        setFeedScanMessage(
          "Active tab is not X/Twitter. Open an X feed, then try again.",
        );
        setIsScanningFeed(false);
        return;
      }

      function sendScanMessage() {
        api.tabs!.sendMessage(
          activeTab.id!,
          { type: "XCA_SCAN_VISIBLE_FEED" },
          (response) => {
            const runtimeError = api.runtime?.lastError?.message;
            if (runtimeError) {
              if (!options.retryAfterInject && api.scripting?.executeScript) {
                setFeedScanMessage(
                  "Injecting X feed scanner into the current tab...",
                );
                api.scripting.executeScript(
                  {
                    target: { tabId: activeTab.id! },
                    files: ["assets/contentScript.js"],
                  },
                  () => {
                    const injectionError = api.runtime?.lastError?.message;
                    if (injectionError) {
                      setFeedScanMessage(
                        `Could not inject X feed scanner: ${injectionError}. Reload the extension and refresh X.`,
                      );
                      setIsScanningFeed(false);
                      return;
                    }

                    window.setTimeout(
                      () => scanVisibleFeed({ retryAfterInject: true }),
                      150,
                    );
                  },
                );
                return;
              }

              setFeedScanMessage(
                `Could not reach X feed scanner: ${runtimeError}. Refresh the X tab and reload the extension.`,
              );
              setIsScanningFeed(false);
              return;
            }

            if (!response || !("snapshot" in response) || !response.snapshot) {
              setFeedScanMessage(
                response && "error" in response && response.error
                  ? response.error
                  : "No visible X feed posts found. Scroll to a feed, then retry.",
              );
              setIsScanningFeed(false);
              return;
            }

            setFeedScanMessage(
              `Found ${response.snapshot.visiblePostCount} visible posts. Sending snapshot...`,
            );
            void submitFeedSnapshot(response.snapshot)
              .then(async (result) => {
                setFeedSnapshotResult(result);
                setOpportunityResult(null);

                if (!result.next.canScore) {
                  setFeedScanMessage(
                    "Feed snapshot analyzed, but no candidates are ready for scoring.",
                  );
                  return;
                }

                setFeedScanMessage(
                  "Feed snapshot analyzed. Scoring opportunities...",
                );
                const scored = await scoreFeedSnapshot(result.snapshotId);
                setOpportunityResult(scored);
                setFeedScanMessage(
                  "Opportunity scoring complete. No vision calls were triggered.",
                );
              })
              .catch((scanError) => {
                setFeedScanMessage(
                  scanError instanceof Error
                    ? scanError.message
                    : "Could not analyze feed snapshot.",
                );
              })
              .finally(() => setIsScanningFeed(false));
          },
        );
      }

      sendScanMessage();
    });
  }

  useEffect(() => {
    const chromeApi = typeof chrome === "undefined" ? undefined : chrome;
    chromeApi?.runtime?.sendMessage(
      { type: "XCA_GET_SELECTED_POST" },
      (response) => {
        if (response && "post" in response && response.post)
          applyDetectedPost(response.post, response.postContext);
      },
    );
    chromeApi?.storage?.local?.get(SELECTED_POST_STORAGE_KEY, (items) => {
      const storedValue = items[SELECTED_POST_STORAGE_KEY];
      if (isExtractedPostContext(storedValue)) {
        applyDetectedPost(storedValue.mainPost, storedValue);
        return;
      }
      if (isExtractedPost(storedValue)) applyDetectedPost(storedValue);
    });

    const autoDetectTimer = window.setTimeout(() => {
      detectCurrentTabPost({ silent: true });
    }, 300);

    const handleStorageChange = (
      changes: Record<string, ChromeStorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return;
      const nextValue = changes[SELECTED_POST_STORAGE_KEY]?.newValue;
      if (isExtractedPostContext(nextValue)) {
        applyDetectedPost(nextValue.mainPost, nextValue);
        return;
      }
      if (isExtractedPost(nextValue)) applyDetectedPost(nextValue);
    };

    chromeApi?.storage?.onChanged?.addListener(handleStorageChange);
    return () => {
      window.clearTimeout(autoDetectTimer);
      chromeApi?.storage?.onChanged?.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!selectedPost) return;

    setIsScoringPost(true);
    setPostScoreMessage("Scoring this post for growth decision...");

    const localScore = scoreOpportunity({
      candidate: buildPostScoreCandidate(selectedPost),
    });
    const localResult: OpportunityPostScoreResponse = {
      postUrl: selectedPost.postUrl,
      score: localScore,
    };

    setPostScoreResult(localResult);
    setPostScoreMessage(null);
    setCacheMessage(
      `${getOpportunityLabelVi(localResult.score.label)} · ${formatRecommendedAction(localResult.score.recommendedAction)}`,
    );
    pushPostOverlayToCurrentTab(selectedPost, localResult.score);
    setIsScoringPost(false);
  }, [selectedPost]);

  async function handleGenerate(
    options: { refreshVisionContext?: boolean } = {},
  ) {
    if (!authSession) {
      setError("Login before generating so the result can be saved to your DB history.");
      return;
    }

    if (!postText.trim()) {
      setError("Paste post text before generating suggestions.");
      return;
    }

    const visionMedia = selectedPost?.media.length
      ? selectedPost.media
          .filter((item) => selectedImageUrls.includes(item.url))
          .slice(0, 4)
          .map((item) => ({
            type: "image" as const,
            url: item.url,
            altText: item.altText,
          }))
      : imageUrl.trim()
        ? [
            {
              type: "image" as const,
              url: imageUrl.trim(),
              altText: imageAltText.trim() || undefined,
            },
          ]
        : [];

    const request: GenerateReplyPackRequest = {
      platform: "x",
      postText,
      postUrl: selectedPost?.postUrl,
      postContext: selectedPostContext ?? undefined,
      targetCommentLanguage: targetLanguage,
      explanationLanguage,
      tone,
      niche: "auto",
      maxSuggestions,
    };
    const startedAt = performance.now();

    setIsGenerating(true);
    setError(null);
    setCacheMessage(null);
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setFeedbackStates({});
    if (replyPack) {
      trackEvent("regenerate_clicked", request);
    }
    trackEvent("analyze_started", request);

    try {
      let result: ReplyPack | VisionReplyPack;
      let harness: HarnessState;
      let visionContext: VisionContext | undefined;

      if (visionMedia.length > 0) {
        const visionRequest: AnalyzeVisionRequest = {
          post: {
            platform: "x",
            text: postText,
            url: selectedPost?.postUrl,
            authorName: selectedPost?.authorName,
            authorHandle: selectedPost?.username,
          },
          media: visionMedia,
          postContext: selectedPostContext ?? undefined,
          options: {
            explanationLanguage,
            targetCommentLanguage: targetLanguage,
            tone,
            niche: "auto",
            maxSuggestions,
          },
        };
        setCacheMessage("Analyzing image context...");
        visionContext = await analyzeVisionContext(visionRequest);
      }

      setCacheMessage("Running comment harness...");
      harness = await runCommentHarness(buildHarnessInput(visionContext));
      result = mapHarnessToReplyPack(harness, postText, visionContext);

      if (result.suggestions.length === 0) {
        throw new Error(
          harness.status === "skipped"
            ? getHarnessSkipMessage(harness)
            : "Harness did not return any comment candidates.",
        );
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      setReplyPack(result);
      let savedToDb = true;
      try {
        const persisted = await persistGeneratedContent(result, harness);
        // Optimistic local prepend — avoids re-fetching 20 items after each generate.
        prependHistoryItems(result, persisted);
      } catch {
        savedToDb = false;
      }
      setCacheMessage(
        !savedToDb
          ? "Generated suggestions. DB save failed; login/session or API needs attention."
          : options.refreshVisionContext
            ? "Refreshed image analysis, generated fresh suggestions, and saved to DB."
            : "Generated suggestions and saved to DB.",
      );
      trackEvent("analyze_succeeded", { ...request, latencyMs });
    } catch (requestError) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const errorMessage =
        requestError instanceof Error
          ? requestError.message
          : "Could not generate suggestions.";
      setError(errorMessage);
      trackEvent("analyze_failed", { ...request, latencyMs, errorMessage });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy(index: number, suggestion: CommentSuggestion) {
    if (suggestion.risk === "high") {
      setCopyStates((current) => ({
        ...current,
        [index]: { status: "failed", reason: "high_risk" },
      }));
      setManualCopyText(null);
      return;
    }

    setCopyStates((current) => ({
      ...current,
      [index]: { status: "copying" },
    }));

    const result = await copyTextToClipboard(suggestion.text);

    if (result.ok) {
      const suggestionId = persistedGeneration?.suggestionIds[index];
      setCopyStates((current) => ({
        ...current,
        [index]: { status: "copied" },
      }));
      setManualCopyText(null);
      trackEvent("copy_clicked", { tone: suggestion.tone, niche: "auto" });
      if (persistedGeneration?.postId) {
        void logCommentAction({
          postId: persistedGeneration.postId,
          suggestionId,
          actionType: "copied",
          commentText: suggestion.text,
          metadata: {
            position: index + 1,
            tone: suggestion.tone,
            source: "side_panel",
          },
        });
        sendPendingCommentToCurrentTab(suggestion, suggestionId);
      }
      return;
    }

    setCopyStates((current) => ({
      ...current,
      [index]: { status: "failed", reason: result.reason },
    }));
    setManualCopyText(suggestion.text);
  }

  function handleFeedback(index: number, feedback: CommentFeedback) {
    setFeedbackStates((current) => ({
      ...current,
      [index]: feedback,
    }));
    trackEvent("feedback_submitted", { feedback });
  }

  function toggleDetectedImage(url: string) {
    setSelectedImageUrls((current) => {
      if (current.includes(url)) {
        return current.filter((item) => item !== url);
      }

      return [...current, url].slice(0, 4);
    });
  }

  function handleManualImageChange(nextUrl: string) {
    setImageUrl(nextUrl);
    if (selectedPost) {
      setSelectedPost(null);
      setSelectedPostContext(null);
      setSelectedImageUrls([]);
      setCacheMessage(
        "Manual image URL mode. Detected post context is no longer linked.",
      );
    }
  }

  if (!authSession) {
    return (
      <main className="shell authShell">
        <section className="hero authHero">
          <p className="eyebrow">Phase 3.1 Growth Decision Engine</p>
          <h1>X Comment Assistant</h1>
          <p className="heroText">
            Login or create an account to sync comment history, generated replies,
            and growth signals by user ID.
          </p>
        </section>

        <section className="safetyBanner">
          This extension never sends replies automatically and never touches the X
          reply box.
        </section>

        {renderAuthPanel()}
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Phase 3.1 Growth Decision Engine</p>
        <h1>X Comment Assistant</h1>
        <p className="heroText">
          Auto-detect X posts while you scroll, label the opportunity, and
          recommend the next growth action.
        </p>
      </section>

      <section className="safetyBanner">
        This extension never sends replies automatically and never touches the X
        reply box.
      </section>

      {renderAuthPanel()}

      <section className="panel feedPanel">
        <div className="historyHeader">
          <div>
            <h2>Feed Intelligence</h2>
            <p className="muted">
              Phase 2.5 scans visible posts, scores opportunities, and
              recommends the next action.
            </p>
          </div>
        </div>

        <button
          className="secondaryButton detectButton"
          type="button"
          disabled={isScanningFeed}
          onClick={() => scanVisibleFeed()}
        >
          {isScanningFeed ? "Scanning feed..." : "Scan visible feed"}
        </button>

        {feedScanMessage ? <p className="muted">{feedScanMessage}</p> : null}

        {feedSnapshotResult ? (
          <div className="feedSummary">
            <div className="feedStatsGrid">
              <div className="feedStatCard">
                <span>Visible posts</span>
                <strong>{feedSnapshotResult.summary.visiblePostCount}</strong>
              </div>
              <div className="feedStatCard">
                <span>Useful candidates</span>
                <strong>{feedSnapshotResult.summary.usefulCandidates}</strong>
              </div>
              <div className="feedStatCard">
                <span>Ignored</span>
                <strong>{feedSnapshotResult.ignoredPosts}</strong>
              </div>
              <div className="feedStatCard">
                <span>Average score</span>
                <strong>{feedSnapshotResult.summary.averageScore}</strong>
              </div>
              <div className="feedStatCard">
                <span>Best score</span>
                <strong>{feedSnapshotResult.summary.bestScore}</strong>
              </div>
            </div>

            <div className="metaRow">
              {Object.entries(feedSnapshotResult.summary.byNiche).map(
                ([niche, count]) => (
                  <span className="metaBadge" key={niche}>
                    {niche}: {count}
                  </span>
                ),
              )}
              {Object.entries(feedSnapshotResult.summary.byContentType).map(
                ([contentType, count]) => (
                  <span className="metaBadge" key={contentType}>
                    {contentType}: {count}
                  </span>
                ),
              )}
              <span className="metaBadge">
                Ready for scoring:{" "}
                {feedSnapshotResult.summary.readyForScoring ? "Yes" : "No"}
              </span>
            </div>

            {opportunityResult ? (
              <div className="opportunitySummary">
                <h2>Opportunity Summary</h2>
                <div className="metaRow">
                  <span className="metaBadge">
                    Total: {opportunityResult.summary.totalCandidates}
                  </span>
                  <span className="metaBadge urgent">
                    Urgent: {opportunityResult.summary.urgent}
                  </span>
                  <span className="metaBadge high">
                    High: {opportunityResult.summary.high}
                  </span>
                  <span className="metaBadge medium">
                    Medium: {opportunityResult.summary.medium}
                  </span>
                  <span className="metaBadge low">
                    Low: {opportunityResult.summary.low}
                  </span>
                  <span className="metaBadge skip">
                    Skip: {opportunityResult.summary.skip}
                  </span>
                </div>

                {opportunityResult.topOpportunities.length > 0 ? (
                  <div className="opportunityList">
                    <h2>Top Opportunities</h2>
                    {opportunityResult.topOpportunities.map(
                      (opportunity, index) => (
                        <article
                          className="opportunityCard"
                          key={`${opportunity.candidateId}-${index}`}
                          data-label={opportunity.score.label}
                        >
                          <div className="feedCandidateTopRow">
                            <strong>
                              {opportunity.username ??
                                opportunity.authorName ??
                                "Unknown author"}
                            </strong>
                            <span className="scoreBadge">
                              {opportunity.score.total}/100
                            </span>
                          </div>
                          <div className="metaRow">
                            <span
                              className={`opportunityLabel ${opportunity.score.label}`}
                            >
                              {getOpportunityLabelText(opportunity.score.label)}
                            </span>
                            <span className="metaBadge">
                              {formatRecommendedAction(
                                opportunity.score.recommendedAction,
                              )}
                            </span>
                            {opportunity.detectedNiche ? (
                              <span className="metaBadge">
                                {opportunity.detectedNiche}
                              </span>
                            ) : null}
                          </div>
                          <p>{opportunity.text}</p>
                          <p className="contextStrategy">
                            {opportunity.score.suggestedCommentAngle}
                          </p>
                          {opportunity.score.reasonVi.length > 0 ? (
                            <ul className="opportunityReasons">
                              {opportunity.score.reasonVi.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          ) : null}
                          {opportunity.score.warnings.length > 0 ? (
                            <p className="errorText">
                              Warnings: {opportunity.score.warnings.join("; ")}
                            </p>
                          ) : null}
                          <div className="dimensionGrid">
                            {Object.entries(opportunity.score.dimensions).map(
                              ([dimension, score]) => (
                                <span
                                  className="dimensionBadge"
                                  key={dimension}
                                >
                                  {dimension}: {score}
                                </span>
                              ),
                            )}
                          </div>
                          <button
                            className="secondaryButton"
                            type="button"
                            onClick={() => applyOpportunityPost(opportunity)}
                          >
                            Use this post
                          </button>
                        </article>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {feedSnapshotResult.topCandidates.length > 0 ? (
              <div className="feedCandidateList">
                <h2>Top detected candidates</h2>
                {feedSnapshotResult.topCandidates.map((candidate, index) => (
                  <article
                    className="feedCandidate"
                    key={`${candidate.postUrl ?? candidate.text}-${index}`}
                  >
                    <div className="feedCandidateTopRow">
                      <strong>
                        {candidate.username ??
                          candidate.authorName ??
                          "Unknown author"}
                      </strong>
                      <span className="scoreBadge">{candidate.score}</span>
                    </div>
                    <span>
                      {candidate.niche} / {candidate.topic} /{" "}
                      {candidate.contentType}
                    </span>
                    <p>{candidate.text}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        {selectedPost ? (
          <div className="summaryBlock postDetectedSummary">
            <h2>Post detected</h2>
            {(() => {
              const detectionLabel = getDetectionSourceLabel(selectedPost);
              return (
                <>
                  <p className="muted">
                    {detectionLabel} · Images: {selectedPost.media.length}
                    {selectedPost.username ? ` · ${selectedPost.username}` : ""}
                  </p>
                  <div className="metaRow detectionMetaRow">
                    <span className="metaBadge autoDetectBadge">
                      {detectionLabel}
                    </span>
                    <span className="metaBadge themeBadge">
                      {getPostThemeLabel(selectedPost)}
                    </span>
                    <span className="metaBadge">
                      Type: {getPostContentType(selectedPost).replaceAll("_", " ")}
                    </span>
                  </div>
                </>
              );
            })()}
            {selectedPost.postUrl ? (
              <p className="muted">URL: {selectedPost.postUrl}</p>
            ) : null}
            {selectedPostContext ? (
              <div className="summaryBlock">
                <h2>Context detected</h2>
                <div className="metaRow">
                  <span className="metaBadge">Type: {selectedPostContext.contextType}</span>
                  <span className="metaBadge">
                    Confidence: {Math.round(selectedPostContext.extraction.confidence * 100)}%
                  </span>
                  {selectedPostContext.socialContext?.isSelfRepost ? (
                    <span className="metaBadge">Self repost</span>
                  ) : null}
                </div>
                {selectedPostContext.socialContext?.visibleContextText ? (
                  <p className="muted">
                    Social context: {selectedPostContext.socialContext.visibleContextText}
                  </p>
                ) : null}
                {selectedPostContext.quotedPost ? (
                  <p className="muted">
                    Quoted post: {selectedPostContext.quotedPost.username ?? "unknown"} · {selectedPostContext.quotedPost.text.slice(0, 140)}
                  </p>
                ) : null}
                {selectedPostContext.repostedPost ? (
                  <p className="muted">
                    Reposted post: {selectedPostContext.repostedPost.username ?? "unknown"} · {selectedPostContext.repostedPost.text.slice(0, 140)}
                  </p>
                ) : null}
                {selectedPostContext.extraction.warnings.length > 0 ? (
                  <p className="errorText">
                    Context warnings: {selectedPostContext.extraction.warnings.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted">
            No X post detected yet. Click a post on X or paste text manually.
          </p>
        )}

        {selectedPost ? (
          <div
            className="decisionCard"
            data-label={postScoreResult?.score.label ?? "pending"}
          >
            <div className="decisionCardHeader">
              <div>
                <p className="eyebrow">Phase 3.1 Decision</p>
                <h2>Growth Decision Card</h2>
              </div>
              <span className="scoreBadge decisionScore">
                {isScoringPost
                  ? "Scoring..."
                  : postScoreResult
                    ? `${postScoreResult.score.total}/100`
                    : "No score"}
              </span>
            </div>

            {postScoreResult ? (
              <>
                <div className="metaRow">
                  <span className={`opportunityLabel ${postScoreResult.score.label}`}>
                    {getOpportunityLabelVi(postScoreResult.score.label)}
                  </span>
                  <span className="metaBadge">
                    Label: {getOpportunityLabelText(postScoreResult.score.label)}
                  </span>
                  <span className="metaBadge themeBadge">
                    {getPostThemeLabel(selectedPost)}
                  </span>
                  <span className="metaBadge">
                    Action: {formatRecommendedAction(postScoreResult.score.recommendedAction)}
                  </span>
                </div>
                <p className="contextStrategy">
                  {postScoreResult.score.suggestedCommentAngle}
                </p>
                {postScoreResult.score.reasonVi.length > 0 ? (
                  <ul className="opportunityReasons">
                    {postScoreResult.score.reasonVi.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {postScoreResult.score.warnings.length > 0 ? (
                  <p className="errorText">
                    Warnings: {postScoreResult.score.warnings.join("; ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className={postScoreMessage?.includes("failed") ? "errorText" : "muted"}>
                {postScoreMessage ?? "Waiting for post opportunity score..."}
              </p>
            )}
          </div>
        ) : null}

        <button
          className="secondaryButton detectButton"
          type="button"
          onClick={() => detectCurrentTabPost()}
        >
          Detect current X post manually
        </button>

        {detectionMessage ? <p className="muted">{detectionMessage}</p> : null}

        <label className="field">
          <span>Post text</span>
          <textarea
            value={postText}
            onChange={(event) => setPostText(event.target.value)}
            rows={6}
            placeholder="Paste the X post text here..."
          />
        </label>

        {analysisMode === "vision" ? (
          <div className="visionPreview">
            {selectedPost?.media.length ? (
              <div className="summaryBlock">
                <h2>Ảnh trong bài viết</h2>
                <p className="muted">Chọn tối đa 4 ảnh để AI phân tích.</p>
                <div className="detectedImageGrid">
                  {selectedPost.media.map((media, index) => {
                    const selected = selectedImageUrls.includes(media.url);

                    return (
                      <button
                        className="detectedImageButton"
                        type="button"
                        key={media.url}
                        data-selected={selected}
                        onClick={() => toggleDetectedImage(media.url)}
                      >
                        <img
                          src={media.url}
                          alt={media.altText || `Detected image ${index + 1}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <small>
                          {selected ? "Selected" : "Click to select"} · image {media.photoIndex ?? index + 1}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>Image URL</span>
                  <input
                    value={imageUrl}
                    onChange={(event) => handleManualImageChange(event.target.value)}
                    placeholder="https://pbs.twimg.com/media/..."
                  />
                </label>
                <label className="field">
                  <span>Alt text optional</span>
                  <textarea
                    value={imageAltText}
                    onChange={(event) => setImageAltText(event.target.value)}
                    rows={2}
                    placeholder="Optional alt text from X..."
                  />
                </label>
                {imageUrl.trim() ? (
                  <div className="imagePreviewCard">
                    <img
                      src={imageUrl.trim()}
                      alt={imageAltText || "Selected post media"}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <p className="muted">
                      Manual image preview. Backend fetches and analyzes this image after you click Analyze.
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <button
          className="primaryButton"
          type="button"
          disabled={isGenerating || !authSession}
          onClick={() => void handleGenerate()}
        >
          {isGenerating
            ? "Đang phân tích..."
            : authSession
              ? "Phân tích bài viết"
              : "Login để phân tích"}
        </button>

        {error ? <p className="errorText">{error}</p> : null}
        {cacheMessage ? <p className="successText">{cacheMessage}</p> : null}
      </section>

      {replyPack ? (
        <section className="panel results">
          <div className="summaryBlock">
            <h2>{t("result.context")}</h2>
            <p className="contextSummary">{replyPack.summary}</p>
            <p className="contextStrategy">{replyPack.commentStrategy}</p>
          </div>

          {"analysisMode" in replyPack ? (
            <div className="visionResult">
              <div className="metaRow">
                <span className="metaBadge">
                  {t("result.mode")}: {replyPack.analysisMode}
                </span>
                {"imageAnalysis" in replyPack && replyPack.imageAnalysis ? (
                  <span className="metaBadge">
                    {t("result.visualTone")}: {replyPack.imageAnalysis.visualTone}
                  </span>
                ) : null}
              </div>

              {"imageAnalysis" in replyPack && replyPack.imageAnalysis ? (
                <>
                  <h2>{t("result.imageAnalysis")}</h2>
                  <p className="contextSummary">
                    {replyPack.imageAnalysis.summary}
                  </p>
                  {replyPack.imageAnalysis.visibleText ? (
                    <p className="contextDataRow">
                      <span className="contextLabel">{t("result.visibleText")}</span>
                      {replyPack.imageAnalysis.visibleText}
                    </p>
                  ) : null}
                  {replyPack.imageAnalysis.uncertainty ? (
                    <p className="contextDataRow contextDataRow--warn">
                      <span className="contextLabel">{t("result.uncertainty")}</span>
                      {replyPack.imageAnalysis.uncertainty}
                    </p>
                  ) : null}
                </>
              ) : null}

              {"combinedContext" in replyPack ? (
                <>
                  <h2>{t("result.combinedContext")}</h2>
                  <p className="contextSummary">
                    {replyPack.combinedContext.explanation}
                  </p>
                  {replyPack.combinedContext.avoid.length > 0 ? (
                    <p className="contextDataRow contextDataRow--warn">
                      <span className="contextLabel">{t("result.avoid")}</span>
                      {replyPack.combinedContext.avoid.join(", ")}
                    </p>
                  ) : null}
                </>
              ) : null}

              {"imageErrors" in replyPack && replyPack.imageErrors?.length ? (
                <p className="errorText">
                  {t("result.imageFallback")}: {replyPack.imageErrors.join("; ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="suggestionList">
            {replyPack.suggestions.map((suggestion, index) => {
              const copyState = copyStates[index] ?? { status: "idle" };
              const isHighRisk = suggestion.risk === "high";

              return (
                <article
                  className="suggestionCard"
                  key={`${suggestion.text}-${index}`}
                >
                  <div className="suggestionHeader">
                    <span className={`riskBadge ${suggestion.risk}`}>
                      {t(`risk.${suggestion.risk}`)}
                    </span>
                    <span className="toneBadge">
                      {t(`tone.${suggestion.tone}`, {
                        defaultValue: suggestion.tone.replaceAll("_", " "),
                      })}
                    </span>
                    {suggestion.score ? (
                      <span className="replyScoreBadge">
                        {t("score.reply")} {suggestion.score.total}/100 · {getReplyScoreLabel(suggestion.score.total, t)}
                      </span>
                    ) : null}
                  </div>

                  {suggestion.score ? (
                    <div className="replyScorePanel">
                      <div className="replyScoreBar" aria-hidden="true">
                        <span style={{ width: `${suggestion.score.total}%` }} />
                      </div>
                      <div className="replyScoreGrid">
                        <span>{t("score.fit")} {suggestion.score.postFit}</span>
                        <span>{t("score.visibility")} {suggestion.score.visibility}</span>
                        <span>{t("score.specific")} {suggestion.score.specificity}</span>
                        <span>{t("score.native")} {suggestion.score.native}</span>
                        <span>{t("score.hook")} {suggestion.score.engagementHook}</span>
                      </div>
                      <p className="replyScoreWhy">{suggestion.score.whyVisible}</p>
                    </div>
                  ) : null}

                  {/* ── Comment code block ── */}
                  <div className="commentBlock">
                    <pre className="commentBlockText">{suggestion.text}</pre>
                    <div className="commentBlockFooter">
                      {copyState.status === "copied" ? (
                        <span className="commentBlockCopied">✓ Copied!</span>
                      ) : copyState.status === "failed" && !isHighRisk ? (
                        <span className="commentBlockError">
                          Clipboard failed — select &amp; copy manually
                        </span>
                      ) : null}
                      <button
                        className="commentBlockCopyBtn"
                        type="button"
                        disabled={copyState.status === "copying" || isHighRisk}
                        onClick={() => void handleCopy(index, suggestion)}
                      >
                        {isHighRisk
                          ? t("actions.highRisk")
                          : copyState.status === "copying"
                            ? t("actions.copying")
                            : `⎘ ${t("actions.copy")}`}
                      </button>
                    </div>
                  </div>

                  {/* ── Vietnamese translation ── */}
                  {suggestion.meaningVi ? (
                    <p className="meaningText">{suggestion.meaningVi}</p>
                  ) : null}

                  <p className="muted">{suggestion.whyItWorks}</p>
                  <p className="riskHelp">{getRiskHelp(suggestion, t)}</p>

                  <div className="metaRow">
                    <span className="metaBadge">{t("result.theme")}: {replyPack.theme}</span>
                    <span className="metaBadge">{t("result.topic")}: {replyPack.topic}</span>
                  </div>

                  <div className="feedbackRow" aria-label="Suggestion feedback">
                    {(
                      [
                        "good",
                        "too_generic",
                        "wrong_context",
                        "too_risky",
                      ] as const
                    ).map((feedback) => (
                      <button
                        className="feedbackButton"
                        type="button"
                        key={feedback}
                        data-selected={feedbackStates[index] === feedback}
                        onClick={() => handleFeedback(index, feedback)}
                      >
                        {t(`feedback.${feedback}`)}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel historyPanel">
        <div className="historyHeader">
          <div>
            <h2>Saved comment history</h2>
            <p className="muted">Preview old comments or reload their source post.</p>
          </div>
          <button
            className="secondaryButton"
            type="button"
            disabled={isLoadingHistory}
            onClick={() => void loadCommentHistory()}
          >
            {isLoadingHistory ? "Loading..." : "Refresh"}
          </button>
        </div>

        {historyMessage ? <p className="muted">{historyMessage}</p> : null}

        {historyItems.length > 0 ? (
          <div className="historyList">
            {historyItems.slice(0, 10).map((item) => {
              const copyState = historyCopyStates[item.suggestionId] ?? "idle";
              const isExpanded = expandedHistoryId === item.suggestionId;

              function handleCopyHistory() {
                if (copyState === "copying") return;
                setHistoryCopyStates((prev) => ({ ...prev, [item.suggestionId]: "copying" }));
                copyTextToClipboard(item.text)
                  .then((result) => {
                    setHistoryCopyStates((prev) => ({
                      ...prev,
                      [item.suggestionId]: result.ok ? "copied" : "failed",
                    }));
                    if (result.ok) {
                      window.setTimeout(() => {
                        setHistoryCopyStates((prev) => ({ ...prev, [item.suggestionId]: "idle" }));
                      }, 2500);
                    }
                  })
                  .catch(() => {
                    setHistoryCopyStates((prev) => ({ ...prev, [item.suggestionId]: "failed" }));
                  });
              }

              return (
                <article
                  className={`historyItem${isExpanded ? " historyItemExpanded" : ""}`}
                  key={item.suggestionId}
                >
                  {/* ── Collapsed header — always visible ── */}
                  <button
                    className="historyItemHeader"
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedHistoryId(isExpanded ? null : item.suggestionId)
                    }
                  >
                    <span className="historyItemPreviewText">{item.text}</span>
                    <span className="historyItemChevron" aria-hidden="true">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  <div className="historyItemMeta">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    {(item.username ?? item.authorName) ? (
                      <span className="historyMetaBadge">@{item.username ?? item.authorName}</span>
                    ) : null}
                    {item.optimizationScore != null ? (
                      <span className="historyMetaBadge historyScoreBadge">score {item.optimizationScore}</span>
                    ) : null}
                    {item.risk ? (
                      <span className={`historyMetaBadge historyRiskBadge historyRisk--${item.risk}`}>{item.risk}</span>
                    ) : null}
                  </div>

                  {/* ── Expanded panel ── */}
                  {isExpanded ? (
                    <div className="historyExpandedPanel">
                      {/* Full comment block */}
                      <div className="historyCommentBlock">
                        <p className="historyCommentText">{item.text}</p>
                        <div className="historyCommentFooter">
                          {copyState === "copied" ? (
                            <span className="historyCommentCopied">✓ Copied to clipboard</span>
                          ) : copyState === "failed" ? (
                            <span className="historyCommentFailed">Copy failed — try again</span>
                          ) : null}
                          <button
                            className={`historyBigCopy${copyState === "copied" ? " historyBigCopied" : ""}`}
                            type="button"
                            disabled={copyState === "copying"}
                            onClick={handleCopyHistory}
                          >
                            {copyState === "copied"
                              ? "✓ Copied"
                              : copyState === "copying"
                                ? "Copying..."
                                : "Copy comment"}
                          </button>
                        </div>
                      </div>

                      {/* Vietnamese meaning */}
                      {item.meaningVi ? (
                        <p className="historyMeaning">{item.meaningVi}</p>
                      ) : null}

                      {/* Post context */}
                      {item.postText ? (
                        <div className="historyPostContext">
                          <span className="historyContextLabel">Post</span>
                          <p>{item.postText}</p>
                        </div>
                      ) : null}

                      {/* Strategy */}
                      {item.analysis?.commentStrategy ? (
                        <div className="historyPostContext">
                          <span className="historyContextLabel">Strategy</span>
                          <p>{item.analysis.commentStrategy}</p>
                        </div>
                      ) : null}

                      {/* Media */}
                      {item.media.length > 0 ? (
                        <p className="historyMediaNote">
                          📷 {item.media.length} image{item.media.length > 1 ? "s" : ""} attached
                        </p>
                      ) : null}

                      {/* Actions */}
                      <div className="historyActions">
                        <button
                          className="secondaryButton"
                          type="button"
                          onClick={() => previewHistoryItem(item)}
                        >
                          Preview in results
                        </button>
                        <button
                          className="secondaryButton"
                          type="button"
                          disabled={!item.postText}
                          onClick={() => loadHistoryPost(item)}
                        >
                          Load source post
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Collapsed: show small copy pill */
                    <div className="historyCollapsedCopy">
                      <button
                        className={`historyInlineCopy${copyState === "copied" ? " historyInlineCopied" : ""}`}
                        type="button"
                        disabled={copyState === "copying"}
                        title={copyState === "copied" ? "Copied!" : "Copy comment"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyHistory();
                        }}
                      >
                        {copyState === "copied" ? "✓ Copied" : copyState === "failed" ? "Failed" : "Copy"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>


      {manualCopyText ? (
        <section className="panel manualCopy">
          <h2>Manual copy fallback</h2>
          <textarea readOnly value={manualCopyText} rows={4} />
        </section>
      ) : null}
    </main>
  );
}
