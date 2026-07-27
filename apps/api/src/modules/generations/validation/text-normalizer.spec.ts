import {
  openingWords,
  containsPhrase,
  normalizeForCompare,
  stem,
  stemmedTokens,
  startsWithPhrase,
} from './text-normalizer';

describe('normalizeForCompare', () => {
  it('folds case, punctuation, emoji and fullwidth forms', () => {
    expect(normalizeForCompare('ＧＭ, ser! 🚀')).toBe('gm ser');
  });

  it('normalises curly quotes so phrase lists written with straight quotes match', () => {
    expect(normalizeForCompare('couldn’t')).toBe("couldn't");
  });
});

describe('stem', () => {
  it('folds plurals and -ing so the same fact matches across forms', () => {
    expect(stem('minutes')).toBe(stem('minute'));
    expect(stem('withdrawals')).toBe('withdrawal');
    expect(stem('shipping')).toBe('shipp');
  });

  it('leaves short words alone to avoid silly collisions', () => {
    expect(stem('bus')).toBe('bus');
    expect(stem('gas')).toBe('gas');
  });

  it('maps -ies back to -y instead of chopping the stem', () => {
    expect(stem('stories')).toBe('story');
  });

  it('strips the whole -es only for sibilant stems', () => {
    expect(stem('boxes')).toBe('box');
    expect(stem('matches')).toBe('match');
  });

  it('keeps a word that merely ends in -ss', () => {
    expect(stem('class')).toBe('class');
  });
});

describe('stemmedTokens', () => {
  it('lets a plural in the post match a singular in the reply', () => {
    const context = stemmedTokens(
      'down for 40 minutes, withdrawals were stuck',
    );
    expect(context.has(stem('withdrawal'))).toBe(true);
    expect(context.has(stem('minute'))).toBe(true);
  });
});

describe('phrase matching', () => {
  it('respects word boundaries', () => {
    expect(containsPhrase('their factsheet is stale', 'facts')).toBe(false);
    expect(containsPhrase('facts, plainly', 'facts')).toBe(true);
  });

  it('distinguishes an opener from a mid-sentence use', () => {
    expect(startsWithPhrase('Great post, and also...', 'great post')).toBe(
      true,
    );
    expect(
      startsWithPhrase('The p99 drop, great post aside', 'great post'),
    ).toBe(false);
  });

  it('takes the first two words for the batch opener rule', () => {
    expect(openingWords('I think this shipped early')).toBe('i think');
  });
});
