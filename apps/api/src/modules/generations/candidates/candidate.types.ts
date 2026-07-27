import type { AiExecutionMetadata } from '../../../ai/ai.types';
import type { AiProvider } from '../../../ai/providers/ai-provider.interface';
import type { VisionContext } from '../../../vision/types/vision.types';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import type { NicheDetectionResult } from '../niche/niche.types';
import type { Niche } from '../types/niche.types';
import type {
  CommentIntent,
  CommentIntentSelection,
  EmojiLevel,
  EnergyLevel,
  ReplyCount,
  ReplyLanguage,
  ReplyLength,
  Tone,
  ToneSelection,
} from '../types/style.types';

/**
 * `v2`: output schema thêm block `analysis` (summary/topic/sentiment/
 * translation) và field `meaning` per-candidate, đồng thời RULES nói con số
 * word/emoji thật thay vì tên band. Cùng một call — không thêm LLM call nào.
 */
export const CANDIDATE_PROMPT_VERSION = 'candidate:v2';

/** Timeout cho candidate call. Hằng số, không phải env knob — `ai.config.ts`
 * chưa có khái niệm timeout và phase này không mở rộng surface config. */
export const CANDIDATE_TIMEOUT_MS = 30_000;

export const MAX_RETRY_ATTEMPTS = 1;

/**
 * Vision context đã chuẩn hoá cho prompt sinh candidate.
 *
 * Doc Phase 4 viết `detectedEntities`/`mood`, nhưng `VisionContext` thật không
 * có hai field đó — chúng được map từ `imageAnalysis.importantObjects` và
 * `imageAnalysis.visualTone`. Xem `toCandidateVisionContext`.
 */
export interface CandidateVisionContext {
  summary: string;
  detectedEntities?: string[];
  mood?: string;
  visibleText?: string;
  /** `combinedContext.avoid` — chủ đề vision analysis đã bảo là nên tránh. */
  avoid?: string[];
}

export interface CandidatePostContext {
  text?: string;
  quotedPostText?: string;
  threadContext?: string[];
  language: string;
  /**
   * Sắc thái của bài post. Nguồn: `VisionContext.sentiment` khi vision chạy,
   * hoặc `analysis.sentiment` mà chính candidate call trả về ở request trước
   * (cache). Phase 6 `empathyFit` đối chiếu `empathySignal` với field này —
   * thiếu nó thì empathy chỉ còn đoán từ text.
   */
  sentiment?: string;
}

export interface CandidateUserStyle {
  preferredTones?: Tone[];
  blockedPhrases?: string[];
  preferredLength?: ReplyLength;
  /**
   * Doc Phase 4 khai báo field này nhưng codebase chưa có nguồn nào sinh ra nó
   * (`UserMemory` chỉ có preferredTones/blockedPhrases/styleNotes). Giữ optional
   * để không phải đổi contract khi có nguồn thật.
   */
  styleExamples?: string[];
}

export interface CandidateGenerationOptions {
  replyCount: ReplyCount;
  length: ReplyLength;
  energy: EnergyLevel;
  language: ReplyLanguage;
  emojiLevel: EmojiLevel;
  /** Tone/intent user chọn tay; `'auto'` nghĩa là để slot mặc định quyết định. */
  tone: ToneSelection;
  intent: CommentIntentSelection;
  /** Ngôn ngữ của `candidate.meaning` và `analysis.translation`. */
  explanationLanguage: 'en' | 'vi';
}

export interface CandidateGenerationInput {
  postContext: CandidatePostContext;
  visionContext?: CandidateVisionContext;
  nicheResult: NicheDetectionResult;
  /**
   * `ResolvedNichePolicy extends NichePolicy`, nên vẫn khớp chỗ doc Phase 4 khai
   * báo `nichePolicy: NichePolicy`, mà thêm được `provisional`/`degraded` —
   * hai cờ quyết định prompt có yêu cầu model tự chốt niche hay không.
   */
  nichePolicy: ResolvedNichePolicy;
  userStyle?: CandidateUserStyle;
  options: CandidateGenerationOptions;
}

