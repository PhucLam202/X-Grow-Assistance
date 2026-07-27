/**
 * Ràng buộc đo được của một reply: bao nhiêu từ, bao nhiêu emoji.
 *
 * Đây là nguồn chân lý duy nhất. `candidate-prompt.builder.ts` nói con số này
 * cho model, `validation/candidate-validator.service.ts` kiểm đúng con số đó —
 * hai danh sách song song sẽ lệch nhau và validator sẽ reject thứ mà prompt
 * chưa từng yêu cầu.
 *
 * Doc Phase 5 viết band theo tên `micro|short|medium` và emoji
 * `none|light|normal`; codebase (Phase 1, `style.types.ts`) dùng
 * `very_short|short|medium|long` và `none|minimal|rich`. Bảng dưới là bản dịch
 * chính thức giữa hai bộ tên, cộng thêm `long` mà doc không có.
 */

import type { EmojiLevel, ReplyLength } from './style.types';

export interface WordBand {
  min: number;
  max: number;
}

export const LENGTH_WORD_BANDS: Record<ReplyLength, WordBand> = {
  /** Doc Phase 5 gọi là `micro`. */
  very_short: { min: 2, max: 8 },
  short: { min: 6, max: 24 },
  medium: { min: 15, max: 60 },
  /** Band mới — doc Phase 5 không định nghĩa `long`. */
  long: { min: 40, max: 110 },
};

export const EMOJI_MAX: Record<EmojiLevel, number> = {
  none: 0,
  /** Doc Phase 5 gọi là `light`. */
  minimal: 1,
  /** Doc Phase 5 gọi là `normal` (max 2); `rich` nới lên 3. */
  rich: 3,
};

/**
 * Chữ viết liền (scriptio continua): không đặt khoảng trắng giữa các từ, nên
 * tách theo `\s+` gom cả câu thành MỘT token — mọi reply rớt dưới `band.min` và
 * bị loại sạch với `length_out_of_band`.
 *
 * Với những hệ chữ này, đơn vị đếm phải là *word-equivalent* quy từ số ký tự
 * nền. Hệ số quy đổi đo trên cùng một câu dịch sang từng ngôn ngữ, lấy câu
 * tiếng Anh 11 từ làm mốc (ký tự nền / từ tiếng Anh):
 *
 *   Hán 1.64 · Kana 2.00 · Miến 2.00 │ Khmer 3.09 · Lào 3.27 · Tạng 3.55 · Thái 3.73
 *
 * Chênh 2.3× giữa hai cụm, nên MỘT hệ số duy nhất không thể đúng cho cả hai:
 * lấy 2 thì Thái vượt `band.max`, lấy 3.5 thì Hán rớt dưới `band.min`. Đó là lý
 * do có hai bậc chứ không phải một hằng số.
 *
 * Hangul cố tình KHÔNG nằm đây: tiếng Hàn viết có khoảng trắng, đếm token đã
 * đúng sẵn. Việt/Đức/Phần Lan/Thổ… cũng vậy — chúng chỉ lệch mật độ từ vựng
 * trong phạm vi band đã đủ rộng để chứa.
 */
const SCRIPT_CHARS_PER_WORD: ReadonlyArray<{
  pattern: RegExp;
  charsPerWord: number;
}> = [
  {
    // Chữ ghi ý và kana: một ký tự mang gần trọn một hình vị.
    pattern: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Myanmar}\p{Script=Yi}]/gu,
    charsPerWord: 2,
  },
  {
    // Abugida: một "từ" trải ra nhiều ký tự nền phụ âm + nguyên âm.
    pattern: /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Tibetan}\p{Script=Javanese}\p{Script=Balinese}\p{Script=Tai_Tham}\p{Script=New_Tai_Lue}]/gu,
    charsPerWord: 3.5,
  },
];

/**
 * Dấu phụ (`\p{M}`) không phải ký tự nền. Tiếng Thái viết câu 41 ký tự nền
 * bằng 54 code point; đếm cả dấu phụ thổi nó vượt `band.max` — đúng lỗi cũ, chỉ
 * ở đầu kia của band.
 */
const COMBINING_MARK = /\p{M}/gu;

