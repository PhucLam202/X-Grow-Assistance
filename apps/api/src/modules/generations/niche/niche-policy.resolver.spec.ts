import type { Niche } from '../types/niche.types';
import {
  MAX_SECONDARY_POLICIES,
  NEUTRAL_TONES,
} from './niche-policy.interface';
import type { NichePolicy } from './niche-policy.interface';
import {
  NichePolicyResolver,
  extractVocabularyHintsFromEvidence,
} from './niche-policy.resolver';
import {
  clearNichePolicies,
  getNichePolicy,
  registerNichePolicy,
  resetNichePolicies,
} from './niche-policy.registry';
import { GENERAL_POLICY } from './policies';

const CONFIDENT = {
  confidence: 0.9,
  needsGenerationTimeClassification: false,
};

describe('NichePolicyResolver', () => {
  let resolver: NichePolicyResolver;

  beforeEach(() => {
    resetNichePolicies();
    resolver = new NichePolicyResolver();
  });

  afterAll(() => {
    resetNichePolicies();
  });

  // Doc test case 1.
  it('returns the registered policy for a confident known niche', () => {
    const resolved = resolver.resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      ...CONFIDENT,
    });

    expect(resolved.niche).toBe('crypto');
    expect(resolved.version).toBe('1.0.0');
    expect(resolved.fallbackUsed).toBe(false);
    expect(resolved.degraded).toBe(false);
    expect(resolved.provisional).toBe(false);
    expect(resolved.allowedSlang.length).toBeGreaterThan(0);
    expect(resolved.resolvedVersion).toBe('crypto@1.0.0');
  });

  // Doc test case 2.
  it('falls back to general but preserves vocabulary recovered from evidence', () => {
    clearNichePolicies();
    registerNichePolicy(GENERAL_POLICY);

    const resolved = resolver.resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 1,
      needsGenerationTimeClassification: false,
      evidence: [
        'strong:bitcoin',
        'cashtag:$BTC',
        'link:binance.com',
        'hashtag:#airdrop',
        'no_signal_matched',
      ],
    });

    expect(resolved.niche).toBe('general');
    expect(resolved.requestedPrimaryNiche).toBe('crypto');
    expect(resolved.fallbackUsed).toBe(true);
    // Fallback vẫn là phỏng đoán kể cả confidence 1.0.
    expect(resolved.provisional).toBe(true);
    expect(resolved.degraded).toBe(false);

    expect(resolved.contextVocabularyHints).toEqual([
      'bitcoin',
      'BTC',
      'airdrop',
    ]);
    expect(resolved.vocabularyHints).toEqual(
      expect.arrayContaining(['bitcoin', 'BTC', 'airdrop']),
    );
    expect(resolved.contextVocabularyHints).not.toContain('binance.com');
    expect(resolved.resolvedVersion).toContain('|fallback');
  });

  // Doc test case 7.
  it('degrades on confidence below the policy threshold', () => {
    const resolved = resolver.resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.65,
      needsGenerationTimeClassification: false,
    });

    expect(resolved.degraded).toBe(true);
    expect(resolved.degradeReasons).toEqual(['low_confidence']);
    expect(resolved.provisional).toBe(true);
    expect(resolved.allowedSlang).toEqual([]);
    for (const tone of resolved.recommendedTones) {
      expect(NEUTRAL_TONES).toContain(tone);
    }
  });

  it('degrades when generation-time classification is pending', () => {
    const resolved = resolver.resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.95,
      needsGenerationTimeClassification: true,
    });

    expect(resolved.degradeReasons).toEqual([
      'needs_generation_time_classification',
    ]);
    expect(resolved.allowedSlang).toEqual([]);
    expect(resolved.resolvedVersion).toContain('|degraded');
  });

  it('keeps slang and fandom tones when confident', () => {
    const resolved = resolver.resolve({
      primaryNiche: 'football',
      secondaryNiches: [],
      ...CONFIDENT,
    });

    expect(resolved.degraded).toBe(false);
    expect(resolved.recommendedTones).toContain('football_fan');
    expect(resolved.allowedSlang.length).toBeGreaterThan(0);
  });

  it('keeps a neutral tone even when the niche only recommends fandom tones', () => {
    const resolved = resolver.resolve({
      primaryNiche: 'football',
      secondaryNiches: [],
      confidence: 0.4,
      needsGenerationTimeClassification: false,
    });

    expect(resolved.recommendedTones.length).toBeGreaterThan(0);
    for (const tone of resolved.recommendedTones) {
      expect(NEUTRAL_TONES).toContain(tone);
    }
  });

  it('does not mutate the registered policy when degrading', () => {
    resolver.resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.1,
      needsGenerationTimeClassification: true,
    });

    const registered = getNichePolicy('crypto')!;
    expect(registered.allowedSlang.length).toBeGreaterThan(0);
    expect(registered.styleRules).not.toContain(
      expect.stringContaining('not confirmed'),
    );
  });

  // Doc test case 8 — layer resolver. Đối chiếu với test 11 ở validator.spec:
  // validator tố giác niche ngoài `niche.types.ts`, còn resolver vẫn phải phục
  // vụ được nó mà không cần sửa một dòng nào ở file resolver.
  it('resolves a niche registered after boot without any resolver change', () => {
    const sustainability: NichePolicy = {
      ...GENERAL_POLICY,
      niche: 'sustainability' as Niche,
      version: '0.1.0',
      description: 'Climate and sustainability discussion.',
      vocabularyHints: ['carbon intensity', 'grid mix'],
      recommendedTones: ['insightful'],
    };
    registerNichePolicy(sustainability);

    const resolved = resolver.resolve({
      primaryNiche: 'sustainability' as Niche,
      secondaryNiches: [],
      ...CONFIDENT,
    });

    expect(resolved.niche).toBe('sustainability');
    expect(resolved.fallbackUsed).toBe(false);
    expect(resolved.vocabularyHints).toContain('carbon intensity');
    expect(resolved.resolvedVersion).toBe('sustainability@0.1.0');
  });

  describe('secondary niches', () => {
    it('caps secondary niches at the configured maximum', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'crypto',
        secondaryNiches: ['tech', 'business', 'startup', 'ai_ml'],
        ...CONFIDENT,
      });

      expect(resolved.appliedSecondaryNiches).toHaveLength(
        MAX_SECONDARY_POLICIES,
      );
      expect(resolved.appliedSecondaryNiches).toEqual(['tech', 'business']);
    });

    it('drops a secondary that equals the primary, is general, or is duplicated', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'crypto',
        secondaryNiches: ['crypto', 'general', 'tech', 'tech'],
        ...CONFIDENT,
      });

      expect(resolved.appliedSecondaryNiches).toEqual(['tech']);
    });

    it('drops a secondary with no registered policy', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'crypto',
        secondaryNiches: ['sustainability' as Niche, 'tech'],
        ...CONFIDENT,
      });

      expect(resolved.appliedSecondaryNiches).toEqual(['tech']);
    });

    it('unions safetyRules and avoidPhrases across primary and secondaries', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'news',
        secondaryNiches: ['crypto'],
        ...CONFIDENT,
      });

      // Cấm đoán cộng dồn: post news chạm crypto vẫn giữ disclaimer tài chính.
      expect(
        resolved.safetyRules.some((r) => /financial advice/i.test(r)),
      ).toBe(true);
      expect(
        resolved.safetyRules.some((r) => /unverified claims/i.test(r)),
      ).toBe(true);
      expect(resolved.avoidPhrases).toEqual(
        expect.arrayContaining(['To the moon', 'Thoughts and prayers']),
      );
    });

    it('unions safetyPatterns across primary and secondaries, deduped by id', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'news',
        secondaryNiches: ['crypto'],
        ...CONFIDENT,
      });

      const ids = resolved.safetyPatterns.map((p) => p.id);

      expect(ids).toEqual(expect.arrayContaining(['news.blame_assignment']));
      expect(ids).toEqual(expect.arrayContaining(['crypto.price_prediction']));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives a niche without safetyPatterns an empty list, not undefined', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'general',
        secondaryNiches: [],
        ...CONFIDENT,
      });

      expect(resolved.safetyPatterns).toEqual([]);
    });

    it('does not take tone, intent, slang or examples from a secondary', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'news',
        secondaryNiches: ['crypto'],
        ...CONFIDENT,
      });

      expect(resolved.recommendedTones).toEqual(
        getNichePolicy('news')!.recommendedTones,
      );
      expect(resolved.recommendedIntents).toEqual(
        getNichePolicy('news')!.recommendedIntents,
      );
      expect(resolved.allowedSlang).toEqual(
        getNichePolicy('news')!.allowedSlang,
      );
      expect(resolved.examples).toEqual(getNichePolicy('news')!.examples);
    });

    it('adds secondary vocabulary and builds a stable resolvedVersion', () => {
      const resolved = resolver.resolve({
        primaryNiche: 'crypto',
        secondaryNiches: ['tech'],
        ...CONFIDENT,
      });

      expect(resolved.vocabularyHints).toEqual(
        expect.arrayContaining(['narrative', 'ship']),
      );
      expect(resolved.resolvedVersion).toBe('crypto@1.0.0+tech@1.0.0');
      expect(resolved.policyVersions).toEqual([
        { niche: 'crypto', version: '1.0.0' },
        { niche: 'tech', version: '1.0.0' },
      ]);
    });
  });

  it('clamps confidence into [0, 1]', () => {
    expect(
      resolver.resolve({
        primaryNiche: 'tech',
        secondaryNiches: [],
        confidence: 4.2,
        needsGenerationTimeClassification: false,
      }).confidence,
    ).toBe(1);

    expect(
      resolver.resolve({
        primaryNiche: 'tech',
        secondaryNiches: [],
        confidence: -3,
        needsGenerationTimeClassification: false,
      }).confidence,
    ).toBe(0);
  });

  it('maps a NicheDetectionResult straight through', () => {
    const resolved = resolver.resolveFromDetection({
      primaryNiche: 'ai_ml',
      secondaryNiches: ['tech'],
      confidence: 0.88,
      evidence: ['strong:llm'],
      sourceSignals: [],
      classificationMethod: 'lightweight',
      needsGenerationTimeClassification: false,
      fallbackUsed: false,
    });

    expect(resolved.niche).toBe('ai_ml');
    expect(resolved.appliedSecondaryNiches).toEqual(['tech']);
    expect(resolved.contextVocabularyHints).toEqual(['llm']);
  });
});

describe('extractVocabularyHintsFromEvidence', () => {
  it('keeps vocabulary signals and drops links, manual markers and sentinels', () => {
    expect(
      extractVocabularyHintsFromEvidence([
        'strong:fine-tuning',
        'weak:gpu',
        'hashtag:#machinelearning',
        'cashtag:$ETH',
        'link:huggingface.co',
        'manual:crypto',
        'no_signal_matched',
        'empty_context',
        'generation_call_returned_no_niche',
      ]),
    ).toEqual(['fine tuning', 'gpu', 'machinelearning', 'ETH']);
  });

  it('dedupes case-insensitively, keeps first-seen order, and caps at 8', () => {
    const hints = extractVocabularyHintsFromEvidence([
      'strong:LLM',
      'weak:llm',
      ...Array.from({ length: 12 }, (_, i) => `weak:term${i}`),
    ]);

    expect(hints[0]).toBe('llm');
    expect(hints).toHaveLength(8);
  });

  it('returns an empty list for empty evidence', () => {
    expect(extractVocabularyHintsFromEvidence([])).toEqual([]);
  });
});
