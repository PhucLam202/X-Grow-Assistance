import { Injectable } from '@nestjs/common';
import type {
  CandidatePostContext,
  CandidateVisionContext,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import type { RejectReason } from './validation.types';
import { normalizeForCompare } from './text-normalizer';

export interface FactualityInput {
  candidates: GeneratedCandidate[];
  postContext: CandidatePostContext;
  visionContext?: CandidateVisionContext;
  nichePolicy: ResolvedNichePolicy;
}

/**
 * Từ viết hoa vì đứng đầu câu hoặc vì là từ thường hay được viết hoa — không
 * phải tên riêng. Thiếu danh sách này thì mọi câu bắt đầu bằng "Honestly," đều
 * bị coi là bịa một cái tên.
 */
const COMMON_CAPITALIZED = new Set([
  'the',
  'this',
  'that',
  'these',
  'those',
  'and',
  'but',
  'also',
  'honestly',
  'actually',
  'really',
  'maybe',
  'though',
  'still',
  'yes',
  'yeah',
  'okay',
  'sure',
  'wait',
  'love',
  'nice',
  'wow',
  'huh',
  'why',
  'how',
  'what',
  'when',
  'where',
  'who',
  'which',
  'not',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'ai',
  'api',
  'ui',
  'ux',
  'ok',
  'tbh',
  'imo',
  'idk',
  'btw',
  'lol',
]);

/**
 * Lọc candidate bịa đặt — nhưng chỉ khi có bằng chứng đo được.
 *
 * Nguyên tắc hẹp: chỉ reject khi candidate mang SPECIFICS (con số nhiều chữ số,
 * %, số tiền, số kèm đơn vị, năm, tên riêng) mà cả post lẫn vision context đều
 * không có. Một câu cảm xúc chung chung ("this is the part that worries me")
 * không bao giờ bị chặn ở đây — nó là việc của `specificity` ở Phase 6.
 *
 * Vì sao thêm cả `vocabularyHints`/`allowedSlang` vào context: "L2", "TVL",
 * "mainnet" là từ vựng của cộng đồng, không phải dữ kiện bịa. Thiếu chúng thì
 * mọi reply đúng giọng niche đều bị coi là fabrication.
 */
@Injectable()
export class FactualityFilterService {
  filter(input: FactualityInput): Map<string, RejectReason[]> {
    const rejects = new Map<string, RejectReason[]>();
    const context = this.buildContextIndex(input);

    for (const candidate of input.candidates) {
      const numbers = extractNumbers(candidate.text).filter(
        (value) => !context.numbers.has(value),
      );

      if (numbers.length > 0) {
        rejects.set(candidate.id, [
          {
            code: 'fabricated_specifics',
            detail:
              `Cites "${numbers[0]}", which appears nowhere in the post or ` +
              'image context.',
          },
        ]);
        continue;
      }

      const names = extractProperNouns(candidate.text).filter(
        (name) => !context.words.has(name.toLowerCase()),
      );

      if (names.length > 0) {
        rejects.set(candidate.id, [
          {
            code: 'fabricated_specifics',
            detail:
              `Names "${names[0]}", which appears nowhere in the post or ` +
              'image context.',
          },
        ]);
      }
    }

    return rejects;
  }

  private buildContextIndex(input: FactualityInput): {
    numbers: Set<string>;
    words: Set<string>;
  } {
    const { postContext, visionContext, nichePolicy } = input;

    const sources = [
      postContext.text,
      postContext.quotedPostText,
      ...(postContext.threadContext ?? []),
      postContext.sentiment,
      visionContext?.summary,
      visionContext?.visibleText,
      ...(visionContext?.detectedEntities ?? []),
      visionContext?.mood,
      ...nichePolicy.vocabularyHints,
      ...nichePolicy.allowedSlang,
      ...nichePolicy.contextVocabularyHints,
    ].filter((value): value is string => Boolean(value && value.trim()));

    const blob = sources.join(' ');

    return {
      numbers: new Set(extractNumbers(blob)),
      words: new Set(normalizeForCompare(blob).split(' ').filter(Boolean)),
    };
  }
}

/**
 * Chuỗi chữ số đã bỏ dấu phân cách. So theo con số chứ không theo cách viết:
 * post ghi "40 minutes", reply ghi "40-minute" — cùng một dữ kiện.
 *
 * Số một chữ số bị bỏ qua có chủ đích: "one or 2 things" không phải là dữ kiện.
 */
function extractNumbers(text: string): string[] {
  const matches: string[] = text.match(/\d[\d,.]*/g) ?? [];

  return matches
    .map((raw) => raw.replace(/[,.]+$/, '').replace(/,/g, ''))
    .filter((value) => value.replace(/\./g, '').length >= 2);
}

/**
 * Token viết hoa KHÔNG ở đầu câu. Đầu câu thì viết hoa là quy tắc chính tả, nói
 * lên không gì cả.
 *
 * Giới hạn đã biết: tên riêng bịa ở ĐẦU câu ("Arbitrum had similar issues")
 * thoát được bộ lọc này. Đó là đánh đổi có chủ đích — muốn bắt nó thì phải coi
 * mọi token đầu câu là tên riêng tiềm năng, và khi đó "Publishing a timeline
 * would help" hay "Wondering how long the queue was" đều bị reject oan. Reject
 * một reply tốt tệ hơn là để lọt một cái tên không kiểm chứng được: prompt đã
 * cấm bịa tên, và `postFit` ở Phase 6 tự đẩy loại câu đó xuống cuối bảng.
 */
function extractProperNouns(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const names: string[] = [];

  for (const sentence of sentences) {
    // Câu viết hoa toàn bộ thì chữ hoa không mang thông tin gì: không phân biệt
    // được tên riêng với nhấn giọng, nên không đoán.
    if (!/\p{Ll}/u.test(sentence)) continue;

    const tokens = sentence.trim().split(/\s+/);

    tokens.slice(1).forEach((token) => {
      const cleaned = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (cleaned.length < 3) return;
      if (!/^\p{Lu}/u.test(cleaned)) return;
      // Chữ hoa toàn bộ có thể là nhấn giọng ("THIS"), không phải tên riêng.
      if (cleaned === cleaned.toUpperCase() && cleaned.length <= 3) return;
      if (COMMON_CAPITALIZED.has(cleaned.toLowerCase())) return;
      names.push(cleaned);
    });
  }

  return names;
}
