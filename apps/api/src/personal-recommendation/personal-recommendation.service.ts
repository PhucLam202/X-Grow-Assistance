import { BadRequestException, Injectable } from '@nestjs/common';
import { Db, ObjectId } from 'mongodb';
import { MongoService } from '../mongo/mongo.service';
import { IngestActionLogDto } from './dto/ingest-action-log.dto';
import { ManualPerformanceUpdateDto } from './dto/manual-performance-update.dto';

type SignalType = 'niche' | 'language' | 'tone' | 'account' | 'comment_pattern';

type PerformanceScores = {
  absolutePerformanceScore: number;
  relativePerformanceScore?: number;
  finalPerformanceScore: number;
  label: 'weak' | 'okay' | 'good' | 'strong' | 'excellent';
};

@Injectable()
export class PersonalRecommendationService {
  constructor(private readonly mongoService: MongoService) {}

  async ingestActionLog(dto: IngestActionLogDto) {
    const userId = this.requireUserId(dto.userId);
    const db = await this.mongoService.db();
    const personalEventId = new ObjectId();

    await db.collection('personal_events').insertOne({
      _id: personalEventId,
      userId,
      source: 'phase_3_1_growth_action',
      sessionId: dto.sessionId,
      actionId: dto.actionId,
      candidateId: dto.candidateId,
      postUrl: dto.postUrl,
      username: dto.username,
      actionType: dto.actionType,
      recommendedAction: dto.recommendedAction,
      baseOpportunityScore: dto.baseOpportunityScore,
      niche: dto.niche,
      language: dto.language,
      tone: dto.tone,
      commentText: dto.commentText,
      status: dto.actionType === 'skipped' ? 'ignored' : 'pending_feedback',
      metadata: dto.metadata ?? {},
      createdAt: new Date(),
    });

    return {
      success: true,
      personalEventId,
      status: dto.actionType === 'skipped' ? 'ignored' : 'pending_feedback',
    };
  }

