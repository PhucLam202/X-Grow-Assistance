import { Injectable, Logger } from '@nestjs/common';
import { MongoService } from '../../mongo/mongo.service';
import {
  GenerationRun,
  GenerationRunStatus,
} from './types/generation-run.types';

const COLLECTION = 'generation_runs';

import { AiUsageMetadata } from '../../ai/ai.types';

export interface MarkCompletedDetails {
  suggestions: GenerationRun['suggestions'];
  analysisMode: 'text' | 'vision' | 'text_only_fallback';
  fallbackUsed: boolean;
  latencyMs: number;
  aiLatencyMs?: number;
  visionLatencyMs?: number;
  provider?: string;
  model?: string;
  primaryProvider?: string;
  primaryModel?: string;
  fallbackReason?: string;
  attemptCount?: number;
  replyPackUsage?: AiUsageMetadata;
  visionUsage?: AiUsageMetadata;
  primaryNiche?: string;
  nicheConfidence?: number;
  nicheClassificationMethod?: string;
  candidatesGenerated?: number;
  candidatesRejected?: number;
  duplicatesDetected?: number;
  retryUsed?: boolean;
  scoringMethod?: string;
  resolvedPolicyVersion?: string;
}

@Injectable()
export class GenerationRunRepository {
  constructor(private readonly mongoService: MongoService) {}

  async create(run: GenerationRun): Promise<void> {
    try {
      const db = await this.mongoService.db();
      await db.collection(COLLECTION).insertOne(run);
    } catch (error) {
      Logger.warn(
        `Failed to persist generation run: ${(error as Error).message}`,
      );
    }
  }

  async updateStatus(
    id: string,
    status: GenerationRunStatus,
    suggestions?: GenerationRun['suggestions'],
  ): Promise<void> {
    try {
      const db = await this.mongoService.db();
      const update: Record<string, unknown> = { status };
      if (suggestions) update.suggestions = suggestions;
      await db.collection(COLLECTION).updateOne({ id }, { $set: update });
    } catch (error) {
      Logger.warn(
        `Failed to update generation run ${id}: ${(error as Error).message}`,
      );
    }
  }

  async markCompleted(
    id: string,
    details: MarkCompletedDetails,
  ): Promise<void> {
    try {
      const db = await this.mongoService.db();
      const update: Record<string, unknown> = {
        status: 'completed',
        suggestions: details.suggestions,
        analysisMode: details.analysisMode,
        fallbackUsed: details.fallbackUsed,
        latencyMs: details.latencyMs,
      };
      if (details.aiLatencyMs !== undefined) {
        update.aiLatencyMs = details.aiLatencyMs;
      }
      if (details.primaryNiche !== undefined) {
        update.primaryNiche = details.primaryNiche;
      }
      if (details.nicheConfidence !== undefined) {
        update.nicheConfidence = details.nicheConfidence;
      }
      if (details.nicheClassificationMethod !== undefined) {
        update.nicheClassificationMethod = details.nicheClassificationMethod;
      }
      if (details.visionLatencyMs !== undefined) {
        update.visionLatencyMs = details.visionLatencyMs;
      }
      if (details.provider !== undefined) {
        update.provider = details.provider;
      }
      if (details.model !== undefined) {
        update.model = details.model;
      }
      if (details.primaryProvider !== undefined) {
        update.primaryProvider = details.primaryProvider;
      }
      if (details.primaryModel !== undefined) {
        update.primaryModel = details.primaryModel;
      }
      if (details.fallbackReason !== undefined) {
        update.fallbackReason = details.fallbackReason;
      }
      if (details.attemptCount !== undefined) {
        update.attemptCount = details.attemptCount;
      }
      if (details.replyPackUsage !== undefined) {
        update.replyPackUsage = details.replyPackUsage;
      }
      if (details.visionUsage !== undefined) {
        update.visionUsage = details.visionUsage;
      }
      // Số liệu pipeline Phase 4–6, cùng một quy ước "chỉ ghi khi có" như trên.
      for (const key of [
        'candidatesGenerated',
        'candidatesRejected',
        'duplicatesDetected',
        'retryUsed',
        'scoringMethod',
        'resolvedPolicyVersion',
      ] as const) {
        if (details[key] !== undefined) update[key] = details[key];
      }
      await db.collection(COLLECTION).updateOne({ id }, { $set: update });
    } catch (error) {
      Logger.warn(
        `Failed to mark generation run completed ${id}: ${(error as Error).message}`,
      );
    }
  }

  async markFailed(
    id: string,
    details: {
      errorCode: string;
      latencyMs?: number;
    },
  ): Promise<void> {
    try {
      const db = await this.mongoService.db();
      const update: Record<string, unknown> = {
        status: 'failed',
        errorCode: details.errorCode,
      };
      if (details.latencyMs !== undefined) {
        update.latencyMs = details.latencyMs;
      }
      await db.collection(COLLECTION).updateOne({ id }, { $set: update });
    } catch (error) {
      Logger.warn(
        `Failed to mark generation run failed ${id}: ${(error as Error).message}`,
      );
    }
  }
}
