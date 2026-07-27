import type { ScoredCandidate } from '../scoring/scoring.types';
import { toSuggestionDto } from './scored-candidate.mapper';

function scored(overrides: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    id: 'cand_1_slot_1',
    slotId: 'slot_1',
    text: 'Were the stuck withdrawals reachable through the escape hatch?',
    meaning: 'Rút tiền có đi qua được escape hatch không?',
    niche: 'crypto',
    nicheConfidence: 0.9,
    intent: 'ask',
    tone: 'question_based',
    length: 'short',
    energy: 'balanced',
    referencedConcept: 'the stuck withdrawals',
    generationAttempt: 1,
    scores: {
      postFit: 0.82,
      specificity: 0.7,
      naturalness: 0.75,
      nicheFit: 0.64,
      empathyFit: 0.6,
      conversationPotential: 0.9,
      safetyScore: 1,
      userStyleFit: 0.6,
      ruleScore: 0.74,
      modelSelfScore: 0.8,
      finalScore: 0.755,
    },
    scoringMethod: 'rule_plus_self_score',
    scoreReasons: ['Conversation potential is strong (0.90).'],
    visionAligned: false,
    ...overrides,
  };
}

describe('toSuggestionDto', () => {
  const options = { generationRunId: 'run-1', penalties: [] };

  /**
   * Contract với extension: `App.tsx` đọc `s.score.total` như field bắt buộc và
   * render `{total}/100`. Bài test này là thứ chặn việc "dọn dẹp" shape cũ.
   */
  it('keeps the legacy 0-100 score shape', () => {
    const dto = toSuggestionDto(scored(), 0, options);

    expect(dto.score).toEqual({
      total: 76,
      postFit: 82,
      visibility: 64,
      specificity: 70,
      native: 75,
      engagementHook: 90,
    });
  });

  it('adds the Phase 6 scores alongside, on the 0-1 scale', () => {
    const dto = toSuggestionDto(scored(), 0, options);

    expect(dto.scores).toMatchObject({
      finalScore: 0.755,
      modelSelfScore: 0.8,
      scoringMethod: 'rule_plus_self_score',
    });
  });

  it('omits modelSelfScore when the model did not self-score', () => {
    const candidate = scored();
    const dto = toSuggestionDto(
      {
        ...candidate,
        scores: { ...candidate.scores, modelSelfScore: undefined },
        scoringMethod: 'rule_only',
      },
      0,
      options,
    );

    expect(dto.scores).not.toHaveProperty('modelSelfScore');
    expect(dto.scores?.scoringMethod).toBe('rule_only');
  });

  it('numbers suggestionIds from the generation run', () => {
    expect(toSuggestionDto(scored(), 2, options).suggestionId).toBe('run-1-3');
  });

  it('carries meaning into meaningVi and the top reason into whyItWorks', () => {
    const dto = toSuggestionDto(scored(), 0, options);

    expect(dto.meaningVi).toBe('Rút tiền có đi qua được escape hatch không?');
    expect(dto.whyItWorks).toBe('Conversation potential is strong (0.90).');
  });

  it('leaves meaningVi out when the model returned no translation', () => {
    const dto = toSuggestionDto(scored({ meaning: undefined }), 0, options);

    expect(dto).not.toHaveProperty('meaningVi');
  });

  it('reports low risk for a clean candidate and medium for a soft safety flag', () => {
    expect(toSuggestionDto(scored(), 0, options).risk).toBe('low');

    const flagged = toSuggestionDto(scored(), 0, {
      generationRunId: 'run-1',
      penalties: [
        {
          candidateId: 'cand_1_slot_1',
          code: 'niche_safety_soft',
          detail: 'downplays risk',
        },
      ],
    });

    expect(flagged.risk).toBe('medium');
  });

  it('never reports high risk — those candidates were already rejected', () => {
    const candidate = scored();
    const dto = toSuggestionDto(
      { ...candidate, scores: { ...candidate.scores, safetyScore: 0 } },
      0,
      options,
    );

    expect(dto.risk).toBe('medium');
  });

  it('passes through the style dimensions the extension can display', () => {
    const dto = toSuggestionDto(scored(), 0, options);

    expect(dto).toMatchObject({
      tone: 'question_based',
      niche: 'crypto',
      intent: 'ask',
      length: 'short',
      energy: 'balanced',
      referencedConcept: 'the stuck withdrawals',
    });
  });
});
