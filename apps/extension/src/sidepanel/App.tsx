import { useEffect, useState } from 'react';
import {
  analyzeVisionContext,
  generateFromVisionContext,
  generateReplyPack,
  trackUsageEvent,
} from '../shared/apiClient';
import { copyTextToClipboard } from '../shared/clipboard';
import { getDeviceId } from '../shared/deviceId';
import {
  addHistoryItem,
  clearHistoryItems,
  getHistoryItems,
} from '../shared/history';
import {
  createReplyPackCacheKey,
  getCachedReplyPack,
  setCachedReplyPack,
} from '../shared/replyPackCache';
import { SELECTED_POST_STORAGE_KEY } from '../shared/types';
import {
  createVisionContextCacheKey,
  deleteCachedVisionContext,
  getCachedVisionContext,
  setCachedVisionContext,
} from '../shared/visionContextCache';
import type {
  AnalyzeVisionRequest,
  CommentFeedback,
  CommentSuggestion,
  CommentTone,
  AnalysisMode,
  ExtensionMessage,
  ExtractedPost,
  GenerateReplyPackRequest,
  HistoryItem,
  ReplyPack,
  SelectedPostResponse,
  TargetCommentLanguage,
  UsageEventName,
  VisionReplyPack,
} from '../shared/types';

type ChromeStorageChange = {
  newValue?: unknown;
};

