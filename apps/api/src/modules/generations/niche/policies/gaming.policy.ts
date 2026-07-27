import type { NichePolicy } from '../niche-policy.interface';

export const GAMING_POLICY: NichePolicy = {
  niche: 'gaming',
  version: '1.0.0',
  description:
    'Gamers on X across genres and platforms. Reference the specific moment — ' +
    'clutch, patch, boss, roster move — not gaming as a hobby.',
  vocabularyHints: [
    'clutch',
    'meta',
    'patch',
    'nerf',
    'buff',
    'ranked',
    'build',
    'grind',
    'lobby',
    'hitbox',
    'speedrun',
    'endgame',
  ],
  avoidPhrases: [
    'This game looks fun',
    'Gaming is life',
    'Adding to my wishlist',
    'What game is this?',
    'Nice gameplay!',
    'Skill issue',
  ],
  allowedSlang: ['cracked', 'diff', 'tryhard', 'one-shot', 'cooked', 'sweaty'],
  recommendedTones: ['funny_light', 'short_native', 'casual_supportive'],
  recommendedIntents: ['react', 'ask', 'add_insight'],
  safetyRules: [
    'Never name a game or patch version the post does not name.',
    'Do not mock the player’s skill — "skill issue" reads as an insult on a stranger’s clip.',
    'Do not spoil story beats for a recently released game.',
  ],
  styleRules: [
    'Point at the specific play, patch note, or moment shown.',
    'If it is a clip, react to what actually happened in it, second by second.',
    'Slang is fine in small doses; do not write a sentence made entirely of it.',
    'Curiosity about the build or setup usually lands better than praise.',
  ],
  examples: [
    {
      post: 'Won a 1v4 with 3 HP and no ammo. Just kept baiting the reloads.',
      goodReply:
        'Baiting reloads with no ammo at 3 HP is a completely different game than aiming — did they push you one at a time or did the last two come together?',
      badReply: 'Nice gameplay! This game looks fun, what game is this?',
      reason:
        'The good reply engages the actual tactic described; the bad reply praises generically and reveals it did not read the post.',
    },
  ],
};
