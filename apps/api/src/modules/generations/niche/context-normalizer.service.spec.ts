import { ContextNormalizerService } from './context-normalizer.service';

describe('ContextNormalizerService', () => {
  const normalizer = new ContextNormalizerService();

  it('derives hashtags, mentions, links and cashtags straight from the text', () => {
    const context = normalizer.normalize({
      requestedNiche: 'auto',
      postText:
        'Loading $BTC and $eth thanks to @vitalikbuterin — see #DeFi notes at ' +
        'https://www.dexscreener.com/solana/abc',
    });

    expect(context.cashtags).toEqual(['BTC', 'ETH']);
    expect(context.mentions).toEqual(['vitalikbuterin']);
    expect(context.hashtags).toEqual(['defi']);
    expect(context.domains).toEqual(['dexscreener.com']);
  });

  it('merges explicitly supplied hashtags with derived ones', () => {
    const context = normalizer.normalize({
      requestedNiche: 'auto',
      hashtags: ['#AI', 'llm'],
      postText: 'shipping #rag today',
    });

    expect(context.hashtags.sort()).toEqual(['ai', 'llm', 'rag']);
  });

  it('keeps every source in its own segment for attribution', () => {
    const context = normalizer.normalize({
      requestedNiche: 'auto',
      postText: 'post body',
      quotedPostText: 'quoted body',
      visionText: 'a photo of a bowl',
      threadContext: ['first', 'second'],
      altText: 'alt description',
      authorBio: 'bio line',
    });

    expect(context.segments.map((segment) => segment.source)).toEqual([
      'post_text',
      'quoted_post',
      'thread',
      'alt_text',
      'vision',
      'author_bio',
    ]);
  });

  it('lowercases and collapses whitespace in the search text', () => {
    const context = normalizer.normalize({
      requestedNiche: 'auto',
      postText: '  Hello   WORLD \n\n again  ',
    });

    expect(context.searchText).toBe('hello world again');
  });

  it('marks context empty when nothing usable was supplied', () => {
    expect(
      normalizer.normalize({ requestedNiche: 'auto', postText: '   ' }).isEmpty,
    ).toBe(true);
    expect(normalizer.normalize({ requestedNiche: 'auto' }).isEmpty).toBe(true);
  });

  it('is not empty when only vision text is available', () => {
    expect(
      normalizer.normalize({ requestedNiche: 'auto', visionText: 'a cat' })
        .isEmpty,
    ).toBe(false);
  });

  it('ignores links it cannot parse', () => {
    const context = normalizer.normalize({
      requestedNiche: 'auto',
      links: ['not a url'],
      postText: 'hello',
    });

    expect(context.domains).toEqual([]);
  });

  it('finds every match rather than every other one', () => {
    // Guards the shared-regex lastIndex trap: module-level `g` patterns reused
    // across calls would skip alternating matches.
    const first = normalizer.normalize({
      requestedNiche: 'auto',
      postText: '#one #two #three',
    });
    const second = normalizer.normalize({
      requestedNiche: 'auto',
      postText: '#one #two #three',
    });

    expect(first.hashtags).toEqual(['one', 'two', 'three']);
    expect(second.hashtags).toEqual(first.hashtags);
  });
});
