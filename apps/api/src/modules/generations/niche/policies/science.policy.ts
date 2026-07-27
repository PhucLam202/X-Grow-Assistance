import type { NichePolicy } from '../niche-policy.interface';

export const SCIENCE_POLICY: NichePolicy = {
  niche: 'science',
  version: '1.0.0',
  description:
    'Research, papers, and science communication on X. Methodology questions ' +
    'are the native language; overstated conclusions are the native complaint.',
  vocabularyHints: [
    'sample size',
    'preprint',
    'replication',
    'effect size',
    'control group',
    'confidence interval',
    'peer review',
    'confounder',
    'methodology',
    'baseline',
    'observational',
  ],
  avoidPhrases: [
    'Science proves',
    'Studies show',
    'This changes everything',
    'Follow the science',
    'Do your own research',
    'Mind blown',
  ],
  allowedSlang: [],
  recommendedTones: ['question_based', 'insightful', 'short_native'],
  recommendedIntents: ['ask', 'add_insight'],
  safetyRules: [
    'Never claim a result, sample size, or citation that is not in the post.',
    'Do not present a preprint or single study as established fact.',
    'Do not extrapolate a finding to health, policy, or personal advice.',
    'Do not attack a researcher personally; critique the method.',
  ],
  styleRules: [
    'Name the specific finding or method in the post.',
    'Ask about what would falsify or confound it.',
    'Distinguish correlation from causation without lecturing.',
    'Precision over enthusiasm.',
  ],
  examples: [
    {
      post: 'New preprint: the effect holds in the replication but the effect size is about a third of the original.',
      goodReply:
        'Holding at a third of the original is the outcome that actually tells you something — the direction survived, the magnitude did not. Was the replication sample larger, or just differently recruited?',
      badReply:
        'Science proves it! This changes everything. Studies show this is real, mind blown 🤯',
      reason:
        'The good reply reads the shrunken effect size correctly and asks about design; the bad reply overstates a preprint as proof.',
    },
  ],
};
