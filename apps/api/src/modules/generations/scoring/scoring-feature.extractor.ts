import { Injectable } from '@nestjs/common';
import type {
  CandidatePostContext,
  CandidateUserStyle,
  CandidateVisionContext,
  GeneratedCandidate,
} from '../candidates/candidate.types';
import type { ResolvedNichePolicy } from '../niche/niche-policy.interface';
import {
  LENGTH_WORD_BANDS,
  countEmoji,
  countWords,
} from '../types/reply-constraints';
import {
  containsPhrase,
  normalizeForCompare,
  stemmedTokens,
  tokenize,
} from '../validation/text-normalizer';
import { EmpathyFitScorer } from './empathy-fit.scorer';
import { SAFETY_PENALTY_CODES, type ScoringFeatures } from './scoring.types';

/**
 * Candidate NHÌN TỪ extractor: không có `selfScore`.
 *
 * Đây là điểm cốt yếu của Phase 6. Nếu rule features cũng đọc self-score thì
 * `ruleScore * 0.78 + selfScore * 0.22` thực chất là ~95% ý kiến của model,
 * trong khi cả kiến trúc được dựng để hai nguồn độc lập kiểm tra nhau. Kiểu dữ
 * liệu chặn việc đó ở compile time, không phải bằng lời hứa trong comment.
 */
export type CandidateForFeatures = Omit<GeneratedCandidate, 'selfScore'>;

export interface FeatureExtractionInput {
  candidate: CandidateForFeatures;
  postContext: CandidatePostContext;
  visionContext?: CandidateVisionContext;
  nichePolicy: ResolvedNichePolicy;
  userStyle?: CandidateUserStyle;
  visionAligned: boolean;
  /** Code penalty của Phase 5 cho đúng candidate này. */
  penaltyCodes: string[];
}

/** Token ngắn/quá phổ biến không chứng minh được candidate bám vào post. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'as',
  'by',
  'into',
  'about',
  'over',
  'after',
  'before',
  'than',
  'then',
  'there',
  'here',
  'you',
  'your',
  'i',
  'we',
  'they',
  'he',
  'she',
  'my',
  'our',
  'their',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'could',
  'should',
  'can',
  'just',
  'really',
  'very',
  'so',
  'not',
  'no',
  'yes',
  'if',
  'when',
  'how',
  'what',
  'why',
]);

/** Cụm khiến câu nghe như bài luận AI. */
const AI_TELLS: readonly string[] = [
  'it is important to',
  'it is worth noting',
  'in conclusion',
  'moreover',
  'furthermore',
  'additionally',
  'i would argue',
  'one could say',
  'at the end of the day',
  'the fact that',
  'truly remarkable',
  'game changer',
  'incredibly powerful',
];

const QUESTION_WORDS: readonly string[] = [
  'how',
  'what',
  'why',
  'when',
  'which',
  'who',
  'where',
  'did',
  'does',
  'do',
  'is',
  'are',
  'would',
  'could',
  'should',
  'any',
];

/** Cụm mời người khác nói tiếp. */
const INVITATIONS: readonly string[] = [
  'curious',
  'wondering',
  'thoughts',
  'anyone else',
  'have you',
  'did you',
  'what did',
  'how did',
];

const MIN_ANCHOR_TOKEN_LENGTH = 4;

/**
 * Rút 8 feature deterministic từ text. Không network, không LLM, không đọc
 * self-score.
 */
@Injectable()
export class ScoringFeatureExtractor {
  constructor(private readonly empathyScorer: EmpathyFitScorer) {}

  extract(input: FeatureExtractionInput): ScoringFeatures {
    return {
      postFit: this.postFit(input),
      specificity: this.specificity(input),
      naturalness: this.naturalness(input),
      nicheFit: this.nicheFit(input),
      empathyFit: this.empathyScorer.score({
        candidate: input.candidate,
        postContext: input.postContext,
        visionContext: input.visionContext,
        visionAligned: input.visionAligned,
      }),
      conversationPotential: this.conversationPotential(input),
      safetyScore: this.safetyScore(input),
      userStyleFit: this.userStyleFit(input),
    };
  }

