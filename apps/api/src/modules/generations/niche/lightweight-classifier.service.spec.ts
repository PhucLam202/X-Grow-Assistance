import { ContextNormalizerService } from './context-normalizer.service';
import {
  LightweightClassifierService,
  STRONG_SIGNAL_WEIGHT,
  WEAK_SIGNAL_WEIGHT,
} from './lightweight-classifier.service';
import { resetNicheSignals } from './signal-registry';

describe('LightweightClassifierService', () => {
  const normalizer = new ContextNormalizerService();
  const classifier = new LightweightClassifierService();

  beforeAll(() => {
    resetNicheSignals();
  });

  function score(postText: string) {
    return classifier.score(
      normalizer.normalize({ requestedNiche: 'auto', postText }),
    );
  }

  it('weights strong signals above weak ones', () => {
    const [top] = score('We are fine-tuning an LLM. The model is training.');

    expect(top.niche).toBe('ai_ml');
    expect(top.strongHits).toBeGreaterThanOrEqual(2);
    expect(top.score).toBe(
      top.strongHits * STRONG_SIGNAL_WEIGHT + top.weakHits * WEAK_SIGNAL_WEIGHT,
    );
  });

  it('returns results sorted best first', () => {
    const scores = score(
      'Our LLM RAG embeddings pipeline runs on kubernetes with postgres.',
    );

    expect(scores.length).toBeGreaterThan(1);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }
  });

  it('returns nothing for empty context', () => {
    expect(
      classifier.score(
        normalizer.normalize({ requestedNiche: 'auto', postText: '' }),
      ),
    ).toEqual([]);
  });

  it('returns nothing when no keyword matches', () => {
    expect(score('zzz qqq')).toEqual([]);
  });

  it('attributes a hit to the segment it came from', () => {
    const context = normalizer.normalize({
      requestedNiche: 'auto',
      postText: 'nothing relevant here',
      visionText: 'a bowl of ramen next to an espresso',
    });
    const [top] = classifier.score(context);

    expect(top.niche).toBe('food');
    expect(
      top.sourceSignals.every((signal) => signal.source === 'vision'),
    ).toBe(true);
  });

  it('scores Japanese and Vietnamese text', () => {
    expect(score('筋トレとダイエットを続けている')[0].niche).toBe(
      'health_fitness',
    );
    expect(score('mình thích nấu ăn và làm món ăn mới')[0].niche).toBe('food');
  });

  describe('matchDeterministic', () => {
    function deterministic(postText: string) {
      return classifier.matchDeterministic(
        normalizer.normalize({ requestedNiche: 'auto', postText }),
      );
    }

    it('matches cashtags', () => {
      const [match] = deterministic('buying $BTC');

      expect(match.niche).toBe('crypto');
      expect(match.evidence).toContain('cashtag:$BTC');
    });

    it('matches hashtag aliases', () => {
      const [match] = deterministic('thoughts on #LLM today');

      expect(match.niche).toBe('ai_ml');
      expect(match.evidence).toContain('hashtag:#llm');
    });

    it('matches link hosts including subdomains', () => {
      const [match] = deterministic('https://gist.github.com/acme/1');

      expect(match.niche).toBe('tech');
    });

    it('does not match a host that merely ends with the domain name', () => {
      expect(deterministic('https://notgithub.com/acme')).toEqual([]);
    });

    it('returns nothing when there is no deterministic signal', () => {
      expect(deterministic('just a normal sentence about code')).toEqual([]);
    });
  });
});
