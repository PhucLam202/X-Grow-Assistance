import type { ResolvedNichePolicy } from './niche-policy.interface';
import {
  NICHE_PROMPT_BUDGET,
  buildNichePolicyPrompt,
  estimateNichePolicyPromptSize,
} from './niche-policy.prompt-adapter';
import { NichePolicyResolver } from './niche-policy.resolver';
import { resetNichePolicies } from './niche-policy.registry';

describe('niche policy prompt adapter', () => {
  let resolver: NichePolicyResolver;

  beforeEach(() => {
    resetNichePolicies();
    resolver = new NichePolicyResolver();
  });

  afterAll(() => {
    resetNichePolicies();
  });

  function resolve(
    overrides: Partial<Parameters<NichePolicyResolver['resolve']>[0]> = {},
  ): ResolvedNichePolicy {
    return resolver.resolve({
      primaryNiche: 'crypto',
      secondaryNiches: [],
      confidence: 0.9,
      needsGenerationTimeClassification: false,
      ...overrides,
    });
  }

  it('renders the niche, safety, tone and vocabulary sections', () => {
    const prompt = buildNichePolicyPrompt(resolve());

    expect(prompt).toContain('## NICHE POLICY: crypto');
    expect(prompt).toContain('SAFETY (non-negotiable):');
    expect(prompt).toContain('TONE:');
    expect(prompt).toContain('VOCABULARY THAT FITS:');
    expect(prompt).toContain('SLANG YOU MAY USE:');
    expect(prompt).toContain('EXAMPLES:');
  });

  it('lists secondary niches in the header', () => {
    const prompt = buildNichePolicyPrompt(
      resolve({ secondaryNiches: ['tech', 'business'] }),
    );

    expect(prompt).toContain(
      '## NICHE POLICY: crypto, secondary: tech, business',
    );
  });

  // Doc test case 9.
  it('stays under the character cap when two secondary niches are merged', () => {
    const prompt = buildNichePolicyPrompt(
      resolve({ secondaryNiches: ['tech', 'finance_personal'] }),
    );

    expect(prompt.length).toBeLessThanOrEqual(NICHE_PROMPT_BUDGET.totalChars);
  });

  it('stays under the cap for every niche in the registry', () => {
    for (const niche of ['news', 'anime_manga', 'health_fitness'] as const) {
      const prompt = buildNichePolicyPrompt(
        resolve({ primaryNiche: niche, secondaryNiches: ['crypto', 'tech'] }),
      );
      expect(prompt.length).toBeLessThanOrEqual(NICHE_PROMPT_BUDGET.totalChars);
    }
  });

  it('never drops safety rules when trimming', () => {
    const resolved = resolve({ secondaryNiches: ['tech', 'finance_personal'] });
    const prompt = buildNichePolicyPrompt(resolved);

    for (const rule of resolved.safetyRules.slice(
      0,
      NICHE_PROMPT_BUDGET.safetyRules,
    )) {
      expect(prompt).toContain(rule);
    }
  });

  it('drops examples before it touches vocabulary', () => {
    const resolved = resolve();
    const full = buildNichePolicyPrompt(resolved);
    expect(full).toContain('EXAMPLES:');

    // Vừa đủ chật để phải nhả một thứ, nhưng chưa tới bậc cắt cứng.
    const tight = buildNichePolicyPrompt(resolved, {
      ...NICHE_PROMPT_BUDGET,
      totalChars: 1500,
    });

    expect(tight.length).toBeLessThanOrEqual(1500);
    expect(tight).not.toContain('EXAMPLES:');
    expect(tight).toContain('VOCABULARY THAT FITS:');
    expect(tight).toContain('SAFETY (non-negotiable):');
  });

  it('omits the slang section entirely when degraded', () => {
    const prompt = buildNichePolicyPrompt(
      resolve({ needsGenerationTimeClassification: true }),
    );

    expect(prompt).not.toContain('SLANG YOU MAY USE:');
  });

  it('renders the provisional warning when provisional', () => {
    const prompt = buildNichePolicyPrompt(resolve({ confidence: 0.42 }));

    expect(prompt).toContain('This niche is PROVISIONAL (confidence 0.42)');
  });

  it('omits the provisional warning when confident', () => {
    expect(buildNichePolicyPrompt(resolve())).not.toContain('PROVISIONAL');
  });

  it('is deterministic for the same input', () => {
    const resolved = resolve({ secondaryNiches: ['tech'] });

    expect(buildNichePolicyPrompt(resolved)).toBe(
      buildNichePolicyPrompt(resolved),
    );
  });

  it('keeps a synthetic worst-case policy under the cap', () => {
    const bloated: ResolvedNichePolicy = {
      ...resolve(),
      vocabularyHints: Array.from({ length: 50 }, (_, i) =>
        `hint-${i}`.repeat(30),
      ),
      avoidPhrases: Array.from({ length: 50 }, (_, i) =>
        `avoid-${i}`.repeat(30),
      ),
      allowedSlang: Array.from({ length: 50 }, (_, i) =>
        `slang-${i}`.repeat(30),
      ),
      styleRules: Array.from({ length: 50 }, (_, i) => `style-${i}`.repeat(30)),
      examples: Array.from({ length: 10 }, (_, i) => ({
        post: `post-${i}`.repeat(40),
        goodReply: `good-${i}`.repeat(40),
        badReply: `bad-${i}`.repeat(40),
        reason: `reason-${i}`.repeat(40),
      })),
    };

    expect(buildNichePolicyPrompt(bloated).length).toBeLessThanOrEqual(
      NICHE_PROMPT_BUDGET.totalChars,
    );
  });

  // Hành vi cố ý: an toàn không bị hy sinh cho ngân sách prompt.
  it('exceeds the cap rather than truncating safety rules', () => {
    const safetyHeavy: ResolvedNichePolicy = {
      ...resolve(),
      safetyRules: Array.from({ length: 8 }, (_, i) =>
        `Safety rule ${i}. `.repeat(30),
      ),
      examples: [],
      vocabularyHints: [],
      allowedSlang: [],
      styleRules: [],
      avoidPhrases: [],
    };

    const prompt = buildNichePolicyPrompt(safetyHeavy);

    expect(prompt.length).toBeGreaterThan(NICHE_PROMPT_BUDGET.totalChars);
    for (const rule of safetyHeavy.safetyRules) {
      expect(prompt).toContain(rule.trim());
    }
  });

  it('estimates the size by delegating to the builder', () => {
    const resolved = resolve({ secondaryNiches: ['tech'] });

    expect(estimateNichePolicyPromptSize(resolved)).toBe(
      buildNichePolicyPrompt(resolved).length,
    );
  });
});
