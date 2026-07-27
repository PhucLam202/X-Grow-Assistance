import type { GeneratedCandidate } from '../candidates/candidate.types';
import {
  JACCARD_DUPLICATE_THRESHOLD,
  findJaccardDuplicates,
  jaccardSimilarity,
} from './jaccard-duplicate-detector';
import { tokenize } from './text-normalizer';

function candidate(id: string, text: string): GeneratedCandidate {
  return {
    id,
    slotId: id,
    text,
    niche: 'tech',
    nicheConfidence: 0.9,
    intent: 'react',
    tone: 'short_native',
    length: 'short',
    energy: 'balanced',
    referencedConcept: 'the rewrite',
    generationAttempt: 1,
  };
}

describe('jaccardSimilarity', () => {
  it('is 1 for identical token sets and 0 for disjoint ones', () => {
    expect(jaccardSimilarity(tokenize('a b c'), tokenize('c b a'))).toBe(1);
    expect(jaccardSimilarity(tokenize('a b'), tokenize('c d'))).toBe(0);
  });

  it('measures overlap over the union', () => {
    // 3 chung / 5 union.
    expect(
      jaccardSimilarity(
        tokenize('one two three four'),
        tokenize('one two three five'),
      ),
    ).toBeCloseTo(0.6, 5);
  });

  it('treats two empty sets as identical and one empty set as disjoint', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
    expect(jaccardSimilarity(tokenize('a'), new Set())).toBe(0);
  });
});

describe('findJaccardDuplicates', () => {
  // Doc test case 10.
  it('flags a pair above the threshold', () => {
    const pairs = findJaccardDuplicates([
      candidate('a', 'one two three four five six seven eight nine ten'),
      candidate('b', 'one two three four five six seven eight nine eleven'),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      candidateAId: 'a',
      candidateBId: 'b',
      method: 'jaccard',
    });
    expect(pairs[0].score).toBeGreaterThan(JACCARD_DUPLICATE_THRESHOLD);
  });

  // Doc test case 11.
  it('leaves a pair at or below the threshold alone', () => {
    const pairs = findJaccardDuplicates([
      candidate('a', 'one two three four five six seven'),
      candidate('b', 'one two three four eight nine ten'),
    ]);

    expect(pairs).toEqual([]);
  });

  it('is exclusive at exactly the threshold', () => {
    // Hai set 4 phần tử, giao 2 → 2/6 = 0.3333; đặt threshold bằng đúng con số
    // đó để chứng minh `>` chứ không phải `>=`.
    const pairs = findJaccardDuplicates(
      [
        candidate('a', 'alpha beta gamma delta'),
        candidate('b', 'alpha beta epsilon zeta'),
      ],
      1 / 3,
    );

    expect(pairs).toEqual([]);
  });

  it('reports each pair once and keeps input order', () => {
    const text = 'one two three four five six seven eight nine ten';
    const pairs = findJaccardDuplicates([
      candidate('a', text),
      candidate('b', text),
      candidate('c', text),
    ]);

    expect(pairs.map((p) => [p.candidateAId, p.candidateBId])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });
});
