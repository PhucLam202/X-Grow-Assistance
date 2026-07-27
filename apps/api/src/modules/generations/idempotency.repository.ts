import { Injectable, Logger } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongoService } from '../../mongo/mongo.service';
import { ReplyPackResponse } from './dto/reply-pack-response.dto';

export const IDEMPOTENCY_COLLECTION = 'idempotency_records';

export interface IdempotencyRecordDocument {
  _id?: ObjectId;
  userId: string;
  keyHash: string;
  requestHash: string;
  status: 'processing' | 'completed';
  generationRunId?: string;
  response?: ReplyPackResponse;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class IdempotencyRepository {
  private readonly logger = new Logger(IdempotencyRepository.name);
  private indexesPromise: Promise<void> | null = null;

  constructor(private readonly mongoService: MongoService) {}

  async ensureIndexes(): Promise<void> {
    if (!this.indexesPromise) {
      this.indexesPromise = this.createIndexes();
    }
    await this.indexesPromise;
  }

  private async createIndexes(): Promise<void> {
    try {
      const db = await this.mongoService.db();
      await Promise.all([
        db
          .collection(IDEMPOTENCY_COLLECTION)
          .createIndex({ userId: 1, keyHash: 1 }, { unique: true }),
        db
          .collection(IDEMPOTENCY_COLLECTION)
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
    } catch (error) {
      this.logger.warn(
        `Failed to create idempotency indexes: ${(error as Error).message}`,
      );
    }
  }

  async createRecord(record: IdempotencyRecordDocument): Promise<boolean> {
    await this.ensureIndexes();
    try {
      const db = await this.mongoService.db();
      await db
        .collection<IdempotencyRecordDocument>(IDEMPOTENCY_COLLECTION)
        .insertOne(record);
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        return false;
      }
      throw error;
    }
  }

  async findByKeyHash(
    userId: string,
    keyHash: string,
  ): Promise<IdempotencyRecordDocument | null> {
    await this.ensureIndexes();
    try {
      const db = await this.mongoService.db();
      return db
        .collection<IdempotencyRecordDocument>(IDEMPOTENCY_COLLECTION)
        .findOne({ userId, keyHash });
    } catch (error) {
      this.logger.warn(
        `Failed to find idempotency record: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async markCompleted(
    userId: string,
    keyHash: string,
    response: ReplyPackResponse,
  ): Promise<void> {
    await this.ensureIndexes();
    try {
      const db = await this.mongoService.db();
      await db
        .collection<IdempotencyRecordDocument>(IDEMPOTENCY_COLLECTION)
        .updateOne(
          { userId, keyHash },
          {
            $set: {
              status: 'completed',
              response,
            },
          },
        );
    } catch (error) {
      this.logger.warn(
        `Failed to mark idempotency record completed: ${(error as Error).message}`,
      );
    }
  }

  async deleteRecord(userId: string, keyHash: string): Promise<void> {
    await this.ensureIndexes();
    try {
      const db = await this.mongoService.db();
      await db
        .collection<IdempotencyRecordDocument>(IDEMPOTENCY_COLLECTION)
        .deleteOne({ userId, keyHash });
    } catch (error) {
      this.logger.warn(
        `Failed to delete idempotency record: ${(error as Error).message}`,
      );
    }
  }

  async deleteIfExpired(userId: string, keyHash: string): Promise<boolean> {
    await this.ensureIndexes();
    try {
      const db = await this.mongoService.db();
      const result = await db
        .collection<IdempotencyRecordDocument>(IDEMPOTENCY_COLLECTION)
        .deleteOne({ userId, keyHash, expiresAt: { $lte: new Date() } });
      return (result.deletedCount ?? 0) > 0;
    } catch (error) {
      this.logger.warn(
        `Failed to delete expired idempotency record: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