/**
 * Đếm từ. Coi mọi khoảng trắng là ranh giới và bỏ emoji ra khỏi phép đếm —
 * "nice 🎉" là một từ, không phải hai.
 *
 * Chữ viết liền được quy đổi sang word-equivalent theo bảng trên; phần còn lại
 * đếm theo token như thường và hai vế cộng dồn.
 */
export function countWords(text: string): number {
  let remaining = text.replace(EMOJI_SEQUENCE, ' ').replace(COMBINING_MARK, '');
  let wordEquivalents = 0;

  for (const { pattern, charsPerWord } of SCRIPT_CHARS_PER_WORD) {
    const chars = remaining.match(pattern)?.length ?? 0;
    if (chars > 0) {
      wordEquivalents += chars / charsPerWord;
    }
    // Tách ký tự viết liền ra trước khi đếm token, nếu không phần latin dính
    // liền kề ("Nice スキル" viết không cách) sẽ bị tính hai lần.
    remaining = remaining.replace(pattern, ' ');
  }

  const words = remaining
    .trim()
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token));

  return words.length + Math.ceil(wordEquivalents);
}

/**
 * Một emoji ghép là MỘT emoji.
 *
 * `👨‍👩‍👧` là 3 code point người + 2 ZWJ, `👍🏽` là base + skin-tone modifier, `🇻🇳`
 * là 2 regional indicator. Đếm theo code point (hoặc tệ hơn, theo `.length`)
 * biến chúng thành 2–3 và reject oan ở level `minimal`.
 */
export function countEmoji(text: string): number {
  const matches = text.match(EMOJI_SEQUENCE);
  return matches ? matches.length : 0;
}

export function isWithinWordBand(text: string, length: ReplyLength): boolean {
  const band = LENGTH_WORD_BANDS[length];
  const words = countWords(text);
  return words >= band.min && words <= band.max;
}

export function isWithinEmojiLimit(text: string, level: EmojiLevel): boolean {
  return countEmoji(text) <= EMOJI_MAX[level];
}

/** Loại mọi emoji khỏi text. Dùng ở `text-normalizer.ts` của Phase 5. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_SEQUENCE, '');
}

/**
 * Một cluster emoji hoàn chỉnh:
 *   - cặp regional indicator (cờ `🇻🇳`), hoặc
 *   - keycap (`3️⃣`), hoặc
 *   - base pictographic + skin-tone/variation selector, nối tiếp qua ZWJ
 *     (`👨‍👩‍👧`, `👍🏽`).
 *
 * Không dùng `Intl.Segmenter('grapheme')`: nó cũng gom `e` + dấu thành một
 * cluster, nên vẫn phải lọc lại "cluster nào là emoji" — vòng thừa cho cùng
 * một kết quả.
 *
 * `\p{Extended_Pictographic}` cố tình KHÔNG kèm `\p{Emoji}`: chữ số và `#`/`*`
 * mang property `Emoji` nhưng chỉ là emoji khi có keycap theo sau, và nhánh
 * keycap đã lo trường hợp đó.
 *
 * `© ® ™ ℹ` bị loại khỏi nhánh base: chúng là Extended_Pictographic nhưng mặc
 * định hiển thị dạng text, nên "Nike®" không được tính là có emoji.
 *
 * `g` flag an toàn ở đây vì chỉ dùng với `String.match`/`String.replace` —
 * `RegExp.exec` mới là chỗ `lastIndex` bị mang qua lần gọi sau.
 */
const EMOJI_BASE =
  '(?![\\u00A9\\u00AE\\u2122\\u2139])\\p{Extended_Pictographic}';
// Alternation thay vì một character class: gộp `️` (variation selector)
// cùng skin-tone modifier vào một class là mẫu mà `no-misleading-character-class`
// chặn, vì class trông như "một ký tự" nhưng thực ra là modifier.
const EMOJI_TRAIL = '(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])*';

const EMOJI_SEQUENCE = new RegExp(
  '\\p{Regional_Indicator}{2}' +
    '|[\\d#*]\\uFE0F?\\u20E3' +
    `|${EMOJI_BASE}${EMOJI_TRAIL}(?:\\u200D${EMOJI_BASE}${EMOJI_TRAIL})*`,
  'gu',
);
