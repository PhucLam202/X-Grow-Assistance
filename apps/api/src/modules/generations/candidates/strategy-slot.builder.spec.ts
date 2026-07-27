import { NichePolicyResolver } from '../niche/niche-policy.resolver';
import { resetNichePolicies } from '../niche/niche-policy.registry';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import { buildStrategySlots } from './strategy-slot.builder';

describe('buildStrategySlots', () => {
  let policy: ResolvedNichePolicy;

  beforeEach(() => {
    resetNichePolicies();
    policy = new NichePolicyResolver().resolve({
      primaryNiche: 'general',
      secondaryNiches: [],
      confidence: 0.9,
      needsGenerationTimeClassification: false,
    });
  });

  afterAll(() => {
    resetNichePolicies();
  });

  const auto = { tone: 'auto', intent: 'auto' } as const;

  it('builds the documented default slot table', () => {
    expect(buildStrategySlots(4, { ...auto, policy })).toEqual([
      { slotId: 'slot_1', intent: 'react', tone: 'short_native' },
      { slotId: 'slot_2', intent: 'ask', tone: 'question_based' },
      { slotId: 'slot_3', intent: 'support', tone: 'casual_supportive' },
      { slotId: 'slot_4', intent: 'add_insight', tone: 'insightful' },
    ]);
  });

  it('drops the add_insight slot when only three are requested', () => {
    const slots = buildStrategySlots(3, { ...auto, policy });

    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.intent)).toEqual(['react', 'ask', 'support']);
  });

  it('gives every slot a unique id', () => {
    const ids = buildStrategySlots(4, { ...auto, policy }).map((s) => s.slotId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  // Doc test case 4.
  it('applies a user-chosen tone to the first slot only', () => {
    const slots = buildStrategySlots(4, {
      tone: 'funny_light',
      intent: 'auto',
      policy,
    });

    expect(slots[0].tone).toBe('funny_light');
    expect(slots.slice(1).map((s) => s.tone)).not.toContain('funny_light');
  });

  it('lets the user tone win even when the policy does not recommend it', () => {
    const crypto = new NichePolicyResolver().resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.9,
      needsGenerationTimeClassification: false,
    });
    expect(crypto.recommendedTones).not.toContain('congratulation');

    expect(
      buildStrategySlots(4, {
        tone: 'congratulation',
        intent: 'auto',
        policy: crypto,
      })[0].tone,
    ).toBe('congratulation');
  });

  it('applies a user-chosen intent to the first slot only', () => {
    const slots = buildStrategySlots(4, {
      tone: 'auto',
      intent: 'add_insight',
      policy,
    });

    expect(slots[0].intent).toBe('add_insight');
    expect(slots[1].intent).toBe('ask');
  });

  it('substitutes a policy tone when the default is not recommended', () => {
    const football = new NichePolicyResolver().resolve({
      primaryNiche: 'football',
      secondaryNiches: [],
      confidence: 0.9,
      needsGenerationTimeClassification: false,
    });

    const tones = buildStrategySlots(4, { ...auto, policy: football }).map(
      (s) => s.tone,
    );

    // `football_fan` chỉ đến từ policy — file builder không chứa tên niche nào.
    expect(tones).toContain('football_fan');
  });

  it('keeps a degraded policy free of fandom tones', () => {
    const degraded = new NichePolicyResolver().resolve({
      primaryNiche: 'football',
      secondaryNiches: [],
      confidence: 0.3,
      needsGenerationTimeClassification: true,
    });

    const tones = buildStrategySlots(4, { ...auto, policy: degraded }).map(
      (s) => s.tone,
    );

    expect(tones).not.toContain('football_fan');
  });
});
