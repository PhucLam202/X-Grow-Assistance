import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { CreateReplyPackRequest } from './dto/create-reply-pack-request.dto';
import { ReplyPackResponse } from './dto/reply-pack-response.dto';
import {
  IdempotencyRecordDocument,
  IdempotencyRepository,
} from './idempotency.repository';
import {
  computeRequestHash,
  hashIdempotencyKey,
  validateIdempotencyKey,
} from './idempotency.util';

export interface IdempotencyBeginResult {
  idempotencyActive: boolean;
  isCompleted?: boolean;
  storedResponse?: ReplyPackResponse;
  keyHash?: string;
  requestHash?: string;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly repository: IdempotencyRepository) {}

  async handleBegin(
    userId: string,
    rawKey: unknown,
    request: CreateReplyPackRequest,
    generationRunId: string,
    ttlSeconds = 3600,
  ): Promise<IdempotencyBeginResult> {
    const validKey = validateIdempotencyKey(rawKey);
    if (!validKey) {
      return { idempotencyActive: false };
    }

    const keyHash = hashIdempotencyKey(validKey);
    const requestHash = computeRequestHash(userId, request);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const recordDoc: IdempotencyRecordDocument = {
      userId,
      keyHash,
      requestHash,
      status: 'processing',
      generationRunId,
      createdAt: now,
      expiresAt,
    };

    const inserted = await this.repository.createRecord(recordDoc);

    if (inserted) {
      return {
        idempotencyActive: true,
        isCompleted: false,
        keyHash,
        requestHash,
      };
    }

    // Insert failed due to duplicate key. Check if existing record is expired.
    const deletedExpired = await this.repository.deleteIfExpired(
      userId,
      keyHash,
    );
    if (deletedExpired) {
      const retryInserted = await this.repository.createRecord(recordDoc);
      if (retryInserted) {
        return {
          idempotencyActive: true,
          isCompleted: false,
          keyHash,
          requestHash,
        };
      }
    }

    const existing = await this.repository.findByKeyHash(userId, keyHash);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
      }

      if (existing.status === 'processing') {
        throw new ConflictException('IDEMPOTENCY_REQUEST_IN_PROGRESS');
      }

      if (existing.status === 'completed' && existing.response) {
        return {
          idempotencyActive: true,
          isCompleted: true,
          storedResponse: existing.response,
          keyHash,
          requestHash,
        };
      }
    }

    throw new ConflictException('IDEMPOTENCY_REQUEST_IN_PROGRESS');
  }

  async handleComplete(
    userId: string,
    keyHash: string,
    response: ReplyPackResponse,
  ): Promise<void> {
    // Sanitize response to store ONLY public ReplyPackResponse fields
    const publicResponse: ReplyPackResponse = {
      generationRunId: response.generationRunId,
      analysisMode: response.analysisMode,
      detectedLanguage: response.detectedLanguage,
      translation: response.translation,
      summary: response.summary,
      context: response.context,
      theme: response.theme,
      topic: response.topic,
      sentiment: response.sentiment,
      commentStrategy: response.commentStrategy,
      suggestions: response.suggestions,
      metadata: {
        provider: response.metadata.provider,
        model: response.metadata.model,
        promptVersion: response.metadata.promptVersion,
        latencyMs: response.metadata.latencyMs,
        fallbackUsed: response.metadata.fallbackUsed,
      },
      warnings: response.warnings,
    };

    await this.repository.markCompleted(userId, keyHash, publicResponse);
  }

  async handleFailure(userId: string, keyHash: string): Promise<void> {
    await this.repository.deleteRecord(userId, keyHash);
  }
}
