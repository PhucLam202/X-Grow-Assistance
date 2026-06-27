import { Injectable } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongoService } from '../../mongo/mongo.service';
import {
  HarnessRunDocument,
  HarnessState,
  HarnessToolCallRecord,
} from './harness.types';

const RUNS_COLLECTION = 'ai_harness_runs';
const TOOL_CALLS_COLLECTION = 'ai_harness_tool_calls';

@Injectable()
export class HarnessLogRepository {
  private indexesPromise: Promise<void> | null = null;

  constructor(private readonly mongoService: MongoService) {}

  async startRun(state: HarnessState): Promise<void> {
    await this.ensureIndexes();
    const db = await this.mongoService.db();
    await db.collection<HarnessRunDocument>(RUNS_COLLECTION).insertOne({
      runId: state.runId,
      status: 'started',
      input: state.input,
      enrichedInput: state.enrichedInput,
      warnings: state.warnings,
      startedAt: new Date(state.startedAt),
    });
  }

  async recordToolCall(
    runId: string,
    record: HarnessToolCallRecord,
  ): Promise<void> {
    await this.ensureIndexes();
    const db = await this.mongoService.db();
    await db.collection(TOOL_CALLS_COLLECTION).insertOne({
      _id: new ObjectId(),
      runId,
      toolName: record.toolName,
      toolStatus: record.status,
      critical: record.critical,
      inputJson: record.input,
      outputJson: record.output,
      errorMessage: record.errorMessage,
      durationMs: record.durationMs,
      startedAt: new Date(record.startedAt),
      completedAt: new Date(record.completedAt),
    });
  }

  async completeRun(state: HarnessState): Promise<void> {
    await this.ensureIndexes();
    const db = await this.mongoService.db();
    await db.collection<HarnessRunDocument>(RUNS_COLLECTION).updateOne(
      { runId: state.runId },
      {
        $set: {
          status: state.status,
          enrichedInput: state.enrichedInput,
          initialDecision: state.initialDecision,
          finalDecision: state.finalDecision,
          composerOutput: state.composerOutput,
          warnings: state.warnings,
          completedAt: state.completedAt
            ? new Date(state.completedAt)
            : new Date(),
          durationMs: state.durationMs,
        },
      },
    );
  }

  async failRun(state: HarnessState, errorMessage: string): Promise<void> {
    await this.ensureIndexes();
    const db = await this.mongoService.db();
    await db.collection<HarnessRunDocument>(RUNS_COLLECTION).updateOne(
      { runId: state.runId },
      {
        $set: {
          status: 'failed',
          enrichedInput: state.enrichedInput,
          initialDecision: state.initialDecision,
          finalDecision: state.finalDecision,
          warnings: state.warnings,
          errorMessage,
          completedAt: state.completedAt
            ? new Date(state.completedAt)
            : new Date(),
          durationMs: state.durationMs,
        },
      },
    );
  }

  async getRunByRunId(runId: string, userId: string) {
    await this.ensureIndexes();
    const db = await this.mongoService.db();
    const run = await db
      .collection(RUNS_COLLECTION)
      .findOne({ runId, 'input.userId': userId });
    if (!run) return { run: null, toolCalls: [] };
    const toolCalls = await db
      .collection(TOOL_CALLS_COLLECTION)
      .find({ runId })
      .sort({ startedAt: 1 })
      .toArray();
    return { run, toolCalls };
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.indexesPromise) {
      this.indexesPromise = this.createIndexes();
    }
    await this.indexesPromise;
  }

  private async createIndexes(): Promise<void> {
    const db = await this.mongoService.db();
    await Promise.all([
      db
        .collection(RUNS_COLLECTION)
        .createIndex({ runId: 1 }, { unique: true }),
      db.collection(RUNS_COLLECTION).createIndex({ userId: 1, startedAt: -1 }),
      db.collection(RUNS_COLLECTION).createIndex({ postId: 1, startedAt: -1 }),
      db.collection(RUNS_COLLECTION).createIndex({ status: 1, startedAt: -1 }),
      db
        .collection(TOOL_CALLS_COLLECTION)
        .createIndex({ runId: 1, startedAt: 1 }),
      db
        .collection(TOOL_CALLS_COLLECTION)
        .createIndex({ toolName: 1, toolStatus: 1, startedAt: -1 }),
    ]);
  }
}
