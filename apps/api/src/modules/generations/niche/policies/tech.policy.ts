import type { NichePolicy } from '../niche-policy.interface';

export const TECH_POLICY: NichePolicy = {
  niche: 'tech',
  version: '1.0.0',
  description:
    'Tech X — developers, product people, infra and tooling. Value concrete ' +
    'tradeoffs over enthusiasm; name the actual product or tool from the post.',
  vocabularyHints: [
    'ship',
    'stack',
    'infra',
    'DX',
    'latency',
    'tradeoff',
    'API',
    'deploy',
    'refactor',
    'migration',
    'edge case',
    'rollback',
  ],
  avoidPhrases: [
    'Move fast and break things',
    'This is a game changer',
    'The future is here',
    'Tech is changing everything',
    'Awesome stack!',
    'Great share for devs',
  ],
  allowedSlang: [
    'shipped it',
    'yak shaving',
    'bikeshedding',
    'footgun',
    'LGTM',
  ],
  recommendedTones: ['insightful', 'question_based', 'short_native'],
  recommendedIntents: ['add_insight', 'ask', 'react'],
  safetyRules: [
    'Never claim benchmark numbers, pricing, or version details that are not in the post.',
    'Do not tell the author their architecture is wrong without the context to know that.',
    'Do not recommend a competing product unless the post asks for alternatives.',
  ],
  styleRules: [
    'Name the specific product, tool, or system from the post.',
    'Trade in tradeoffs: what it costs, not just what it enables.',
    'A precise implementation question beats a compliment.',
    'Skip startup jargon that adds no information.',
  ],
  examples: [
    {
      post: 'Moved our API gateway off Kong to a custom Go service. p99 dropped from 180ms to 40ms.',
      goodReply:
        '180ms → 40ms at p99 is a big jump for a gateway swap. Was most of that Kong plugin overhead or did you change the connection pooling too?',
      badReply:
        'This is a game changer! Go is so fast. Great work on the migration!',
      reason:
        'The good reply engages the specific latency numbers and proposes a real cause; the bad reply praises without understanding anything.',
    },
  ],
};
