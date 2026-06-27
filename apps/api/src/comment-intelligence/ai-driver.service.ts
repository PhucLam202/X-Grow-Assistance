import { Injectable } from '@nestjs/common';
import { LanguageDetectorService } from '../common/language/language-detector.service';
import {
  DriverDecision,
  DriverDecisionStage,
  DriverInput,
} from './types/comment-intelligence.types';
import {
  classifyIntent,
  classifyZone,
  decideSafety,
  recommendDepth,
  recommendLanguage,
  recommendTone,
  writeStrategy,
} from './driver/driver-fns';
import { ContinuationSignalDetectorService } from './tools/continuation-signal-detector.service';

@Injectable()
export class AiDriverService {
  constructor(
    private readonly languageDetector: LanguageDetectorService,
    private readonly signalDetector: ContinuationSignalDetectorService,
  ) {}

  decide(
    input: DriverInput,
    stage: DriverDecisionStage = 'initial',
  ): DriverDecision {
    const zone = classifyZone(input);
    const intent = classifyIntent(input, zone);
    const recommendedLanguage = recommendLanguage(input, this.languageDetector);
    const recommendedTone = recommendTone(zone);
    const recommendedDepth = recommendDepth(input, zone);
    const safety = decideSafety(input, zone);
    const contextNeed = this.getContextNeed(input, stage);

    return {
      zone,
      intent,
      shouldComment: safety.shouldComment && !contextNeed.needsContextExpansion,
      recommendedLanguage,
      recommendedTone,
      recommendedDepth,
      commentStrategy: writeStrategy({
        driverInput: input,
        zone,
        intent,
        language: recommendedLanguage,
        tone: recommendedTone,
        depth: recommendedDepth,
      }),
      avoid: safety.avoid,
      requiredTools: contextNeed.needsContextExpansion
        ? contextNeed.requiredTools
        : this.getMediaTools(input),
      needsContextExpansion: contextNeed.needsContextExpansion,
      contextReasons: contextNeed.contextReasons,
      decisionStage: stage,
      confidence: this.getDecisionConfidence(
        input,
        contextNeed.needsContextExpansion,
      ),
      warnings: this.getWarnings(input, contextNeed.needsContextExpansion),
    };
  }

  private getContextNeed(
    input: DriverInput,
    stage: DriverDecisionStage,
  ): {
    needsContextExpansion: boolean;
    contextReasons: string[];
    requiredTools: string[];
  } {
    if (stage === 'final' || input.contextState?.isExpanded) {
      return {
        needsContextExpansion: false,
        contextReasons: [],
        requiredTools: [],
      };
    }

    const signal = this.signalDetector.detect(input);
    const needsContextExpansion = signal.hasSignal;
    return {
      needsContextExpansion,
      contextReasons: signal.signals,
      requiredTools: needsContextExpansion
        ? [
            'continuation_signal_detector',
            'author_continuation_extractor',
            'relationship_context_extractor',
            'context_package_normalizer',
          ]
        : [],
    };
  }

  private getMediaTools(input: DriverInput): string[] {
    const hasImageContext = (input.media ?? []).some(
      (media) => media.altText || media.ocrText || media.type === 'image',
    );
    return hasImageContext ? ['media_context_tool'] : [];
  }

  private getDecisionConfidence(
    input: DriverInput,
    needsContextExpansion: boolean,
  ): number {
    const contextPenalty = needsContextExpansion ? 0.18 : 0;
    const lowContextPenalty = input.contextState?.needsMoreContext ? 0.12 : 0;
    return Number(
      Math.max(
        0.2,
        input.extraction.confidence - contextPenalty - lowContextPenalty,
      ).toFixed(2),
    );
  }

  private getWarnings(
    input: DriverInput,
    needsContextExpansion: boolean,
  ): string[] {
    return [
      ...input.extraction.warnings,
      ...(needsContextExpansion
        ? ['decision_paused_until_context_expansion']
        : []),
      ...(input.contextState?.needsMoreContext
        ? ['final_decision_still_low_context']
        : []),
    ];
  }
}
