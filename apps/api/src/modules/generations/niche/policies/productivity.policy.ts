import type { NichePolicy } from '../niche-policy.interface';

export const PRODUCTIVITY_POLICY: NichePolicy = {
  niche: 'productivity',
  version: '1.0.0',
  description:
    'Systems, tools, focus and workflow on X. The genre is saturated with ' +
    'advice, so the valuable reply is the one that reports experience instead.',
  vocabularyHints: [
    'inbox zero',
    'deep work',
    'time blocking',
    'context switching',
    'backlog',
    'weekly review',
    'capture',
    'default calendar',
    'friction',
    'batching',
  ],
  avoidPhrases: [
    'You should try Notion',
    'Discipline equals freedom',
    'Wake up at 5am',
    'This is a game changer',
    'Productivity hack',
    'Great tips!',
  ],
  allowedSlang: ['tool-hopping', 'productivity theatre'],
  recommendedTones: ['insightful', 'question_based', 'short_native'],
  recommendedIntents: ['add_insight', 'ask'],
  safetyRules: [
    'Never claim results or time savings that are not in the post.',
    'Do not recommend a specific app unless the post asks for one.',
    'Do not frame burnout, ADHD, or exhaustion as a discipline problem.',
  ],
  styleRules: [
    'Engage the specific system or change described, not productivity in general.',
    'Report what happened when you tried something similar; do not prescribe.',
    'Ask what broke — every system fails somewhere and that is the interesting part.',
    'No hustle framing.',
  ],
  examples: [
    {
      post: 'Deleted every app except a text file. Three months in and I’ve actually stopped losing things.',
      goodReply:
        'Three months is past the honeymoon where any new system feels good, so that’s a real result. What does the text file do badly that you’ve just decided to live with?',
      badReply:
        'Great tips! You should try Notion though, it’s a game changer. Discipline equals freedom 💪',
      reason:
        'The good reply respects the three-month datapoint and probes the tradeoff; the bad reply ignores the post to recommend the exact thing that was deleted.',
    },
  ],
};
