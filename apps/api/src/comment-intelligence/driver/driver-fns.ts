import { LanguageDetectorService } from '../../common/language/language-detector.service';
import {
  CommentDepth,
  CommentZone,
  DriverInput,
} from '../types/comment-intelligence.types';

export function classifyZone(input: DriverInput): CommentZone {
  const text = allText(input);
  if (/war|death|killed|racis|religion|politic|nsfw|suicide|scam/i.test(text))
    return 'risky_topic';
  if (/anime|manga|one piece|naruto|jujutsu|vtuber|アニメ|漫画|マンガ|推し/i.test(text))
    return /meme|😂|🤣|ｗｗ|笑|lol|lmao/i.test(text) || (input.media?.length ?? 0) > 0
      ? 'anime_meme'
      : 'general';
  if (/congrats|congratulations|shipped|launched|milestone|won|passed|achieved/i.test(text))
    return 'achievement_congrats';
  if (/sad|sorry|tired|burnout|heartbroken|miss you|つらい|悲しい/i.test(text))
    return 'emotional_support';
  if (/typescript|react|api|database|ai|llm|openai|claude|code|bug|deploy/i.test(text))
    return 'technical_insight';
  if (/breaking|news|announced|report|update|速報/i.test(text))
    return 'news_reaction';
  if (/hot take|unpopular opinion|debate|wrong|agree|disagree|controversial/i.test(text))
    return 'debate_hot_take';
  if (mainText(input).length < 30 && !input.quotedPost && !input.parentPost)
    return 'low_context';
  return 'general';
}

export function classifyIntent(input: DriverInput, zone: CommentZone): string {
  const text = input.mainPost.text ?? '';
  if (/[?？]/.test(text)) return 'question_reply';
  if (zone === 'anime_meme') return 'joke_reaction';
  if (zone === 'achievement_congrats') return 'congratulate';
  if (zone === 'emotional_support') return 'support_emotion';
  if (zone === 'technical_insight') return 'value_add';
  if (zone === 'news_reaction') return 'timely_reaction';
  if (zone === 'debate_hot_take') return 'careful_positioning';
  if (zone === 'risky_topic') return 'avoid_or_safe_reply';
  if (zone === 'low_context') return 'context_probe';
  return 'natural_reaction';
}

export function recommendLanguage(
  input: DriverInput,
  languageDetector: LanguageDetectorService,
): string {
  if (input.mainPost.language && input.mainPost.language !== 'unknown')
    return input.mainPost.language;
  const text = [input.mainPost.text, input.quotedPost?.text, input.parentPost?.text]
    .filter(Boolean)
    .join(' ');
  return languageDetector.detect(text);
}

// ponytail: const lookup beats a class with one method
const ZONE_TONES: Record<CommentZone, string> = {
  anime_meme: 'funny_native',
  achievement_congrats: 'supportive_specific',
  emotional_support: 'warm_gentle',
  technical_insight: 'smart_specific',
  news_reaction: 'safe_observational',
  debate_hot_take: 'calm_balanced',
  low_context: 'curious_safe',
  risky_topic: 'safe_neutral',
  general: 'natural_native',
};

export function recommendTone(zone: CommentZone): string {
  return ZONE_TONES[zone];
}

export function recommendDepth(input: DriverInput, zone: CommentZone): CommentDepth {
  if (zone === 'technical_insight') return 'deep';
  if (zone === 'debate_hot_take' || zone === 'news_reaction') return 'medium';
  if (zone === 'low_context') return 'short';
  if ((input.authorContinuations?.length ?? 0) > 1) return 'medium';
  if ((input.mainPost.text?.length ?? 0) > 240) return 'medium';
  return 'short';
}

export function decideSafety(
  input: DriverInput,
  zone: CommentZone,
): { shouldComment: boolean; avoid: string[] } {
  const avoid = ['Do not sound generic', 'Do not ignore quote/parent context'];
  if (zone === 'risky_topic')
    return {
      shouldComment: false,
      avoid: [...avoid, 'Do not engage with unsafe, hateful, or highly political content'],
    };
  if (input.extraction.confidence < 0.35)
    return {
      shouldComment: false,
      avoid: [...avoid, 'Do not comment when extraction confidence is too low'],
    };
  return { shouldComment: true, avoid };
}

export function writeStrategy(input: {
  driverInput: DriverInput;
  zone: CommentZone;
  intent: string;
  language: string;
  tone: string;
  depth: CommentDepth;
}): string {
  const sources = input.driverInput.contextState?.expansionSources ?? [];
  const contextHint =
    sources.length > 0 ? `Use expanded context from: ${sources.join(', ')}.` : undefined;
  return [
    `Write a ${input.depth} ${input.language} reply for ${input.zone}.`,
    `Intent: ${input.intent}. Tone: ${input.tone}.`,
    contextHint,
    'Be specific to the main post and avoid over-explaining.',
  ]
    .filter(Boolean)
    .join(' ');
}

function allText(input: DriverInput): string {
  return [
    input.mainPost.text,
    input.quotedPost?.text,
    input.repostedPost?.text,
    input.parentPost?.text,
    ...(input.authorContinuations ?? []).map((item) => item.text),
    ...(input.media ?? []).flatMap((media) => [media.altText, media.ocrText]),
  ]
    .filter(Boolean)
    .join(' ');
}

function mainText(input: DriverInput): string {
  return input.mainPost.text?.replace(/\s+/g, ' ').trim() ?? '';
}
