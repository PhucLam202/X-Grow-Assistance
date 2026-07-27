import type {
  CandidateVisionContext,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import type { VisionAlignment } from './validation.types';
import { normalizeForCompare, stem, stemmedTokens } from './text-normalizer';

export interface VisionAlignmentResult {
  alignment: VisionAlignment[];
  /** Có ảnh mà không candidate nào nhắc tới → cảnh báo, KHÔNG reject. */
  noneAligned: boolean;
}

/** Từ quá phổ biến để chứng minh candidate đang nói về cái ảnh. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'as',
  'by',
  'into',
  'about',
  'over',
  'after',
  'before',
  'than',
  'then',
  'there',
  'here',
  'image',
  'photo',
  'picture',
  'screenshot',
]);

/** Token phải dài hơn ngần này mới được coi là bằng chứng. */
const MIN_TOKEN_LENGTH = 4;

/**
 * Candidate có thật sự bám vào cái ảnh hay không.
 *
 * Cố tình KHÔNG reject: doc Phase 5 test case 8 nói rõ "cảnh báo, không reject".
 * Kết quả đi vào Phase 6 — `postFit`/`empathyFit` của candidate bám ảnh được
 * cộng, và diversity ranking giữ lại ít nhất một cái như vậy trong top.
 *
 * Bằng chứng lấy từ `referencedConcept` và `empathySignal` trước, rồi mới tới
 * `text`: hai field kia là chỗ model tự khai nó neo vào đâu, nên tín hiệu sạch
 * hơn cả câu reply.
 */
export function checkVisionAlignment(
  candidates: GeneratedCandidate[],
  visionContext?: CandidateVisionContext,
): VisionAlignmentResult {
  if (!visionContext) {
    return {
      alignment: candidates.map((candidate) => ({
        candidateId: candidate.id,
        aligned: false,
      })),
      noneAligned: false,
    };
  }

  const visionTokens = buildVisionTokens(visionContext);

  const alignment = candidates.map((candidate) => ({
    candidateId: candidate.id,
    aligned: isAligned(candidate, visionTokens),
  }));

  return {
    alignment,
    noneAligned:
      candidates.length > 0 && alignment.every((entry) => !entry.aligned),
  };
}

function buildVisionTokens(context: CandidateVisionContext): Set<string> {
  const blob = [
    context.summary,
    context.visibleText,
    ...(context.detectedEntities ?? []),
    context.mood,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ');

  const tokens = new Set<string>();

  for (const token of stemmedTokens(blob)) {
    if (token.length < MIN_TOKEN_LENGTH) continue;
    if (STOPWORDS.has(token)) continue;
    tokens.add(token);
  }

  return tokens;
}

function isAligned(
  candidate: GeneratedCandidate,
  visionTokens: Set<string>,
): boolean {
  if (visionTokens.size === 0) return false;

  const claimed = normalizeForCompare(
    [candidate.referencedConcept, candidate.empathySignal ?? '']
      .filter(Boolean)
      .join(' '),
  );

  const haystacks = [claimed, normalizeForCompare(candidate.text)];

  return haystacks.some((haystack) =>
    haystack
      .split(' ')
      .some(
        (token) =>
          token.length >= MIN_TOKEN_LENGTH && visionTokens.has(stem(token)),
      ),
  );
}
