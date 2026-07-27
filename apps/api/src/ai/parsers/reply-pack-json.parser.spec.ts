import { ReplyPackJsonParser } from './reply-pack-json.parser';

describe('ReplyPackJsonParser', () => {
  const parser = new ReplyPackJsonParser();

  it('keeps good suggestions when the response is truncated mid-item', () => {
    const truncated = `{"summary":"x","suggestions":[{"text":"いいね","tone":"short_native"},{"text":`;
    expect(parser.parse(truncated).suggestions).toHaveLength(1);
  });

  it('throws only when nothing usable survives', () => {
    expect(() => parser.parse('{"suggestions":[{"tone":"a"}]}')).toThrow();
  });
});
