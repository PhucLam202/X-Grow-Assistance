import { NichePolicyResolver } from '../niche/niche-policy.resolver';
import { resetNichePolicies } from '../niche/niche-policy.registry';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import type { GeneratedCandidate } from '../candidates/candidate.types';
import { CandidateRetentionService } from './candidate-retention.service';
import { CandidateValidatorService } from './candidate-validator.service';
import { FactualityFilterService } from './factuality-filter.service';
import { SafetyFilterService } from './safety-filter.service';
import type { CandidateValidationInput } from './validation.types';

const POST =
  'Base sequencer went down for 40 minutes this morning. Zero funds lost but withdrawals were stuck.';

/** 12 từ — nằm giữa band `short` (6–24). */
const GOOD_TEXT =
  'The stuck withdrawals matter more here than the downtime itself does, honestly';

function candidate(
  overrides: Partial<GeneratedCandidate> = {},
): GeneratedCandidate {
  return {
    id: overrides.id ?? 'cand_1_slot_1',
    slotId: 'slot_1',
    text: GOOD_TEXT,
    niche: 'crypto',
    nicheConfidence: 0.9,
    intent: 'add_insight',
    tone: 'insightful',
    length: 'short',
    energy: 'balanced',
    referencedConcept: 'the stuck withdrawals',
    selfScore: { postFit: 0.8, naturalness: 0.8, empathyFit: 0.7 },
    generationAttempt: 1,
    ...overrides,
  };
}

