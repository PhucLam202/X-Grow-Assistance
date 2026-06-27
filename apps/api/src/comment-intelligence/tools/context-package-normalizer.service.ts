import { Injectable } from '@nestjs/common';
import {
  ContinuationContext,
  DriverInput,
} from '../types/comment-intelligence.types';
import { AuthorContinuationExtractorService } from './author-continuation-extractor.service';
import { ContinuationSignalDetectorService } from './continuation-signal-detector.service';
import { RelationshipContextExtractorService } from './relationship-context-extractor.service';

@Injectable()
export class ContextPackageNormalizerService {
  constructor(
    private readonly signalDetector: ContinuationSignalDetectorService,
    private readonly continuationExtractor: AuthorContinuationExtractorService,
    private readonly relationshipExtractor: RelationshipContextExtractorService,
  ) {}

  enrich(input: DriverInput): {
    context: ContinuationContext;
    input: DriverInput;
  } {
    const signal = this.signalDetector.detect(input);
    const relationshipContext = this.relationshipExtractor.extract(input);
    const authorContinuations = this.continuationExtractor.extract(input);
    const expansionSources = [...relationshipContext.sources];

    if (authorContinuations.length > 0) {
      expansionSources.push('author_continuations');
    }

    const needsMoreContext =
      signal.hasSignal &&
      authorContinuations.length === 0 &&
      expansionSources.length === 0;

    const context: ContinuationContext = {
      authorContinuations,
      parentPost: relationshipContext.parentPost,
      quotedPost: relationshipContext.quotedPost,
      repostedPost: relationshipContext.repostedPost,
      extraction: {
        confidence: this.getConfidence(
          input,
          signal.confidence,
          needsMoreContext,
        ),
        warnings: [
          ...input.extraction.warnings,
          ...(needsMoreContext
            ? ['context_expansion_signal_without_available_context']
            : []),
        ],
        missingFields: input.extraction.missingFields,
        needsMoreContext,
      },
      expansionSources,
    };

    return {
      context,
      input: {
        ...input,
        authorContinuations,
        parentPost: relationshipContext.parentPost ?? input.parentPost,
        quotedPost: relationshipContext.quotedPost ?? input.quotedPost,
        repostedPost: relationshipContext.repostedPost ?? input.repostedPost,
        extraction: {
          confidence: context.extraction.confidence,
          warnings: context.extraction.warnings,
          missingFields: context.extraction.missingFields,
        },
        contextState: {
          isExpanded: true,
          expansionSources,
          needsMoreContext,
        },
      },
    };
  }

  private getConfidence(
    input: DriverInput,
    signalConfidence: number,
    needsMoreContext: boolean,
  ): number {
    const base = Math.min(input.extraction.confidence, signalConfidence);
    return Number(
      Math.max(0.25, base - (needsMoreContext ? 0.15 : 0)).toFixed(2),
    );
  }
}
