import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiDriverService } from '../ai-driver.service';
import { CommentComposerService } from '../composer/comment-composer.service';
import { DriverInput } from '../types/comment-intelligence.types';
import { HarnessLogRepository } from './harness-log.repository';
import { HarnessState, HarnessToolCallRecord } from './harness.types';
import { ToolRouterService } from './tool-router.service';

@Injectable()
export class CommentAiHarnessService {
  private readonly logger = new Logger(CommentAiHarnessService.name);

  constructor(
    private readonly aiDriver: AiDriverService,
    private readonly toolRouter: ToolRouterService,
    private readonly composer: CommentComposerService,
    private readonly logRepository: HarnessLogRepository,
  ) {}

  async run(input: DriverInput): Promise<HarnessState> {
    const startedAt = new Date();
    const state: HarnessState = {
      runId: randomUUID(),
      status: 'started',
      input,
      enrichedInput: input,
      toolCalls: [],
      warnings: [],
      startedAt: startedAt.toISOString(),
    };

    // Fire-and-forget: startRun is observability-only, must not block AI pipeline.
    void this.tryLog(
      () => this.logRepository.startRun(state),
      state,
      'harness_log_start_failed',
    );

    try {
      state.initialDecision = this.aiDriver.decide(input, 'initial');
      state.warnings.push(...state.initialDecision.warnings);

      if (state.initialDecision.requiredTools.length > 0) {
        const records = await this.toolRouter.run(
          state.initialDecision.requiredTools,
          state,
        );
        // Fire-and-forget: tool call records are diagnostic only.
        void this.recordToolCalls(state.runId, records, state);
      }

      state.finalDecision = this.aiDriver.decide(state.enrichedInput, 'final');
      state.warnings.push(...state.finalDecision.warnings);
      const userMemory = state.input.userId
        ? await this.composer.fetchUserMemory(state.input.userId)
        : undefined;
      state.composerOutput = await this.composer.compose({
        input: state.enrichedInput,
        decision: state.finalDecision,
        userMemory,
      });
      state.warnings.push(...state.composerOutput.warnings);
      state.status = state.composerOutput.bestPick ? 'completed' : 'skipped';
      state.completedAt = new Date().toISOString();
      state.durationMs = Date.now() - startedAt.getTime();
      await this.tryLog(
        () => this.logRepository.completeRun(state),
        state,
        'harness_log_complete_failed',
      );
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      state.status = 'failed';
      state.completedAt = new Date().toISOString();
      state.durationMs = Date.now() - startedAt.getTime();
      state.warnings.push(`harness_failed:${message}`);
      await this.tryLog(
        () => this.logRepository.failRun(state, message),
        state,
        'harness_log_fail_failed',
      );
      throw error;
    }
  }

  async getRun(runId: string, userId: string) {
    return this.logRepository.getRunByRunId(runId, userId);
  }

  private async recordToolCalls(
    runId: string,
    records: HarnessToolCallRecord[],
    state: HarnessState,
  ): Promise<void> {
    for (const record of records) {
      await this.tryLog(
        () => this.logRepository.recordToolCall(runId, record),
        state,
        `harness_log_tool_call_failed:${record.toolName}`,
      );
    }
  }

  private async tryLog(
    operation: () => Promise<void>,
    state: HarnessState,
    warning: string,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      state.warnings.push(`${warning}:${message}`);
      this.logger.warn(`${warning}: ${message}`);
    }
  }
}
