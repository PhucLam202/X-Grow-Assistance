import type { GeneratedCandidate } from '../candidates/candidate.types';
import { CandidateRetentionService } from './candidate-retention.service';
import type { DuplicatePair, RejectReason } from './validation.types';

function candidate(
  id: string,
  selfScore?: GeneratedCandidate['selfScore'],
): GeneratedCandidate {
  return {
    id,
    slotId: id,
    text: `reply ${id}`,
    niche: 'tech',
    nicheConfidence: 0.9,
    intent: 'react',
    tone: 'short_native',
    length: 'short',
    energy: 'balanced',
    referencedConcept: 'the rewrite',
    ...(selfScore ? { selfScore } : {}),
    generationAttempt: 1,
  };
}

function pair(a: string, b: string): DuplicatePair {
  return { candidateAId: a, candidateBId: b, method: 'jaccard', score: 0.9 };
}

describe('CandidateRetentionService', () => {
  const service = new CandidateRetentionService();

  it('keeps the higher self-scoring half of a duplicate pair', () => {
    const result = service.retain({
      candidates: [
        candidate('a', { postFit: 0.4, naturalness: 0.4, empathyFit: 0.4 }),
        candidate('b', { postFit: 0.9, naturalness: 0.9, empathyFit: 0.9 }),
        candidate('c'),
      ],
      rejects: new Map(),
      duplicatePairs: [pair('a', 'b')],
    });

    expect(result.validCandidates.map((c) => c.id)).toEqual(['b', 'c']);
    expect(result.rejectedCandidates[0].candidate.id).toBe('a');
    expect(result.rejectedCandidates[0].reasons[0].code).toBe(
      'duplicate_jaccard',
    );
  });

  it('keeps the earlier candidate when self-scores tie or are absent', () => {
    const result = service.retain({
      candidates: [candidate('a'), candidate('b'), candidate('c')],
      rejects: new Map(),
      duplicatePairs: [pair('a', 'b')],
    });

    // Thứ tự input là thứ tự slot — tức thứ tự chiến lược của Phase 4.
    expect(result.validCandidates.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('does not let an already-rejected candidate eliminate anyone', () => {
    const rejects = new Map<string, RejectReason[]>([
      ['a', [{ code: 'niche_safety', detail: 'unsafe' }]],
    ]);

    const result = service.retain({
      candidates: [candidate('a'), candidate('b'), candidate('c')],
      rejects,
      duplicatePairs: [pair('a', 'b')],
    });

    expect(result.validCandidates.map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('flags a retry when fewer than three survive', () => {
    const result = service.retain({
      candidates: [candidate('a'), candidate('b'), candidate('c')],
      rejects: new Map([['c', [{ code: 'missing_text', detail: 'empty' }]]]),
      duplicatePairs: [],
    });

    expect(result.validCandidates).toHaveLength(2);
    expect(result.needSelectiveRetry).toBe(true);
  });

  it('does not mutate the rejects map it was given', () => {
    const rejects = new Map<string, RejectReason[]>();

    service.retain({
      candidates: [candidate('a'), candidate('b')],
      rejects,
      duplicatePairs: [pair('a', 'b')],
    });

    expect(rejects.size).toBe(0);
  });
});
