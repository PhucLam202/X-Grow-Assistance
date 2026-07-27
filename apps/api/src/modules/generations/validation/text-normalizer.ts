import { stripEmoji } from '../types/reply-constraints';

/**
 * Chuẩn hoá text để SO SÁNH (duplicate detection, phrase matching) — không phải
 * để hiển thị.
 *
 * NFKC trước tiên: "ｇｍ" fullwidth và "gm" phải là một, và dấu nháy cong của
 * model ("couldn’t") phải khớp được với danh sách viết bằng nháy thẳng.
 */
export function normalizeForCompare(text: string): string {
  return stripEmoji(text.normalize('NFKC'))
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token set cho Jaccard. Bỏ trùng — Jaccard làm việc trên set, không trên bag. */
export function tokenize(text: string): Set<string> {
  const normalized = normalizeForCompare(text);
  if (!normalized) return new Set();
  return new Set(normalized.split(' ').filter(Boolean));
}

/**
 * Stem cực nhẹ, chỉ để SO KHỚP hai token có nói về cùng một thứ hay không.
 *
 * Đây không phải Porter stemmer và không cần là: dữ liệu thật cho thấy thứ làm
 * `postFit` sai nhiều nhất là số nhiều và dạng -ing. Post viết "down for 40
 * minutes", reply viết "the 40-minute downtime" — cùng một dữ kiện, nhưng so
 * chuỗi thô thì không token nào khớp và candidate bị chấm như thể nó nói chuyện
 * khác.
 *
 * Chỉ cắt khi từ còn đủ dài để không tạo ra đụng độ ngớ ngẩn ("bus" → "bu").
 */
export function stem(token: string): string {
  if (token.length <= 4) return token;

  // "stories" → "story", để khớp với dạng số ít trong post.
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;

  // "boxes" → "box", "matches" → "match": chỉ nhóm này mới được cắt cả `es`.
  if (/(?:ss|sh|ch|x|z)es$/.test(token)) return token.slice(0, -2);

  // "minutes" → "minute" (KHÔNG phải "minut"): cắt đúng một chữ `s`.
  // `ss` được giữ nguyên — "class" không phải số nhiều của "clas".
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);

  if (token.length > 6 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith('ed')) return token.slice(0, -2);

  return token;
}

/** `tokenize` + `stem`, dùng ở mọi chỗ đo "candidate có nói về post này không". */
export function stemmedTokens(text: string): Set<string> {
  return new Set([...tokenize(text)].map(stem));
}

/**
 * N từ đầu tiên sau khi chuẩn hoá. Dùng cho rule batch "quá nửa candidate mở
 * đầu giống nhau" — so cả câu thì không bao giờ trùng, so 2 từ đầu thì bắt được
 * đúng cái tật "I think…" ở mọi slot.
 */
export function openingWords(text: string, count = 2): string {
  return normalizeForCompare(text).split(' ').slice(0, count).join(' ');
}

/**
 * Phrase có xuất hiện trong text hay không, theo ranh giới từ.
 *
 * Ranh giới là điểm chính: `avoidPhrases` chứa cả cụm ngắn như "Facts", và
 * `includes()` trần sẽ khớp luôn "factsheet".
 */
export function containsPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${normalizeForCompare(text)} `;
  const needle = normalizeForCompare(phrase);
  return needle.length > 0 && haystack.includes(` ${needle} `);
}

/** Text có MỞ ĐẦU bằng phrase hay không (sau chuẩn hoá). */
export function startsWithPhrase(text: string, phrase: string): boolean {
  const haystack = normalizeForCompare(text);
  const needle = normalizeForCompare(phrase);
  if (!needle) return false;
  if (haystack === needle) return true;
  return haystack.startsWith(`${needle} `);
}
