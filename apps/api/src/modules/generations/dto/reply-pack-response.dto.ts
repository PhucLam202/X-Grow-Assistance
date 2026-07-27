import { ReplyAnalysisDto } from './reply-analysis.dto';
import type {
  CommentIntent,
  EnergyLevel,
  ReplyLength,
} from '../types/style.types';

/**
 * Thang 0–100 của contract cũ. Extension đọc `score.total` như field bắt buộc
 * và render `{total}/100`, nên shape này KHÔNG được đổi — `CandidateScoresDto`
 * bên dưới là chỗ chứa thang 0–1 đầy đủ của Phase 6.
 */
export class SuggestionScoreDto {
  total: number;
  postFit: number;
  visibility: number;
  specificity: number;
  native: number;
  engagementHook: number;
}

/** Điểm Phase 6 nguyên bản, thang 0–1. Additive — client cũ bỏ qua được. */
export class CandidateScoresDto {
  postFit: number;
  specificity: number;
  naturalness: number;
  nicheFit: number;
  empathyFit: number;
  conversationPotential: number;
  safetyScore: number;
  userStyleFit: number;
  ruleScore: number;
  /** Vắng mặt nghĩa là model không tự chấm điểm — không phải 0. */
  modelSelfScore?: number;
  finalScore: number;
  scoringMethod: 'rule_only' | 'rule_plus_self_score';
}

export class SuggestionDto {
  suggestionId: string;
  text: string;
  meaningVi?: string;
  whyItWorks?: string;
  score: SuggestionScoreDto;
  risk: 'low' | 'medium' | 'high';
  tone: string;
  niche: string;

  /** Được điền từ Phase 4 trở đi; Phase 1 chỉ mở contract. */
  intent?: CommentIntent;
  length?: ReplyLength;
  energy?: EnergyLevel;

  /** Phase 6. */
  scores?: CandidateScoresDto;

  /** Chi tiết cụ thể trong bài post mà reply này neo vào (Phase 4). */
  referencedConcept?: string;
}

/** Số liệu của pipeline Phase 4–6 cho một request. */
export class PipelineMetadataDto {
  /** Bao nhiêu candidate được sinh ra trước khi lọc. */
  generated: number;
  rejected: number;
  duplicates: number;
  /** Selective retry đã được GỌI hay chưa (không phải "có thêm được candidate"). */
  retryUsed: boolean;
  scoringMethod: 'rule_only' | 'rule_plus_self_score' | 'mixed';
}

export class GenerationMetadataDto {
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  fallbackUsed: boolean;

  pipeline?: PipelineMetadataDto;
}

export class ReplyPackResponse {
  generationRunId: string;

  requestId?: string;

  analysisMode: 'text' | 'vision' | 'text_only_fallback';

  analysis?: ReplyAnalysisDto;

  detectedLanguage?: string;
  translation?: string;
  summary?: string;
  context?: string;
  theme?: string;
  topic?: string;
  sentiment?: string;
  commentStrategy?: string;

  suggestions: SuggestionDto[];

  metadata: GenerationMetadataDto;

  warnings?: string[];
}

export { ReplyAnalysisDto };
