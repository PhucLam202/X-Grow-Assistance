import { Injectable } from '@nestjs/common';
import { MIN_REPLY_COUNT } from '../types/style.types';
import { findExactDuplicates } from '../validation/exact-duplicate-detector';
import { findJaccardDuplicates } from '../validation/jaccard-duplicate-detector';
import type { ScoredCandidate } from './scoring.types';

/** Doc Phase 6: được hy sinh tối đa `0.08` final score để đổi lấy đa dạng. */
export const MAX_DIVERSITY_COST = 0.08;

/** Số intent khác nhau tối thiểu trong kết quả trả về. */
export const MIN_DISTINCT_INTENTS = 2;

export interface RankingInput {
  candidates: ScoredCandidate[];
  /** `replyCount` người dùng nhắm tới (3 hoặc 4). */
  target: number;
  /** Có ảnh trong bài post hay không. */
  hasVision: boolean;
}

export interface RankingResult {
  selected: ScoredCandidate[];
  /** Những lần đánh đổi đã thực hiện — trace được quyết định. */
  swaps: string[];
}

/**
 * Chọn top 3–4 vừa điểm cao vừa đa dạng.
 *
 * Ba ràng buộc, xếp theo thứ tự áp dụng:
 *   1. không có duplicate (double-check, dù Phase 5 đã lọc);
 *   2. ít nhất 2 intent khác nhau;
 *   3. nếu bài post có ảnh, giữ ít nhất 1 candidate bám vào ảnh.
 *
 * Mỗi lần đổi chỉ được làm khi chênh lệch điểm ≤ `MAX_DIVERSITY_COST`. Ngưỡng
 * này là lý do "đa dạng" không bao giờ biến thành "trả về câu dở".
 */
@Injectable()
export class DiversityRankingService {
  rank(input: RankingInput): RankingResult {
    const swaps: string[] = [];

    const pool = this.dropDuplicates(
      [...input.candidates].sort(
        (a, b) => b.scores.finalScore - a.scores.finalScore,
      ),
      swaps,
    );

    const size = Math.min(input.target, pool.length);
    let selected = pool.slice(0, size);
    let bench = pool.slice(size);

    ({ selected, bench } = this.enforceIntentDiversity(selected, bench, swaps));

    if (input.hasVision) {
      ({ selected } = this.enforceVisionCoverage(selected, bench, swaps));
    }

    return {
      // Trả về theo điểm giảm dần: client hiển thị theo đúng thứ tự này.
      selected: selected.sort(
        (a, b) => b.scores.finalScore - a.scores.finalScore,
      ),
      swaps,
    };
  }

  /**
   * Phase 5 đã loại duplicate, nhưng selective retry sinh thêm candidate SAU đó
   * và chúng chỉ được validate riêng phần mới. Đây là lưới cuối.
   */
  private dropDuplicates(
    candidates: ScoredCandidate[],
    swaps: string[],
  ): ScoredCandidate[] {
    const pairs = [
      ...findExactDuplicates(candidates),
      ...findJaccardDuplicates(candidates),
    ];

    if (pairs.length === 0) return candidates;

    const dropped = new Set<string>();

    for (const pair of pairs) {
      // Danh sách đã sort theo điểm, nên cái đứng sau trong cặp là cái điểm thấp
      // hơn — bỏ nó.
      const a = candidates.findIndex((c) => c.id === pair.candidateAId);
      const b = candidates.findIndex((c) => c.id === pair.candidateBId);
      if (a === -1 || b === -1) continue;

      const loser = candidates[Math.max(a, b)];
      if (dropped.has(loser.id)) continue;

      dropped.add(loser.id);
      swaps.push(
        `Dropped ${loser.id}: ${pair.method} duplicate of ` +
          `${loser.id === pair.candidateAId ? pair.candidateBId : pair.candidateAId}.`,
      );
    }

    return candidates.filter((c) => !dropped.has(c.id));
  }

  private enforceIntentDiversity(
    selected: ScoredCandidate[],
    bench: ScoredCandidate[],
    swaps: string[],
  ): { selected: ScoredCandidate[]; bench: ScoredCandidate[] } {
    if (selected.length < MIN_REPLY_COUNT) return { selected, bench };

    const intents = new Set(selected.map((c) => c.intent));
    if (intents.size >= MIN_DISTINCT_INTENTS) return { selected, bench };

    // Cái yếu nhất trong selected là cái đáng đổi đi nhất.
    const weakest = selected[selected.length - 1];

    const replacement = bench.find(
      (candidate) =>
        candidate.intent !== weakest.intent &&
        weakest.scores.finalScore - candidate.scores.finalScore <=
          MAX_DIVERSITY_COST,
    );

    if (!replacement) {
      swaps.push(
        'Kept a single-intent set: no alternative angle was within the ' +
          `${MAX_DIVERSITY_COST} diversity budget.`,
      );
      return { selected, bench };
    }

    swaps.push(
      `Swapped ${weakest.id} for ${replacement.id} to add a second intent ` +
        `(cost ${(weakest.scores.finalScore - replacement.scores.finalScore).toFixed(3)}).`,
    );

    return {
      selected: [...selected.slice(0, -1), replacement],
      bench: bench.filter((c) => c.id !== replacement.id).concat(weakest),
    };
  }

  private enforceVisionCoverage(
    selected: ScoredCandidate[],
    bench: ScoredCandidate[],
    swaps: string[],
  ): { selected: ScoredCandidate[] } {
    if (selected.some((candidate) => candidate.visionAligned)) {
      return { selected };
    }

    const weakest = selected[selected.length - 1];
    if (!weakest) return { selected };

    const replacement = bench.find(
      (candidate) =>
        candidate.visionAligned &&
        weakest.scores.finalScore - candidate.scores.finalScore <=
          MAX_DIVERSITY_COST &&
        // Đổi vào không được phá mất ràng buộc intent vừa lo xong.
        new Set([
          ...selected.slice(0, -1).map((c) => c.intent),
          candidate.intent,
        ]).size >= Math.min(MIN_DISTINCT_INTENTS, selected.length),
    );

    if (!replacement) return { selected };

    swaps.push(
      `Swapped ${weakest.id} for ${replacement.id} to keep one image-anchored ` +
        `reply (cost ${(weakest.scores.finalScore - replacement.scores.finalScore).toFixed(3)}).`,
    );

    return { selected: [...selected.slice(0, -1), replacement] };
  }
}
