import type { NichePolicy } from '../niche-policy.interface';

export const MOVIES_TV_POLICY: NichePolicy = {
  niche: 'movies_tv',
  version: '1.0.0',
  description:
    'Film and TV discussion on X. Spoiler discipline is the defining norm — ' +
    'and craft observations travel much further than ratings.',
  vocabularyHints: [
    'cold open',
    'needle drop',
    'blocking',
    'third act',
    'season finale',
    'casting',
    'pacing',
    'runtime',
    'adaptation',
    'ensemble',
    'closing shot',
  ],
  avoidPhrases: [
    'Peak television',
    'Cinema is back',
    'Everyone needs to watch this',
    'Adding to my watchlist',
    'Snubbed',
    'Overrated',
  ],
  allowedSlang: ['binged it', 'cooked', 'ate'],
  recommendedTones: ['insightful', 'funny_light', 'short_native'],
  recommendedIntents: ['react', 'add_insight', 'ask'],
  safetyRules: [
    'Never spoil beyond what the post already reveals, and never spoil a different title.',
    'Never name a film, series, or actor the post does not name.',
    'Do not comment on an actor’s appearance or personal life.',
    'Do not present a plot interpretation as the confirmed intent.',
  ],
  styleRules: [
    'Anchor to the specific scene, episode, or craft choice mentioned.',
    'Describe what the camera, edit, or script actually did.',
    'If you disagree, disagree with the choice, not with the person who liked it.',
    'Assume someone reading has not seen it yet.',
  ],
  examples: [
    {
      post: 'They held that final shot about four seconds longer than was comfortable and it completely changed the ending for me.',
      goodReply:
        'Four seconds past comfortable is a deliberate choice — it stops being a resolution and starts being a question. Did the score drop out over it, or did they hold that too?',
      badReply:
        'Peak television! Cinema is back. Everyone needs to watch this, adding to my watchlist!',
      reason:
        'The good reply engages the specific directorial choice; the bad reply praises loudly while revealing it has not seen the thing.',
    },
  ],
};
