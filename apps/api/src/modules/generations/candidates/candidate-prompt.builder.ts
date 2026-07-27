import { Injectable } from '@nestjs/common';
import { buildNichePolicyPrompt } from '../niche/niche-policy.prompt-adapter';
import { EMOJI_MAX, LENGTH_WORD_BANDS } from '../types/reply-constraints';
import type { CandidateGenerationInput, StrategySlot } from './candidate.types';

/**
 * Cụm mở đầu bị cấm ở mọi niche. Policy `avoidPhrases` cộng thêm vào danh sách
 * này chứ không thay thế. Export để Phase 5 (validation) lọc trên cùng một
 * nguồn thay vì tự dựng danh sách thứ hai rồi lệch nhau.
 */
export const GLOBAL_BANNED_OPENERS: readonly string[] = [
  'Great post',
  'Love this',
  'This is so true',
  'Thanks for sharing',
  'As an AI',
  'Well said',
  'Couldn’t agree more',
  'This!',
  'Absolutely',
  'So important',
  'Amazing',
  'Facts',
];

function section(title: string, body: string): string {
  return `═══ ${title} ═══\n${body}`;
}

function renderSlots(slots: StrategySlot[]): string {
  return slots
    .map((slot) => `- ${slot.slotId}: intent=${slot.intent}, tone=${slot.tone}`)
    .join('\n');
}

