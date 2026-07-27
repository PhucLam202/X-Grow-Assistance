import { BadRequestException, ConflictException } from '@nestjs/common';
import { CreateReplyPackRequest } from './dto/create-reply-pack-request.dto';
import { ReplyPackResponse } from './dto/reply-pack-response.dto';
import {
  IdempotencyRecordDocument,
  IdempotencyRepository,
} from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';
import {
  computeRequestHash,
  hashIdempotencyKey,
  validateIdempotencyKey,
} from './idempotency.util';

const mockRequest: CreateReplyPackRequest = {
  post: {
    platform: 'x',
    postId: 'post-100',
    text: 'Test post text for idempotency',
    url: 'https://x.com/user/status/100',
    author: { name: 'Alice', handle: 'alice' },
  },
  options: {
    tone: 'short_native',
    niche: 'tech',
    targetLanguage: 'en',
    maxSuggestions: 3,
  },
};

const mockPublicResponse: ReplyPackResponse = {
  generationRunId: 'gen-run-1',
  analysisMode: 'text',
  detectedLanguage: 'en',
  translation: 'Translation',
  summary: 'Summary',
  context: 'Context',
  theme: 'theme',
  topic: 'tech',
  sentiment: 'positive',
  commentStrategy: 'Strategy',
  suggestions: [],
  metadata: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    promptVersion: 'generation:v1',
    latencyMs: 150,
    fallbackUsed: false,
  },
};