  /**
   * Candidate có nói về ĐÚNG bài post này hay không.
   *
   * Đo bằng token nội dung dùng chung với context, cộng điểm cho
   * `referencedConcept` thật sự xuất hiện trong post (model khai neo vào đâu thì
   * chỗ đó phải có thật), cộng nữa nếu bám được chi tiết chỉ có trong ảnh.
   */
  private postFit(input: FeatureExtractionInput): number {
    const contextTokens = this.contextTokens(input);
    const candidateTokens = [...stemmedTokens(input.candidate.text)].filter(
      (token) =>
        token.length >= MIN_ANCHOR_TOKEN_LENGTH && !STOPWORDS.has(token),
    );

    if (candidateTokens.length === 0 || contextTokens.size === 0) return 0.2;

    const shared = candidateTokens.filter((token) => contextTokens.has(token));
    // 3 token nội dung dùng chung là đã bám chắc; hơn nữa không nói thêm gì.
    const overlap = Math.min(1, shared.length / 3);

    const conceptGrounded = this.conceptAppearsInContext(input) ? 0.2 : 0;
    const visionBonus = input.visionAligned ? 0.15 : 0;

    return clamp(overlap * 0.65 + conceptGrounded + visionBonus);
  }

  /** Có chi tiết cụ thể hay chỉ là câu nói chung chung. */
  private specificity(input: FeatureExtractionInput): number {
    const text = input.candidate.text;
    const words = countWords(text);
    if (words === 0) return 0;

    const hasNumber = /\d/.test(text);
    const hasProperNoun = /\s\p{Lu}[\p{L}]{2,}/u.test(text);
    const concept = normalizeForCompare(input.candidate.referencedConcept);
    const conceptWords = concept ? concept.split(' ').length : 0;

    const contentTokens = [...tokenize(text)].filter(
      (token) =>
        !STOPWORDS.has(token) && token.length >= MIN_ANCHOR_TOKEN_LENGTH,
    ).length;

    const density = Math.min(1, contentTokens / Math.max(4, words * 0.5));

    return clamp(
      density * 0.5 +
        (hasNumber ? 0.2 : 0) +
        (hasProperNoun ? 0.1 : 0) +
        // Concept một từ ("outage") mỏng hơn concept hai-ba từ ("the stuck
        // withdrawals") — nó thường là chủ đề, không phải chi tiết.
        Math.min(0.2, conceptWords * 0.07),
    );
  }

