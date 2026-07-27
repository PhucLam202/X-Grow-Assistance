import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const HEALTH_FITNESS_SIGNALS: NicheSignalDefinition = {
  niche: 'health_fitness',
  version: '1.0.0',
  strong: [
    en('workout', /\bworkouts?\b/),
    en('gym', /\b(gym|lifting session)\b/),
    en('lift', /\b(deadlift|squat|bench press|overhead press)\b/),
    en(
      'nutrition',
      /\b(calorie deficit|macros|protein intake|bulking|cutting)\b/,
    ),
    en('cardio', /\b(hiit|cardio|zone 2|vo2 ?max)\b/),
    en('running', /\b(marathon|half marathon|5k pace|couch to 5k)\b/),
    en('recovery', /\b(mobility work|physical therapy|foam roll)\b/),
    en('sleep', /\bsleep (quality|debt|hygiene)\b/),
    en('mental', /\b(mental health|burnout recovery|meditation|mindfulness)\b/),
    vi('suc-khoe', /tập gym|sức khỏe|giảm cân|dinh dưỡng/),
    ja('kintore', /筋トレ|ダイエット|健康|有酸素/),
  ],
  weak: [
    en('fitness', /\bfitness\b/),
    en('training', /\btraining plan\b/),
    en('diet', /\bdiets?\b/),
    en('weight', /\b(body ?weight|weight loss)\b/),
    en('reps', /\b\d+\s*(reps?|sets?)\b/),
    ja('undou', /運動|体調/),
  ],
  hashtagAliases: [
    'health',
    'fitness',
    'healthfitness',
    'health_fitness',
    'gym',
    'workout',
    'running',
    'mentalhealth',
  ],
  cashtags: [],
  domains: ['strava.com', 'myfitnesspal.com'],
};
