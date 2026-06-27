import { Injectable } from '@nestjs/common';
import { AiDriverService } from './ai-driver.service';
import {
  DriverInput,
  StrategyEngineResult,
} from './types/comment-intelligence.types';
import { ContextPackageNormalizerService } from './tools/context-package-normalizer.service';

@Injectable()
export class CommentStrategyEngineService {
  constructor(
    private readonly aiDriver: AiDriverService,
    private readonly contextNormalizer: ContextPackageNormalizerService,
  ) {}

  run(input: DriverInput): StrategyEngineResult {
    const initialDecision = this.aiDriver.decide(input, 'initial');

    if (!initialDecision.needsContextExpansion) {
      return {
        initialDecision,
        enrichedInput: input,
        finalDecision: initialDecision,
      };
    }

    const enriched = this.contextNormalizer.enrich(input);
    const finalDecision = this.aiDriver.decide(enriched.input, 'final');

    return {
      initialDecision,
      continuationContext: enriched.context,
      enrichedInput: enriched.input,
      finalDecision,
    };
  }
}
