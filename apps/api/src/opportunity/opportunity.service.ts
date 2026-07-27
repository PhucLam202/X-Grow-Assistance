import { ConfigService } from '@nestjs/config';
import { Injectable, NotFoundException } from '@nestjs/common';
import { FeedIntelligenceService } from '../feed-intelligence/feed-intelligence.service';
import { TopOpportunitiesSelector } from './selectors/top-opportunities.selector';
import { scoreOpportunity } from '../../../../packages/opportunity-scoring/src/index';
import { InMemoryCacheService } from '../infrastructure/cache/in-memory-cache.service';
import { createHash } from 'node:crypto';
import {
  candidateFromStoredFeedCandidate,
  OpportunityBatchItem,
  OpportunityBatchResponse,
  OpportunityScore,
  OpportunityScoreResponse,
  OpportunityScoringInput,
  OpportunitySnapshotItem,
  OpportunitySnapshotSummary,
} from './types/opportunity.types';
import type {
  EvaluateContextDto,
  EvaluatePostDto,
} from './dto/evaluate-opportunity.dto';

export const OPPORTUNITY_SCORE_VERSION = 'opportunity:v1';

@Injectable()
export class OpportunityService {
  constructor(
    private readonly feedIntelligenceService: FeedIntelligenceService,
    private readonly topOpportunitiesSelector: TopOpportunitiesSelector,
    private readonly cacheService: InMemoryCacheService,
    private readonly configService: ConfigService,
  ) {}

  private getCacheTtl(): number {
    return Number(
      this.configService.get<string>('OPPORTUNITY_CACHE_TTL_SECONDS', '600'),
    );
  }

  scorePost(input: OpportunityScoringInput): {
    postUrl?: string;
    score: OpportunityScore;
  } {
    return {
      postUrl: input.candidate.postUrl,
      score: this.score(input),
    };
  }

  async scoreSnapshot(input: {
    snapshotId: string;
    userContext?: OpportunityScoringInput['userContext'];
  }) {
    const snapshot = await this.feedIntelligenceService.getSnapshot(
      input.snapshotId,
    );
    if (!snapshot) {
      throw new NotFoundException(
        `Feed snapshot ${input.snapshotId} was not found`,
      );
    }

    const scoredItems: OpportunitySnapshotItem[] = snapshot.candidates.map(
      (candidate) => {
        const opportunityCandidate =
          candidateFromStoredFeedCandidate(candidate);
        return {
          candidateId: candidate.id,
          postUrl: candidate.postUrl,
          username: candidate.username,
          authorName: candidate.authorName,
          text: candidate.text,
          detectedNiche: candidate.niche,
          detectedTopic: candidate.topic,
          contentType: candidate.contentType,
          score: this.score({
            candidate: opportunityCandidate,
            userContext: input.userContext,
          }),
        };
      },
    );

    const topOpportunities = this.topOpportunitiesSelector.select(
      scoredItems,
      5,
    );

    return {
      snapshotId: snapshot.id,
      topOpportunities,
      summary: this.summarize(scoredItems),
    };
  }

  async evaluate(
    userId: string,
    post: EvaluatePostDto,
    context?: EvaluateContextDto,
  ): Promise<OpportunityScoreResponse> {
    const scoringInput = this.mapToScoringInput(userId, post, context);
    const cacheKey = this.buildCacheKey(userId, post.postId);

    let cachedResult: OpportunityScoreResponse | null = null;
    let cached = false;

    try {
      cachedResult =
        await this.cacheService.get<OpportunityScoreResponse>(cacheKey);
      if (cachedResult) {
        cached = true;
      }
    } catch {
      // Cache failure degrades to miss
    }

    if (cachedResult) {
      return { ...cachedResult, cached: true };
    }

    const score = this.score(scoringInput);
    const response = this.buildResponse(post.postId, score, cached);

    try {
      await this.cacheService.set(cacheKey, response, this.getCacheTtl());
    } catch {
      // Cache failure is non-fatal
    }

    return response;
  }

