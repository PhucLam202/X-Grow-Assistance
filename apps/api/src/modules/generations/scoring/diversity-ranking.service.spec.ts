import {
  DiversityRankingService,
  MAX_DIVERSITY_COST,
} from './diversity-ranking.service';
import type { ScoredCandidate } from './scoring.types';

function scored(
  id: string,
  finalScore: number,
  overrides: Partial<ScoredCandidate> = {},
): ScoredCandidate {
  return {
    id,
    slotId: id,
    // Token riêng biệt hoàn toàn theo id: fixture dùng chung một câu sẽ bị
    // chính `dropDuplicates` loại và mọi assertion về ranking thành vô nghĩa.
    text: `${id}alpha ${id}beta ${id}gamma ${id}delta ${id}epsilon ${id}zeta`,
    niche: 'crypto',
    nicheConfidence: 0.9,
    intent: 'react',
    tone: 'short_native',
    length: 'short',
    energy: 'balanced',
    referencedConcept: `concept ${id}`,
    generationAttempt: 1,
    scores: {
      postFit: 0.7,
      specificity: 0.7,
      naturalness: 0.7,
      nicheFit: 0.7,
      empathyFit: 0.7,
      conversationPotential: 0.7,
      safetyScore: 1,
      userStyleFit: 0.6,
      ruleScore: finalScore,
      finalScore,
    },
    scoringMethod: 'rule_only',
    scoreReasons: [],
    visionAligned: false,
    ...overrides,
  };
}

describe('DiversityRankingService', () => {
  const service = new DiversityRankingService();

  // Doc test case 10.
  it('returns four when four are available and sorts by final score', () => {
    const result = service.rank({
      candidates: [
        scored('a', 0.6),
        scored('b', 0.9, { intent: 'ask' }),
        scored('c', 0.7),
        scored('d', 0.8, { intent: 'add_insight' }),
      ],
      target: 4,
      hasVision: false,
    });

    expect(result.selected.map((c) => c.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  // Doc test case 11.
  it('returns three without complaining when only three exist', () => {
    const result = service.rank({
      candidates: [
        scored('a', 0.8),
        scored('b', 0.7, { intent: 'ask' }),
        scored('c', 0.6),
      ],
      target: 4,
      hasVision: false,
    });

    expect(result.selected).toHaveLength(3);
  });

  // Doc test case 7 + 8.
  it('swaps in a second intent when the cost is inside the budget', () => {
    const result = service.rank({
      candidates: [
        scored('a', 0.9),
        scored('b', 0.85),
        scored('c', 0.8),
        // Cùng điểm với `c` - 0.04 → nằm trong ngân sách 0.08.
        scored('d', 0.76, { intent: 'ask' }),
      ],
      target: 3,
      hasVision: false,
    });

    expect(result.selected.map((c) => c.id).sort()).toEqual(['a', 'b', 'd']);
    expect(new Set(result.selected.map((c) => c.intent)).size).toBe(2);
    expect(result.swaps.join(' ')).toMatch(/to add a second intent/);
  });

  // Doc test case 9.
  it('keeps the higher-scoring single-intent set when the swap costs too much', () => {
    const result = service.rank({
      candidates: [
        scored('a', 0.9),
        scored('b', 0.85),
        scored('c', 0.8),
        // 0.8 - 0.68 = 0.12 > 0.08.
        scored('d', 0.68, { intent: 'ask' }),
      ],
      target: 3,
      hasVision: false,
    });

    expect(result.selected.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.swaps.join(' ')).toMatch(/single-intent set/);
  });

  it('never pays more than the diversity budget for a swap', () => {
    const result = service.rank({
      candidates: [
        scored('a', 0.9),
        scored('b', 0.85),
        scored('c', 0.8),
        scored('d', 0.8 - MAX_DIVERSITY_COST, { intent: 'ask' }),
      ],
      target: 3,
      hasVision: false,
    });

    // Đúng bằng ngân sách vẫn được đổi (`<=`).
    expect(result.selected.map((c) => c.id)).toContain('d');
  });

  it('keeps one image-anchored reply when the post has an image', () => {
    const result = service.rank({
      candidates: [
        scored('a', 0.9),
        scored('b', 0.85, { intent: 'ask' }),
        scored('c', 0.8),
        scored('d', 0.75, { intent: 'ask', visionAligned: true }),
      ],
      target: 3,
      hasVision: true,
    });

    expect(result.selected.some((c) => c.visionAligned)).toBe(true);
    expect(result.swaps.join(' ')).toMatch(/image-anchored/);
  });

  it('does not force an image-anchored reply that costs too much', () => {
    const result = service.rank({
      candidates: [
        scored('a', 0.9),
        scored('b', 0.85, { intent: 'ask' }),
        scored('c', 0.8),
        scored('d', 0.5, { intent: 'ask', visionAligned: true }),
      ],
      target: 3,
      hasVision: true,
    });

    expect(result.selected.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops a duplicate that slipped in after a selective retry', () => {
    const text =
      'the exact same sentence appearing twice in one batch of replies';

    const result = service.rank({
      candidates: [
        scored('a', 0.9, { text }),
        scored('b', 0.85, { text, intent: 'ask' }),
        scored('c', 0.8),
        scored('d', 0.7, { intent: 'add_insight' }),
      ],
      target: 3,
      hasVision: false,
    });

    expect(result.selected.map((c) => c.id)).not.toContain('b');
    expect(result.swaps.join(' ')).toMatch(/exact duplicate/);
    expect(result.selected).toHaveLength(3);
  });

  it('handles an empty pool without throwing', () => {
    expect(
      service.rank({ candidates: [], target: 4, hasVision: true }),
    ).toEqual({ selected: [], swaps: [] });
  });
});
