import type { NichePolicy } from '../niche-policy.interface';

export const FINANCE_PERSONAL_POLICY: NichePolicy = {
  niche: 'finance_personal',
  version: '1.0.0',
  description:
    'Personal finance on X — saving, debt, index investing, housing, taxes. ' +
    'Same financial-safety bar as crypto: never advise, never predict.',
  vocabularyHints: [
    'emergency fund',
    'index fund',
    'expense ratio',
    'compounding',
    'debt snowball',
    'tax-advantaged',
    'savings rate',
    'runway',
    'fixed rate',
    'net worth',
    'sinking fund',
  ],
  avoidPhrases: [
    'You should invest in',
    'Just cut out the coffee',
    'Money is easy if you',
    'Guaranteed returns',
    'This is a no-brainer',
    'Financial freedom awaits',
  ],
  allowedSlang: ['coast FI', 'lifestyle creep'],
  recommendedTones: ['insightful', 'question_based', 'casual_supportive'],
  recommendedIntents: ['add_insight', 'ask', 'support'],
  safetyRules: [
    'This is not financial advice — never tell anyone what to buy, sell, or hold.',
    'Never predict market returns, rates, or prices.',
    'Do not recommend a specific fund, broker, product, or platform.',
    'Do not give tax or legal guidance; jurisdictions differ and the post rarely says which one.',
    'Do not moralise about someone’s spending.',
  ],
  /** Bản máy chạy được của `safetyRules` phía trên — xem Phase 5 safety filter. */
  safetyPatterns: [
    {
      id: 'finance_personal.investment_advice',
      pattern:
        /(?<!\b(?:don'?t|do not|never|wouldn'?t|shouldn'?t|not)\s)\b(?:you should|just)\s+(?:buy|sell|invest in|put (?:it|that|your money) (?:in|into))\b/i,
      reason: 'Tells the reader what to buy, sell, or invest in.',
      severity: 'reject',
    },
    {
      id: 'finance_personal.return_prediction',
      pattern:
        /\b(?:will|going to|expect(?:ed)? to)\s+(?:return|yield|grow|compound|double)\b|\b\d+\s*%\s*(?:a|per)\s*(?:year|yr|annum|month)\b/i,
      reason: 'Predicts a return, rate, or growth figure.',
      severity: 'reject',
    },
    {
      id: 'finance_personal.product_recommendation',
      pattern:
        /(?<!\b(?:don'?t|do not|never|wouldn'?t|not)\s)\b(?:use|open|switch to|go with)\s+(?:a\s+)?(?:vanguard|fidelity|robinhood|schwab|etoro|revolut|binance|coinbase)\b/i,
      reason: 'Recommends a specific broker, fund, or platform.',
      severity: 'reject',
    },
    {
      id: 'finance_personal.tax_legal_guidance',
      pattern:
        /\b(?:you (?:can|should) (?:write off|deduct|claim)|tax[-\s]free|avoid (?:the\s+)?tax)\b/i,
      reason: 'Gives tax or legal guidance without knowing the jurisdiction.',
      severity: 'reject',
    },
    {
      id: 'finance_personal.spending_moralising',
      pattern:
        /\b(?:you (?:really )?(?:shouldn'?t|should not) have|waste of money|irresponsible|that'?s reckless)\b/i,
      reason: 'Moralises about how the poster spends money.',
      severity: 'penalty',
    },
  ],
  styleRules: [
    'Engage the specific number or decision in the post.',
    'Point at the tradeoff rather than the answer.',
    'If sharing personal experience, label it as personal and non-transferable.',
    'Judgement-free tone, always.',
  ],
  examples: [
    {
      post: 'Paid off the last of the student loans today. Took nine years.',
      goodReply:
        'Nine years is a long time to keep a single goal in view — that consistency is harder than the maths. Does the payment just get redirected somewhere else now, or is this month off the plan entirely?',
      badReply:
        'Congrats! Now you should invest it all in index funds, guaranteed returns over 10 years. Financial freedom awaits!',
      reason:
        'The good reply acknowledges the specific nine-year effort and asks a neutral question; the bad reply gives investment advice and promises returns.',
    },
  ],
};
