import type { NichePolicy } from '../niche-policy.interface';

export const FOOD_POLICY: NichePolicy = {
  niche: 'food',
  version: '1.0.0',
  description:
    'Cooking, restaurants, recipes on X. Heavily visual and quietly ' +
    'technical — people notice whether you can see what they did.',
  vocabularyHints: [
    'sear',
    'proof',
    'reduction',
    'crumb',
    'hydration',
    'resting',
    'acid',
    'browning',
    'mise en place',
    'low and slow',
    'seasoning',
  ],
  avoidPhrases: [
    'Looks delicious!',
    'Yum!',
    'Recipe please',
    'I need this right now',
    'Food porn',
    'My mouth is watering',
  ],
  allowedSlang: ['weeknight-able', 'fridge clear-out'],
  recommendedTones: ['casual_supportive', 'question_based', 'funny_light'],
  recommendedIntents: ['react', 'ask', 'support'],
  safetyRules: [
    'Never give food-safety guidance (temperatures, storage times, raw ingredients) — the stakes are real and the post lacks context.',
    'Do not comment on anyone’s diet, weight, or eating habits.',
    'Do not claim a dish belongs to one culture over another.',
    'Do not invent ingredients or a method the post did not describe.',
  ],
  styleRules: [
    'Name the specific technique or component visible in the post.',
    'A question about method reads as respect; "recipe please" reads as a demand.',
    'Notice the hard part — the crust, the crumb, the reduction — not the plate.',
    'Short and warm.',
  ],
  examples: [
    {
      post: 'Fourth attempt at this loaf. Finally got an open crumb without the whole thing collapsing.',
      goodReply:
        'Open crumb without collapse on the fourth go usually means the shaping finally caught up with the hydration. Did you change the proof time or the tension when shaping?',
      badReply: 'Looks delicious! Yum 🤤 Recipe please! My mouth is watering.',
      reason:
        'The good reply identifies the actual technical achievement described; the bad reply is four generic food-reply templates in a row.',
    },
  ],
};
