import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import type {
  CommentIntent,
  CommentIntentSelection,
  ReplyCount,
  Tone,
  ToneSelection,
} from '../types/style.types';
import type { StrategySlot } from './candidate.types';

/** Bảng slot mặc định của doc Phase 4. */
const DEFAULT_SLOTS: ReadonlyArray<{ intent: CommentIntent; tone: Tone }> = [
  { intent: 'react', tone: 'short_native' },
  { intent: 'ask', tone: 'question_based' },
  { intent: 'support', tone: 'casual_supportive' },
  { intent: 'add_insight', tone: 'insightful' },
];

export interface StrategySlotOptions {
  tone: ToneSelection;
  intent: CommentIntentSelection;
  policy: ResolvedNichePolicy;
}

/**
 * Dựng slot cho một request.
 *
 * Ba tầng ưu tiên, từ mạnh tới yếu:
 *   1. Tone/intent user chọn tay → áp vào slot 1, các slot khác giữ nguyên để
 *      response vẫn đa dạng.
 *   2. Tone recommended của policy → thay tone mặc định khi policy không dùng
 *      nó. Nhờ tầng này mà `football` nhận `football_fan` mà file này không
 *      chứa một tên niche nào.
 *   3. Bảng mặc định.
 */
export function buildStrategySlots(
  count: ReplyCount,
  options: StrategySlotOptions,
): StrategySlot[] {
  const recommended = options.policy.recommendedTones;

  return DEFAULT_SLOTS.slice(0, count).map((slot, index) => {
    const isFirst = index === 0;

    const tone: Tone =
      isFirst && options.tone !== 'auto'
        ? options.tone
        : recommended.includes(slot.tone)
          ? slot.tone
          : (recommended[index % recommended.length] ?? slot.tone);

    const intent: CommentIntent =
      isFirst && options.intent !== 'auto' ? options.intent : slot.intent;

    return { slotId: `slot_${index + 1}`, intent, tone };
  });
}
