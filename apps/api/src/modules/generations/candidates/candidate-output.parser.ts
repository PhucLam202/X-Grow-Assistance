import { Logger } from '@nestjs/common';
import { jsonrepair } from 'jsonrepair';
import { ApplicationError } from '../../../common/errors/application.error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { isNiche } from '../types/niche.types';
import { isCommentIntent, isTone } from '../types/style.types';
import type { EnergyLevel, ReplyLength } from '../types/style.types';
import type {
  CandidateAnalysis,
  CandidateNicheDecision,
  CandidateSelfScore,
  GeneratedCandidate,
  StrategySlot,
} from './candidate.types';

export interface ParseCandidatesOptions {
  slots: StrategySlot[];
  expectNicheDecision: boolean;
  length: ReplyLength;
  energy: EnergyLevel;
  /** Niche mặc định khi model không chốt hoặc chốt sai. */
  fallbackNiche: GeneratedCandidate['niche'];
  /** Confidence của Phase 2, dùng khi model không chốt lại niche. */
  fallbackNicheConfidence: number;
  /** Lần gọi thứ mấy — 1 là call chính, 2 là selective retry. */
  attempt: number;
}

export interface ParsedCandidates {
  candidates: GeneratedCandidate[];
  analysis?: CandidateAnalysis;
  resolvedNiche?: CandidateNicheDecision;
}

type RawRecord = Record<string, unknown>;

const logger = new Logger('CandidateOutputParser');

/** ponytail: 400 ký tự đầu + cuối đủ để thấy JSON bị cắt hay model từ chối. */
function logBadOutput(reason: string, content: string): void {
  logger.warn(
    `${reason} (len=${content.length}) head=${JSON.stringify(
      content.slice(0, 400),
    )} tail=${JSON.stringify(content.slice(-200))}`,
  );
}

/**
 * Kẹp về [0, 1].
 *
 * KHÔNG tái dùng `clampScore` của `reply-pack-json.parser.ts`: hàm đó thuộc
 * thang 0–100 và có `Math.round`, nên một selfScore 0.8 hợp lệ sẽ bị làm tròn
 * thành 1 và mọi candidate trông như nhau.
 */
function clampUnitScore(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pick(raw: RawRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return undefined;
}

/**
 * Parse output của candidate call.
 *
 * Nguyên tắc: candidate hỏng thì DROP, cả payload hỏng mới THROW. Phase 6 quyết
 * định 2 candidate có đủ hay không, không phải parser.
 *
 * Đây cũng là path đầu tiên thật sự phát `AI_INVALID_OUTPUT` /
 * `AI_OUTPUT_REPAIR_FAILED` — `reply-pack-json.parser.ts` chỉ throw `Error`
 * trần nên hai code đó tồn tại trong `ErrorCodes` mà chưa ai emit.
 */
export function parseCandidates(
  content: string,
  options: ParseCandidatesOptions,
): ParsedCandidates {
  let payload: RawRecord;

  try {
    payload = JSON.parse(jsonrepair(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim())) as RawRecord;
  } catch (error) {
    logBadOutput('JSON repair failed', content);
    throw new ApplicationError(
      ErrorCodes.AI_OUTPUT_REPAIR_FAILED,
      'Candidate output could not be repaired into valid JSON.',
      true,
      502,
      error,
    );
  }

  const rawList = pick(payload, 'candidates', 'replies', 'suggestions');

  if (!Array.isArray(rawList)) {
    logBadOutput('No candidates array', content);
    throw new ApplicationError(
      ErrorCodes.AI_INVALID_OUTPUT,
      'Candidate output contains no candidates array.',
      true,
      502,
    );
  }

  const slotById = new Map(options.slots.map((slot) => [slot.slotId, slot]));
  const usedSlots = new Set<string>();
  const candidates: GeneratedCandidate[] = [];

  rawList.forEach((entry) => {
    if (typeof entry !== 'object' || entry === null) return;
    const raw = entry as RawRecord;

    const slotId = str(pick(raw, 'slotId', 'slot_id', 'slot'));
    const slot = slotById.get(slotId);
    // Slot lạ hoặc trùng: bỏ. Slot trùng là dấu hiệu model tự nhân bản một góc
    // nhìn, đúng thứ Phase 4 tồn tại để chống.
    if (!slot || usedSlots.has(slotId)) return;

    const text = str(pick(raw, 'text', 'comment', 'reply', 'content'));
    const referencedConcept = str(
      pick(raw, 'referencedConcept', 'referenced_concept', 'concept'),
    );
    if (!text || !referencedConcept) return;

    usedSlots.add(slotId);

    const rawIntent = pick(raw, 'intent');
    const rawTone = pick(raw, 'tone');
    const selfScore = readSelfScore(pick(raw, 'selfScore', 'self_score'));
    const empathySignal = str(pick(raw, 'empathySignal', 'empathy_signal'));
    const meaning = str(pick(raw, 'meaning', 'meaningVi', 'meaning_vi'));

    candidates.push({
      // Theo slotId, không theo index của rawList: model trả lệch thứ tự hoặc
      // kèm entry rác thì id vẫn ổn định và vẫn duy nhất trong một attempt.
      id: `cand_${options.attempt}_${slotId}`,
      slotId,
      text,
      niche: options.fallbackNiche,
      nicheConfidence: options.fallbackNicheConfidence,
      intent: isCommentIntent(rawIntent) ? rawIntent : slot.intent,
      tone: isTone(rawTone) ? rawTone : slot.tone,
      length: options.length,
      energy: options.energy,
      referencedConcept,
      ...(empathySignal ? { empathySignal } : {}),
      ...(meaning ? { meaning } : {}),
      ...(selfScore ? { selfScore } : {}),
      generationAttempt: options.attempt,
    });
  });

  const resolvedNiche = options.expectNicheDecision
    ? readNicheDecision(payload)
    : undefined;

  if (resolvedNiche) {
    for (const candidate of candidates) {
      candidate.niche = resolvedNiche.niche;
      candidate.nicheConfidence = resolvedNiche.confidence;
    }
  }

  const analysis = readAnalysis(payload);

  return {
    candidates,
    ...(analysis ? { analysis } : {}),
    ...(resolvedNiche ? { resolvedNiche } : {}),
  };
}

/**
 * `undefined` khi model không trả self-score gì cả — Phase 6 dùng đúng tín hiệu
 * này để rơi về `rule_only`.
 *
 * Trả 1–2 trong 3 field thì vẫn coi là "có self-score" và fill 0.5 cho phần
 * thiếu: đó là lỗi nhỏ của một lần sinh, khác hẳn với việc model bỏ hẳn khái
 * niệm tự chấm điểm.
 */
function readSelfScore(raw: unknown): CandidateSelfScore | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;

  const record = raw as RawRecord;
  const postFit = pick(record, 'postFit', 'post_fit');
  const naturalness = pick(record, 'naturalness');
  const empathyFit = pick(record, 'empathyFit', 'empathy_fit');

  const usable = [postFit, naturalness, empathyFit].some((value) =>
    Number.isFinite(typeof value === 'number' ? value : Number(value)),
  );

  if (!usable) return undefined;

  return {
    postFit: clampUnitScore(postFit, 0.5),
    naturalness: clampUnitScore(naturalness, 0.5),
    empathyFit: clampUnitScore(empathyFit, 0.5),
  };
}

