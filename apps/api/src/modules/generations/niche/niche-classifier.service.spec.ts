import { ContextNormalizerService } from './context-normalizer.service';
import { LightweightClassifierService } from './lightweight-classifier.service';
import { NicheClassifierService } from './niche-classifier.service';
import {
  NICHE_ACCEPT_THRESHOLD,
  NicheConfidenceService,
} from './niche-confidence.service';
import type { NicheClassificationInput } from './niche.types';
import { registerNicheSignals, resetNicheSignals } from './signal-registry';
import { en } from './signals/kw';

describe('NicheClassifierService', () => {
  let classifier: NicheClassifierService;

  beforeEach(() => {
    resetNicheSignals();
    const confidence = new NicheConfidenceService();
    classifier = new NicheClassifierService(
      new ContextNormalizerService(),
      new LightweightClassifierService(),
      confidence,
    );
  });

  afterAll(() => {
    resetNicheSignals();
  });

  function classify(input: Partial<NicheClassificationInput>) {
    const result = classifier.classify({
      requestedNiche: 'auto',
      ...input,
    });

    // Every path must produce a schema-valid result.
    expect(classifier.validate(result)).toEqual([]);
    return result;
  }

  // Test case 1
  it('honours a manually picked niche without overriding it', () => {
    const result = classify({
      requestedNiche: 'crypto',
      // Text pointing at a different niche must not win.
      postText: 'Deadlift PR at the gym today, calorie deficit is working.',
    });

    expect(result.primaryNiche).toBe('crypto');
    expect(result.confidence).toBe(1);
    expect(result.classificationMethod).toBe('manual');
    expect(result.needsGenerationTimeClassification).toBe(false);
  });

  // Test case 2
  it('detects ai_ml from clear keywords', () => {
    const result = classify({
      postText:
        'Our RAG pipeline got way better after we swapped the embedding model ' +
        'and started fine-tuning the LLM on domain data.',
    });

    expect(result.primaryNiche).toBe('ai_ml');
    expect(['deterministic', 'lightweight']).toContain(
      result.classificationMethod,
    );
    expect(result.confidence).toBeGreaterThanOrEqual(NICHE_ACCEPT_THRESHOLD);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  // Test case 3
  it('returns a secondary niche when a second topic is clearly present', () => {
    const result = classify({
      postText:
        'We raised a seed round from a VC after hitting product-market fit. ' +
        'Our founders built the whole LLM agent stack with RAG and fine-tuning ' +
        'on a neural network we trained ourselves.',
    });

    expect(result.primaryNiche).toBe('ai_ml');
    expect(result.secondaryNiches).toContain('startup');
    expect(result.secondaryNiches).not.toContain(result.primaryNiche);
  });

  // Test case 4
  it('does not commit to a niche off a single weak keyword', () => {
    const result = classify({ postText: 'Just shipped it.' });

    expect(result.needsGenerationTimeClassification).toBe(true);
    expect(result.confidence).toBeLessThan(NICHE_ACCEPT_THRESHOLD);
    expect(result.secondaryNiches).toEqual([]);
  });

  // Test case 5
  it('flags for generation-time classification below the threshold', () => {
    const result = classify({
      postText: 'Thinking about my career and whether the manager track fits.',
    });

    expect(result.confidence).toBeLessThan(NICHE_ACCEPT_THRESHOLD);
    expect(result.needsGenerationTimeClassification).toBe(true);
  });

  // Test case 6
  it('accepts without generation-time classification above the threshold', () => {
    const result = classify({
      postText:
        'Bitcoin on-chain volume is up, DeFi liquidity pools are filling, and ' +
        'the airdrop farmers are back. Staking yields look solid.',
    });

    expect(result.primaryNiche).toBe('crypto');
    expect(result.confidence).toBeGreaterThanOrEqual(NICHE_ACCEPT_THRESHOLD);
    expect(result.needsGenerationTimeClassification).toBe(false);
  });

  // Test case 7
  describe('applyGenerationTimeClassification', () => {
    const uncertain = () => classify({ postText: 'Just shipped it.' });

    it('falls back to general when the generation call returns no niche', () => {
      const result = classifier.applyGenerationTimeClassification(
        uncertain(),
        null,
      );

      expect(result.primaryNiche).toBe('general');
      expect(result.classificationMethod).toBe('general_fallback');
      expect(result.fallbackUsed).toBe(true);
      expect(result.needsGenerationTimeClassification).toBe(false);
      expect(classifier.validate(result)).toEqual([]);
    });

    it('falls back when the model niche is not in the registry', () => {
      const result = classifier.applyGenerationTimeClassification(
        uncertain(),
        'underwater_basket_weaving',
      );

      expect(result.classificationMethod).toBe('general_fallback');
    });

    it('falls back when the model is not confident enough', () => {
      const result = classifier.applyGenerationTimeClassification(
        uncertain(),
        'tech',
        0.2,
      );

      expect(result.classificationMethod).toBe('general_fallback');
    });

    it('records generation_embedded when the model settles the niche', () => {
      const result = classifier.applyGenerationTimeClassification(
        uncertain(),
        'gaming',
        0.9,
      );

      expect(result.primaryNiche).toBe('gaming');
      expect(result.classificationMethod).toBe('generation_embedded');
      expect(result.needsGenerationTimeClassification).toBe(false);
      expect(result.fallbackUsed).toBe(false);
    });

    it('leaves an already-confident result untouched', () => {
      const confident = classify({
        postText:
          'Bitcoin on-chain volume is up, DeFi liquidity pools are filling, ' +
          'and staking yields look solid with the airdrop farmers back.',
      });

      expect(
        classifier.applyGenerationTimeClassification(confident, 'gaming', 0.99),
      ).toEqual(confident);
    });
  });

  // Test case 8
  it('never repeats the primary niche among the secondaries', () => {
    const result = classify({
      postText:
        'LLM fine-tuning, RAG, embeddings, transformers, prompt engineering, ' +
        'machine learning and neural networks all in one AI agent post.',
    });

    expect(result.secondaryNiches).not.toContain(result.primaryNiche);
    expect(new Set(result.secondaryNiches).size).toBe(
      result.secondaryNiches.length,
    );
    expect(result.secondaryNiches.length).toBeLessThanOrEqual(2);
  });

  // Test case 9
  it('falls back to general when there is no context at all', () => {
    const result = classify({ postText: '   ' });

    expect(result.primaryNiche).toBe('general');
    expect(result.classificationMethod).toBe('general_fallback');
    expect(result.confidence).toBe(0);
    expect(result.fallbackUsed).toBe(true);
    // Nothing for Phase 4 to work with either.
    expect(result.needsGenerationTimeClassification).toBe(false);
  });

  // Test case 10
  it('detects a niche registered without touching the cascade', () => {
    const result = classify({
      postText:
        'Zone 2 cardio plus a calorie deficit beat my old HIIT workout split. ' +
        'Deadlift numbers still climbing.',
    });

    expect(result.primaryNiche).toBe('health_fitness');
    expect(result.confidence).toBeGreaterThanOrEqual(NICHE_ACCEPT_THRESHOLD);
  });

  it('picks up signals registered at runtime', () => {
    registerNicheSignals({
      niche: 'science',
      version: '9.9.9-test',
      strong: [en('quokka', /\bquokka research\b/)],
      weak: [],
      hashtagAliases: [],
      cashtags: [],
      domains: [],
    });

    const result = classify({ postText: 'New quokka research just dropped.' });

    expect(result.primaryNiche).toBe('science');
  });

  describe('signal sources beyond the post body', () => {
    it('classifies from vision text when the post has no words', () => {
      const result = classify({
        visionText:
          'A screenshot of a ramen bowl at a michelin guide restaurant, ' +
          'street food stall in the background, recipe card visible.',
      });

      expect(result.primaryNiche).toBe('food');
      expect(result.sourceSignals.some((s) => s.source === 'vision')).toBe(
        true,
      );
    });

    it('uses a cashtag as a deterministic signal', () => {
      const result = classify({ postText: 'Loading up on $SOL here.' });

      expect(result.primaryNiche).toBe('crypto');
      expect(result.classificationMethod).toBe('deterministic');
      expect(result.evidence).toContain('cashtag:$SOL');
    });

    it('uses a link host as a deterministic signal', () => {
      const result = classify({
        postText: 'Repo is up: https://github.com/acme/thing',
      });

      expect(result.primaryNiche).toBe('tech');
      expect(result.classificationMethod).toBe('deterministic');
    });

    it('detects Japanese posts', () => {
      const result = classify({
        postText: '呪術廻戦の新しいアニメ、作画が本当にすごい。声優も最高。',
      });

      expect(result.primaryNiche).toBe('anime_manga');
    });

    it('detects Vietnamese posts', () => {
      const result = classify({
        postText:
          'Mình vừa đi du lịch Đà Nẵng, đặt vé máy bay rẻ và chuyến đi rất đáng.',
      });

      expect(result.primaryNiche).toBe('travel');
    });
  });
});
