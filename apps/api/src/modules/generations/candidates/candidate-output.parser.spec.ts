import { ApplicationError } from '../../../common/errors/application.error';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { parseCandidates } from './candidate-output.parser';
import type { ParseCandidatesOptions } from './candidate-output.parser';
import type { StrategySlot } from './candidate.types';

const SLOTS: StrategySlot[] = [
  { slotId: 'slot_1', intent: 'react', tone: 'short_native' },
  { slotId: 'slot_2', intent: 'ask', tone: 'question_based' },
  { slotId: 'slot_3', intent: 'support', tone: 'casual_supportive' },
];

const OPTIONS: ParseCandidatesOptions = {
  slots: SLOTS,
  expectNicheDecision: false,
  length: 'short',
  energy: 'balanced',
  fallbackNiche: 'tech',
  fallbackNicheConfidence: 0.82,
  attempt: 1,
};

function candidate(slotId: string, overrides: Record<string, unknown> = {}) {
  return {
    slotId,
    text: `reply for ${slotId}`,
    referencedConcept: 'the 180ms to 40ms drop',
    selfScore: { postFit: 0.8, naturalness: 0.7, empathyFit: 0.6 },
    ...overrides,
  };
}

describe('parseCandidates', () => {
  // Doc test case 5.
  it('parses a valid payload with self scores', () => {
    const { candidates } = parseCandidates(
      JSON.stringify({
        candidates: [candidate('slot_1'), candidate('slot_2')],
      }),
      OPTIONS,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      slotId: 'slot_1',
      intent: 'react',
      tone: 'short_native',
      length: 'short',
      energy: 'balanced',
      niche: 'tech',
      nicheConfidence: 0.82,
      generationAttempt: 1,
      selfScore: { postFit: 0.8, naturalness: 0.7, empathyFit: 0.6 },
    });
    // Id theo slot, không theo vị trí trong mảng.
    expect(candidates[0].id).toBe('cand_1_slot_1');
  });

  it('leaves selfScore undefined when the model omits it entirely', () => {
    const { candidates } = parseCandidates(
      JSON.stringify({
        candidates: [candidate('slot_1', { selfScore: undefined })],
      }),
      OPTIONS,
    );

    // Phase 6 dựa vào đúng chỗ này để rơi về `rule_only` — điền 0.5 sẽ làm
    // nhánh đó không bao giờ chạy.
    expect(candidates[0].selfScore).toBeUndefined();
  });

  it('leaves selfScore undefined when every sub-field is unusable', () => {
    const { candidates } = parseCandidates(
      JSON.stringify({
        candidates: [
          candidate('slot_1', { selfScore: { postFit: 'high', foo: 1 } }),
        ],
      }),
      OPTIONS,
    );

    expect(candidates[0].selfScore).toBeUndefined();
  });

  it('keeps a partial selfScore and fills the missing sub-fields', () => {
    const { candidates } = parseCandidates(
      JSON.stringify({
        candidates: [
          candidate('slot_1', { selfScore: { postFit: 5, naturalness: -2 } }),
        ],
      }),
      OPTIONS,
    );

    expect(candidates[0].selfScore).toEqual({
      postFit: 1,
      naturalness: 0,
      empathyFit: 0.5,
    });
  });

  it('accepts snake_case aliases from the model', () => {
    const { candidates } = parseCandidates(
      JSON.stringify({
        candidates: [
          {
            slot_id: 'slot_1',
            text: 'hello',
            referenced_concept: 'the migration',
            empathy_signal: 'shares the frustration',
            self_score: { post_fit: 0.9, naturalness: 0.9, empathy_fit: 0.9 },
          },
        ],
      }),
      OPTIONS,
    );

    expect(candidates[0].referencedConcept).toBe('the migration');
    expect(candidates[0].empathySignal).toBe('shares the frustration');
    expect(candidates[0].selfScore?.postFit).toBe(0.9);
  });

  it('parses the analysis block and per-candidate meaning', () => {
    const { candidates, analysis } = parseCandidates(
      JSON.stringify({
        analysis: {
          summary: 'A latency win after a rewrite.',
          topic: 'performance',
          sentiment: 'proud',
          comment_strategy: 'Ask what dominated the old path.',
        },
        candidates: [candidate('slot_1', { meaning: 'nghĩa tiếng Việt' })],
      }),
      OPTIONS,
    );

    expect(analysis).toEqual({
      summary: 'A latency win after a rewrite.',
      topic: 'performance',
      sentiment: 'proud',
      commentStrategy: 'Ask what dominated the old path.',
    });
    expect(candidates[0].meaning).toBe('nghĩa tiếng Việt');
  });

  it('omits the analysis block when the model skips it', () => {
    const { analysis } = parseCandidates(
      JSON.stringify({ candidates: [candidate('slot_1')] }),
      OPTIONS,
    );

    expect(analysis).toBeUndefined();
  });

  it('ignores an analysis block that carries nothing usable', () => {
    const { analysis } = parseCandidates(
      JSON.stringify({
        analysis: { summary: '   ', unrelated: 5 },
        candidates: [candidate('slot_1')],
      }),
      OPTIONS,
    );

    expect(analysis).toBeUndefined();
  });

  it('repairs JSON wrapped in markdown fences', () => {
    const { candidates } = parseCandidates(
      '```json\n' +
        JSON.stringify({ candidates: [candidate('slot_1')] }) +
        '\n```',
      OPTIONS,
    );

    expect(candidates).toHaveLength(1);
  });

  it('falls back to the slot intent and tone when the model returns junk', () => {
    const { candidates } = parseCandidates(
      JSON.stringify({
        candidates: [candidate('slot_2', { intent: 'debate', tone: 'sassy' })],
      }),
      OPTIONS,
    );

    expect(candidates[0].intent).toBe('ask');
    expect(candidates[0].tone).toBe('question_based');
  });

  describe('dropping invalid candidates', () => {
    // Doc test case 10.
    it('drops a duplicate slot id and keeps the first', () => {
      const { candidates } = parseCandidates(
        JSON.stringify({
          candidates: [
            candidate('slot_1', { text: 'first' }),
            candidate('slot_1', { text: 'second' }),
          ],
        }),
        OPTIONS,
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].text).toBe('first');
    });

    it('drops a candidate with an empty referencedConcept', () => {
      const { candidates } = parseCandidates(
        JSON.stringify({
          candidates: [
            candidate('slot_1', { referencedConcept: '  ' }),
            candidate('slot_2'),
          ],
        }),
        OPTIONS,
      );

      expect(candidates.map((c) => c.slotId)).toEqual(['slot_2']);
    });

    it('drops a candidate with empty text or an unknown slot', () => {
      const { candidates } = parseCandidates(
        JSON.stringify({
          candidates: [
            candidate('slot_1', { text: '' }),
            candidate('slot_9'),
            candidate('slot_3'),
          ],
        }),
        OPTIONS,
      );

      expect(candidates.map((c) => c.slotId)).toEqual(['slot_3']);
    });

    // Doc test case 12 — lọc cliché là việc của Phase 5, không phải ở đây.
    it('lets a cliché opener through untouched', () => {
      const { candidates } = parseCandidates(
        JSON.stringify({
          candidates: [candidate('slot_1', { text: 'Great post! Love this.' })],
        }),
        OPTIONS,
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].text).toBe('Great post! Love this.');
    });
  });

  describe('niche decision', () => {
    // Doc test case 6.
    it('reads the niche decision and stamps it on every candidate', () => {
      const { candidates, resolvedNiche } = parseCandidates(
        JSON.stringify({
          niche: 'ai_ml',
          nicheConfidence: 0.83,
          candidates: [candidate('slot_1'), candidate('slot_2')],
        }),
        { ...OPTIONS, expectNicheDecision: true },
      );

      expect(resolvedNiche).toEqual({ niche: 'ai_ml', confidence: 0.83 });
      expect(candidates.every((c) => c.niche === 'ai_ml')).toBe(true);
      expect(candidates.every((c) => c.nicheConfidence === 0.83)).toBe(true);
    });

    it('treats niche: null as no decision and keeps the fallback niche', () => {
      const { candidates, resolvedNiche } = parseCandidates(
        JSON.stringify({ niche: null, candidates: [candidate('slot_1')] }),
        { ...OPTIONS, expectNicheDecision: true },
      );

      expect(resolvedNiche).toBeUndefined();
      expect(candidates[0].niche).toBe('tech');
      // Rơi về confidence của Phase 2 chứ không để trống — Phase 6 `nicheFit`
      // luôn có số để chấm.
      expect(candidates[0].nicheConfidence).toBe(0.82);
    });

    it('ignores a niche decision that was not asked for', () => {
      const { resolvedNiche } = parseCandidates(
        JSON.stringify({ niche: 'ai_ml', candidates: [candidate('slot_1')] }),
        OPTIONS,
      );

      expect(resolvedNiche).toBeUndefined();
    });
  });

  describe('payload-level failures', () => {
    it('throws AI_OUTPUT_REPAIR_FAILED on unrepairable output', () => {
      // Chuỗi rỗng là thứ `jsonrepair` thật sự bó tay. Prose kiểu
      // "not json at all" thì nó vẫn cứu được thành một JSON string hợp lệ —
      // trường hợp đó rơi vào AI_INVALID_OUTPUT bên dưới.
      expect(() => parseCandidates('   ', OPTIONS)).toThrow(ApplicationError);

      try {
        parseCandidates('   ', OPTIONS);
      } catch (error) {
        expect((error as ApplicationError).code).toBe(
          ErrorCodes.AI_OUTPUT_REPAIR_FAILED,
        );
        expect((error as ApplicationError).retryable).toBe(true);
      }
    });

    it('throws AI_INVALID_OUTPUT when the model answers in prose', () => {
      try {
        parseCandidates('not json at all <<<', OPTIONS);
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as ApplicationError).code).toBe(
          ErrorCodes.AI_INVALID_OUTPUT,
        );
      }
    });

    it('throws AI_INVALID_OUTPUT when the candidates array is missing', () => {
      try {
        parseCandidates(JSON.stringify({ result: 'ok' }), OPTIONS);
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as ApplicationError).code).toBe(
          ErrorCodes.AI_INVALID_OUTPUT,
        );
      }
    });

    it('returns an empty list rather than throwing when every candidate is invalid', () => {
      const { candidates } = parseCandidates(
        JSON.stringify({ candidates: [candidate('slot_9'), 'nonsense'] }),
        OPTIONS,
      );

      expect(candidates).toEqual([]);
    });
  });
});
