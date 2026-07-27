import type { Niche } from '../types/niche.types';

export { NICHE_CLASSIFICATION_METHODS } from '../niche/niche.types';
export type { NicheClassificationMethod } from '../niche/niche.types';

import type { NicheClassificationMethod } from '../niche/niche.types';

/** Whether vision context fed into the analysis. */
export type ReplyAnalysisMode = 'text_only' | 'text_and_vision';

export class ReplyAnalysisDto {
  detectedLanguage: string;

  primaryNiche: Niche;

  secondaryNiches: Niche[];

  nicheConfidence: number;

  classificationMethod: NicheClassificationMethod;

  analysisMode: ReplyAnalysisMode;

  visionUsed: boolean;

  fallbackUsed: boolean;

  /** Why the classifier landed on this niche. Empty when picked manually. */
  nicheEvidence?: string[];

  /** Phase 4 must settle the niche itself while generating candidates. */
  needsGenerationTimeClassification?: boolean;
}
