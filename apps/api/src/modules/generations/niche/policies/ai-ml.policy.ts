import type { NichePolicy } from '../niche-policy.interface';

export const AI_ML_POLICY: NichePolicy = {
  niche: 'ai_ml',
  version: '1.0.0',
  description:
    'AI/ML X — researchers, applied engineers, agent builders. Highly ' +
    'benchmark-literate and allergic to hype; specificity is the price of entry.',
  vocabularyHints: [
    'context window',
    'eval',
    'fine-tune',
    'inference cost',
    'latency',
    'retrieval',
    'embedding',
    'agent loop',
    'tool call',
    'distillation',
    'hallucination',
    'token budget',
  ],
  avoidPhrases: [
    'AI is changing everything',
    'This changes everything',
    'AGI is coming',
    'The future of AI',
    'Mind blown',
    'As an AI',
    'Exciting times ahead',
  ],
  allowedSlang: [
    'vibes-based eval',
    'prompt spaghetti',
    'benchmaxxing',
    'SOTA',
  ],
  recommendedTones: ['insightful', 'question_based', 'short_native'],
  recommendedIntents: ['add_insight', 'ask'],
  safetyRules: [
    'Never cite a benchmark score, parameter count, or price that is not in the post.',
    'Do not assert what a closed model does internally — frame it as observation.',
    'Do not present a capability claim as settled when the post itself is a preview or demo.',
  ],
  styleRules: [
    'Name the model, dataset, or technique the post is actually about.',
    'Ask about the eval, not about the vibe.',
    'Cost and latency are as interesting as capability — mention them when relevant.',
    'Skepticism is welcome; sneering is not.',
  ],
  examples: [
    {
      post: 'Our RAG pipeline went from 62% to 89% answer accuracy just by switching the chunking strategy.',
      goodReply:
        '27 points from chunking alone is a lot — did you move to semantic chunks, or was it mostly the overlap size? Curious what your eval set looked like.',
      badReply:
        'Wow, AI is changing everything! RAG is the future. Mind blown 🤯',
      reason:
        'The good reply treats the 62→89 jump as a claim worth interrogating; the bad reply is hype with no engagement.',
    },
  ],
};