@Injectable()
export class CandidatePromptBuilder {
  /**
   * `includeAnalysis: false` cho selective retry — analysis đã có từ call đầu,
   * xin lại chỉ tốn output token và mở đường cho hai bản analysis lệch nhau.
   */
  build(
    input: CandidateGenerationInput,
    slots: StrategySlot[],
    { includeAnalysis = true }: { includeAnalysis?: boolean } = {},
  ): string {
    const { postContext, visionContext, nicheResult, nichePolicy, options } =
      input;

    const parts: string[] = [];

    // ── Post ────────────────────────────────────────────────────────────────
    const postLines = [`Language: ${postContext.language}`];
    if (postContext.text) postLines.push(`Post: ${postContext.text}`);
    if (postContext.sentiment) {
      postLines.push(`Sentiment: ${postContext.sentiment}`);
    }
    if (postContext.quotedPostText) {
      postLines.push(`Quoted post: ${postContext.quotedPostText}`);
    }
    if (postContext.threadContext?.length) {
      postLines.push(`Thread: ${postContext.threadContext.join(' | ')}`);
    }
    parts.push(section('POST CONTEXT', postLines.join('\n')));

    // ── Vision ──────────────────────────────────────────────────────────────
    if (visionContext) {
      const visionLines = [`Image summary: ${visionContext.summary}`];
      if (visionContext.detectedEntities?.length) {
        visionLines.push(
          `Visible: ${visionContext.detectedEntities.join(', ')}`,
        );
      }
      if (visionContext.visibleText) {
        visionLines.push(`Text in image: ${visionContext.visibleText}`);
      }
      if (visionContext.mood) visionLines.push(`Mood: ${visionContext.mood}`);
      if (visionContext.avoid?.length) {
        visionLines.push(`Avoid: ${visionContext.avoid.join(', ')}`);
      }
      parts.push(section('VISION CONTEXT', visionLines.join('\n')));
    }

    // ── Niche policy (Phase 3 adapter) ──────────────────────────────────────
    parts.push(buildNichePolicyPrompt(nichePolicy));

    // ── User style ──────────────────────────────────────────────────────────
    const style = input.userStyle;
    if (style) {
      const styleLines: string[] = [];
      if (style.preferredTones?.length) {
        styleLines.push(`Preferred tones: ${style.preferredTones.join(', ')}`);
      }
      if (style.preferredLength) {
        styleLines.push(`Preferred length: ${style.preferredLength}`);
      }
      if (style.styleExamples?.length) {
        styleLines.push(`Their voice: ${style.styleExamples.join(' | ')}`);
      }
      if (styleLines.length > 0) {
        parts.push(section('USER STYLE', styleLines.join('\n')));
      }
    }

    // ── Slots ───────────────────────────────────────────────────────────────
    parts.push(
      section(
        'STRATEGY SLOTS',
        `Write exactly one reply per slot, in this order:\n${renderSlots(slots)}`,
      ),
    );

    // ── Rules ───────────────────────────────────────────────────────────────
    const band = LENGTH_WORD_BANDS[options.length];
    const emojiMax = EMOJI_MAX[options.emojiLevel];
    const meaningLanguage =
      options.explanationLanguage === 'vi' ? 'Vietnamese' : 'English';

    const banned = [
      ...new Set([
        ...GLOBAL_BANNED_OPENERS,
        ...nichePolicy.avoidPhrases,
        ...(style?.blockedPhrases ?? []),
      ]),
    ];

    const rules = [
      'Every reply must take a genuinely different angle. A reply that is a reworded version of another slot is a failure.',
      '`referencedConcept` is mandatory and must be a concrete detail lifted from the post' +
        (visionContext ? ' or the image' : '') +
        '. It must never be empty or generic.',
      ...(visionContext
        ? [
            'At least one reply must engage a detail that only appears in the image, not in the post text.',
          ]
        : []),
      'Do not repeat sentence structure across replies — vary length and how each one opens.',
      'Never invent a fact, statistic, name, or personal experience that is not in the context above.',
      // Con số, không phải tên band: validator Phase 5 kiểm đúng hai số này
      // (`types/reply-constraints.ts`), nên prompt phải nói ra chúng — nói
      // "Length: short" rồi reject vì 25 từ là bắt lỗi thứ chưa từng yêu cầu.
      `Length: ${band.min}–${band.max} words per reply. ` +
        (emojiMax === 0
          ? 'Emoji: none at all.'
          : `Emoji: at most ${emojiMax} per reply.`) +
        ` Energy: ${options.energy}. Output language: ${options.language}.`,
      `Never open with or use these phrases: ${banned.join(', ')}.`,
      `Write \`meaning\` for every reply: the same reply rendered in ${meaningLanguage}, for a reader who does not speak the output language.`,
      'Return structured JSON only. No markdown, no commentary.',
    ];

    parts.push(section('RULES', rules.map((rule) => `- ${rule}`).join('\n')));

    // ── Niche classification (chỉ khi Phase 2 chưa chốt được) ───────────────
    const mustClassify = nicheResult.needsGenerationTimeClassification;
    if (mustClassify) {
      parts.push(
        section(
          'NICHE DECISION',
          'The niche above is provisional. Decide the real niche for this post ' +
            'and report it once at the top level as `niche` plus ' +
            '`nicheConfidence` (0-1). If nothing fits, return `niche: null`. ' +
            'Do not repeat the decision on every candidate.',
        ),
      );
    }

    // ── Output schema ───────────────────────────────────────────────────────
    parts.push(
      section(
        'OUTPUT JSON',
        JSON.stringify(
          {
            ...(mustClassify
              ? { niche: 'string|null', nicheConfidence: 0.0 }
              : {}),
            ...(includeAnalysis
              ? {
                  analysis: {
                    summary:
                      'string — what the post is actually about, one sentence',
                    topic: 'string — short topic label',
                    sentiment:
                      'string — the mood of the post (e.g. excited, frustrated, grieving, matter-of-fact)',
                    translation: `string — the post rendered in ${meaningLanguage}`,
                    commentStrategy:
                      'string — the angle that would earn a reply here, one sentence',
                  },
                }
              : {}),
            candidates: [
              {
                slotId: 'slot_1',
                text: 'string',
                meaning: `string — this reply in ${meaningLanguage}`,
                intent: 'react|ask|support|add_insight',
                tone: 'string',
                referencedConcept: 'string (required, non-empty)',
                empathySignal: 'string (optional)',
                selfScore: { postFit: 0.0, naturalness: 0.0, empathyFit: 0.0 },
              },
            ],
          },
          null,
          2,
        ),
      ),
    );

    return parts.join('\n\n');
  }
}