/** Analysis là bonus của cùng một call: thiếu thì mất phần hiển thị, không lỗi. */
function readAnalysis(payload: RawRecord): CandidateAnalysis | undefined {
  const raw = pick(payload, 'analysis', 'postAnalysis', 'post_analysis');
  if (typeof raw !== 'object' || raw === null) return undefined;

  const record = raw as RawRecord;
  const analysis: CandidateAnalysis = {
    ...field(record, 'summary', ['summary']),
    ...field(record, 'topic', ['topic']),
    ...field(record, 'sentiment', ['sentiment']),
    ...field(record, 'translation', ['translation']),
    ...field(record, 'commentStrategy', [
      'commentStrategy',
      'comment_strategy',
    ]),
  };

  return Object.keys(analysis).length > 0 ? analysis : undefined;
}

function field(
  record: RawRecord,
  key: keyof CandidateAnalysis,
  aliases: string[],
): Partial<CandidateAnalysis> {
  const value = str(pick(record, ...aliases));
  return value ? { [key]: value } : {};
}

/**
 * `niche: null` là câu trả lời hợp lệ — nghĩa là model cũng không chốt được.
 *
 * Tìm cả trong `analysis`: prompt yêu cầu niche ở top level, nhưng dữ liệu thật
 * cho thấy model thường nhét nó cạnh các field phân tích khác. Bỏ sót chỗ đó
 * đồng nghĩa với việc rơi về `general_fallback` cho một bài post mà model đã
 * phân loại đúng.
 */
function readNicheDecision(
  payload: RawRecord,
): CandidateNicheDecision | undefined {
  const analysis = pick(payload, 'analysis', 'postAnalysis', 'post_analysis');
  const nested =
    typeof analysis === 'object' && analysis !== null
      ? (analysis as RawRecord)
      : {};

  const niche =
    pick(payload, 'niche', 'resolvedNiche', 'resolved_niche') ??
    pick(nested, 'niche', 'resolvedNiche', 'resolved_niche');

  if (!isNiche(niche)) return undefined;

  return {
    niche,
    confidence: clampUnitScore(
      pick(payload, 'nicheConfidence', 'niche_confidence') ??
        pick(nested, 'nicheConfidence', 'niche_confidence'),
      0.5,
    ),
  };
}
