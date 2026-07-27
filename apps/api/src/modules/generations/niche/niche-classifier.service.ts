import { Injectable } from '@nestjs/common';

import { DEFAULT_NICHE, isNiche } from '../types/niche.types';
import type { Niche } from '../types/niche.types';
import { ContextNormalizerService } from './context-normalizer.service';
import { LightweightClassifierService } from './lightweight-classifier.service';
import { NicheConfidenceService } from './niche-confidence.service';
import { NICHE_CLASSIFICATION_METHODS } from './niche.types';
import type {
  DeterministicNicheMatch,
  NicheClassificationInput,
  NicheDetectionResult,
  NicheScore,
  NicheSourceSignal,
} from './niche.types';
import { getNicheSignals } from './signal-registry';

/** Below this, a model-supplied niche is treated as "the model did not know". */
export const GENERATION_NICHE_MIN_CONFIDENCE = 0.5;

/**
 * Cascade:
 *
 *   Manual Override → Deterministic Signals → Lightweight Classifier
 *                   → Uncertain → flag for Phase 4 to settle while generating
 *
 * No LLM call is made here. When the cascade is not confident it sets
 * `needsGenerationTimeClassification`, and the candidate-generation call
 * decides — which is why there is no `niche-llm-fallback.service.ts`.
 */
@Injectable()
export class NicheClassifierService {
  constructor(
    private readonly contextNormalizer: ContextNormalizerService,
    private readonly lightweightClassifier: LightweightClassifierService,
    private readonly confidence: NicheConfidenceService,
  ) {}

  classify(input: NicheClassificationInput): NicheDetectionResult {
    const manual = this.tryManualOverride(input);
    if (manual) return manual;

    const context = this.contextNormalizer.normalize(input);

    // Nothing to classify, and nothing Phase 4 could classify either.
    if (context.isEmpty) {
      return this.generalFallback('empty_context');
    }

    const scores = this.lightweightClassifier.score(context);
    const deterministic =
      this.lightweightClassifier.matchDeterministic(context);

    const fromDeterministic = this.tryDeterministic(deterministic, scores);
    if (fromDeterministic) return fromDeterministic;

    return this.fromLightweight(scores);
  }

  /**
   * Applied by Phase 4 after the generation call returns. Keeps the "who
   * decided the niche" bookkeeping in one place instead of spreading it across
   * the generation prompt handling.
   */
  applyGenerationTimeClassification(
    result: NicheDetectionResult,
    modelNiche: string | null | undefined,
    modelConfidence?: number,
  ): NicheDetectionResult {
    if (!result.needsGenerationTimeClassification) {
      return result;
    }

    const decided =
      typeof modelNiche === 'string' && isNiche(modelNiche)
        ? modelNiche
        : undefined;
    const confident =
      modelConfidence === undefined ||
      modelConfidence >= GENERATION_NICHE_MIN_CONFIDENCE;

    // The model could not settle it either — this is the only path to
    // general_fallback after a non-empty context.
    if (!decided || !confident) {
      return {
        ...result,
        primaryNiche: DEFAULT_NICHE,
        secondaryNiches: [],
        confidence: 0,
        evidence: [...result.evidence, 'generation_call_returned_no_niche'],
        classificationMethod: 'general_fallback',
        needsGenerationTimeClassification: false,
        fallbackUsed: true,
      };
    }

    return {
      ...result,
      primaryNiche: decided,
      secondaryNiches: result.secondaryNiches.filter(
        (niche) => niche !== decided,
      ),
      confidence: modelConfidence ?? result.confidence,
      evidence: [...result.evidence, `generation_embedded:${decided}`],
      sourceSignals: [
        ...result.sourceSignals,
        { source: 'post_text', signal: `model_niche:${decided}`, weight: 5 },
      ],
      classificationMethod: 'generation_embedded',
      needsGenerationTimeClassification: false,
    };
  }

  /** Structured validation — the result must always satisfy the contract. */
  validate(result: NicheDetectionResult): string[] {
    const problems: string[] = [];

    if (!isNiche(result.primaryNiche)) {
      problems.push(`Unknown primary niche "${String(result.primaryNiche)}".`);
    }
    if (result.secondaryNiches.length > 2) {
      problems.push('At most 2 secondary niches are allowed.');
    }
    if (result.secondaryNiches.includes(result.primaryNiche)) {
      problems.push('Secondary niches must not repeat the primary niche.');
    }
    if (
      new Set(result.secondaryNiches).size !== result.secondaryNiches.length
    ) {
      problems.push('Secondary niches must be unique.');
    }
    if (result.confidence < 0 || result.confidence > 1) {
      problems.push('Confidence must be within [0, 1].');
    }
    if (
      !(NICHE_CLASSIFICATION_METHODS as readonly string[]).includes(
        result.classificationMethod,
      )
    ) {
      problems.push(
        `Unknown classification method "${result.classificationMethod}".`,
      );
    }

    return problems;
  }