export interface StrategySlot {
  slotId: string;
  intent: CommentIntent;
  tone: Tone;
}

export interface CandidateSelfScore {
  postFit: number;
  naturalness: number;
  empathyFit: number;
}

export interface GeneratedCandidate {
  id: string;
  slotId: string;
  text: string;
  niche: Niche;
  /** Luôn có số: `resolvedNiche.confidence` nếu model chốt niche, ngược lại
   * confidence của Phase 2. Phase 6 `nicheFit` không phải xử lý undefined. */
  nicheConfidence: number;
  intent: CommentIntent;
  tone: Tone;
  length: ReplyLength;
  energy: EnergyLevel;
  /** Bắt buộc non-empty — candidate không neo vào chi tiết thật bị loại. */
  referencedConcept: string;
  empathySignal?: string;
  /** Bản dịch của `text` sang `options.explanationLanguage`. Model không trả
   * thì bỏ trống — không có LLM call thứ hai để dịch bù. */
  meaning?: string;
  /**
   * `undefined` nghĩa là model KHÔNG trả self-score, không phải "trả 0.5".
   * Phase 6 dựa vào đúng sự phân biệt này để chọn giữa `rule_only` và
   * `rule_plus_self_score`.
   */
  selfScore?: CandidateSelfScore;
  generationAttempt: number;
}

export interface CandidateNicheDecision {
  niche: Niche;
  confidence: number;
}

/**
 * Ngữ cảnh bài post mà cùng một call đã đọc xong — thu về đây thay vì gọi một
 * prompt phân tích riêng. Mọi field optional: model bỏ sót thì response mất
 * phần hiển thị đó, không phải lỗi.
 */
export interface CandidateAnalysis {
  summary?: string;
  topic?: string;
  sentiment?: string;
  /** Bản dịch bài post sang `options.explanationLanguage`. */
  translation?: string;
  commentStrategy?: string;
}

export interface CandidateGenerationResult {
  candidates: GeneratedCandidate[];
  analysis?: CandidateAnalysis;
  /** Chỉ có khi `nicheResult.needsGenerationTimeClassification = true`. */
  resolvedNiche?: CandidateNicheDecision;
  execution: AiExecutionMetadata;
  /**
   * Slot đã yêu cầu và provider đã dùng — pipeline cần cả hai để chạy selective
   * retry SAU validation. Retry không còn nằm trong service này: chỉ pipeline
   * biết được sau khi lọc thì còn mấy candidate hợp lệ.
   */
  slots: StrategySlot[];
  provider: AiProvider;
}

/**
 * Làm phẳng `VisionContext` thật thành shape prompt cần.
 *
 * Khác `GenerationOrchestrator.buildVisionText()` — hàm đó cố tình bỏ
 * `visualTone` và `commentStrategy` vì chúng sẽ làm lệch niche detection. Ở đây
 * thì ngược lại: mood và danh sách `avoid` chính là thứ giúp candidate bám đúng
 * sắc thái của ảnh, nên được giữ lại.
 */
export function toCandidateVisionContext(
  context?: VisionContext,
): CandidateVisionContext | undefined {
  if (!context || context.analysisMode === 'text_only_fallback') {
    return undefined;
  }

  const analysis = context.imageAnalysis;
  const summary = analysis?.summary?.trim() || context.summary?.trim() || '';

  if (!summary) return undefined;

  const entities = analysis?.importantObjects?.filter(Boolean) ?? [];
  const avoid = context.combinedContext?.avoid?.filter(Boolean) ?? [];
  const mood = analysis?.visualTone?.trim() || context.sentiment?.trim();
  const visibleText = analysis?.visibleText?.trim();

  return {
    summary,
    ...(entities.length > 0 ? { detectedEntities: entities } : {}),
    ...(mood ? { mood } : {}),
    ...(visibleText ? { visibleText } : {}),
    ...(avoid.length > 0 ? { avoid } : {}),
  };
}
