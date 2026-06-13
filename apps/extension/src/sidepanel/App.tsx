import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  analyzeVisionContext,
  generateFromVisionContext,
  generateReplyPack,
  logCommentAction,
  scoreFeedSnapshot,
  scorePost,
  saveFullContext,
  submitFeedSnapshot,
  trackUsageEvent,
} from "../shared/apiClient";
import { copyTextToClipboard } from "../shared/clipboard";
import { getDeviceId } from "../shared/deviceId";
import {
  addHistoryItem,
  clearHistoryItems,
  getHistoryItems,
} from "../shared/history";
import {
  createReplyPackCacheKey,
  getCachedReplyPack,
  setCachedReplyPack,
} from "../shared/replyPackCache";
import { SELECTED_POST_STORAGE_KEY } from "../shared/types";
import { UI_LANGUAGE_STORAGE_KEY, i18n, type UiLanguage } from "../i18n";
import {
  createVisionContextCacheKey,
  deleteCachedVisionContext,
  getCachedVisionContext,
  setCachedVisionContext,
} from "../shared/visionContextCache";
import { scoreOpportunity } from "../../../../packages/opportunity-scoring/src/index";
import type {
  AnalyzeVisionRequest,
  CommentFeedback,
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
  HistoryItem,
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
>;

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

function buildPostScoreRequest(post: ExtractedPost) {
  return {
    candidate: buildPostScoreCandidate(post),
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

export function App() {
  const { t } = useTranslation();
  const [deviceId] = useState(() => getDeviceId());
  const [postText, setPostText] = useState(defaultPostText);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAltText, setImageAltText] = useState("");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("text");
  const [tone, setTone] = useState<CommentTone>("short_native");
  const [targetLanguage, setTargetLanguage] =
    useState<TargetCommentLanguage>("same_as_original");
  const [explanationLanguage, setExplanationLanguage] =
    useState<ExplanationLanguage>("vi");
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(() =>
    i18n.language === "en" ? "en" : "vi",
  );
  const [isUiLanguageMenuOpen, setIsUiLanguageMenuOpen] = useState(false);
  const [maxSuggestions, setMaxSuggestions] = useState(5);
  const [replyPack, setReplyPack] = useState<
    ReplyPack | VisionReplyPack | null
  >(null);
  const [selectedPost, setSelectedPost] = useState<ExtractedPost | null>(null);
  const [selectedPostContext, setSelectedPostContext] =
    useState<ExtractedPostContext | null>(null);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() =>
    getHistoryItems(),
  );
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
  const [persistedGeneration, setPersistedGeneration] =
    useState<PersistedGeneration | null>(null);

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

  function handleUiLanguageChange(nextLanguage: UiLanguage) {
    setUiLanguage(nextLanguage);
    setIsUiLanguageMenuOpen(false);
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
    void i18n.changeLanguage(nextLanguage);
  }

  function getUiLanguageLabel(language: UiLanguage) {
    return language === "vi" ? t("controls.vietnamese") : t("controls.english");
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

  function getSuggestionScoreTotal(suggestion: CommentSuggestion): number | undefined {
    return suggestion.score?.total;
  }

  async function persistGeneratedContent(result: ReplyPack | VisionReplyPack) {
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
        tone,
        intent: result.theme,
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
    });
    return response;
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
          parentPostUrl: selectedPost?.postUrl,
          parentTweetId: selectedPost?.tweetId,
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

      function sendDetectMessage() {
        api.tabs!.sendMessage(
          activeTab.id!,
          { type: "XCA_DETECT_CURRENT_POST" },
          (response) => {
            const runtimeError = api.runtime?.lastError?.message;
            if (runtimeError) {
              if (!options.retryAfterInject && api.scripting?.executeScript) {
                if (!options.silent) {
                  setDetectionMessage(
                    "Injecting X detector into the current tab...",
                  );
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
                      150,
                    );
                  },
                );
                return;
              }

              setDetectionMessage(
                `Could not reach X detector: ${runtimeError}. Refresh the X tab and reload the extension.`,
              );
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

      sendDetectMessage();
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

    let cancelled = false;
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

    void scorePost(buildPostScoreRequest(selectedPost))
      .then((result) => {
        if (cancelled) return;
        setPostScoreResult(result);
        setCacheMessage(
          `${getOpportunityLabelVi(result.score.label)} · ${formatRecommendedAction(result.score.recommendedAction)}`,
        );
        pushPostOverlayToCurrentTab(selectedPost, result.score);
      })
      .catch((scoreError) => {
        if (cancelled) return;
        setPostScoreResult(null);
        setPostScoreMessage(
          scoreError instanceof Error
            ? scoreError.message
            : "Could not score this post.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsScoringPost(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPost]);

  function persistHistory(
    request: GenerateReplyPackRequest,
    result: ReplyPack,
  ) {
    addHistoryItem(request, result);
    setHistoryItems(getHistoryItems());
  }

  async function handleGenerate(
    options: { refreshVisionContext?: boolean } = {},
  ) {
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

    if (analysisMode === "vision" && visionMedia.length === 0) {
      setError("Select or paste an image URL before using Text + image mode.");
      return;
    }

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
    const shouldBypassReplyCache =
      Boolean(replyPack) || options.refreshVisionContext;

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

    const cacheKey =
      analysisMode === "vision"
        ? `${createReplyPackCacheKey(request)}|vision|${visionMedia.map((item) => item.url).join(",")}`
        : createReplyPackCacheKey(request);
    const cachedReplyPack = getCachedReplyPack(cacheKey);

    if (cachedReplyPack && !shouldBypassReplyCache) {
      const latencyMs = Math.round(performance.now() - startedAt);
      setReplyPack(cachedReplyPack);
      persistHistory(request, cachedReplyPack);
      try {
        await persistGeneratedContent(cachedReplyPack);
        setCacheMessage("Loaded from local cache and saved to DB.");
      } catch (persistError) {
        setCacheMessage("Loaded from local cache. DB save failed; core flow still works.");
      }
      setIsGenerating(false);
      trackEvent("analyze_succeeded", { ...request, latencyMs });
      return;
    }

    try {
      let result: ReplyPack | VisionReplyPack;

      if (analysisMode === "vision") {
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
        const visionContextKey = createVisionContextCacheKey(visionRequest);
        if (options.refreshVisionContext) {
          deleteCachedVisionContext(visionContextKey);
        }
        let visionContext = getCachedVisionContext(visionContextKey);

        if (!visionContext) {
          setCacheMessage("Analyzing image context...");
          visionContext = await analyzeVisionContext(visionRequest);
          setCachedVisionContext(visionContextKey, visionContext);
        } else {
          setCacheMessage(
            "Using cached image analysis. Generating fresh comments...",
          );
        }

        result = await generateFromVisionContext({
          post: visionRequest.post,
          postContext: selectedPostContext ?? undefined,
          visionContext,
          options: visionRequest.options,
        });
      } else {
        result = await generateReplyPack(request);
      }
      const latencyMs = Math.round(performance.now() - startedAt);
      setReplyPack(result);
      setCachedReplyPack(cacheKey, result);
      persistHistory(request, result);
      let savedToDb = true;
      try {
        await persistGeneratedContent(result);
      } catch {
        savedToDb = false;
      }
      setCacheMessage(
        !savedToDb
          ? "Generated suggestions. DB save failed; core flow still works."
          : options.refreshVisionContext
          ? "Refreshed image analysis, generated fresh suggestions, and saved to DB."
          : shouldBypassReplyCache
            ? "Generated fresh suggestions using cached image analysis when available and saved to DB."
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

  function handleToneChange(nextTone: CommentTone) {
    setTone(nextTone);
    trackEvent("tone_changed", { tone: nextTone });
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

  function handleRestoreHistory(item: HistoryItem) {
    setPostText(item.postText);
    setTone(item.tone);
    setTargetLanguage(item.targetCommentLanguage);
    setReplyPack(item.replyPack);
    setError(null);
    setCacheMessage("Restored from local history.");
    setManualCopyText(null);
    setCopyStates({});
    setFeedbackStates({});
  }

  function handleClearHistory() {
    clearHistoryItems();
    setHistoryItems([]);
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
      setSelectedImageUrls([]);
      setCacheMessage(
        "Manual image URL mode. Detected post context is no longer linked.",
      );
    }
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

        <div className="controls">
          <div className="field compact languagePicker">
            <span>{t("controls.uiLanguage")}</span>
            <button
              className="secondaryButton languagePickerButton"
              type="button"
              aria-expanded={isUiLanguageMenuOpen}
              onClick={() => setIsUiLanguageMenuOpen((current) => !current)}
            >
              <span>{t("controls.chooseLanguage")}</span>
              <span>{getUiLanguageLabel(uiLanguage)}</span>
            </button>
            {isUiLanguageMenuOpen ? (
              <div className="languagePickerMenu" role="menu">
                <button
                  type="button"
                  className="languagePickerOption"
                  onClick={() => handleUiLanguageChange("vi")}
                >
                  {t("controls.vietnamese")}
                </button>
                <button
                  type="button"
                  className="languagePickerOption"
                  onClick={() => handleUiLanguageChange("en")}
                >
                  {t("controls.english")}
                </button>
              </div>
            ) : null}
          </div>

          <label className="field compact">
            <span>{t("controls.analysisMode")}</span>
            <select
              value={analysisMode}
              onChange={(event) =>
                setAnalysisMode(event.target.value as AnalysisMode)
              }
            >
              <option value="text">{t("controls.textOnly")}</option>
              <option value="vision">{t("controls.textImage")}</option>
            </select>
          </label>

          <label className="field compact">
            <span>{t("controls.tone")}</span>
            <select
              value={tone}
              onChange={(event) =>
                handleToneChange(event.target.value as CommentTone)
              }
            >
              <option value="short_native">{t("tone.short_native")}</option>
              <option value="casual_supportive">{t("tone.casual_supportive")}</option>
              <option value="question_based">{t("tone.question_based")}</option>
              <option value="insightful">{t("tone.insightful")}</option>
              <option value="funny_light">{t("tone.funny_light")}</option>
              <option value="anime_fan">{t("tone.anime_fan")}</option>
              <option value="crypto_casual">{t("tone.crypto_casual")}</option>
              <option value="football_fan">{t("tone.football_fan")}</option>
              <option value="congratulation">{t("tone.congratulation")}</option>
            </select>
          </label>

          <label className="field compact">
            <span>{t("controls.commentLanguage")}</span>
            <select
              value={targetLanguage}
              onChange={(event) =>
                setTargetLanguage(event.target.value as TargetCommentLanguage)
              }
            >
              <option value="same_as_original">{t("controls.sameAsOriginal")}</option>
              <option value="ja">{t("controls.japanese")}</option>
              <option value="en">{t("controls.english")}</option>
              <option value="vi">{t("controls.vietnamese")}</option>
            </select>
          </label>

          <label className="field compact">
            <span>{t("controls.analysisLanguage")}</span>
            <select
              value={explanationLanguage}
              onChange={(event) =>
                setExplanationLanguage(event.target.value as ExplanationLanguage)
              }
            >
              <option value="vi">{t("controls.vietnamese")}</option>
              <option value="en">{t("controls.english")}</option>
            </select>
            <small className="muted">{t("hints.analysisLanguage")}</small>
          </label>

          <label className="field compact">
            <span>{t("controls.suggestionCount")}</span>
            <select
              value={maxSuggestions}
              onChange={(event) => setMaxSuggestions(Number(event.target.value))}
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
        </div>

        {analysisMode === "vision" ? (
          <div className="visionPreview">
            {selectedPost?.media.length ? (
              <div className="summaryBlock">
                <h2>Detected images</h2>
                <p className="muted">
                  Select up to 4 images for vision analysis.
                </p>
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
                        />
                        <small>
                          {selected ? "Selected" : "Click to select"} · image{" "}
                          {media.photoIndex ?? index + 1}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <label className="field">
                <span>Image URL</span>
                <input
                  value={imageUrl}
                  onChange={(event) =>
                    handleManualImageChange(event.target.value)
                  }
                  placeholder="https://pbs.twimg.com/media/..."
                />
              </label>
            )}

            {!selectedPost?.media.length ? (
              <label className="field">
                <span>Alt text</span>
                <textarea
                  value={imageAltText}
                  onChange={(event) => setImageAltText(event.target.value)}
                  rows={2}
                  placeholder="Optional alt text from X..."
                />
              </label>
            ) : null}

            {!selectedPost?.media.length && imageUrl.trim() ? (
              <div className="imagePreviewCard">
                <img
                  src={imageUrl.trim()}
                  alt={imageAltText || "Selected post media"}
                />
                <p className="muted">
                  Manual image preview. Backend fetches and analyzes this image
                  only after you click Analyze.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          className="primaryButton"
          type="button"
          disabled={isGenerating}
          onClick={() => void handleGenerate()}
        >
          {isGenerating
            ? t("actions.analyzing")
            : replyPack
              ? t("actions.regenerate")
              : analysisMode === "vision"
                ? t("actions.analyze")
                : t("actions.generate")}
        </button>

        {analysisMode === "vision" && selectedPost?.media.length ? (
          <button
            className="secondaryButton detectButton"
            type="button"
            disabled={isGenerating}
            onClick={() => void handleGenerate({ refreshVisionContext: true })}
          >
            {t("actions.refreshVision")}
          </button>
        ) : null}

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
          <h2>Local history</h2>
          <button
            className="secondaryButton"
            type="button"
            disabled={historyItems.length === 0}
            onClick={handleClearHistory}
          >
            Clear
          </button>
        </div>

        {historyItems.length === 0 ? (
          <p className="muted">No analyzed posts saved in this browser yet.</p>
        ) : (
          <div className="historyList">
            {historyItems.slice(0, 5).map((item) => (
              <button
                className="historyItem"
                type="button"
                key={item.id}
                onClick={() => handleRestoreHistory(item)}
              >
                <span>{item.replyPack.summary}</span>
                <small>
                  {new Date(item.createdAt).toLocaleString()} · {item.tone} ·{" "}
                  {item.replyPack.theme}
                </small>
              </button>
            ))}
          </div>
        )}
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
