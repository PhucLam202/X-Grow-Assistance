import { LanguageDetectorService } from '../common/language/language-detector.service';
import { AiDriverService } from './ai-driver.service';
import { CommentStrategyEngineService } from './comment-strategy-engine.service';
import { AuthorContinuationExtractorService } from './tools/author-continuation-extractor.service';
import { ContextPackageNormalizerService } from './tools/context-package-normalizer.service';
import { ContinuationSignalDetectorService } from './tools/continuation-signal-detector.service';
import { RelationshipContextExtractorService } from './tools/relationship-context-extractor.service';

describe('CommentStrategyEngineService', () => {
  it('runs initial driver, context tools, and final driver decision', () => {
    const signalDetector = new ContinuationSignalDetectorService();
    const contextNormalizer = new ContextPackageNormalizerService(
      signalDetector,
      new AuthorContinuationExtractorService(),
      new RelationshipContextExtractorService(),
    );
    const aiDriver = new AiDriverService(
      new LanguageDetectorService(),
      signalDetector,
    );
    const engine = new CommentStrategyEngineService(
      aiDriver,
      contextNormalizer,
    );

    const result = engine.run({
      platform: 'x',
      mainPost: {
        text: 'Thread: this React bug looked impossible at first...',
        username: 'dev_author',
      },
      availableReplies: [
        {
          text: 'The root cause was a stale closure around async state updates.',
          username: 'dev_author',
          orderIndex: 0,
        },
      ],
      extraction: {
        confidence: 0.92,
        warnings: [],
        missingFields: [],
      },
    });

    expect(result.initialDecision.needsContextExpansion).toBe(true);
    expect(result.initialDecision.shouldComment).toBe(false);
    expect(result.continuationContext?.authorContinuations).toHaveLength(1);
    expect(result.finalDecision.decisionStage).toBe('final');
    expect(result.finalDecision.needsContextExpansion).toBe(false);
    expect(result.finalDecision.shouldComment).toBe(true);
    expect(result.finalDecision.zone).toBe('technical_insight');
    expect(result.finalDecision.requiredTools).toEqual([]);
  });
});
