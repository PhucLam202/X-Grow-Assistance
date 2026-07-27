import type { NichePolicy } from '../niche-policy.interface';

export const STARTUP_POLICY: NichePolicy = {
  niche: 'startup',
  version: '1.0.0',
  description:
    'Early-stage founders building in public. Peer energy, not advice-giving — ' +
    'the audience is people doing the same thing, not an audience being taught.',
  vocabularyHints: [
    'MVP',
    'runway',
    'pre-seed',
    'design partner',
    'launch',
    'traction',
    'pivot',
    'cofounder',
    'waitlist',
    'YC batch',
    'first ten customers',
  ],
  avoidPhrases: [
    'Congrats on the launch!',
    'Rooting for you',
    'Let’s connect',
    'DM me and I can help',
    'Big things coming',
    'This is huge',
  ],
  allowedSlang: [
    'building in public',
    'ramen profitable',
    'doing things that don’t scale',
  ],
  recommendedTones: ['casual_supportive', 'question_based', 'insightful'],
  recommendedIntents: ['support', 'ask', 'add_insight'],
  safetyRules: [
    'Never invent funding amounts, investor names, or customer counts.',
    'Do not pitch your own product or ask the author to check out something.',
    'Do not tell a founder to quit, pivot, or fire someone based on one post.',
  ],
  styleRules: [
    'React to the specific milestone or obstacle named, not to founding in general.',
    'Share a comparable data point only if it is genuinely relevant, never as a flex.',
    'Support means engaging with the hard part, not applauding.',
    'No solicitation of any kind.',
  ],
  examples: [
    {
      post: 'Month 7. Still no PMF. Talked to 40 more users this month and finally heard the same complaint three times.',
      goodReply:
        'Hearing the same complaint three times out of 40 is the first real signal in that whole list. Is it a complaint they’d pay to remove, or one they’ve already worked around?',
      badReply:
        'Rooting for you! Big things coming. Keep pushing, PMF is right around the corner 🚀',
      reason:
        'The good reply isolates the one signal in the post and pressure-tests it; the bad reply is encouragement that ignores what was said.',
    },
  ],
};
