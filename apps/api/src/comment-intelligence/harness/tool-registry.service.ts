import { Injectable } from '@nestjs/common';
import { AuthorContinuationExtractorService } from '../tools/author-continuation-extractor.service';
import { ContextPackageNormalizerService } from '../tools/context-package-normalizer.service';
import { ContinuationSignalDetectorService } from '../tools/continuation-signal-detector.service';
import { RelationshipContextExtractorService } from '../tools/relationship-context-extractor.service';
import { HarnessToolDefinition } from './harness.types';

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly signalDetector: ContinuationSignalDetectorService,
    private readonly continuationExtractor: AuthorContinuationExtractorService,
    private readonly relationshipExtractor: RelationshipContextExtractorService,
    private readonly contextNormalizer: ContextPackageNormalizerService,
  ) {}

  get(toolName: string): HarnessToolDefinition | undefined {
    return this.getAll().find(
      (tool) => tool.name === toolName || tool.aliases.includes(toolName),
    );
  }

  getAll(): HarnessToolDefinition[] {
    return [
      {
        name: 'media_context_tool',
        aliases: [],
        critical: false,
        execute: ({ state }) => ({
          output: {
            mediaCount: state.enrichedInput.media?.length ?? 0,
            media: state.enrichedInput.media ?? [],
          },
        }),
      },
      {
        name: 'continuation_signal_tool',
        aliases: ['continuation_signal_detector'],
        critical: false,
        execute: ({ state }) => ({
          output: { signal: this.signalDetector.detect(state.enrichedInput) },
        }),
      },
      {
        name: 'author_continuation_tool',
        aliases: ['author_continuation_extractor', 'continuation_reader_tool'],
        critical: false,
        execute: ({ state }) => ({
          output: {
            authorContinuations: this.continuationExtractor.extract(
              state.enrichedInput,
            ),
          },
        }),
      },
      {
        name: 'relationship_context_tool',
        aliases: [
          'relationship_context_extractor',
          'quote_repost_context_tool',
        ],
        critical: false,
        execute: ({ state }) => ({
          output: this.relationshipExtractor.extract(
            state.enrichedInput,
          ) as unknown as Record<string, unknown>,
        }),
      },
      {
        name: 'context_package_tool',
        aliases: ['context_package_normalizer', 'post_context_tool'],
        critical: true,
        execute: ({ state }) => {
          const enriched = this.contextNormalizer.enrich(state.enrichedInput);
          return {
            output: {
              context: enriched.context,
              expansionSources: enriched.context.expansionSources,
            },
            enrichedInput: enriched.input,
            warnings: enriched.context.extraction.warnings,
          };
        },
      },
      {
        name: 'strategy_planner_tool',
        aliases: [],
        critical: true,
        execute: ({ state }) => ({
          output: {
            decisionStage:
              state.finalDecision?.decisionStage ??
              state.initialDecision?.decisionStage,
          },
        }),
      },
      {
        name: 'comment_generator_tool',
        aliases: [],
        critical: true,
        execute: ({ state }) => ({
          output: { hasComposerOutput: Boolean(state.composerOutput) },
        }),
      },
      {
        name: 'comment_quality_tool',
        aliases: [],
        critical: false,
        execute: ({ state }) => ({
          output: { bestScore: state.composerOutput?.bestPick?.score ?? null },
        }),
      },
    ];
  }
}
