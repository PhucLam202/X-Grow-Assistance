import { DEFAULT_NICHE, NICHES, isNiche } from '../types/niche.types';
import {
  clearNicheSignals,
  getAllNicheSignals,
  getNicheSignals,
  getRegisteredNiches,
  registerNicheSignals,
  resetNicheSignals,
  validateNicheSignalRegistry,
} from './signal-registry';
import { en } from './signals/kw';

describe('niche signal registry', () => {
  beforeEach(() => {
    resetNicheSignals();
  });

  afterAll(() => {
    resetNicheSignals();
  });

  it('has no structural problems', () => {
    expect(validateNicheSignalRegistry()).toEqual([]);
  });

  it('covers every niche except the general fallback', () => {
    const registered = new Set(getRegisteredNiches());
    const missing = NICHES.filter(
      (niche) => niche !== DEFAULT_NICHE && !registered.has(niche),
    );

    expect(missing).toEqual([]);
    expect(registered.has(DEFAULT_NICHE)).toBe(false);
  });

  it('registers no niche outside the single source of truth', () => {
    expect(getRegisteredNiches().filter((niche) => !isNiche(niche))).toEqual(
      [],
    );
  });

  it('gives every niche a version and at least one strong signal', () => {
    for (const definition of getAllNicheSignals()) {
      expect(definition.version).toMatch(/\d+\.\d+\.\d+/);
      expect(definition.strong.length).toBeGreaterThan(0);
    }
  });

  it('keeps hashtag aliases and cashtags unambiguous across niches', () => {
    const seenHashtags = new Map<string, string>();
    const seenCashtags = new Map<string, string>();

    for (const definition of getAllNicheSignals()) {
      for (const alias of definition.hashtagAliases) {
        expect(seenHashtags.get(alias)).toBeUndefined();
        seenHashtags.set(alias, definition.niche);
      }
      for (const cashtag of definition.cashtags) {
        expect(seenCashtags.get(cashtag)).toBeUndefined();
        seenCashtags.set(cashtag, definition.niche);
      }
    }
  });

  it('rejects patterns carrying the g flag', () => {
    registerNicheSignals({
      niche: 'science',
      version: '0.0.1',
      // A global regex keeps lastIndex between calls and would silently
      // alternate between matching and not matching.
      strong: [en('bad', /\bphoton\b/g)],
      weak: [],
      hashtagAliases: [],
      cashtags: [],
      domains: [],
    });

    expect(validateNicheSignalRegistry()).toEqual([
      expect.stringContaining('uses the g flag'),
    ]);
  });

  it('reports a niche that has no registered signals', () => {
    clearNicheSignals();
    registerNicheSignals({
      niche: 'tech',
      version: '0.0.1',
      strong: [],
      weak: [],
      hashtagAliases: [],
      cashtags: [],
      domains: [],
    });

    const problems = validateNicheSignalRegistry();

    expect(problems).toContain('Niche "tech" has no strong signals.');
    expect(problems.some((p) => p.includes('"crypto" has no registered'))).toBe(
      true,
    );
  });

  it('restores the default set after a reset', () => {
    registerNicheSignals({
      niche: 'tech',
      version: '0.0.1',
      strong: [],
      weak: [],
      hashtagAliases: [],
      cashtags: [],
      domains: [],
    });
    resetNicheSignals();

    expect(getNicheSignals('tech')?.version).toBe('1.0.0');
  });
});
