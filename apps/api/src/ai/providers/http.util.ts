import { Logger } from '@nestjs/common';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  AiProviderError,
  AiProviderResult,
  AiVisionInput,
  OpenAiCompatibleResponse,
} from '../ai.types';

const httpUtilLogger = new Logger('HttpUtil');

const REPLY_PACK_SYSTEM =
  'You are an assistant that returns only valid JSON for X comment reply packs. Do not add markdown or extra text.';
const VISION_SYSTEM =
  'You are a vision-capable assistant that returns only valid JSON for X post image analysis. Do not add markdown or extra text.';

type OpenAiCompatOpts = {
  maxTokens?: number;
  temperature?: number;
  extraHeaders?: Record<string, string>;
  providerName?: string;
  /**
   * Client-side timeout. Không có nó thì `fetch` treo vô hạn và
   * `AI_PROVIDER_TIMEOUT` chỉ phát khi chính server trả 504.
   */
  timeoutMs?: number;
  /** Thay system message mặc định (reply pack) cho các call có schema khác. */
  systemPrompt?: string;
};

export function classifyHttpError(
  status: number,
  providerName: string,
  sanitizedBodySnippet?: string,
): AiProviderError {
  const sanitizedCause = sanitizedBodySnippet
    ? sanitizedBodySnippet.slice(0, 200).replace(/(bearer\s+)[^\s]+/gi, '$1***')
    : undefined;

  if (status === 429) {
    return new AiProviderError(
      `Provider ${providerName} rate limited request (429)`,
      {
        providerName,
        code: ErrorCodes.AI_PROVIDER_RATE_LIMITED,
        isRetryable: true,
        statusCode: 429,
        sanitizedCause,
      },
    );
  }

  if (status === 504) {
    return new AiProviderError(`Provider ${providerName} timed out (504)`, {
      providerName,
      code: ErrorCodes.AI_PROVIDER_TIMEOUT,
      isRetryable: true,
      statusCode: 504,
      sanitizedCause,
    });
  }

  if (status === 502 || status === 503) {
    return new AiProviderError(
      `Provider ${providerName} unavailable (${status})`,
      {
        providerName,
        code: ErrorCodes.AI_PROVIDER_UNAVAILABLE,
        isRetryable: true,
        statusCode: status,
        sanitizedCause,
      },
    );
  }

  if (status === 401) {
    return new AiProviderError(
      `Provider ${providerName} authentication failed (401)`,
      {
        providerName,
        code: ErrorCodes.AI_AUTHENTICATION_FAILED,
        isRetryable: false,
        statusCode: 401,
        sanitizedCause,
      },
    );
  }

  if (status === 400) {
    return new AiProviderError(
      `Provider ${providerName} rejected request (400)`,
      {
        providerName,
        code: ErrorCodes.INVALID_POST_CONTEXT,
        isRetryable: false,
        statusCode: 400,
        sanitizedCause,
      },
    );
  }

  return new AiProviderError(
    `Provider ${providerName} failed with status ${status}`,
    {
      providerName,
      code: ErrorCodes.GENERATION_FAILED,
      isRetryable: false,
      statusCode: status,
      sanitizedCause,
    },
  );
}

async function postOpenAiJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  providerName = 'openai',
  timeoutMs?: number,
): Promise<AiProviderResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      ...(timeoutMs != null ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
  } catch (fetchError) {
    if (
      fetchError instanceof Error &&
      (fetchError.name === 'AbortError' || fetchError.name === 'TimeoutError')
    ) {
      throw new AiProviderError(`Provider ${providerName} fetch timed out`, {
        providerName,
        code: ErrorCodes.AI_PROVIDER_TIMEOUT,
        isRetryable: true,
      });
    }
    throw new AiProviderError(
      `Provider ${providerName} request failed: ${
        fetchError instanceof Error
          ? fetchError.message
          : 'Unknown network error'
      }`,
      {
        providerName,
        code: ErrorCodes.GENERATION_FAILED,
        isRetryable: false,
      },
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    const snippet = errorText.slice(0, 300);
    httpUtilLogger.warn(
      `Provider ${providerName} HTTP ${response.status}: ${snippet}`,
    );
    throw classifyHttpError(response.status, providerName, errorText);
  }

  let payload: OpenAiCompatibleResponse;
  try {
    payload = (await response.json()) as OpenAiCompatibleResponse;
  } catch {
    throw new AiProviderError(
      `Provider ${providerName} returned invalid JSON payload`,
      {
        providerName,
        code: ErrorCodes.AI_INVALID_OUTPUT,
        isRetryable: false,
      },
    );
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new AiProviderError(
      `Provider ${providerName} returned empty response content`,
      {
        providerName,
        code: ErrorCodes.AI_INVALID_OUTPUT,
        isRetryable: false,
      },
    );
  }

  const usage = payload.usage
    ? {
        inputTokens: payload.usage.prompt_tokens,
        outputTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens,
      }
    : undefined;

  return { content, usage };
}

export function postOpenAiCompat(
  url: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  opts?: OpenAiCompatOpts,
): Promise<AiProviderResult> {
  return postOpenAiJson(
    url,
    { Authorization: `Bearer ${apiKey}`, ...opts?.extraHeaders },
    {
      model,
      ...(opts?.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts?.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts?.systemPrompt ?? REPLY_PACK_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    },
    opts?.providerName ?? 'openai',
    opts?.timeoutMs,
  );
}

export function postOpenAiVision(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  images: AiVisionInput['images'],
  opts?: OpenAiCompatOpts,
): Promise<AiProviderResult> {
  return postOpenAiJson(
    url,
    { Authorization: `Bearer ${apiKey}`, ...opts?.extraHeaders },
    {
      model,
      ...(opts?.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VISION_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...images.map((img) => ({
              type: 'image_url',
              image_url: {
                url: `data:${img.contentType};base64,${img.base64}`,
                detail: 'auto',
              },
            })),
          ],
        },
      ],
    },
    opts?.providerName ?? 'openai',
    opts?.timeoutMs,
  );
}
