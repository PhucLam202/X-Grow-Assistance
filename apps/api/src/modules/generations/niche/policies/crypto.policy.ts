import type { NichePolicy } from '../niche-policy.interface';

/**
 * `safetyRules` ở đây là nội dung bắt buộc (doc Phase 3, test case 5): policy
 * crypto phải có financial safety rules. Đừng rút gọn chúng.
 */
export const CRYPTO_POLICY: NichePolicy = {
  niche: 'crypto',
  version: '1.0.0',
  description:
    'Crypto X — traders, builders, degens, long-term holders. Anchor to the ' +
    'named token, protocol, or event; market takes without an anchor read as noise.',
  vocabularyHints: [
    'narrative',
    'conviction',
    'liquidity',
    'on-chain',
    'cycle',
    'catalyst',
    'unlock',
    'TVL',
    'bridge',
    'governance',
    'mainnet',
    'custody',
  ],
  avoidPhrases: [
    'To the moon',
    'This is going to 100x',
    'Not gonna make it',
    'Buy the dip',
    'Financial advice: buy now',
    'Guaranteed returns',
    'Easy money',
  ],
  allowedSlang: ['degen', 'bags', 'alpha', 'gm', 'ser', 'aped', 'rekt'],
  recommendedTones: ['crypto_casual', 'insightful', 'question_based'],
  recommendedIntents: ['react', 'ask', 'add_insight'],
  safetyRules: [
    'This is not financial advice — never phrase a reply as a recommendation to buy, sell, or hold.',
    'Never predict prices or promise returns, in any timeframe.',
    'Do not endorse or shill a specific token, presale, or airdrop.',
    'Never claim on-chain data, TVL, or volume figures that are not in the post.',
    'Do not downplay risk of loss when the post involves leverage or a new protocol.',
  ],
  /**
   * Bản máy chạy được của `safetyRules` phía trên (Phase 5 filter). Không phải
   * rule nào cũng dịch được — "do not downplay risk" thì chỉ prompt lo được.
   * Negative lookbehind ở nhánh recommendation là có chủ đích: "I wouldn't buy
   * this" là quan sát, "buy this" là khuyến nghị.
   */
  safetyPatterns: [
    {
      id: 'crypto.price_prediction',
      pattern:
        /\b(?:going to|gonna|will|about to)\s+(?:\d+\s*x\b|moon\b|pump\b|dump\b|hit\s+\$?\d)/i,
      reason: 'Predicts a price move, which the crypto policy prohibits.',
      severity: 'reject',
    },
    {
      id: 'crypto.multiple_target',
      pattern:
        /\b\d+\s*x\b(?=[^.!?]*\b(?:soon|incoming|by\s|this\s+(?:year|month|cycle)|eoy)\b)/i,
      reason: 'States a price multiple with a timeframe.',
      severity: 'reject',
    },
    {
      id: 'crypto.trade_recommendation',
      pattern:
        /(?<!\b(?:don'?t|do not|never|wouldn'?t|shouldn'?t|not)\s)\b(?:buy|sell|short|long|ape into)\s+(?:the\s+)?(?:dip|top|this|it|now|\$[A-Za-z]{2,6})\b/i,
      reason: 'Reads as a recommendation to buy, sell, or hold.',
      severity: 'reject',
    },
    {
      id: 'crypto.guaranteed_returns',
      pattern:
        /\b(?:guaranteed|risk[-\s]?free|can'?t lose|sure thing|no[-\s]brainer)\b(?=[^.!?]*\b(?:returns?|profits?|gains?|money|yield|apy)\b)|\bguaranteed\s+\d+\s*%/i,
      reason: 'Promises returns or frames the trade as risk-free.',
      severity: 'reject',
    },
    {
      id: 'crypto.shill',
      pattern:
        /\b(?:presale|airdrop|whitelist|stealth launch)\b(?=[^.!?]*\b(?:join|dm|link in bio|don'?t miss|get in)\b)/i,
      reason: 'Promotes a presale, airdrop, or whitelist.',
      severity: 'reject',
    },
  ],
  styleRules: [
    'Name the asset, protocol, or event from the post before saying anything else.',
    'Prefer mechanism over sentiment: what would have to be true for this to hold.',
    'Curiosity beats conviction — a sharp question ages better than a call.',
    'Keep it dry. Crypto X rewards understatement more than exclamation marks.',
  ],
  examples: [
    {
      post: 'Base sequencer went down for 40 minutes this morning. Zero funds lost but withdrawals were stuck.',
      goodReply:
        '40 minutes with withdrawals stuck is the part worth watching — was the escape hatch actually usable during the outage, or only after the sequencer came back?',
      badReply:
        'Bearish for Base. Time to buy the dip on other L2s, this one is going to 100x 🚀',
      reason:
        'The good reply digs into the specific failure mode; the bad reply gives a price call and a buy recommendation, both prohibited.',
    },
  ],
};
