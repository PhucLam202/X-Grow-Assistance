import type { NichePolicy } from '../niche-policy.interface';

/**
 * `safetyRules` ở đây là nội dung bắt buộc (doc Phase 3, test case 6): policy
 * news phải có factuality rules. Đừng rút gọn chúng.
 */
export const NEWS_POLICY: NichePolicy = {
  niche: 'news',
  version: '1.0.0',
  description:
    'Breaking and developing news on X. Stay observational — a precise ' +
    'question about the specific event is usually the most valuable reply.',
  vocabularyHints: [
    'developing',
    'reported',
    'confirmed',
    'according to',
    'statement',
    'timeline',
    'context',
    'source',
    'update',
  ],
  avoidPhrases: [
    'Thoughts and prayers',
    'This is important',
    'Wake up people',
    'The media won’t tell you',
    'Everyone needs to see this',
    'Told you so',
  ],
  allowedSlang: [],
  recommendedTones: ['question_based', 'short_native', 'insightful'],
  recommendedIntents: ['ask', 'react'],
  safetyRules: [
    'Do not state facts, numbers, or attributions that are not in the post.',
    'Do not amplify unverified claims; prefer a precise question.',
    'Avoid partisan framing and political hot takes.',
    'Never assign blame to a named person or group beyond what the post reports.',
    'Do not speculate about casualties, motives, or outcomes.',
  ],
  /**
   * Bản máy chạy được của `safetyRules` phía trên. Factuality tổng quát ("số
   * không có trong post") do `factuality-filter.service.ts` lo — nó cần chính
   * post context nên không biểu diễn được bằng regex tĩnh ở đây.
   */
  safetyPatterns: [
    {
      id: 'news.casualty_speculation',
      pattern:
        /\b(?:probably|likely|must be|i (?:bet|reckon)|no doubt)\b(?=[^.!?]*\b(?:dead|died|killed|casualt|injur|body count|victims?)\b)/i,
      reason: 'Speculates about casualties.',
      severity: 'reject',
    },
    {
      id: 'news.motive_speculation',
      pattern:
        /\b(?:this was|it was|clearly)\s+(?:a\s+)?(?:false flag|inside job|staged|planned|coordinated)\b/i,
      reason: 'Speculates about motive or pushes an unverified theory.',
      severity: 'reject',
    },
    {
      id: 'news.blame_assignment',
      pattern:
        /\b(?:this is (?:all )?|blame|thanks to)\s+(?:the\s+)?(?:left|right|democrats?|republicans?|liberals?|conservatives?|government|regime)(?:'s)?\s*(?:fault)?\b/i,
      reason: 'Assigns blame or uses partisan framing.',
      severity: 'reject',
    },
    {
      id: 'news.unverified_amplification',
      pattern:
        /\b(?:i heard|apparently|word is|rumour has it|rumor has it|sources say)\b/i,
      reason: 'Amplifies an unverified claim.',
      severity: 'penalty',
    },
  ],
  styleRules: [
    'Name the specific event, place, or organization from the post.',
    'Distinguish what is reported from what is inferred.',
    'A question about missing context is safer and more useful than a verdict.',
    'Keep it short — long replies on breaking news read as grandstanding.',
  ],
  examples: [
    {
      post: 'Regulators have opened an inquiry into the outage that took the payments network offline for six hours yesterday.',
      goodReply:
        'Six hours is long enough that the inquiry will probably focus on the failover, not the initial fault. Has anyone said whether the backup path was tested this year?',
      badReply:
        'This is important. Thoughts and prayers to everyone affected. The media won’t tell you the real reason.',
      reason:
        'The good reply stays inside what was reported and asks a specific, answerable question; the bad reply adds insinuation and reports nothing.',
    },
  ],
};
