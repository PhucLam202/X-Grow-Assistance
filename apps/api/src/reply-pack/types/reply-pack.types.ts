/**
 * @deprecated Nguồn chân lý cho tone/niche/language đã chuyển sang
 * `src/modules/generations/types/style.types.ts` và `niche.types.ts`.
 * File này chỉ re-export lại trong giai đoạn transition để không phá các import
 * cũ (`ai.types.ts`, `vision-analyze.service.ts`, `comment-style-mapper.service.ts`, ...).
 * Import mới phải trỏ thẳng vào `modules/generations/types/`.
 */
import { DetectedLanguage } from '../../common/language/language.types';

export {
  COMMENT_NICHES,
  COMMENT_TONES,
  TARGET_COMMENT_LANGUAGES,
} from '../../modules/generations/types/style.types';

export type {
  CommentNiche,
  CommentTone,
  TargetCommentLanguage,
} from '../../modules/generations/types/style.types';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ReplyCandidateScore = {
  total: number;
  postFit: number;
  visibility: number;
  specificity: number;
  native: number;
  engagementHook: number;
  whyVisible: string;
};

export type CommentSuggestion = {
  text: string;
  meaningVi: string;
  tone: string;
  risk: RiskLevel;
  whyItWorks: string;
  score?: ReplyCandidateScore;
};

export type ReplyPack = {
  detectedLanguage: DetectedLanguage;
  translationLanguage: string;
  translation: string;
  summary: string;
  context: string;
  theme: string;
  topic: string;
  sentiment: string;
  commentStrategy: string;
  suggestions: CommentSuggestion[];
};