describe('CandidateValidatorService', () => {
  let policy: ResolvedNichePolicy;

  function makeValidator() {
    return new CandidateValidatorService(
      new SafetyFilterService(),
      new FactualityFilterService(),
      new CandidateRetentionService(),
    );
  }

  function input(
    candidates: GeneratedCandidate[],
    overrides: Partial<CandidateValidationInput> = {},
  ): CandidateValidationInput {
    return {
      postContext: { text: POST, language: 'en' },
      nichePolicy: policy,
      userBlockedPhrases: [],
      constraints: { length: 'short', emojiLevel: 'none' },
      candidates,
      ...overrides,
    };
  }

  /** Ba candidate hợp lệ, khác nhau về từ vựng — nền để thêm cái thứ tư vào. */
  function threeGood(): GeneratedCandidate[] {
    return [
      candidate({ id: 'a' }),
      candidate({
        id: 'b',
        slotId: 'slot_2',
        intent: 'ask',
        text: 'Was the escape hatch usable while the sequencer was still offline, or only after?',
        referencedConcept: 'the escape hatch',
      }),
      candidate({
        id: 'c',
        slotId: 'slot_3',
        intent: 'support',
        text: 'Zero funds lost through all of that is the part worth publishing loudly',
        referencedConcept: 'zero funds lost',
      }),
    ];
  }

  beforeEach(() => {
    resetNichePolicies();
    policy = new NichePolicyResolver().resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.9,
      needsGenerationTimeClassification: false,
    });
  });

  afterAll(() => {
    resetNichePolicies();
  });

  it('keeps a batch of valid, distinct candidates', async () => {
    const result = await makeValidator().validate(input(threeGood()));

    expect(result.validCandidates).toHaveLength(3);
    expect(result.rejectedCandidates).toHaveLength(0);
    expect(result.needSelectiveRetry).toBe(false);
  });

  // Doc test case 1.
  it('rejects an empty text and an empty referencedConcept', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({ id: 'empty_text', text: '   ' }),
        candidate({ id: 'no_concept', referencedConcept: '' }),
      ]),
    );

    expect(reasonsFor(result, 'empty_text')).toContain('missing_text');
    expect(reasonsFor(result, 'no_concept')).toContain(
      'missing_referenced_concept',
    );
  });

  it('rejects a referencedConcept that names nothing concrete', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({ id: 'generic', referencedConcept: 'the post' }),
      ]),
    );

    expect(reasonsFor(result, 'generic')).toContain(
      'generic_referenced_concept',
    );
  });

  // Doc test case 2.
  it('rejects a reply outside the word band', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({ id: 'tiny', text: 'Rough one' }),
        candidate({
          id: 'huge',
          text: Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '),
        }),
      ]),
    );

    expect(reasonsFor(result, 'tiny')).toContain('length_out_of_band');
    expect(reasonsFor(result, 'huge')).toContain('length_out_of_band');
  });

  // Doc test case 3.
  it('rejects emoji above the level and accepts a composed emoji at minimal', async () => {
    const withEmoji = candidate({
      id: 'emoji',
      slotId: 'slot_4',
      // Khác hẳn `GOOD_TEXT` để bài test này chỉ đo emoji, không vướng
      // duplicate — `normalizeForCompare` bỏ emoji nên cùng câu + emoji sẽ là
      // exact duplicate.
      text: 'Publishing the sequencer timeline afterwards would settle most of the questions here 👍🏽',
      referencedConcept: 'the sequencer timeline',
    });

    const rejected = await makeValidator().validate(
      input([...threeGood(), withEmoji]),
    );
    expect(reasonsFor(rejected, 'emoji')).toContain('emoji_over_limit');

    // Emoji ghép (base + skin tone) là MỘT emoji, nên `minimal` phải nhận.
    const accepted = await makeValidator().validate(
      input([...threeGood(), withEmoji], {
        constraints: { length: 'short', emojiLevel: 'minimal' },
      }),
    );
    expect(accepted.validCandidates.map((c) => c.id)).toContain('emoji');
  });

  // Doc test case 4.
  it('rejects a user-blocked phrase anywhere in the reply', async () => {
    const result = await makeValidator().validate(
      input(
        [
          ...threeGood(),
          candidate({
            id: 'blocked',
            text: 'Honestly just my two sats but the stuck withdrawals are the real story here',
          }),
        ],
        { userBlockedPhrases: ['just my two sats'] },
      ),
    );

    expect(reasonsFor(result, 'blocked')).toContain('user_blocked_phrase');
  });

  // Doc test case 5.
  it('rejects a clichéd opener and only penalises the same phrase mid-sentence', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({
          id: 'opener',
          text: 'Great post — the stuck withdrawals are the part that actually matters today',
        }),
        candidate({
          id: 'mid',
          text: 'The stuck withdrawals matter here, and well said on shipping the postmortem',
        }),
      ]),
    );

    expect(reasonsFor(result, 'opener')).toContain('cliche_opener');
    expect(result.validCandidates.map((c) => c.id)).toContain('mid');
    expect(result.penalties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: 'mid', code: 'cliche_phrase' }),
      ]),
    );
  });

  // Doc test case 6.
  it('rejects invented specifics that appear nowhere in the context', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({
          id: 'fabricated',
          text: 'I lost 12000 dollars in the very same outage on Arbitrum last summer, brutal',
        }),
      ]),
    );

    expect(reasonsFor(result, 'fabricated')).toContain('fabricated_specifics');
  });

  it('keeps a number that the post itself already stated', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({
          id: 'grounded',
          text: 'Those 40 minutes with withdrawals stuck is the number worth publishing here',
        }),
      ]),
    );

    expect(result.validCandidates.map((c) => c.id)).toContain('grounded');
  });

  // Doc test case 7.
  it('rejects a crypto reply that promises returns', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({
          id: 'shill',
          text: 'Outages aside this is guaranteed profits over the next cycle, easy money here',
        }),
      ]),
    );

    expect(reasonsFor(result, 'shill')).toEqual(
      expect.arrayContaining([expect.stringMatching(/safety/)]),
    );
  });

  // Doc test case 8.
  it('warns but does not reject when no reply engages the image', async () => {
    const result = await makeValidator().validate(
      input(threeGood(), {
        visionContext: {
          summary:
            'A grafana dashboard showing a flatlined block production chart.',
          detectedEntities: ['grafana dashboard', 'block production chart'],
        },
      }),
    );

    expect(result.validCandidates).toHaveLength(3);
    expect(result.warnings.map((w) => w.code)).toContain(
      'vision_not_referenced',
    );
    expect(result.visionAlignment.every((entry) => !entry.aligned)).toBe(true);
  });

  it('marks the candidate that does engage the image as aligned', async () => {
    const result = await makeValidator().validate(
      input(
        [
          ...threeGood(),
          candidate({
            id: 'image_aware',
            text: 'That flatlined block production chart says more than the status page did',
            referencedConcept: 'the block production chart',
          }),
        ],
        {
          visionContext: {
            summary:
              'A grafana dashboard showing a flatlined block production chart.',
            detectedEntities: ['grafana dashboard', 'block production chart'],
          },
        },
      ),
    );

    expect(
      result.visionAlignment.find((e) => e.candidateId === 'image_aware')
        ?.aligned,
    ).toBe(true);
    expect(result.warnings.map((w) => w.code)).not.toContain(
      'vision_not_referenced',
    );
  });

  // Doc test case 9.
  it('rejects an exact duplicate and keeps the original', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        // Chỉ khác dấu câu và chữ hoa — chuẩn hoá xong là trùng khít.
        candidate({
          id: 'copy',
          slotId: 'slot_4',
          text: `${GOOD_TEXT.toUpperCase()}!!!`,
        }),
      ]),
    );

    expect(result.validCandidates.map((c) => c.id)).toContain('a');
    expect(reasonsFor(result, 'copy')).toContain('duplicate_exact');
    expect(result.duplicatePairs).toEqual([
      expect.objectContaining({ method: 'exact', score: 1 }),
    ]);
  });

  // Doc test case 10/11 — ngưỡng Jaccard.
  it('rejects a lexical near-duplicate but keeps a genuinely different angle', async () => {
    const near = candidate({
      id: 'near',
      slotId: 'slot_4',
      // Đổi một từ trong 12 → Jaccard ≈ 0.85.
      text: 'The stuck withdrawals matter more here than the outage itself does, honestly',
    });

    const result = await makeValidator().validate(
      input([...threeGood(), near]),
    );

    expect(reasonsFor(result, 'near')).toContain('duplicate_jaccard');
    // Ba cái nền vẫn khác nhau đủ để không ai bị loại.
    expect(result.validCandidates.map((c) => c.id).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  // Doc test case 15.
  it('asks for a selective retry when fewer than three survive', async () => {
    const result = await makeValidator().validate(
      input([
        candidate({ id: 'a' }),
        candidate({
          id: 'b',
          slotId: 'slot_2',
          text: 'Was the escape hatch usable while the sequencer was still offline, or only after?',
          referencedConcept: 'the escape hatch',
        }),
        candidate({ id: 'dead', text: '' }),
      ]),
    );

    expect(result.validCandidates).toHaveLength(2);
    expect(result.needSelectiveRetry).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('below_target_count');
  });

  it('does not let an already-rejected candidate eliminate its duplicate', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        // Trùng khít với `a`, nhưng chính nó bị loại vì safety trước đó.
        candidate({
          id: 'unsafe_copy',
          slotId: 'slot_4',
          text: 'Guaranteed profits regardless, the stuck withdrawals barely matter here at all',
        }),
      ]),
    );

    expect(result.validCandidates.map((c) => c.id)).toContain('a');
    expect(reasonsFor(result, 'unsafe_copy')).toEqual(
      expect.arrayContaining([expect.stringMatching(/safety/)]),
    );
  });

  it('drops penalties that belong to rejected candidates', async () => {
    const result = await makeValidator().validate(
      input([
        ...threeGood(),
        candidate({
          id: 'penalised_then_rejected',
          // "Well said" giữa câu → penalty; 3 từ → reject vì length.
          text: 'Well said',
        }),
      ]),
    );

    expect(
      result.penalties.some((p) => p.candidateId === 'penalised_then_rejected'),
    ).toBe(false);
  });

  /**
   * Tầng phòng thủ. Band từ là ước lượng theo hệ chữ, và luôn tồn tại ngôn ngữ
   * chưa được hiệu chỉnh (Tây Tạng từng đếm ra 1 từ cho cả câu). Khi điều đó
   * xảy ra, người dùng phải nhận reply hơi lệch độ dài — không phải một cái 502.
   */
  describe('length band relaxation', () => {
    it('keeps candidates alive when length is the only thing that killed them', async () => {
      const result = await makeValidator().validate(
        input([
          candidate({ id: 'a', text: 'Rough one' }),
          candidate({
            id: 'b',
            slotId: 'slot_2',
            text: 'Withdrawals stuck',
            referencedConcept: 'the escape hatch',
          }),
        ]),
      );

      expect(result.validCandidates.length).toBeGreaterThan(0);
      expect(result.warnings.map((w) => w.code)).toContain(
        'length_band_relaxed',
      );
    });

    it('never relaxes when a candidate failed for any other reason', async () => {
      const result = await makeValidator().validate(
        input([
          // Length sai VÀ thiếu referencedConcept → không được cứu.
          candidate({ id: 'a', text: 'Rough one', referencedConcept: '' }),
        ]),
      );

      expect(result.validCandidates).toHaveLength(0);
      expect(result.warnings.map((w) => w.code)).not.toContain(
        'length_band_relaxed',
      );
    });

    it('does not relax while any candidate still passes normally', async () => {
      const result = await makeValidator().validate(
        input([...threeGood(), candidate({ id: 'tiny', text: 'Rough one' })]),
      );

      expect(reasonsFor(result, 'tiny')).toContain('length_out_of_band');
      expect(result.warnings.map((w) => w.code)).not.toContain(
        'length_band_relaxed',
      );
    });
  });
});

function reasonsFor(
  result: Awaited<ReturnType<CandidateValidatorService['validate']>>,
  id: string,
): string[] {
  const entry = result.rejectedCandidates.find((r) => r.candidate.id === id);
  return (entry?.reasons ?? []).map((reason) => reason.code);
}