describe('Idempotency Validation and Service (Phase 4D-2)', () => {
  describe('Idempotency Key Validation', () => {
    it('should return undefined for undefined/null key', () => {
      expect(validateIdempotencyKey(undefined)).toBeUndefined();
      expect(validateIdempotencyKey(null)).toBeUndefined();
    });

    it('should trim and accept valid keys (1 to 128 chars)', () => {
      expect(validateIdempotencyKey('  my-key-123  ')).toBe('my-key-123');
      const char128 = 'a'.repeat(128);
      expect(validateIdempotencyKey(char128)).toBe(char128);
    });

    it('should reject empty or whitespace-only keys', () => {
      expect(() => validateIdempotencyKey('')).toThrow(BadRequestException);
      expect(() => validateIdempotencyKey('   ')).toThrow(BadRequestException);
    });

    it('should reject keys longer than 128 characters', () => {
      const char129 = 'a'.repeat(129);
      expect(() => validateIdempotencyKey(char129)).toThrow(
        BadRequestException,
      );
    });

    it('should reject non-string key types', () => {
      expect(() => validateIdempotencyKey(12345)).toThrow(BadRequestException);
      expect(() => validateIdempotencyKey({})).toThrow(BadRequestException);
    });
  });

  describe('IdempotencyService', () => {
    let service: IdempotencyService;
    let mockRepository: jest.Mocked<IdempotencyRepository>;

    beforeEach(() => {
      mockRepository = {
        ensureIndexes: jest.fn(),
        createRecord: jest.fn(),
        findByKeyHash: jest.fn(),
        markCompleted: jest.fn(),
        deleteRecord: jest.fn(),
        deleteIfExpired: jest.fn(),
      } as unknown as jest.Mocked<IdempotencyRepository>;

      service = new IdempotencyService(mockRepository);
    });

    it('no key processes normally', async () => {
      const result = await service.handleBegin(
        'user-1',
        undefined,
        mockRequest,
        'gen-1',
      );
      expect(result.idempotencyActive).toBe(false);
      expect(mockRepository.createRecord).not.toHaveBeenCalled();
    });

    it('new key calls AI once and returns active processing state', async () => {
      mockRepository.createRecord.mockResolvedValueOnce(true);

      const result = await service.handleBegin(
        'user-1',
        'key-abc',
        mockRequest,
        'gen-1',
      );

      expect(result.idempotencyActive).toBe(true);
      expect(result.isCompleted).toBe(false);
      expect(result.keyHash).toBe(hashIdempotencyKey('key-abc'));

      // Ensure raw key is not passed to repository
      const createdRecord: IdempotencyRecordDocument =
        mockRepository.createRecord.mock.calls[0][0];
      expect(createdRecord.keyHash).toBe(hashIdempotencyKey('key-abc'));
      expect((createdRecord as Record<string, unknown>).rawKey).toBeUndefined();
    });

    it('duplicate processing returns 409 IDEMPOTENCY_REQUEST_IN_PROGRESS', async () => {
      const hash = hashIdempotencyKey('key-abc');
      const reqHash = computeRequestHash('user-1', mockRequest);

      mockRepository.createRecord.mockResolvedValueOnce(false);
      mockRepository.deleteIfExpired.mockResolvedValueOnce(false);
      mockRepository.findByKeyHash.mockResolvedValueOnce({
        userId: 'user-1',
        keyHash: hash,
        requestHash: reqHash,
        status: 'processing',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });

      await expect(
        service.handleBegin('user-1', 'key-abc', mockRequest, 'gen-2'),
      ).rejects.toThrow(ConflictException);
    });

    it('duplicate completed returns stored response without AI call', async () => {
      const hash = hashIdempotencyKey('key-abc');
      const reqHash = computeRequestHash('user-1', mockRequest);

      mockRepository.createRecord.mockResolvedValueOnce(false);
      mockRepository.deleteIfExpired.mockResolvedValueOnce(false);
      mockRepository.findByKeyHash.mockResolvedValueOnce({
        userId: 'user-1',
        keyHash: hash,
        requestHash: reqHash,
        status: 'completed',
        response: mockPublicResponse,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await service.handleBegin(
        'user-1',
        'key-abc',
        mockRequest,
        'gen-2',
      );

      expect(result.idempotencyActive).toBe(true);
      expect(result.isCompleted).toBe(true);
      expect(result.storedResponse).toEqual(mockPublicResponse);
    });

    it('same key with different requestHash returns 409 conflict', async () => {
      const hash = hashIdempotencyKey('key-abc');

      mockRepository.createRecord.mockResolvedValueOnce(false);
      mockRepository.deleteIfExpired.mockResolvedValueOnce(false);
      mockRepository.findByKeyHash.mockResolvedValueOnce({
        userId: 'user-1',
        keyHash: hash,
        requestHash: 'different-request-hash-123',
        status: 'completed',
        response: mockPublicResponse,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });

      await expect(
        service.handleBegin('user-1', 'key-abc', mockRequest, 'gen-2'),
      ).rejects.toThrow(ConflictException);
    });

    it('expired record can be reused without waiting for Mongo TTL deletion', async () => {
      mockRepository.createRecord.mockResolvedValueOnce(false);
      mockRepository.deleteIfExpired.mockResolvedValueOnce(true); // Expired record deleted!
      mockRepository.createRecord.mockResolvedValueOnce(true); // Retry insert succeeded!

      const result = await service.handleBegin(
        'user-1',
        'key-abc',
        mockRequest,
        'gen-2',
      );

      expect(mockRepository.deleteIfExpired).toHaveBeenCalledWith(
        'user-1',
        hashIdempotencyKey('key-abc'),
      );
      expect(mockRepository.createRecord).toHaveBeenCalledTimes(2);
      expect(result.idempotencyActive).toBe(true);
      expect(result.isCompleted).toBe(false);
    });

    it('generation failure deletes the processing record', async () => {
      const hash = hashIdempotencyKey('key-abc');
      await service.handleFailure('user-1', hash);

      expect(mockRepository.deleteRecord).toHaveBeenCalledWith('user-1', hash);
    });

    it('stored completed response contains only public ReplyPackResponse fields', async () => {
      const hash = hashIdempotencyKey('key-abc');
      const fullResponse: any = {
        ...mockPublicResponse,
        rawAiResponse: 'secret internal data',
        internalDebugTrace: { stack: 'err' },
      };

      await service.handleComplete('user-1', hash, fullResponse);

      expect(mockRepository.markCompleted).toHaveBeenCalledWith(
        'user-1',
        hash,
        mockPublicResponse,
      );
    });
  });
});
