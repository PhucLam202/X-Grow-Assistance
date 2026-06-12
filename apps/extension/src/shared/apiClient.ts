import type {
  AnalyzeVisionRequest,
  GenerateFromVisionContextRequest,
  GenerateReplyPackRequest,
  ReplyPack,
  UsageEventRequest,
  VisionContext,
  VisionReplyPack,
} from './types';

const API_BASE_URL = 'http://127.0.0.1:3001/api/v1';

export async function generateReplyPack(
  request: GenerateReplyPackRequest,
): Promise<ReplyPack> {
  const response = await fetch(`${API_BASE_URL}/generate-reply-pack`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Vision context API request failed with status ${response.status}`);
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

  const response = await fetch(`${API_BASE_URL}/analyze/vision/context/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sanitizedRequest),
  });

  if (!response.ok) {
    throw new Error(`Vision context comments API request failed with status ${response.status}`);
  }

  return response.json() as Promise<VisionReplyPack>;
}

export async function trackUsageEvent(event: UsageEventRequest): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Analytics must never break the core generate/copy flow.
  }
}
