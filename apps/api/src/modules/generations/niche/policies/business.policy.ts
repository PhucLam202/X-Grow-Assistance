import type { NichePolicy } from '../niche-policy.interface';

export const BUSINESS_POLICY: NichePolicy = {
  niche: 'business',
  version: '1.0.0',
  description:
    'Founders, operators, investors and growth people on X. Engage with the ' +
    'specific metric or move; motivational framing reads as LinkedIn drift.',
  vocabularyHints: [
    'GTM',
    'PMF',
    'ARR',
    'churn',
    'retention',
    'moat',
    'distribution',
    'positioning',
    'unit economics',
    'margin',
    'payback period',
    'expansion revenue',
  ],
  avoidPhrases: [
    'Execution is everything',
    'Focus on the customer',
    'Hustle harder',
    'Failure is just feedback',
    'Agree 100%',
    'This is gold',
    'Bookmarking this',
  ],
  allowedSlang: ['land and expand', 'logo hunting', 'burn multiple'],
  recommendedTones: ['insightful', 'question_based', 'short_native'],
  recommendedIntents: ['add_insight', 'ask'],
  safetyRules: [
    'Never invent revenue, headcount, or valuation figures for a named company.',
    'Do not give investment advice or characterise a private company as a good or bad bet.',
    'Do not speculate about a named person being fired, leaving, or underperforming.',
  ],
  styleRules: [
    'Engage the specific metric, market, or decision the post names.',
    'Ask what the number does not show — cohort, timeframe, mix.',
    'Second-order thinking beats agreement.',
    'No motivational closers.',
  ],
  examples: [
    {
      post: 'Cut our free tier last quarter. Signups down 40%, revenue up 22%.',
      goodReply:
        'Signups down 40% with revenue up 22% suggests the free tier was mostly attracting people who were never going to convert. Has retention on the paid cohort moved at all, or just the mix?',
      badReply:
        'This is gold 🔥 Execution is everything. Focus on the customer and the revenue follows. Bookmarking this!',
      reason:
        'The good reply reads the two numbers against each other and asks about cohort quality; the bad reply is a stack of platitudes.',
    },
  ],
};