  async evaluateBatch(
    userId: string,
    posts: EvaluatePostDto[],
    context?: EvaluateContextDto,
  ): Promise<OpportunityBatchResponse> {
    const results: OpportunityBatchItem[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const post of posts) {
      const cacheKey = this.buildCacheKey(userId, post.postId);
      let cachedResult: OpportunityScoreResponse | null = null;
      try {
        cachedResult =
          await this.cacheService.get<OpportunityScoreResponse>(cacheKey);
        if (cachedResult) {
          cacheHits++;
        } else {
          cacheMisses++;
        }
      } catch {
        // Cache failure degrades to miss
        cacheMisses++;
      }

      if (cachedResult) {
        results.push({
          postId: post.postId,
          success: true,
          result: { ...cachedResult, cached: true },
        });
        continue;
      }

      const scoringInput = this.mapToScoringInput(userId, post, context);
      try {
        const score = this.score(scoringInput);
        const response = this.buildResponse(post.postId, score, false);
        results.push({
          postId: post.postId,
          success: true,
          result: response,
        });

        try {
          await this.cacheService.set(cacheKey, response, this.getCacheTtl());
        } catch {
          // Cache failure is non-fatal
        }
      } catch (error) {
        results.push({
          postId: post.postId,
          success: false,
          error: {
            code: 'SCORING_ERROR',
            message: error instanceof Error ? error.message : 'Scoring failed',
          },
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      results,
      metadata: {
        total: posts.length,
        succeeded,
        failed,
        cacheHits,
        cacheMisses,
        scoreVersion: OPPORTUNITY_SCORE_VERSION,
      },
    };
  }

  private buildCacheKey(userId: string, postId: string): string {
    return `score:${userId}:x:${postId}:${OPPORTUNITY_SCORE_VERSION}`;
  }

  private buildContextHash(context?: EvaluateContextDto): string {
    if (!context?.preferredTopics?.length) {
      return 'default';
    }
    const normalized = context.preferredTopics
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .sort()
      .join(',');
    return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  }

  private mapToScoringInput(
    userId: string,
    post: EvaluatePostDto,
    context?: EvaluateContextDto,
  ): OpportunityScoringInput {
    const metrics = post.metrics
      ? {
          replies: post.metrics.replies,
          reposts: post.metrics.reposts,
          likes: post.metrics.likes,
          views: post.metrics.views,
        }
      : undefined;

    const timestamps = post.createdAt
      ? { postedAt: post.createdAt, extractedAt: new Date().toISOString() }
      : undefined;

    const targetNiches = context?.preferredTopics?.length
      ? context.preferredTopics
      : context?.niche
        ? [context.niche]
        : undefined;

    return {
      candidate: {
        id: post.postId,
        tweetId: post.postId,
        text: post.text ?? '',
        contentType: this.mapContentType(post.contentType),
        metrics,
        timestamps,
        mediaCount:
          post.contentType === 'image' || post.contentType === 'video' ? 1 : 0,
      },
      userContext: targetNiches ? { targetNiches } : undefined,
    };
  }

  private mapContentType(type: string): string {
    switch (type) {
      case 'text':
        return 'text';
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'mixed':
        return 'mixed';
      default:
        return 'unknown';
    }
  }

  private buildResponse(
    postId: string,
    score: OpportunityScore,
    cached: boolean,
  ): OpportunityScoreResponse {
    const expiresAt = new Date(
      Date.now() + this.getCacheTtl() * 1000,
    ).toISOString();
    return {
      postId,
      total: score.total,
      label: score.label,
      components: {
        nicheMatch: score.dimensions.nicheMatch,
        freshness: score.dimensions.freshness,
        engagementVelocity: score.dimensions.engagementVelocity,
        replySurface: score.dimensions.replySurface,
        mediaContext: score.dimensions.mediaContext,
        authorQuality: score.dimensions.authorQuality,
        competitionLevel: score.dimensions.competitionLevel,
        spamRisk: score.dimensions.spamRisk,
        negativeTopicRisk: score.dimensions.negativeTopicRisk,
      },
      reasons: score.reasonVi,
      scoreVersion: OPPORTUNITY_SCORE_VERSION,
      expiresAt,
      cached,
    };
  }

  private score(input: OpportunityScoringInput): OpportunityScore {
    return scoreOpportunity(input);
  }

  private summarize(
    items: OpportunitySnapshotItem[],
  ): OpportunitySnapshotSummary {
    const summary: OpportunitySnapshotSummary = {
      totalCandidates: items.length,
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0,
      skip: 0,
    };

    items.forEach((item) => {
      summary[item.score.label] += 1;
    });

    return summary;
  }
}
