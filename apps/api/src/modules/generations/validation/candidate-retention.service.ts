import { Injectable } from '@nestjs/common';
import type { GeneratedCandidate } from '../candidates/candidate.types';
import { MIN_REPLY_COUNT } from '../types/style.types';
import type {
  DuplicatePair,
  RejectReason,
  RejectedCandidate,
} from './validation.types';

export interface RetentionInput {
  candidates: GeneratedCandidate[];
  /** candidateId → lý do bị loại bởi các filter phía trước. */
  rejects: Map<string, RejectReason[]>;
  duplicatePairs: DuplicatePair[];
}

export interface RetentionResult {
  validCandidates: GeneratedCandidate[];
  rejectedCandidates: RejectedCandidate[];
  needSelectiveRetry: boolean;
}

const REJECT_CODE_BY_METHOD = {
  exact: 'duplicate_exact',
  jaccard: 'duplicate_jaccard',
  embedding: 'duplicate_embedding',
} as const;

/**
 * Chốt xem ai ở lại.
 *
 * Trong một cặp duplicate, cái ĐƯỢC GIỮ là cái self-score cao hơn; bằng nhau
 * (hoặc không có self-score) thì giữ cái xuất hiện trước — thứ tự đó là thứ tự
 * slot, tức thứ tự chiến lược mà Phase 4 đã cố ý xếp.
 *
 * Candidate đã bị filter khác loại thì không được dùng để loại tiếp ai: nếu B
 * trùng với A mà A đã bị reject vì safety, B phải sống.
 */
@Injectable()
export class CandidateRetentionService {
  retain(input: RetentionInput): RetentionResult {
    const { candidates, duplicatePairs } = input;
    const rejects = new Map(input.rejects);
    const byId = new Map(candidates.map((c) => [c.id, c]));

    for (const pair of duplicatePairs) {
      const a = byId.get(pair.candidateAId);
      const b = byId.get(pair.candidateBId);
      if (!a || !b) continue;
      if (rejects.has(a.id) || rejects.has(b.id)) continue;

      const loser = this.pickLoser(a, b);

      rejects.set(loser.id, [
        ...(rejects.get(loser.id) ?? []),
        {
          code: REJECT_CODE_BY_METHOD[pair.method],
          detail:
            `Duplicate of ${loser.id === a.id ? b.id : a.id} ` +
            `(${pair.method} score ${pair.score}).`,
        } satisfies RejectReason,
      ]);
    }

    const validCandidates = candidates.filter((c) => !rejects.has(c.id));
    const rejectedCandidates = candidates
      .filter((c) => rejects.has(c.id))
      .map((candidate) => ({
        candidate,
        reasons: rejects.get(candidate.id) ?? [],
      }));

    return {
      validCandidates,
      rejectedCandidates,
      needSelectiveRetry: validCandidates.length < MIN_REPLY_COUNT,
    };
  }

  private pickLoser(
    a: GeneratedCandidate,
    b: GeneratedCandidate,
  ): GeneratedCandidate {
    const scoreA = mean(a);
    const scoreB = mean(b);

    // `>` không phải `>=`: bằng điểm thì b thua, tức a (đứng trước) được giữ.
    return scoreB > scoreA ? a : b;
  }
}

function mean(candidate: GeneratedCandidate): number {
  const score = candidate.selfScore;
  if (!score) return 0;
  return (score.postFit + score.naturalness + score.empathyFit) / 3;
}
