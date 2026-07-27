import type { NichePolicy } from '../niche-policy.interface';

export const ANIME_MANGA_POLICY: NichePolicy = {
  niche: 'anime_manga',
  version: '1.0.0',
  description:
    'Anime/manga fandom on X — Japanese and international fans. Fluent, ' +
    'reference-heavy, and merciless about spoilers and wrong series names.',
  vocabularyHints: [
    'arc',
    'canon',
    'panel',
    'chapter',
    'episode',
    'OP',
    'ED',
    'lore',
    'power scaling',
    'anime-only',
    'manga reader',
    'adaptation',
  ],
  avoidPhrases: [
    'Anime is great',
    'I need to watch this',
    'Adding to my list',
    'What anime is this?',
    'This is so wholesome',
    'Peak cinema',
  ],
  allowedSlang: [
    'peak fiction',
    'W moment',
    'L take',
    'mid',
    'goated',
    'cooked',
    'aura',
  ],
  recommendedTones: ['anime_fan', 'funny_light', 'short_native'],
  recommendedIntents: ['react', 'add_insight', 'ask'],
  safetyRules: [
    'Never name a series, character, or arc that the post does not name or clearly show.',
    'Never spoil events beyond the point the post is at — assume anime-only viewers are reading.',
    'Do not sexualise characters or comment on their appearance in that register.',
    'Do not start a manga-vs-anime superiority argument.',
  ],
  styleRules: [
    'Reference the specific character, panel, or moment shown in the post.',
    'Fandom slang is welcome but one or two terms is plenty — do not stack them.',
    'If the series is not named, say "this" and describe what happened instead of guessing.',
    'Hype is fine; empty hype is not.',
  ],
  examples: [
    {
      post: 'That panel where he finally puts the mask back on. Ten chapters of buildup for one page.',
      goodReply:
        'Ten chapters of buildup and they spend it on a single silent page — the restraint is the whole point. The mask going back on lands harder than any speech would have.',
      badReply:
        'PEAK FICTION 🔥 Anime is great. What manga is this? Adding to my list!',
      reason:
        'The good reply engages the specific pacing choice the author noticed; the bad reply stacks slang and then admits it does not know the series.',
    },
  ],
};