  /** Nghe như người viết hay như máy sinh. */
  private naturalness(input: FeatureExtractionInput): number {
    const text = input.candidate.text;
    const words = countWords(text);
    if (words === 0) return 0;

    let score = 0.85;

    for (const tell of AI_TELLS) {
      if (containsPhrase(text, tell)) score -= 0.15;
    }

    const exclamations = (text.match(/!/g) ?? []).length;
    score -= Math.min(0.2, exclamations * 0.1);

    // Câu dài đều nhau là dấu hiệu văn máy; câu ngắn xen dài là giọng người.
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgWords = sentences.length > 0 ? words / sentences.length : words;
    if (avgWords > 22) score -= 0.15;

    // Contraction là dấu hiệu rõ của giọng nói thật trên X.
    if (/\b\w+'(?:s|t|re|ve|ll|d|m)\b/i.test(text)) score += 0.1;

    // Chữ hoa toàn câu và emoji dồn dập đều kéo naturalness xuống.
    if (/\b\p{Lu}{4,}\b/u.test(text)) score -= 0.1;
    if (countEmoji(text) > 1) score -= 0.05;

    const band = LENGTH_WORD_BANDS[input.candidate.length];
    const mid = (band.min + band.max) / 2;
    // Nằm giữa band là nơi câu đọc thoải mái nhất; sát rìa thì hoặc cụt hoặc dài.
    const distance = Math.abs(words - mid) / (band.max - band.min);
    score -= Math.min(0.15, distance * 0.2);

    return clamp(score);
  }

  /** Đúng giọng cộng đồng chưa. */
  private nicheFit(input: FeatureExtractionInput): number {
    const { nichePolicy, candidate } = input;
    const text = candidate.text;

    const vocabHits = nichePolicy.vocabularyHints.filter((hint) =>
      containsPhrase(text, hint),
    ).length;
    const slangHits = nichePolicy.allowedSlang.filter((slang) =>
      containsPhrase(text, slang),
    ).length;

    const toneFit = nichePolicy.recommendedTones.includes(candidate.tone)
      ? 0.25
      : 0;
    const intentFit = nichePolicy.recommendedIntents.includes(candidate.intent)
      ? 0.15
      : 0;

    const raw =
      0.3 +
      Math.min(0.3, vocabHits * 0.15) +
      Math.min(0.1, slangHits * 0.1) +
      toneFit +
      intentFit;

    // Niche chưa chắc chắn thì "đúng giọng niche" cũng chưa đáng tin — kéo về
    // trung tính theo confidence thay vì thưởng đủ.
    const confidence = clamp(candidate.nicheConfidence);
    return clamp(raw * (0.6 + 0.4 * confidence));
  }

  /** Có mở đường cho người ta trả lời lại hay không. */
  private conversationPotential(input: FeatureExtractionInput): number {
    const text = input.candidate.text;
    const normalized = normalizeForCompare(text);
    const firstWord = normalized.split(' ')[0] ?? '';

    let score = 0.3;

    if (text.includes('?')) score += 0.3;
    if (QUESTION_WORDS.includes(firstWord)) score += 0.15;
    if (INVITATIONS.some((phrase) => containsPhrase(text, phrase))) {
      score += 0.15;
    }
    if (input.candidate.intent === 'ask') score += 0.1;
    // Câu hỏi đứng cuối dễ được trả lời hơn câu hỏi kẹp giữa.
    if (text.trim().endsWith('?')) score += 0.1;

    return clamp(score);
  }

  /**
   * `1` là mặc định đúng: candidate vi phạm safety cứng đã bị Phase 5 loại từ
   * trước, nên ở đây chỉ còn cờ mềm.
   */
  private safetyScore(input: FeatureExtractionInput): number {
    const softFlags = input.penaltyCodes.filter((code) =>
      SAFETY_PENALTY_CODES.includes(code),
    ).length;

    return clamp(1 - softFlags * 0.35);
  }

  /** Khớp với style người dùng đã khai. */
  private userStyleFit(input: FeatureExtractionInput): number {
    const style = input.userStyle;
    // Không khai gì thì không có gì để lệch — điểm trung tính, không phải 0.
    if (!style) return 0.6;

    let score = 0.6;

    if (style.preferredTones?.length) {
      score += style.preferredTones.includes(input.candidate.tone)
        ? 0.25
        : -0.2;
    }

    if (style.preferredLength) {
      const band = LENGTH_WORD_BANDS[style.preferredLength];
      const words = countWords(input.candidate.text);
      score += words >= band.min && words <= band.max ? 0.15 : -0.1;
    }

    return clamp(score);
  }

  private contextTokens(input: FeatureExtractionInput): Set<string> {
    const blob = [
      input.postContext.text,
      input.postContext.quotedPostText,
      ...(input.postContext.threadContext ?? []),
      input.visionContext?.summary,
      input.visionContext?.visibleText,
      ...(input.visionContext?.detectedEntities ?? []),
    ]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ');

    const tokens = new Set<string>();
    for (const token of stemmedTokens(blob)) {
      if (token.length < MIN_ANCHOR_TOKEN_LENGTH) continue;
      if (STOPWORDS.has(token)) continue;
      tokens.add(token);
    }

    return tokens;
  }

  private conceptAppearsInContext(input: FeatureExtractionInput): boolean {
    const conceptTokens = [
      ...stemmedTokens(input.candidate.referencedConcept),
    ].filter(
      (token) =>
        token.length >= MIN_ANCHOR_TOKEN_LENGTH && !STOPWORDS.has(token),
    );

    if (conceptTokens.length === 0) return false;

    const context = this.contextTokens(input);
    return conceptTokens.some((token) => context.has(token));
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
