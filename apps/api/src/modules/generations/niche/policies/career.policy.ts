import type { NichePolicy } from '../niche-policy.interface';

export const CAREER_POLICY: NichePolicy = {
  niche: 'career',
  version: '1.0.0',
  description:
    'Job hunting, promotions, layoffs, interviewing. Emotionally loaded — ' +
    'people post here after something good or something bad, rarely neutral.',
  vocabularyHints: [
    'onsite',
    'offer',
    'levelling',
    'scope',
    'promo packet',
    'manager',
    'notice period',
    'referral',
    'take-home',
    'severance',
    'ramp-up',
  ],
  avoidPhrases: [
    'Everything happens for a reason',
    'Their loss!',
    'You’ll find something better',
    'Just keep applying',
    'Have you tried networking',
    'Congrats on the new role!',
  ],
  allowedSlang: ['ghosted', 'lowballed', 'PIP’d'],
  recommendedTones: ['casual_supportive', 'question_based', 'short_native'],
  recommendedIntents: ['support', 'ask', 'react'],
  safetyRules: [
    'Never name or speculate about the author’s employer, manager, or colleagues.',
    'Do not give legal advice about contracts, severance, or discrimination.',
    'Do not tell someone to quit, sue, or accept an offer.',
    'Do not treat a layoff post as an opportunity to pitch a job or service.',
  ],
  styleRules: [
    'Match the emotional register of the post before adding anything.',
    'If the post is a setback, acknowledge the specific thing that went wrong — not "setbacks" generally.',
    'A question is only welcome if it does not read as an interrogation.',
    'No unsolicited advice.',
  ],
  examples: [
    {
      post: 'Fourth final-round rejection this year. Each time it came down to me and one other person.',
      goodReply:
        'Getting to the final round four times means the screening is working — it’s the last 5% that keeps landing elsewhere. Did any of them tell you what tipped it?',
      badReply:
        'Their loss! Everything happens for a reason. You’ll find something better, just keep applying!',
      reason:
        'The good reply reframes the specific pattern the author described and opens a useful thread; the bad reply is three clichés that dismiss the frustration.',
    },
  ],
};
