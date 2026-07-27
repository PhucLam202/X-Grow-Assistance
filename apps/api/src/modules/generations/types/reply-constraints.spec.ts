import {
  EMOJI_MAX,
  LENGTH_WORD_BANDS,
  countEmoji,
  countWords,
  isWithinEmojiLimit,
  isWithinWordBand,
  stripEmoji,
} from './reply-constraints';
import { EMOJI_LEVELS, REPLY_LENGTHS } from './style.types';

describe('reply-constraints', () => {
  it('covers every length and emoji level declared in Phase 1', () => {
    for (const length of REPLY_LENGTHS) {
      expect(LENGTH_WORD_BANDS[length]).toBeDefined();
      expect(LENGTH_WORD_BANDS[length].min).toBeLessThan(
        LENGTH_WORD_BANDS[length].max,
      );
    }

    for (const level of EMOJI_LEVELS) {
      expect(EMOJI_MAX[level]).toBeGreaterThanOrEqual(0);
    }
  });

  describe('countWords', () => {
    it('counts whitespace-separated words', () => {
      expect(countWords('this is four words')).toBe(4);
    });

    it('does not count emoji as words', () => {
      expect(countWords('nice 🎉')).toBe(1);
      expect(countWords('🎉 🎉 🎉')).toBe(0);
    });

    it('ignores punctuation-only tokens', () => {
      expect(countWords('really ? yes —')).toBe(2);
    });

    it('handles empty and whitespace-only text', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   \n ')).toBe(0);
    });

    /**
     * Tiếng Nhật/Trung/Thái viết liền không khoảng trắng. Đếm theo token
     * whitespace biến cả câu thành 1 "từ", và mọi reply đều rớt dưới `band.min`
     * — toàn bộ candidate bị loại với `length_out_of_band`.
     */
    it('counts continuous-script text in word equivalents, not one token', () => {
      // 21 ký tự kana/kanji → ~11 word-equivalent, cộng token "3？".
      expect(
        countWords('スキル3個持ちは強すぎでは？明日のガチャ楽しみ'),
      ).toBeGreaterThanOrEqual(6);
      // 13 ký tự Hán.
      expect(countWords('三个技能也太强了吧，明天必抽')).toBeGreaterThanOrEqual(6);
    });

    it('keeps continuous-script counts inside the requested band', () => {
      expect(
        isWithinWordBand('スキル3個持ちは強すぎでは？明日のガチャ楽しみ', 'short'),
      ).toBe(true);
      expect(isWithinWordBand('三个技能也太强了吧，明天必抽', 'short')).toBe(true);
      // Câu cực ngắn vẫn phải nằm ở band `very_short`, không được thổi lên.
      expect(isWithinWordBand('楽しみすぎる', 'very_short')).toBe(true);
    });

    it('counts mixed latin + continuous script additively', () => {
      // 1 token latin + 3 ký tự kana (→ 2 word-equivalent).
      expect(countWords('Nice スキル')).toBe(3);
    });

    it('leaves space-delimited scripts such as Hangul untouched', () => {
      expect(countWords('스킬 3개는 좀 사기 아닌가요')).toBe(5);
    });

    /**
     * Mọi câu dưới đây diễn đạt CÙNG một ý với câu tiếng Anh 11 từ. Nếu phép quy
     * đổi đúng, tất cả phải rơi vào cùng band `short` — đó chính là định nghĩa
     * "band trung lập ngôn ngữ".
     */
    it('lands every continuous script in the same band as its English twin', () => {
      const sameSentence = {
        english: 'Three skills on one unit sounds strong, I might pull tomorrow.',
        japanese: 'スキル3個持ちは強すぎでは？明日引いてみようかな。',
        chinese: '一个角色三个技能太强了吧，明天可能会抽。',
        thai: 'ตัวละครเดียวมีสามสกิลนี่แรงไปไหม พรุ่งนี้อาจจะลองสุ่มดู',
        lao: 'ຕົວລະຄອນດຽວມີສາມສະກິນນີ້ແຮງໄປບໍ່ ມື້ອື່ນອາດຈະລອງ',
        khmer: 'តួអង្គមួយមានជំនាញបីខ្លាំងពេកហើយ ថ្ងៃស្អែកប្រហែលជាសាកល្បង',
        burmese: 'ဇာတ်ကောင်တစ်ကောင်မှာ စွမ်းရည်သုံးခုက အားကြီးလွန်းတယ်',
        tibetan: 'གཞས་མ་གཅིག་ལ་རྩལ་གསུམ་ཡོད་པ་ཤིན་ཏུ་སྟོབས་ཆེན་རེད།',
      };

      for (const [language, text] of Object.entries(sameSentence)) {
        expect(`${language}:${isWithinWordBand(text, 'short')}`).toBe(
          `${language}:true`,
        );
      }
    });

    it('does not let combining vowel marks inflate abugida counts', () => {
      // Thái: 54 code point nhưng chỉ 41 ký tự nền. Đếm cả dấu phụ đẩy câu vượt
      // `band.max` và quay lại đúng lỗi cũ, chỉ ở đầu kia của band.
      const thai = 'ตัวละครเดียวมีสามสกิลนี่แรงไปไหม พรุ่งนี้อาจจะลองสุ่มดู';
      expect(countWords(thai)).toBeLessThanOrEqual(24);
    });
  });

  describe('countEmoji', () => {
    it('counts a plain emoji once', () => {
      expect(countEmoji('ship it 🚀')).toBe(1);
    });

    it('counts a ZWJ family sequence as one emoji', () => {
      expect(countEmoji('👨‍👩‍👧')).toBe(1);
    });

    it('counts a skin-tone modified emoji as one emoji', () => {
      expect(countEmoji('👍🏽')).toBe(1);
    });

    it('counts a flag as one emoji', () => {
      expect(countEmoji('🇻🇳')).toBe(1);
    });

    it('counts a keycap as one emoji', () => {
      expect(countEmoji('3️⃣')).toBe(1);
    });

    it('does not count trademark-style pictographics', () => {
      expect(countEmoji('Nike® and Sony™ and © 2026')).toBe(0);
    });

    it('counts multiple distinct emoji', () => {
      expect(countEmoji('🚀 and 👍🏽 and 👨‍👩‍👧')).toBe(3);
    });

    it('returns 0 for plain text', () => {
      expect(countEmoji('no emoji here at all')).toBe(0);
    });

    it('is not affected by lastIndex across calls', () => {
      expect(countEmoji('🚀')).toBe(1);
      expect(countEmoji('🚀')).toBe(1);
    });
  });

  describe('band guards', () => {
    it('accepts a short reply inside 6-24 words', () => {
      expect(
        isWithinWordBand('one two three four five six seven', 'short'),
      ).toBe(true);
    });

    it('rejects a short reply below the band', () => {
      expect(isWithinWordBand('too short', 'short')).toBe(false);
    });

    it('rejects a very_short reply above the band', () => {
      expect(
        isWithinWordBand(
          'one two three four five six seven eight nine',
          'very_short',
        ),
      ).toBe(false);
    });

    it('accepts a long reply that would overflow medium', () => {
      const text = Array.from({ length: 70 }, (_, i) => `w${i}`).join(' ');
      expect(isWithinWordBand(text, 'long')).toBe(true);
      expect(isWithinWordBand(text, 'medium')).toBe(false);
    });

    it('enforces the emoji ceiling per level', () => {
      expect(isWithinEmojiLimit('clean text', 'none')).toBe(true);
      expect(isWithinEmojiLimit('one 🚀', 'none')).toBe(false);
      expect(isWithinEmojiLimit('one 👍🏽', 'minimal')).toBe(true);
      expect(isWithinEmojiLimit('two 🚀 🎉', 'minimal')).toBe(false);
      expect(isWithinEmojiLimit('three 🚀 🎉 👍', 'rich')).toBe(true);
      expect(isWithinEmojiLimit('four 🚀 🎉 👍 🔥', 'rich')).toBe(false);
    });
  });

  describe('stripEmoji', () => {
    it('removes emoji and leaves the words', () => {
      expect(stripEmoji('ship it 🚀 now 👨‍👩‍👧').trim()).toBe('ship it  now');
    });
  });
});
