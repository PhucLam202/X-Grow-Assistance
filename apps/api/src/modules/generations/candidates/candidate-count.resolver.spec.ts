import {
  RICH_CONTEXT_MIN_CHARS,
  resolveCandidateCount,
} from './candidate-count.resolver';

const RICH_TEXT =
  'Moved our API gateway off Kong to a custom Go service this week and p99 latency dropped from 180ms to 40ms.';

describe('resolveCandidateCount', () => {
  // Doc test case 1.
  it('returns 4 for a context-rich post', () => {
    expect(RICH_TEXT.length).toBeGreaterThanOrEqual(RICH_CONTEXT_MIN_CHARS);

    expect(
      resolveCandidateCount({
        postContext: { text: RICH_TEXT, language: 'en' },
        requested: 4,
      }),
    ).toBe(4);
  });

  // Doc test case 2.
  it('returns 3 for a thin post with no image', () => {
    expect(
      resolveCandidateCount({
        postContext: { text: 'shipped it', language: 'en' },
        requested: 4,
      }),
    ).toBe(3);
  });

  it('returns 4 for a thin post that has vision context', () => {
    expect(
      resolveCandidateCount({
        postContext: { text: 'look', language: 'en' },
        visionContext: { summary: 'A whiteboard covered in system diagrams.' },
        requested: 4,
      }),
    ).toBe(4);
  });

  it('counts quoted post and thread context toward richness', () => {
    expect(
      resolveCandidateCount({
        postContext: {
          text: 'this',
          quotedPostText: 'Kong plugin overhead was the whole problem for us',
          threadContext: ['We saw the same thing last quarter'],
          language: 'en',
        },
        requested: 4,
      }),
    ).toBe(4);
  });

  it('never exceeds the requested count', () => {
    expect(
      resolveCandidateCount({
        postContext: { text: RICH_TEXT, language: 'en' },
        visionContext: { summary: 'a chart' },
        requested: 3,
      }),
    ).toBe(3);
  });

  it('returns 3 when there is no context at all', () => {
    expect(
      resolveCandidateCount({
        postContext: { language: 'en' },
        requested: 4,
      }),
    ).toBe(3);
  });
});
