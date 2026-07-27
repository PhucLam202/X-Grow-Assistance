import type { GeneratedCandidate } from '../candidates/candidate.types';
import { detectCliches } from './ai-cliche-detector';

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

function detect(candidates: GeneratedCandidate[], blocked: string[] = []) {
  return detectCliches({
    candidates,
    policyAvoidPhrases: ['To the moon'],
    userBlockedPhrases: blocked,
  });
}

describe('detectCliches', () => {
  it('rejects a global banned opener', () => {
    const result = detect([
      candidate(
        'a',
        'Great post, the latency numbers are the interesting part',
      ),
    ]);

    expect(result.rejects.get('a')?.[0].code).toBe('cliche_opener');
  });

  it('rejects an opener that came from the niche policy', () => {
    const result = detect([
      candidate('a', 'To the moon on this one, the unlock schedule is wild'),
    ]);

    expect(result.rejects.get('a')?.[0].code).toBe('cliche_opener');
  });

  it('matches openers through curly quotes and casing', () => {
    const result = detect([
      candidate('a', 'couldn’t agree more, the rewrite paid off'),
    ]);

    expect(result.rejects.get('a')?.[0].code).toBe('cliche_opener');
  });

  it('penalises the same phrase mid-sentence instead of rejecting', () => {
    const result = detect([
      candidate('a', 'The p99 drop is the real story, great post aside'),
    ]);

    expect(result.rejects.has('a')).toBe(false);
    expect(result.penalties[0]).toMatchObject({
      candidateId: 'a',
      code: 'cliche_phrase',
    });
  });

  it('rejects a user-blocked phrase wherever it appears', () => {
    const result = detect(
      [candidate('a', 'The rewrite paid off, just my two sats though')],
      ['just my two sats'],
    );

    expect(result.rejects.get('a')?.[0].code).toBe('user_blocked_phrase');
  });

  it('does not match a banned phrase inside a longer word', () => {
    // "Facts" nằm trong danh sách global; "factsheet" thì không phải nó.
    const result = detect([
      candidate('a', 'Their factsheet still lists the old p99 number'),
    ]);

    expect(result.rejects.has('a')).toBe(false);
    expect(result.penalties).toEqual([]);
  });

  it('penalises the batch when more than half share an opener', () => {
    const result = detect([
      candidate('a', 'I think the rewrite is what moved the number'),
      candidate('b', 'I think the caching layer deserves more credit'),
      candidate('c', 'The p99 drop is the part worth publishing'),
    ]);

    expect(result.batchOpenerRepeated).toBe(true);
    expect(result.penalties.map((p) => p.candidateId).sort()).toEqual([
      'a',
      'b',
    ]);
    // Penalty, không phải reject: nguyên nhân là prompt/model lặp, xoá candidate
    // không sửa được điều đó và chỉ kéo theo một retry vô ích.
    expect(result.rejects.size).toBe(0);
  });

  it('does not apply the batch rule to a sample smaller than three', () => {
    const result = detect([
      candidate('a', 'I think the rewrite moved the number'),
      candidate('b', 'I think the caching layer helped'),
    ]);

    expect(result.batchOpenerRepeated).toBe(false);
    expect(result.penalties).toEqual([]);
  });

  it('ignores rejected candidates when measuring the batch', () => {
    const result = detect([
      candidate('a', 'Great post, I think the rewrite moved it'),
      candidate('b', 'I think the caching layer helped a lot here'),
      candidate('c', 'I think the p99 number is the story'),
      candidate('d', 'The rewrite is what moved the number'),
    ]);

    // `a` bị loại vì opener; mẫu còn 3, trong đó 2 cái mở bằng "i think" →
    // 2/3 > 50%.
    expect(result.batchOpenerRepeated).toBe(true);
    expect(result.penalties.map((p) => p.candidateId).sort()).toEqual([
      'b',
      'c',
    ]);
  });
});
