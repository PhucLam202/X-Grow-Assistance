import type { GeneratedCandidate } from '../candidates/candidate.types';
import type { DuplicatePair } from './validation.types';
import { tokenize } from './text-normalizer';

/** Doc Phase 5: `Jaccard > 0.70 → duplicate`. `0.70` chẵn thì KHÔNG phải. */
export const JACCARD_DUPLICATE_THRESHOLD = 0.7;

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  return intersection / (a.size + b.size - intersection);
}

/**
 * Trùng ý ở mức từ vựng.
 *
 * Chỉ so mỗi cặp một lần và giữ nguyên thứ tự candidate — cặp `(A, B)` luôn có
 * A đứng trước, để `candidate-retention` biết cái nào là bản gốc.
 */
export function findJaccardDuplicates(
  candidates: GeneratedCandidate[],
  threshold = JACCARD_DUPLICATE_THRESHOLD,
): DuplicatePair[] {
  const tokens = candidates.map((candidate) => tokenize(candidate.text));
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const score = jaccardSimilarity(tokens[i], tokens[j]);
      if (score <= threshold) continue;

      pairs.push({
        candidateAId: candidates[i].id,
        candidateBId: candidates[j].id,
        method: 'jaccard',
        score: Number(score.toFixed(4)),
      });
    }
  }

  return pairs;
}
