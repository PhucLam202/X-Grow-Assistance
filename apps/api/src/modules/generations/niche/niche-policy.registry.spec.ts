import { NICHES, isNiche } from '../types/niche.types';
import type { Niche } from '../types/niche.types';
import type { NichePolicy } from './niche-policy.interface';
import {
  NichePolicyRegistrationError,
  clearNichePolicies,
  getAllNichePolicies,
  getNichePolicy,
  getRegisteredPolicyNiches,
  hasNichePolicy,
  registerNichePolicy,
  resetNichePolicies,
} from './niche-policy.registry';

function policy(niche: Niche, version = '1.0.0'): NichePolicy {
  return {
    niche,
    version,
    description: 'test policy',
    vocabularyHints: ['alpha'],
    avoidPhrases: ['Great post'],
    allowedSlang: ['gm'],
    recommendedTones: ['short_native'],
    recommendedIntents: ['react'],
    safetyRules: ['Do not invent facts.'],
    styleRules: ['Be specific.'],
    examples: [],
  };
}

describe('niche policy registry', () => {
  beforeEach(() => {
    resetNichePolicies();
  });

  afterAll(() => {
    resetNichePolicies();
  });

  it('registers exactly one policy per niche in NICHES', () => {
    expect(getRegisteredPolicyNiches().sort()).toEqual([...NICHES].sort());
    expect(getAllNichePolicies()).toHaveLength(NICHES.length);
  });

  it('registers the general fallback policy, unlike the signal registry', () => {
    expect(hasNichePolicy('general')).toBe(true);
  });

  it('registers no niche outside the single source of truth', () => {
    expect(
      getRegisteredPolicyNiches().filter((niche) => !isNiche(niche)),
    ).toEqual([]);
  });

  // Doc test case 3.
  it('rejects registering a policy for a niche that already has one', () => {
    expect(() => registerNichePolicy(policy('crypto', '2.0.0'))).toThrow(
      NichePolicyRegistrationError,
    );
    expect(getNichePolicy('crypto')!.version).toBe('1.0.0');
  });

  it('allows replacement with { override: true }', () => {
    registerNichePolicy(policy('crypto', '2.0.0'), { override: true });

    expect(getNichePolicy('crypto')!.version).toBe('2.0.0');
    expect(getAllNichePolicies()).toHaveLength(NICHES.length);
  });

  it('registers a brand new niche without touching the registry code', () => {
    registerNichePolicy(policy('sustainability' as Niche));

    expect(getNichePolicy('sustainability' as Niche)).toBeDefined();
  });

  it('restores the default set after a reset', () => {
    clearNichePolicies();
    expect(getAllNichePolicies()).toHaveLength(0);

    resetNichePolicies();
    expect(getRegisteredPolicyNiches().sort()).toEqual([...NICHES].sort());
  });

  // Nếu self-registration dùng `.forEach(registerNichePolicy)` thì `index` rơi
  // vào slot `options`, biến mọi lần đăng ký thành override im lặng.
  it('does not let forEach arity turn registration into a silent override', () => {
    expect(() => registerNichePolicy(policy('tech'))).toThrow(
      NichePolicyRegistrationError,
    );
  });
});
