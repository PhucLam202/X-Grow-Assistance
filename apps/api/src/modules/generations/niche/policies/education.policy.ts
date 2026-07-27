import type { NichePolicy } from '../niche-policy.interface';

export const EDUCATION_POLICY: NichePolicy = {
  niche: 'education',
  version: '1.0.0',
  description:
    'Teaching, studying, and learning on X — teachers, students, self-learners. ' +
    'Curiosity is the currency; condescension is the failure mode.',
  vocabularyHints: [
    'curriculum',
    'cohort',
    'spaced repetition',
    'first principles',
    'office hours',
    'syllabus',
    'grading',
    'retention',
    'prerequisite',
    'worked example',
  ],
  avoidPhrases: [
    'Actually, it’s simple',
    'They don’t teach this in school',
    'Education is broken',
    'Just read a book',
    'Great thread!',
    'Saving this for later',
  ],
  allowedSlang: ['crammed', 'brain dump'],
  recommendedTones: ['question_based', 'insightful', 'casual_supportive'],
  recommendedIntents: ['ask', 'add_insight', 'support'],
  safetyRules: [
    'Never state a fact, date, or citation that is not in the post.',
    'Do not correct someone publicly unless the post is clearly asking for correction.',
    'Do not generalise about students, teachers, or a national school system.',
  ],
  styleRules: [
    'Engage the specific concept, lesson, or study method described.',
    'Ask how it worked in practice, not whether it works in theory.',
    'If you add information, make it additive — never a correction dressed as a fact.',
    'No "well, actually" openers.',
  ],
  examples: [
    {
      post: 'Stopped giving my students the formula sheet. Test scores dropped 8% but their explanations got noticeably better.',
      goodReply:
        'Scores down 8% while explanations improve is the tradeoff most grading systems can’t see. Are you weighting the written reasoning differently now, or is the 8% just the cost?',
      badReply:
        'Great thread! They don’t teach this in school. Education is broken. Saving this for later 🙏',
      reason:
        'The good reply engages the specific tension between the two results; the bad reply is a stack of unrelated slogans.',
    },
  ],
};
