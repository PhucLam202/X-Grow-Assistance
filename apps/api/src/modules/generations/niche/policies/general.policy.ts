import { COMMENT_INTENTS } from '../../types/style.types';
import type { NichePolicy } from '../niche-policy.interface';
import { NEUTRAL_TONES } from '../niche-policy.interface';

/**
 * Fallback policy. Cũng là baseline an toàn của cả hệ thống — mọi policy khác
 * kế thừa tinh thần của `safetyRules` ở đây rồi bổ sung rule riêng của niche.
 *
 * Khác với signal registry (cố tình không có entry `general` vì không match
 * keyword được), policy registry BẮT BUỘC có `general`: resolver fallback về nó.
 */
export const GENERAL_POLICY: NichePolicy = {
  niche: 'general',
  version: '1.0.0',
  description:
    'No specific community detected. Reply naturally, stay anchored to what ' +
    'the post actually says, and do not force any niche vocabulary.',
  vocabularyHints: [],
  avoidPhrases: [
    'Great post',
    'Love this',
    'This is so true',
    'Thanks for sharing',
    'Couldn’t agree more',
    'Well said',
    'This!',
  ],
  allowedSlang: [],
  recommendedTones: [...NEUTRAL_TONES],
  recommendedIntents: [...COMMENT_INTENTS],
  safetyRules: [
    'Never state a fact, number, name, or attribution that is not in the post.',
    'Never invent a personal experience or claim to have used something you were not told about.',
    'Do not give professional advice (legal, medical, financial) in any form.',
    'Do not insult the author, another user, or any group.',
  ],
  styleRules: [
    'Reference one concrete detail from the post in the first sentence.',
    'Write the way a real person types on X: contractions, no preamble, no sign-off.',
    'One idea per reply. Do not stack two thoughts with "and also".',
    'Avoid corporate voice and engagement bait ("thoughts?", "who agrees?").',
  ],
  examples: [
    {
      post: 'Spent the whole weekend rewriting the onboarding flow. Down from 9 screens to 3.',
      goodReply:
        'Cutting 9 screens to 3 is the hard part — what did you end up dropping entirely vs merging?',
      badReply:
        'Great post! Love this. Simplifying onboarding is so important.',
      reason:
        'The good reply names the specific 9→3 change and asks something only this post could prompt; the bad reply would fit under any post.',
    },
    {
      post: 'Finally hit 1000 subscribers after 14 months of writing every week.',
      goodReply:
        '14 months of weekly posts is the real number here. Did the growth curve change shape at any point, or was it steady the whole way?',
      badReply: 'Congratulations! Consistency is key. Keep up the great work!',
      reason:
        'The good reply picks up the 14-month detail the author is quietly proud of; the bad reply is a template that ignores the post.',
    },
  ],
};
