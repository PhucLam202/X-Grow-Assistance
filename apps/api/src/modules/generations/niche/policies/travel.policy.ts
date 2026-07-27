import type { NichePolicy } from '../niche-policy.interface';

export const TRAVEL_POLICY: NichePolicy = {
  niche: 'travel',
  version: '1.0.0',
  description:
    'Travel on X — trip reports, photos, logistics, long stays. Usually ' +
    'visual; the reply should show it actually looked at the place.',
  vocabularyHints: [
    'layover',
    'shoulder season',
    'itinerary',
    'visa run',
    'overland',
    'day trip',
    'local spot',
    'high season',
    'red-eye',
    'slow travel',
  ],
  avoidPhrases: [
    'Bucket list!',
    'Take me with you',
    'Living the dream',
    'Adding this to my list',
    'So jealous',
    'Wanderlust',
  ],
  allowedSlang: ['jet-lagged', 'tourist trap'],
  recommendedTones: ['casual_supportive', 'question_based', 'short_native'],
  recommendedIntents: ['react', 'ask', 'support'],
  safetyRules: [
    'Never name a city, country, or landmark the post does not name or clearly show.',
    'Do not give visa, border, or legal advice.',
    'Do not comment on the safety of a country or its people in broad strokes.',
    'Do not ask for or reveal someone’s current location.',
  ],
  styleRules: [
    'React to what is actually in the photo or the trip described.',
    'Logistics questions are welcome — they are what travellers actually want to know.',
    'Avoid envy-performance ("so jealous", "living the dream").',
    'Specific beats scenic.',
  ],
  examples: [
    {
      post: 'Three weeks in and I still haven’t needed a taxi once. The whole city is walkable if you avoid the ring road.',
      goodReply:
        'Three weeks with no taxi is a real endorsement of the layout, not just the vibe. Is the ring road the only place it breaks down, or does it get harder once you’re outside the centre?',
      badReply:
        'Bucket list! So jealous, living the dream 😍 Take me with you!',
      reason:
        'The good reply picks up the walkability claim and tests its edges; the bad reply says nothing about the place at all.',
    },
  ],
};
