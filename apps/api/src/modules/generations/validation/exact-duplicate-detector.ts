import type { GeneratedCandidate } from '../candidates/candidate.types';
import type { DuplicatePair } from './validation.types';
import { normalizeForCompare } from './text-normalizer';

/**
 * Trùng khít sau khi chuẩn hoá (lowercase, bỏ dấu câu/emoji/khoảng trắng).
 *
 * `score: 1` là hằng số đúng nghĩa ở đây, không phải giá trị đo được: hai chuỗi
 * đã bằng nhau thì không có gì để đo.
 */
export function findExactDuplicates(
  candidates: GeneratedCandidate[],
): DuplicatePair[] {
  const seen = new Map<string, string>();
  const pairs: DuplicatePair[] = [];

  for (const candidate of candidates) {
    const key = normalizeForCompare(candidate.text);
    if (!key) continue;

    const firstId = seen.get(key);

    if (firstId) {
      pairs.push({
        candidateAId: firstId,
        candidateBId: candidate.id,
        method: 'exact',
        score: 1,
      });
      continue;
    }

    seen.set(key, candidate.id);
  }

  return pairs;
}
