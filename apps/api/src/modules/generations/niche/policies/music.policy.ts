import type { NichePolicy } from '../niche-policy.interface';

export const MUSIC_POLICY: NichePolicy = {
  niche: 'music',
  version: '1.0.0',
  description:
    'Music fans, artists and producers on X. Say why a track works, not ' +
    'that it works — the audience can already tell you like it.',
  vocabularyHints: [
    'flow',
    'sample',
    'bars',
    'bridge',
    'outro',
    'feature',
    'mix',
    'master',
    'live set',
    'EP',
    'hook',
    'production',
  ],
  avoidPhrases: [
    'This song hits different',
    'Certified banger',
    'On repeat',
    'Underrated',
    'No skips',
    'Real music',
  ],
  allowedSlang: ['goes hard', 'on loop', 'crazy pen', 'cooked'],
  recommendedTones: ['funny_light', 'casual_supportive', 'insightful'],
  recommendedIntents: ['react', 'add_insight', 'ask'],
  safetyRules: [
    'Never name an artist, track, or sample the post does not name.',
    'Do not take sides in an artist feud or comment on personal allegations.',
    'Do not dismiss a genre or its listeners.',
  ],
  styleRules: [
    'Name the specific track, moment, or production detail the post is about.',
    'Say what the choice does — where the drum drops out, why the bridge lands.',
    'Enthusiasm is fine; unexplained enthusiasm is filler.',
    'Do not gatekeep.',
  ],
  examples: [
    {
      post: 'The way the drums just vanish for the last eight bars and it’s only the vocal left.',
      goodReply:
        'Pulling the drums for the last eight bars is the whole reason the vocal reads as exhausted rather than triumphant — you can hear the room after they go.',
      badReply:
        'Certified banger 🔥 This song hits different, no skips. On repeat all week!',
      reason:
        'The good reply explains what the arrangement choice actually accomplishes; the bad reply is four stock phrases with no observation.',
    },
  ],
};