  private tryManualOverride(
    input: NicheClassificationInput,
  ): NicheDetectionResult | null {
    const requested = input.requestedNiche;

    // A manually picked niche is never overridden by any later stage.
    if (requested === 'auto' || !isNiche(requested)) return null;

    return {
      primaryNiche: requested,
      secondaryNiches: [],
      confidence: 1,
      evidence: [`manual:${requested}`],
      sourceSignals: [{ source: 'manual', signal: requested, weight: 10 }],
      classificationMethod: 'manual',
      needsGenerationTimeClassification: false,
      fallbackUsed: false,
    };
  }

  private tryDeterministic(
    matches: DeterministicNicheMatch[],
    scores: NicheScore[],
  ): NicheDetectionResult | null {
    if (matches.length === 0) return null;

    // Several niches hit deterministically (e.g. #ai + a github.com link):
    // break the tie with keyword scores, then with signal count.
    const ranked = [...matches].sort((a, b) => {
      const scoreDelta =
        this.scoreOf(scores, b.niche) - this.scoreOf(scores, a.niche);
      if (scoreDelta !== 0) return scoreDelta;
      return b.sourceSignals.length - a.sourceSignals.length;
    });

    const winner = ranked[0];
    const topScore = scores.find((score) => score.niche === winner.niche);
    const confidence = this.confidence.forDeterministic(topScore, scores[1]);

    const secondaries = this.dedupeSecondaries(
      [
        ...ranked.slice(1).map((match) => match.niche),
        ...this.confidence
          .selectSecondaries(scores, winner.niche)
          .map((score) => score.niche),
      ],
      winner.niche,
    );

    return {
      primaryNiche: winner.niche,
      secondaryNiches: secondaries,
      confidence,
      evidence: [...winner.evidence, ...(topScore?.evidence ?? [])],
      sourceSignals: [
        ...winner.sourceSignals,
        ...(topScore?.sourceSignals ?? []),
      ],
      classificationMethod: 'deterministic',
      needsGenerationTimeClassification:
        !this.confidence.isConfident(confidence),
      fallbackUsed: false,
    };
  }

  private fromLightweight(scores: NicheScore[]): NicheDetectionResult {
    const top = scores[0];

    // No keyword matched anything at all.
    if (!top) {
      return this.uncertain(DEFAULT_NICHE, 0, ['no_signal_matched'], []);
    }

    const confidence = this.confidence.forLightweight(top, scores[1]);

    // A lone weak keyword is not enough to commit to a niche, but it is still
    // the best hint available — pass it to Phase 3 as a provisional policy and
    // let Phase 4 override.
    if (!this.confidence.hasMeaningfulEvidence(top)) {
      return this.uncertain(
        top.niche,
        confidence,
        [...top.evidence, 'insufficient_evidence'],
        top.sourceSignals,
      );
    }

    const secondaries = this.dedupeSecondaries(
      this.confidence
        .selectSecondaries(scores, top.niche)
        .map((score) => score.niche),
      top.niche,
    );

    return {
      primaryNiche: top.niche,
      secondaryNiches: secondaries,
      confidence,
      evidence: top.evidence,
      sourceSignals: top.sourceSignals,
      classificationMethod: 'lightweight',
      needsGenerationTimeClassification:
        !this.confidence.isConfident(confidence),
      fallbackUsed: false,
    };
  }

  private uncertain(
    provisionalNiche: Niche,
    confidence: number,
    evidence: string[],
    sourceSignals: NicheSourceSignal[],
  ): NicheDetectionResult {
    return {
      primaryNiche: provisionalNiche,
      secondaryNiches: [],
      confidence,
      evidence,
      sourceSignals,
      classificationMethod: 'lightweight',
      needsGenerationTimeClassification: true,
      fallbackUsed: false,
    };
  }

  private generalFallback(reason: string): NicheDetectionResult {
    return {
      primaryNiche: DEFAULT_NICHE,
      secondaryNiches: [],
      confidence: 0,
      evidence: [reason],
      sourceSignals: [],
      classificationMethod: 'general_fallback',
      needsGenerationTimeClassification: false,
      fallbackUsed: true,
    };
  }

  private dedupeSecondaries(niches: Niche[], primary: Niche): Niche[] {
    return [...new Set(niches)]
      .filter((niche) => niche !== primary)
      .filter((niche) => getNicheSignals(niche) !== undefined)
      .slice(0, 2);
  }

  private scoreOf(scores: NicheScore[], niche: Niche): number {
    return scores.find((score) => score.niche === niche)?.score ?? 0;
  }
}
