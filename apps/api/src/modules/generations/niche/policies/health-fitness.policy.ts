import type { NichePolicy } from '../niche-policy.interface';

export const HEALTH_FITNESS_POLICY: NichePolicy = {
  niche: 'health_fitness',
  version: '1.0.0',
  description:
    'Training, nutrition, recovery, and health on X. Highest-risk niche for ' +
    'unqualified advice — questions and shared observations only.',
  vocabularyHints: [
    'volume',
    'deload',
    'zone 2',
    'RPE',
    'progressive overload',
    'recovery',
    'mobility',
    'PR',
    'split',
    'form check',
    'base building',
  ],
  avoidPhrases: [
    'You should try',
    'Just eat less',
    'No pain no gain',
    'Beast mode',
    'Have you tried fasting',
    'Your form is wrong',
    'Amazing transformation!',
  ],
  allowedSlang: ['gains', 'PR’d', 'leg day', 'hit a wall'],
  recommendedTones: ['casual_supportive', 'question_based', 'short_native'],
  recommendedIntents: ['support', 'ask', 'react'],
  safetyRules: [
    'Never give medical advice, a diagnosis, a dosage, or a supplement recommendation.',
    'Do not prescribe a training or diet plan to a stranger.',
    'Do not comment on anyone’s body, weight, or appearance.',
    'If the post mentions pain, injury, or a symptom, point toward a professional rather than an opinion.',
    'Do not present anecdote as evidence.',
  ],
  /** Bản máy chạy được của `safetyRules` phía trên — xem Phase 5 safety filter. */
  safetyPatterns: [
    {
      id: 'health_fitness.dosage_or_supplement',
      pattern:
        /\b(?:take|dose|dosage|stack)\b(?=[^.!?]*\b(?:\d+\s*(?:mg|g|iu|ml|mcg)|creatine|whey|bcaa|test(?:osterone)?|sarms?)\b)/i,
      reason: 'Recommends a dose or supplement.',
      severity: 'reject',
    },
    {
      id: 'health_fitness.diagnosis',
      pattern:
        /\b(?:you (?:probably |likely )?have|sounds like|that'?s definitely)\b(?=[^.!?]*\b(?:tendinitis|hernia|torn|sprain|deficiency|thyroid|adhd|depression|diabetes)\b)/i,
      reason: 'Offers a diagnosis.',
      severity: 'reject',
    },
    {
      id: 'health_fitness.prescribed_plan',
      pattern:
        /(?<!\b(?:don'?t|do not|never|wouldn'?t|not)\s)\b(?:you should|just)\s+(?:do|run|lift|eat|cut|fast|train)\b(?=[^.!?]*\b(?:\d|daily|every day|per week|reps?|sets?|calories|carbs)\b)/i,
      reason: 'Prescribes a training or diet plan to a stranger.',
      severity: 'reject',
    },
    {
      id: 'health_fitness.body_comment',
      pattern:
        /\b(?:you look|your (?:body|arms|abs|legs|weight|face))\b|\b(?:lose|drop)\s+(?:some\s+)?(?:weight|fat|\d+\s*(?:kg|lbs?))\b/i,
      reason: "Comments on someone's body, weight, or appearance.",
      severity: 'reject',
    },
    {
      id: 'health_fitness.ignores_symptom',
      pattern: /\b(?:push through|no pain no gain|walk it off|man up)\b/i,
      reason:
        'Tells the poster to push through pain instead of seeing a professional.',
      severity: 'reject',
    },
  ],
  styleRules: [
    'React to the specific number, session, or milestone in the post.',
    'Ask about their experience instead of telling them about yours.',
    'Frame anything personal as "what worked for me", never as instruction.',
    'No transformation-account energy.',
  ],
  examples: [
    {
      post: 'Six months of zone 2 only. Same pace at 15 bpm lower heart rate.',
      goodReply:
        '15 bpm lower at the same pace after six months is exactly the change zone 2 is supposed to produce, and it’s slow enough that most people quit first. Did the easy pace itself start drifting faster too?',
      badReply:
        'Amazing transformation! You should try adding sprints now, and have you tried fasting? No pain no gain 💪',
      reason:
        'The good reply engages the specific adaptation described; the bad reply hands out three pieces of unsolicited advice to a stranger.',
    },
  ],
};