  async manualPerformanceUpdate(dto: ManualPerformanceUpdateDto) {
    const userId = this.requireUserId(dto.userId);
    const db = await this.mongoService.db();
    const scores = this.calculateScores(dto.metrics);
    const performanceId = new ObjectId();
    const now = new Date();

    const performanceDoc = {
      _id: performanceId,
      userId,
      actionId: dto.actionId,
      candidateId: dto.candidateId,
      postUrl: dto.postUrl ?? 'unknown',
      commentText: dto.commentText ?? '',
      niche: dto.niche,
      language: dto.language,
      tone: dto.tone,
      metrics: {
        likes: dto.metrics.likes ?? 0,
        replies: dto.metrics.replies ?? 0,
        reposts: dto.metrics.reposts ?? 0,
        views: dto.metrics.views ?? 0,
        profileVisits: dto.metrics.profileVisits ?? 0,
      },
      originalPostMetrics: {
        likes: dto.metrics.postLikes,
        replies: dto.metrics.postReplies,
        reposts: dto.metrics.postReposts,
        views: dto.metrics.postViews,
      },
      scores,
      notes: dto.notes,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('comment_performances').insertOne(performanceDoc);

    const matchQuery: Record<string, unknown> = { userId };
    const orConditions: Array<Record<string, unknown>> = [];

    if (dto.actionId) {
      orConditions.push({ actionId: dto.actionId });
    }

    if (dto.candidateId) {
      orConditions.push({ candidateId: dto.candidateId });
    }

    if (dto.postUrl) {
      orConditions.push({ postUrl: dto.postUrl });
    }

    if (orConditions.length > 0) {
      matchQuery.$or = orConditions;
    }

    const matchedEvent = await db
      .collection('personal_events')
      .findOneAndUpdate(
        matchQuery,
        {
          $set: {
            status: 'performance_recorded',
            performanceId,
            updatedAt: now,
          },
        },
        { sort: { createdAt: -1 } },
      );

    const signalUpdates = this.buildSignalUpdates(dto, scores);
    for (const update of signalUpdates) {
      await this.upsertSignalScore(
        db,
        userId,
        update.type,
        update.key,
        scores.finalPerformanceScore,
        dto.metrics,
        performanceId,
        update.metadata,
      );
    }

    await this.refreshProfile(db, userId);

    return {
      success: true,
      performanceId,
      matchedEventId: matchedEvent?.value?._id ?? null,
      updatedSignals: signalUpdates.map(
        (signal) => `${signal.type}:${signal.key}`,
      ),
      scores,
    };
  }

  async getPersonalProfile(userId: string) {
    const db = await this.mongoService.db();
    const profile = await db
      .collection('personal_profiles')
      .findOne({ userId });

    const isEmpty =
      !profile ||
      ((profile.targetNiches as unknown[])?.length === 0 &&
        (profile.preferredLanguages as unknown[])?.length === 0 &&
        (profile.accountWatchlist as unknown[])?.length === 0);

    if (isEmpty) {
      await this.refreshProfile(db, userId);
    }

    const [refreshed, memory] = await Promise.all([
      db.collection('personal_profiles').findOne({ userId }),
      db.collection('comment_memory_profiles').findOne({ userId }),
    ]);

    return { ...refreshed, commentMemory: memory ?? null };
  }

  async rebuildCommentMemory(userId: string) {
    const db = await this.mongoService.db();
    const usedComments = await db
      .collection('used_comment_memories')
      .find({ userId })
      .toArray();
    const preferredLanguages = this.topValues(
      usedComments.map((item) => item.language),
    );
    const preferredTones = this.topValues(
      usedComments.map((item) => item.tone),
    );
    const commonPostTypes = this.topValues(
      usedComments.map((item) => item.postType),
    );
    const now = new Date();

    await db.collection('comment_memory_profiles').updateOne(
      { userId },
      {
        $set: {
          userId,
          preferredLanguages,
          preferredTones,
          commonPostTypes,
          blockedPhrases: ['Great post', 'Thanks for sharing'],
          styleNotes: this.buildCommentStyleNotes(
            preferredLanguages,
            preferredTones,
          ),
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    await this.rebuildPatternMemories(db, userId, usedComments);

    return {
      success: true,
      usedCommentCount: usedComments.length,
      preferredLanguages,
      preferredTones,
      commonPostTypes,
    };
  }

  async getCommentMemory(userId: string) {
    const db = await this.mongoService.db();
    let profile = await db
      .collection('comment_memory_profiles')
      .findOne({ userId });
    if (!profile) {
      await this.rebuildCommentMemory(userId);
      profile = await db
        .collection('comment_memory_profiles')
        .findOne({ userId });
    }
    const recentUsedComments = await db
      .collection('used_comment_memories')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    const patterns = await db
      .collection('comment_pattern_memories')
      .find({ userId })
      .sort({ useCount: -1 })
      .limit(10)
      .toArray();

    return {
      userId,
      profile,
      recentUsedComments,
      patterns,
    };
  }

  async checkCommentSimilarity(commentText: string, userId: string) {
    const db = await this.mongoService.db();
    const normalized = this.normalizePattern(commentText);
    const recent = await db
      .collection('used_comment_memories')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const exact = recent.find(
      (item) =>
        item.normalizedText === normalized ||
        item.similarityKey === normalized.slice(0, 120),
    );
    if (exact) {
      return {
        isTooSimilar: true,
        similarCommentId: String(exact._id),
        similarText: exact.text,
        reason: 'Exact or near-exact comment was used recently.',
      };
    }

    const tokenSet = new Set(normalized.split(' ').filter(Boolean));
    const similar = recent.find((item) => {
      const candidateTokens = String(item.normalizedText ?? '')
        .split(' ')
        .filter(Boolean);
      if (candidateTokens.length === 0 || tokenSet.size === 0) return false;
      const overlap = candidateTokens.filter((token) =>
        tokenSet.has(token),
      ).length;
      return overlap / Math.max(candidateTokens.length, tokenSet.size) >= 0.75;
    });

    return {
      isTooSimilar: Boolean(similar),
      similarCommentId: similar ? String(similar._id) : null,
      similarText: similar?.text ?? null,
      reason: similar
        ? 'Comment structure is too close to a recent used comment.'
        : null,
    };
  }

  private calculateScores(
    metrics: ManualPerformanceUpdateDto['metrics'],
  ): PerformanceScores {
    const likes = metrics.likes ?? 0;
    const replies = metrics.replies ?? 0;
    const reposts = metrics.reposts ?? 0;
    const views = metrics.views ?? 0;
    const profileVisits = metrics.profileVisits ?? 0;

    const absolutePerformanceScore = Math.min(
      100,
      Math.round(
        likes * 2 +
          replies * 8 +
          reposts * 12 +
          profileVisits * 15 +
          views / 200,
      ),
    );

    const postLikes = metrics.postLikes ?? 0;
    const postReplies = metrics.postReplies ?? 0;
    const postReposts = metrics.postReposts ?? 0;

    const hasRelativeSignal =
      postLikes > 0 ||
      postReplies > 0 ||
      postReposts > 0 ||
      (metrics.postViews ?? 0) > 0;

    if (!hasRelativeSignal) {
      return {
        absolutePerformanceScore,
        finalPerformanceScore: absolutePerformanceScore,
        label: this.toLabel(absolutePerformanceScore),
      };
    }

    const commentEngagement = likes + replies * 4 + reposts * 6;
    const postEngagement = Math.max(
      postLikes + postReplies * 2 + postReposts * 3,
      1,
    );
    const relativePerformanceScore = Math.min(
      100,
      Math.round((commentEngagement / postEngagement) * 100),
    );
    const finalPerformanceScore = Math.min(
      100,
      Math.round(
        absolutePerformanceScore * 0.7 + relativePerformanceScore * 0.3,
      ),
    );

    return {
      absolutePerformanceScore,
      relativePerformanceScore,
      finalPerformanceScore,
      label: this.toLabel(finalPerformanceScore),
    };
  }

  private buildSignalUpdates(
    dto: ManualPerformanceUpdateDto,
    scores: PerformanceScores,
  ) {
    const updates: Array<{
      type: SignalType;
      key: string;
      metadata?: Record<string, unknown>;
    }> = [];

    if (dto.niche) {
      updates.push({ type: 'niche', key: dto.niche });
    }

    if (dto.language) {
      updates.push({ type: 'language', key: dto.language });
    }

    if (dto.tone) {
      updates.push({ type: 'tone', key: dto.tone });
    }

    if (dto.actionId) {
      updates.push({
        type: 'comment_pattern',
        key: `action:${dto.actionId}`,
        metadata: { actionId: dto.actionId },
      });
    }

    if (scores.finalPerformanceScore >= 60 && dto.commentText) {
      updates.push({
        type: 'comment_pattern',
        key: this.normalizePattern(dto.commentText),
      });
    }

    return updates;
  }

  private async upsertSignalScore(
    db: Db,
    userId: string,
    signalType: SignalType,
    signalKey: string,
    finalPerformanceScore: number,
    metrics: ManualPerformanceUpdateDto['metrics'],
    performanceId: ObjectId,
    metadata?: Record<string, unknown>,
  ) {
    const collection = db.collection('personal_signal_scores');
    const current = await collection.findOne({ userId, signalType, signalKey });
    const sampleCount = (current?.sampleCount ?? 0) + 1;
    const positiveCount =
      (current?.positiveCount ?? 0) + (finalPerformanceScore >= 60 ? 1 : 0);
    const negativeCount =
      (current?.negativeCount ?? 0) + (finalPerformanceScore < 40 ? 1 : 0);

    const avgLikes = this.weightedAverage(
      current?.avgLikes,
      sampleCount,
      metrics.likes ?? 0,
    );
    const avgReplies = this.weightedAverage(
      current?.avgReplies,
      sampleCount,
      metrics.replies ?? 0,
    );
    const avgViews = this.weightedAverage(
      current?.avgViews,
      sampleCount,
      metrics.views ?? 0,
    );
    const avgFinalPerformanceScore = this.weightedAverage(
      current?.avgFinalPerformanceScore,
      sampleCount,
      finalPerformanceScore,
    );

    await collection.updateOne(
      { userId, signalType, signalKey },
      {
        $set: {
          userId,
          signalType,
          signalKey,
          score: avgFinalPerformanceScore,
          sampleCount,
          positiveCount,
          negativeCount,
          avgLikes,
          avgReplies,
          avgViews,
          avgFinalPerformanceScore,
          lastSeenAt: new Date(),
          metadata: {
            ...(current?.metadata ?? {}),
            ...(metadata ?? {}),
            lastPerformanceId: performanceId,
          },
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  private async refreshProfile(db: Db, userId: string) {
    type SignalLike = { signalType: string; signalKey: string; score: number };
    const signals: SignalLike[] = (await db
      .collection('personal_signal_scores')
      .find({ userId })
      .toArray()) as unknown as SignalLike[];

    const byType = (signalType: SignalType) =>
      signals
        .filter((signal) => signal.signalType === signalType)
        .sort((left, right) => right.score - left.score);

    const topAccounts = byType('account')
      .slice(0, 5)
      .map((signal) => ({
        username: signal.signalKey,
        priority:
          signal.score >= 80 ? 'high' : signal.score >= 60 ? 'medium' : 'low',
        successScore: signal.score,
      }));

    await db.collection('personal_profiles').updateOne(
      { userId },
      {
        $set: {
          userId,
          targetNiches: byType('niche')
            .slice(0, 5)
            .map((signal) => signal.signalKey),
          strongNiches: byType('niche')
            .filter((signal) => signal.score >= 60)
            .slice(0, 5)
            .map((signal) => signal.signalKey),
          weakNiches: byType('niche')
            .filter((signal) => signal.score < 40)
            .slice(0, 5)
            .map((signal) => signal.signalKey),
          preferredLanguages: byType('language')
            .slice(0, 5)
            .map((signal) => signal.signalKey),
          bestLanguages: byType('language')
            .filter((signal) => signal.score >= 60)
            .slice(0, 5)
            .map((signal) => signal.signalKey),
          tonePreferences: byType('tone')
            .slice(0, 5)
            .map((signal) => signal.signalKey),
          successfulTones: byType('tone')
            .filter((signal) => signal.score >= 60)
            .slice(0, 5)
            .map((signal) => signal.signalKey),
          accountWatchlist: topAccounts,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  private weightedAverage(
    previous: number | undefined,
    sampleCount: number,
    currentValue: number,
  ) {
    if (previous === undefined || sampleCount <= 1) {
      return currentValue;
    }

    return Math.round(
      (previous * (sampleCount - 1) + currentValue) / sampleCount,
    );
  }

  private toLabel(
    score: number,
  ): 'weak' | 'okay' | 'good' | 'strong' | 'excellent' {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'strong';
    if (score >= 40) return 'good';
    if (score >= 20) return 'okay';
    return 'weak';
  }

  private normalizePattern(commentText: string) {
    const compact = commentText.trim().toLowerCase().replace(/\s+/g, ' ');
    return compact.slice(0, 80);
  }

  private requireUserId(userId?: string): string {
    if (!userId) {
      throw new BadRequestException('Authenticated userId is required');
    }
    return userId;
  }

  private topValues(values: unknown[]): string[] {
    const counts = new Map<string, number>();
    for (const value of values) {
      if (!value || typeof value !== 'string') continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([value]) => value);
  }

  private buildCommentStyleNotes(languages: string[], tones: string[]): string {
    if (languages.length === 0 && tones.length === 0)
      return 'Not enough used comment data yet.';
    return `User often chooses ${tones.join(', ') || 'mixed-tone'} comments in ${languages.join(', ') || 'mixed languages'}.`;
  }

  private async rebuildPatternMemories(
    db: Db,
    userId: string,
    usedComments: Array<Record<string, unknown>>,
  ) {
    const groups = new Map<
      string,
      { language?: string; tone?: string; examples: string[]; useCount: number }
    >();

    for (const item of usedComments) {
      const language =
        typeof item.language === 'string' ? item.language : 'unknown';
      const tone = typeof item.tone === 'string' ? item.tone : 'unknown';
      const key = `${language}:${tone}`;
      const group = groups.get(key) ?? {
        language,
        tone,
        examples: [],
        useCount: 0,
      };
      group.useCount += 1;
      if (typeof item.text === 'string' && group.examples.length < 5)
        group.examples.push(item.text);
      groups.set(key, group);
    }

    for (const [key, group] of groups) {
      await db.collection('comment_pattern_memories').updateOne(
        { userId, key },
        {
          $set: {
            userId,
            key,
            name: `${group.language} ${group.tone} replies`,
            language: group.language,
            tone: group.tone,
            structure: 'learned_from_comment_actions',
            examples: group.examples,
            useCount: group.useCount,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    }
  }
}
