import { Injectable } from '@nestjs/common';
import type {
  CandidatePostContext,
  CandidateVisionContext,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import {
  containsPhrase,
  normalizeForCompare,
} from '../validation/text-normalizer';

export interface EmpathyFitInput {
  candidate: Omit<GeneratedCandidate, 'selfScore'>;
  postContext: CandidatePostContext;
  visionContext?: CandidateVisionContext;
  visionAligned: boolean;
}

/**
 * Sắc thái của bài post, nhóm thành 3 hướng mà một reply cần đáp khác nhau.
 *
 * Nguồn `sentiment` là `analysis.sentiment` mà chính candidate call trả về (hoặc
 * `VisionContext.sentiment`) — chuỗi tự do, nên phải map bằng từ khoá chứ không
 * bằng enum.
 */
const SENTIMENT_GROUPS = {
  negative: [
    'sad',
    'grief',
    'grieving',
    'angry',
    'anger',
    'frustrated',
    'frustration',
    'upset',
    'worried',
    'worry',
    'concerned',
    'concern',
    'anxious',
    'fear',
    'afraid',
    'tired',
    'exhausted',
    'burnt out',
    'burnout',
    'disappointed',
    'loss',
    'painful',
    'hurt',
    'stressed',
    'negative',
    'bearish',
    'tiêu cực',
    'buồn',
    'lo lắng',
    'thất vọng',
  ],
  positive: [
    'happy',
    'excited',
    'excitement',
    'proud',
    'proud of',
    'celebrating',
    'grateful',
    'relieved',
    'optimistic',
    'hopeful',
    'joy',
    'delighted',
    'positive',
    'bullish',
    'vui',
    'tự hào',
    'phấn khích',
    'tích cực',
  ],
  neutral: [
    'neutral',
    'matter-of-fact',
    'informational',
    'curious',
    'analytical',
    'factual',
    'observational',
    'trung tính',
  ],
} as const;

/** Reply thừa nhận cảm xúc của người viết. */
const ACKNOWLEDGEMENT_PHRASES: readonly string[] = [
  'that sounds',
  'i can see why',
  'makes sense',
  'no wonder',
  'fair',
  'rough',
  'brutal',
  'tough',
  'sorry',
  'hope',
  'glad',
  'congrats',
  'congratulations',
  'proud of',
  'must have',
  'must be',
  'respect',
  'well earned',
];

/** Reply nói về mình thay vì về người viết. */
const SELF_CENTRED_OPENERS: readonly string[] = [
  'i think',
  'i believe',
  'in my opinion',
  'personally i',
  'i would',
  'i always',
  'i never',
];

/**
 * Đo mức đồng cảm giữa reply và bài post.
 *
 * Cách chấm phụ thuộc hướng sentiment:
 *   - post buồn/lo → reply phải thừa nhận trước, và câu hỏi tọc mạch hay dấu
 *     chấm than đều làm hỏng;
 *   - post vui → chia sẻ niềm vui đúng chỗ mới tính, còn chúc mừng suông thì
 *     `empathySignal` sẽ rỗng và điểm tự thấp;
 *   - post trung tính → đồng cảm không phải trục chính, nên điểm nền cao hơn và
 *     dao động hẹp hơn.
 *
 * Không có `sentiment` (model bỏ analysis, vision không chạy) thì rơi về nhánh
 * neutral — chấm được bằng `empathySignal` là đủ, không cần đoán sắc thái.
 */
@Injectable()
export class EmpathyFitScorer {
  score(input: EmpathyFitInput): number {
    const group = this.sentimentGroup(input);
    const text = input.candidate.text;
    const signal = input.candidate.empathySignal?.trim();

    let score = group === 'neutral' ? 0.55 : 0.4;

    if (signal) {
      score += 0.15;
      // `empathySignal` phải nói về bài post, không phải nhắc lại chính reply.
      if (this.signalGrounded(signal, input)) score += 0.1;
    }

    const acknowledges = ACKNOWLEDGEMENT_PHRASES.some((phrase) =>
      containsPhrase(text, phrase),
    );

    if (acknowledges) score += group === 'negative' ? 0.25 : 0.15;

    if (group === 'negative') {
      // Reply lạc quan giả tạo trước một bài post buồn là kiểu trượt đồng cảm
      // rõ nhất.
      if ((text.match(/!/g) ?? []).length > 0) score -= 0.15;
      if (!acknowledges && text.includes('?')) score -= 0.1;
      if (SELF_CENTRED_OPENERS.some((p) => containsPhrase(text, p))) {
        score -= 0.1;
      }
    }

    if (group === 'positive' && acknowledges) score += 0.05;

    // Bám được chi tiết chỉ có trong ảnh nghĩa là đã thật sự nhìn thứ người ta
    // đăng — cộng ở mọi hướng sentiment.
    if (input.visionAligned) score += 0.1;

    return clamp(score);
  }

  private sentimentGroup(
    input: EmpathyFitInput,
  ): 'negative' | 'positive' | 'neutral' {
    const raw = normalizeForCompare(input.postContext.sentiment ?? '');
    if (!raw) return 'neutral';

    for (const group of ['negative', 'positive', 'neutral'] as const) {
      if (
        (SENTIMENT_GROUPS[group] as readonly string[]).some((keyword) =>
          raw.includes(normalizeForCompare(keyword)),
        )
      ) {
        return group;
      }
    }

    return 'neutral';
  }

  /** `empathySignal` có neo vào nội dung post/ảnh hay chỉ là câu sáo. */
  private signalGrounded(signal: string, input: EmpathyFitInput): boolean {
    const contextBlob = normalizeForCompare(
      [
        input.postContext.text,
        input.postContext.sentiment,
        input.visionContext?.summary,
        ...(input.visionContext?.detectedEntities ?? []),
      ]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(' '),
    );

    if (!contextBlob) return false;

    return normalizeForCompare(signal)
      .split(' ')
      .some((token) => token.length >= 4 && contextBlob.includes(token));
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
