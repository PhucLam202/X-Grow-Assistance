import {
  COMMENT_NICHES as LEGACY_NICHES,
  COMMENT_TONES as LEGACY_TONES,
  TARGET_COMMENT_LANGUAGES as LEGACY_LANGUAGES,
} from '../../../reply-pack/types/reply-pack.types';
import { NICHES, NICHE_SELECTIONS } from './niche.types';
import {
  COMMENT_NICHES,
  COMMENT_TONES,
  TARGET_COMMENT_LANGUAGES,
  TONE_SELECTIONS,
  TONES,
} from './style.types';

describe('style/niche types', () => {
  it('exposes exactly one Niche definition', () => {
    expect(COMMENT_NICHES).toBe(NICHE_SELECTIONS);
    expect(NICHE_SELECTIONS[0]).toBe('auto');
    expect(NICHE_SELECTIONS.slice(1)).toEqual([...NICHES]);
  });

  it('exposes exactly one Tone definition', () => {
    expect(COMMENT_TONES).toBe(TONES);
    expect(TONE_SELECTIONS[0]).toBe('auto');
  });

  it('has no duplicate niche keys', () => {
    expect(new Set(NICHES).size).toBe(NICHES.length);
  });

  it('keeps every legacy niche value supported', () => {
    const legacy = [
      'auto',
      'anime_manga',
      'crypto',
      'football',
      'tech',
      'business',
      'gaming',
      'music',
      'news',
      'general',
    ];

    expect(legacy.every((n) => NICHE_SELECTIONS.includes(n as never))).toBe(
      true,
    );
  });

  // Test case 9 — các import cũ vẫn hoạt động qua re-export trong transition.
  it('re-exports the legacy symbols from reply-pack.types', () => {
    expect(LEGACY_NICHES).toBe(COMMENT_NICHES);
    expect(LEGACY_TONES).toBe(COMMENT_TONES);
    expect(LEGACY_LANGUAGES).toBe(TARGET_COMMENT_LANGUAGES);
  });
});
