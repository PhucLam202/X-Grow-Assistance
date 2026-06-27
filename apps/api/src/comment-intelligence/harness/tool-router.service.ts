import { Injectable } from '@nestjs/common';
import { HarnessState, HarnessToolCallRecord } from './harness.types';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class ToolRouterService {
  constructor(private readonly registry: ToolRegistryService) {}

  async run(
    requiredTools: string[],
    state: HarnessState,
  ): Promise<HarnessToolCallRecord[]> {
    const records: HarnessToolCallRecord[] = [];
    const executed = new Set<string>();

    for (const requestedTool of requiredTools) {
      const startedAt = new Date();
      const definition = this.registry.get(requestedTool);

      if (!definition) {
        records.push(
          this.skipped(requestedTool, false, startedAt, 'tool_not_approved'),
        );
        continue;
      }

      if (executed.has(definition.name)) {
        records.push(
          this.skipped(
            definition.name,
            definition.critical,
            startedAt,
            'duplicate_tool_request',
          ),
        );
        continue;
      }

      executed.add(definition.name);

      try {
        const result = await definition.execute({ state });
        if (result.enrichedInput) {
          state.enrichedInput = result.enrichedInput;
        }
        if (result.warnings) {
          state.warnings.push(...result.warnings);
        }
        records.push({
          toolName: definition.name,
          status: 'success',
          critical: definition.critical,
          input: { requestedTool },
          output: result.output,
          durationMs: Date.now() - startedAt.getTime(),
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown_error';
        records.push({
          toolName: definition.name,
          status: 'failed',
          critical: definition.critical,
          input: { requestedTool },
          errorMessage: message,
          durationMs: Date.now() - startedAt.getTime(),
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
        });
        state.warnings.push(`tool_failed:${definition.name}:${message}`);
        if (definition.critical) throw error;
      }
    }

    state.toolCalls.push(...records);
    return records;
  }

  private skipped(
    toolName: string,
    critical: boolean,
    startedAt: Date,
    reason: string,
  ): HarnessToolCallRecord {
    return {
      toolName,
      status: 'skipped',
      critical,
      input: { reason },
      errorMessage: reason,
      durationMs: Date.now() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    };
  }
}