type ChromeApi = {
  runtime?: {
    sendMessage(
      message: ExtensionMessage,
      callback?: (response: SelectedPostResponse) => void,
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
      callback?: (response: SelectedPostResponse) => void,
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

type CopyState =
  | { status: 'idle' }
  | { status: 'copying' }
  | { status: 'copied' }
  | {
      status: 'failed';
      reason:
        | 'empty_text'
        | 'clipboard_unavailable'
        | 'permission_denied'
        | 'unknown';
    };



function getCopyLabel(state: CopyState): string {
  if (state.status === 'copying') return 'Copying...';
  if (state.status === 'copied') return 'Copied';
  if (state.status === 'failed') return 'Copy failed';
  return 'Copy';
}

function getRiskHelp(suggestion: CommentSuggestion): string {
  if (suggestion.risk === 'high') return 'High-risk suggestion. Regenerate instead.';
  if (suggestion.risk === 'medium') return 'Review carefully before using.';
  return 'Low risk. Still review before sending.';
}


const defaultPostText = 'これはかなり面白いですね';

function isExtractedPost(value: unknown): value is ExtractedPost {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'platform' in value &&
      'text' in value &&
      'media' in value,
  );
}

export function App() {
  const [deviceId] = useState(() => getDeviceId());
  const [postText, setPostText] = useState(defaultPostText);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAltText, setImageAltText] = useState('');
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('text');
  const [tone, setTone] = useState<CommentTone>('short_native');
  const [targetLanguage, setTargetLanguage] =
    useState<TargetCommentLanguage>('same_as_original');
  const [replyPack, setReplyPack] = useState<ReplyPack | VisionReplyPack | null>(null);
  const [selectedPost, setSelectedPost] = useState<ExtractedPost | null>(null);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => getHistoryItems());
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<number, CopyState>>({});
  const [feedbackStates, setFeedbackStates] = useState<Record<number, CommentFeedback>>({});
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);

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
      platform: 'x',
      postUrl: details.postUrl,
      tone: details.tone ?? tone,
      niche: details.niche ?? 'auto',
      targetCommentLanguage: details.targetCommentLanguage ?? targetLanguage,
      latencyMs: details.latencyMs,
      errorMessage: details.errorMessage,
      feedback: details.feedback,
    });
  }

  function applyDetectedPost(post: ExtractedPost) {
    setSelectedPost(post);
    setPostText(post.text);
    if (post.media.length > 0) {
      const defaultMedia = post.media.slice(0, 4);
      setAnalysisMode('vision');
      setSelectedImageUrls(defaultMedia.map((item) => item.url));
      setImageUrl(defaultMedia[0]?.url ?? '');
      setImageAltText(defaultMedia[0]?.altText ?? '');
    } else {
      setSelectedImageUrls([]);
      setImageUrl('');
      setImageAltText('');
    }
    setReplyPack(null);
    setError(null);
    setCacheMessage('Post detected from X. Review it, then analyze manually.');
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setFeedbackStates({});
  }

  function detectCurrentTabPost(options: { silent?: boolean; retryAfterInject?: boolean } = {}) {
    const chromeApi = typeof chrome === 'undefined' ? undefined : chrome;
    if (!options.silent) {
      setDetectionMessage('Detecting current X post...');
    }

    if (!chromeApi?.tabs?.query || !chromeApi.tabs.sendMessage) {
      setDetectionMessage('Chrome tabs API is unavailable. Reload the extension from dist.');
      return;
    }

    const api = chromeApi;

    api.tabs!.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        setDetectionMessage('No active tab found. Focus an X tab, then try again.');
        return;
      }

      const url = activeTab.url ?? '';
      if (!url.includes('x.com') && !url.includes('twitter.com')) {
        setDetectionMessage('Active tab is not X/Twitter. Open a post on X, then try again.');
        return;
      }

      function sendDetectMessage() {
        api.tabs!.sendMessage(
          activeTab.id!,
          { type: 'XCA_DETECT_CURRENT_POST' },
          (response) => {
            const runtimeError = api.runtime?.lastError?.message;
            if (runtimeError) {
              if (!options.retryAfterInject && api.scripting?.executeScript) {
                if (!options.silent) {
                  setDetectionMessage('Injecting X detector into the current tab...');
                }

                api.scripting.executeScript(
                  {
                    target: { tabId: activeTab.id! },
                    files: ['assets/contentScript.js'],
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
                      () => detectCurrentTabPost({ ...options, retryAfterInject: true }),
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

            if (response?.post) {
              applyDetectedPost(response.post);
              setDetectionMessage('Detected current visible X post.');
              return;
            }

            setDetectionMessage(response?.error ?? 'No visible X post found. Click or scroll to a post, then retry.');
          },
        );
      }

      sendDetectMessage();
    });
  }

  useEffect(() => {
    const chromeApi = typeof chrome === 'undefined' ? undefined : chrome;
    chromeApi?.runtime?.sendMessage({ type: 'XCA_GET_SELECTED_POST' }, (response) => {
      if (response?.post) applyDetectedPost(response.post);
    });
    chromeApi?.storage?.local?.get(SELECTED_POST_STORAGE_KEY, (items) => {
      const storedPost = items[SELECTED_POST_STORAGE_KEY];
      if (isExtractedPost(storedPost)) applyDetectedPost(storedPost);
    });

    const autoDetectTimer = window.setTimeout(() => {
      detectCurrentTabPost({ silent: true });
    }, 300);

    const handleStorageChange = (
      changes: Record<string, ChromeStorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      const nextPost = changes[SELECTED_POST_STORAGE_KEY]?.newValue;
      if (isExtractedPost(nextPost)) applyDetectedPost(nextPost);
    };

    chromeApi?.storage?.onChanged?.addListener(handleStorageChange);
    return () => {
      window.clearTimeout(autoDetectTimer);
      chromeApi?.storage?.onChanged?.removeListener(handleStorageChange);
    };
  }, []);

  function persistHistory(request: GenerateReplyPackRequest, result: ReplyPack) {
    addHistoryItem(request, result);
    setHistoryItems(getHistoryItems());
  }

  async function handleGenerate(options: { refreshVisionContext?: boolean } = {}) {
    if (!postText.trim()) {
      setError('Paste post text before generating suggestions.');
      return;
    }

    const visionMedia = selectedPost?.media.length
      ? selectedPost.media
          .filter((item) => selectedImageUrls.includes(item.url))
          .slice(0, 4)
          .map((item) => ({
            type: 'image' as const,
            url: item.url,
            altText: item.altText,
          }))
      : imageUrl.trim()
        ? [
            {
              type: 'image' as const,
              url: imageUrl.trim(),
              altText: imageAltText.trim() || undefined,
            },
          ]
        : [];

    if (analysisMode === 'vision' && visionMedia.length === 0) {
      setError('Select or paste an image URL before using Text + image mode.');
      return;
    }

    const request: GenerateReplyPackRequest = {
      platform: 'x',
      postText,
      postUrl: selectedPost?.postUrl,
      targetCommentLanguage: targetLanguage,
      tone,
      niche: 'auto',
      maxSuggestions: 3,
    };
    const startedAt = performance.now();
    const shouldBypassReplyCache = Boolean(replyPack) || options.refreshVisionContext;

    setIsGenerating(true);
    setError(null);
    setCacheMessage(null);
    setDetectionMessage(null);
    setManualCopyText(null);
    setCopyStates({});
    setFeedbackStates({});
    if (replyPack) {
      trackEvent('regenerate_clicked', request);
    }
    trackEvent('analyze_started', request);

    const cacheKey =
      analysisMode === 'vision'
        ? `${createReplyPackCacheKey(request)}|vision|${visionMedia.map((item) => item.url).join(',')}`
        : createReplyPackCacheKey(request);
    const cachedReplyPack = getCachedReplyPack(cacheKey);

    if (cachedReplyPack && !shouldBypassReplyCache) {
      const latencyMs = Math.round(performance.now() - startedAt);
      setReplyPack(cachedReplyPack);
      persistHistory(request, cachedReplyPack);
      setCacheMessage('Loaded from local cache.');
      setIsGenerating(false);
      trackEvent('analyze_succeeded', { ...request, latencyMs });
      return;
    }

    try {
      let result: ReplyPack | VisionReplyPack;

      if (analysisMode === 'vision') {
        const visionRequest: AnalyzeVisionRequest = {
          post: {
            platform: 'x',
            text: postText,
            url: selectedPost?.postUrl,
            authorName: selectedPost?.authorName,
            authorHandle: selectedPost?.username,
          },
          media: visionMedia,
          options: {
            explanationLanguage: 'vi',
            targetCommentLanguage: targetLanguage,
            tone,
            niche: 'auto',
            maxSuggestions: 3,
          },
        };
        const visionContextKey = createVisionContextCacheKey(visionRequest);
        if (options.refreshVisionContext) {
          deleteCachedVisionContext(visionContextKey);
        }
        let visionContext = getCachedVisionContext(visionContextKey);

        if (!visionContext) {
          setCacheMessage('Analyzing image context...');
          visionContext = await analyzeVisionContext(visionRequest);
          setCachedVisionContext(visionContextKey, visionContext);
        } else {
          setCacheMessage('Using cached image analysis. Generating fresh comments...');
        }

        result = await generateFromVisionContext({
          post: visionRequest.post,
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
      setCacheMessage(
        options.refreshVisionContext
          ? 'Refreshed image analysis and generated fresh suggestions.'
          : shouldBypassReplyCache
            ? 'Generated fresh suggestions using cached image analysis when available.'
            : null,
      );
      trackEvent('analyze_succeeded', { ...request, latencyMs });
    } catch (requestError) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const errorMessage =
        requestError instanceof Error ? requestError.message : 'Could not generate suggestions.';
      setError(
        errorMessage,
      );
      trackEvent('analyze_failed', { ...request, latencyMs, errorMessage });
    } finally {
      setIsGenerating(false);
    }
  }

  function handleToneChange(nextTone: CommentTone) {
    setTone(nextTone);
    trackEvent('tone_changed', { tone: nextTone });
  }

  async function handleCopy(index: number, suggestion: CommentSuggestion) {
    if (suggestion.risk === 'high') {
      setCopyStates((current) => ({
        ...current,
        [index]: { status: 'failed', reason: 'unknown' },
      }));
      setManualCopyText(null);
      return;
    }

    setCopyStates((current) => ({
      ...current,
      [index]: { status: 'copying' },
    }));

    const result = await copyTextToClipboard(suggestion.text);

    if (result.ok) {
      setCopyStates((current) => ({
        ...current,
        [index]: { status: 'copied' },
      }));
      setManualCopyText(null);
      trackEvent('copy_clicked', { tone: suggestion.tone, niche: 'auto' });
      return;
    }

    setCopyStates((current) => ({
      ...current,
      [index]: { status: 'failed', reason: result.reason },
    }));
    setManualCopyText(suggestion.text);
  }

  function handleFeedback(index: number, feedback: CommentFeedback) {
    setFeedbackStates((current) => ({
      ...current,
      [index]: feedback,
    }));
    trackEvent('feedback_submitted', { feedback });
  }




  function handleRestoreHistory(item: HistoryItem) {
    setPostText(item.postText);
    setTone(item.tone);
    setTargetLanguage(item.targetCommentLanguage);
    setReplyPack(item.replyPack);
    setError(null);
    setCacheMessage('Restored from local history.');
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
      setCacheMessage('Manual image URL mode. Detected post context is no longer linked.');
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Phase 2.1 Vision Mode</p>
        <h1>X Comment Assistant</h1>
        <p className="heroText">
          Analyze text and optional post images, then generate safer native reply
          suggestions for manual copy.
        </p>
      </section>

      <section className="safetyBanner">
        This extension never sends replies automatically and never touches the X
        reply box.
      </section>

      <section className="panel">
        {selectedPost ? (
          <div className="summaryBlock">
            <h2>Post detected</h2>
            <p className="muted">
              Source: {selectedPost.source} · Images: {selectedPost.media.length}
              {selectedPost.username ? ` · ${selectedPost.username}` : ''}
            </p>
            {selectedPost.postUrl ? (
              <p className="muted">URL: {selectedPost.postUrl}</p>
            ) : null}
          </div>
        ) : (
          <p className="muted">No X post detected yet. Click a post on X or paste text manually.</p>
        )}

        <button
          className="secondaryButton detectButton"
          type="button"
          onClick={() => detectCurrentTabPost()}
        >
          Detect current X post
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

          <label className="field compact">
            <span>Analysis mode</span>
            <select
              value={analysisMode}
              onChange={(event) => setAnalysisMode(event.target.value as AnalysisMode)}
            >
              <option value="text">Text only</option>
              <option value="vision">Text + image</option>
            </select>
          </label>

          <label className="field compact">
            <span>Tone</span>
            <select
              value={tone}
              onChange={(event) => handleToneChange(event.target.value as CommentTone)}
            >
              <option value="short_native">Short native</option>
              <option value="casual_supportive">Casual supportive</option>
              <option value="question_based">Question based</option>
              <option value="insightful">Insightful</option>
            </select>
          </label>

          <label className="field compact">
            <span>Comment language</span>
            <select
              value={targetLanguage}
              onChange={(event) =>
                setTargetLanguage(event.target.value as TargetCommentLanguage)
              }
            >
              <option value="same_as_original">Same as original</option>
              <option value="ja">Japanese</option>
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
            </select>
          </label>
        </div>

        {analysisMode === 'vision' ? (
          <div className="visionPreview">
            {selectedPost?.media.length ? (
              <div className="summaryBlock">
                <h2>Detected images</h2>
                <p className="muted">Select up to 4 images for vision analysis.</p>
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
                        <img src={media.url} alt={media.altText || `Detected image ${index + 1}`} />
                        <small>
                          {selected ? 'Selected' : 'Click to select'} · image {media.photoIndex ?? index + 1}
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
                  onChange={(event) => handleManualImageChange(event.target.value)}
                  placeholder="https://pbs.twimg.com/media/..."
                />
              </label>
            )}

            {!selectedPost?.media.length ? <label className="field">
              <span>Alt text</span>
              <textarea
                value={imageAltText}
                onChange={(event) => setImageAltText(event.target.value)}
                rows={2}
                placeholder="Optional alt text from X..."
              />
            </label> : null}

            {!selectedPost?.media.length && imageUrl.trim() ? (
              <div className="imagePreviewCard">
                <img src={imageUrl.trim()} alt={imageAltText || 'Selected post media'} />
                <p className="muted">Manual image preview. Backend fetches and analyzes this image only after you click Analyze.</p>
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
            ? 'Analyzing...'
            : replyPack
              ? 'Regenerate fresh suggestions'
              : analysisMode === 'vision'
                ? 'Analyze text + image'
                : 'Generate suggestions'}
        </button>

        {analysisMode === 'vision' && selectedPost?.media.length ? (
          <button
            className="secondaryButton detectButton"
            type="button"
            disabled={isGenerating}
            onClick={() => void handleGenerate({ refreshVisionContext: true })}
          >
            Refresh visual analysis
          </button>
        ) : null}

        {error ? <p className="errorText">{error}</p> : null}
        {cacheMessage ? <p className="successText">{cacheMessage}</p> : null}
      </section>

      {replyPack ? (
        <section className="panel results">
          <div className="summaryBlock">
            <h2>Context</h2>
            <p className="contextSummary">{replyPack.summary}</p>
            <p className="contextStrategy">{replyPack.commentStrategy}</p>
          </div>

          {'analysisMode' in replyPack ? (
            <div className="visionResult">
              <div className="metaRow">
                <span className="metaBadge">Mode: {replyPack.analysisMode}</span>
                {'imageAnalysis' in replyPack && replyPack.imageAnalysis ? (
                  <span className="metaBadge">Visual tone: {replyPack.imageAnalysis.visualTone}</span>
                ) : null}
              </div>

              {'imageAnalysis' in replyPack && replyPack.imageAnalysis ? (
                <>
                  <h2>Image analysis</h2>
                  <p className="contextSummary">{replyPack.imageAnalysis.summary}</p>
                  {replyPack.imageAnalysis.visibleText ? (
                    <p className="contextDataRow"><span className="contextLabel">Visible text</span>{replyPack.imageAnalysis.visibleText}</p>
                  ) : null}
                  {replyPack.imageAnalysis.uncertainty ? (
                    <p className="contextDataRow contextDataRow--warn"><span className="contextLabel">Uncertainty</span>{replyPack.imageAnalysis.uncertainty}</p>
                  ) : null}
                </>
              ) : null}

              {'combinedContext' in replyPack ? (
                <>
                  <h2>Combined context</h2>
                  <p className="contextSummary">{replyPack.combinedContext.explanation}</p>
                  {replyPack.combinedContext.avoid.length > 0 ? (
                    <p className="contextDataRow contextDataRow--warn"><span className="contextLabel">Avoid</span>{replyPack.combinedContext.avoid.join(', ')}</p>
                  ) : null}
                </>
              ) : null}

              {'imageErrors' in replyPack && replyPack.imageErrors?.length ? (
                <p className="errorText">Image fallback: {replyPack.imageErrors.join('; ')}</p>
              ) : null}
            </div>
          ) : null}

          <div className="suggestionList">
            {replyPack.suggestions.map((suggestion, index) => {
              const copyState = copyStates[index] ?? { status: 'idle' };
              const isHighRisk = suggestion.risk === 'high';

              return (
                <article className="suggestionCard" key={`${suggestion.text}-${index}`}>
                  <div className="suggestionHeader">
                    <span className={`riskBadge ${suggestion.risk}`}>
                      {suggestion.risk}
                    </span>
                    <span className="toneBadge">{suggestion.tone}</span>
                  </div>

                  {/* ── Comment code block ── */}
                  <div className="commentBlock">
                    <pre className="commentBlockText">{suggestion.text}</pre>
                    <div className="commentBlockFooter">
                      {copyState.status === 'copied' ? (
                        <span className="commentBlockCopied">✓ Copied!</span>
                      ) : copyState.status === 'failed' && !isHighRisk ? (
                        <span className="commentBlockError">Clipboard failed — select &amp; copy manually</span>
                      ) : null}
                      <button
                        className="commentBlockCopyBtn"
                        type="button"
                        disabled={copyState.status === 'copying' || isHighRisk}
                        onClick={() => void handleCopy(index, suggestion)}
                      >
                        {isHighRisk ? '⚠ High risk' : copyState.status === 'copying' ? 'Copying…' : '⎘ Copy'}
                      </button>
                    </div>
                  </div>

                  {/* ── Vietnamese translation ── */}
                  {suggestion.meaningVi ? (
                    <p className="meaningText">{suggestion.meaningVi}</p>
                  ) : null}

                  <p className="muted">{suggestion.whyItWorks}</p>
                  <p className="riskHelp">{getRiskHelp(suggestion)}</p>

                  <div className="metaRow">
                    <span className="metaBadge">Theme: {replyPack.theme}</span>
                    <span className="metaBadge">Topic: {replyPack.topic}</span>
                  </div>

                  <div className="feedbackRow" aria-label="Suggestion feedback">
                    {(['good', 'too_generic', 'wrong_context', 'too_risky'] as const).map(
                      (feedback) => (
                        <button
                          className="feedbackButton"
                          type="button"
                          key={feedback}
                          data-selected={feedbackStates[index] === feedback}
                          onClick={() => handleFeedback(index, feedback)}
                        >
                          {feedback.replaceAll('_', ' ')}
                        </button>
                      ),
                    )}
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
                  {new Date(item.createdAt).toLocaleString()} · {item.tone} · {item.replyPack.theme}
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
