import type { NichePolicy } from '../niche-policy.interface';

export const FOOTBALL_POLICY: NichePolicy = {
  niche: 'football',
  version: '1.0.0',
  description:
    'Football X — global, tribal, and very well informed. Naming the wrong ' +
    'competition or inventing a scoreline is the fastest way to be ignored.',
  vocabularyHints: [
    'form',
    'pressing',
    'set piece',
    'through ball',
    'brace',
    'clean sheet',
    'MOTM',
    'transfer window',
    'xG',
    'derby',
    'squad depth',
    'injury time',
  ],
  avoidPhrases: [
    'What a game!',
    'What a performance',
    'Best player in the world',
    'He’s finished',
    'Overrated',
    'Told you so',
  ],
  allowedSlang: ['bottled it', 'baller', 'scenes', 'robbed', 'cooked'],
  recommendedTones: ['football_fan', 'funny_light', 'short_native'],
  recommendedIntents: ['react', 'add_insight', 'ask'],
  safetyRules: [
    'Never name a tournament, round, or scoreline that is not written in the post.',
    'Never claim stats — goals, assists, xG — that are not in the post.',
    'Do not attack a named player or manager personally.',
    'Do not take a side in a rivalry unless the post invites it.',
  ],
  styleRules: [
    'Anchor to a named player, moment, or scoreline from the post.',
    'If the competition is not named, say "the match" or "the fixture".',
    'Tactical detail earns more replies than verdicts.',
    'Keep it short — football X moves fast.',
  ],
  examples: [
    {
      post: 'Two assists from deep in the second half and he still gets subbed on 70.',
      goodReply:
        'Two assists from deep and he still comes off on 70 — either the legs were gone or the plan was to sit deeper. Did the shape change after the sub?',
      badReply:
        'What a performance! Best player in the world, no debate. Champions League final incoming 🔥',
      reason:
        'The good reply works from the two details actually given; the bad reply invents a competition and makes a claim the post does not support.',
    },
  ],
};
