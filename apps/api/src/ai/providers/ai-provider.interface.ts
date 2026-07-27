import {
  AiProviderName,
  AiProviderResult,
  AiReplyPackInput,
  AiVisionInput,
} from '../ai.types';

export type AiStructuredCallOptions = {
  maxTokens?: number;
  temperature?: number;
  /** Client-side timeout. Không set thì fetch có thể treo vô hạn. */
  timeoutMs?: number;
};

export interface AiProvider {
  readonly name: AiProviderName;
  generateReplyPack(input: AiReplyPackInput): Promise<AiProviderResult>;
  analyzeVision?(input: AiVisionInput): Promise<AiProviderResult>;
  analyzeVisionContext?(input: AiVisionInput): Promise<AiProviderResult>;
  /**
   * Chạy một prompt đã dựng sẵn và trả JSON thô — không gắn với schema reply
   * pack. Phase 4 (candidate generation) dùng đường này vì prompt và output
   * schema của nó khác hẳn `generateReplyPack`.
   *
   * Optional: provider chỉ làm vision (openrouter) không implement, và caller
   * phải tự xử lý trường hợp thiếu thay vì giả định có.
   */
  generateStructured?(
    prompt: string,
    options?: AiStructuredCallOptions,
  ): Promise<AiProviderResult>;
}
