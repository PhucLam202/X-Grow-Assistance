import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Collection, Db, ObjectId } from 'mongodb';
import { AiReplyPackService } from '../ai/ai-reply-pack.service';
import { MongoService } from '../mongo/mongo.service';
import { DetectPublishedCommentDto } from './dto/detect-published-comment.dto';
import { LogCommentActionDto } from './dto/log-comment-action.dto';
import { SaveFullContextDto } from './dto/save-full-context.dto';
import { TrackUsageEventDto } from './dto/track-usage-event.dto';
import { StoredUsageEvent } from './types/usage-event.types';

const USAGE_EVENTS_COLLECTION = 'usage_events';

type UsageEventDocument = StoredUsageEvent & { _id?: ObjectId };
type UsageEventCountRow = { _id: string; count: number };
type UsageEventLatencyRow = { _id: null; averageLatencyMs?: number };

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private indexesPromise: Promise<void> | null = null;

  constructor(
    private readonly mongoService: MongoService,
    private readonly aiReplyPackService: AiReplyPackService,
  ) {}

  async track(dto: TrackUsageEventDto, userId: string): Promise<{ ok: true }> {
    const db = await this.mongoService.db();
    await db.collection<UsageEventDocument>(USAGE_EVENTS_COLLECTION).insertOne({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      userId,
      ...dto,
    });

    return { ok: true };
  }

  async getSummary() {
    const db = await this.mongoService.db();
    const usageEventsCollection = db.collection<UsageEventDocument>(
      USAGE_EVENTS_COLLECTION,
    );
    const [totalEvents, byEventName, averageLatencyMs, latestEvents] =
      await Promise.all([
        usageEventsCollection.countDocuments({}),
        this.getUsageEventCounts(usageEventsCollection),
        this.getAverageAnalyzeLatency(usageEventsCollection),
        usageEventsCollection
          .find({})
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray(),
      ]);

    return {
      totalEvents,
      byEventName,
      averageLatencyMs,
      latestEvents,
    };
  }

  async saveFullContext(dto: SaveFullContextDto) {
    const db = await this.mongoService.db();
    await this.ensureDataIndexes();
    const userId = this.requireUserId(dto.userId);
    const now = new Date();
    const platform = dto.platform ?? 'x';
    const normalizedPostUrl = this.normalizePostUrl(dto.postUrl);
    const tweetId = this.toNonEmptyString(dto.tweetId);
    const contentHash = this.buildPostContentHash({
      platform,
      postUrl: normalizedPostUrl,
      tweetId,
      username: dto.username,
      text: dto.text,
      firstMediaUrl: this.toStringValue(
        dto.media?.[0]?.mediaUrl ?? dto.media?.[0]?.url,
      ),
    });
    const postQuery = tweetId
      ? { userId, platform, tweetId }
      : { userId, platform, contentHash };
    this.logger.log(
      `DB saveFullContext:start user=${userId} platform=${platform} key=${tweetId ? `tweet:${tweetId}` : `hash:${contentHash.slice(0, 12)}`}`,
    );
    const existingPost = await db.collection('posts').findOne(postQuery);
    const postId =
      existingPost?._id instanceof ObjectId ? existingPost._id : new ObjectId();
    const analysisId = dto.analysis ? new ObjectId() : undefined;

    const postSet: Record<string, unknown> = {
      userId,
      platform,
      postUrl: normalizedPostUrl ?? dto.postUrl,
      contentHash,
      postType: dto.postType,
      authorName: dto.authorName,
      username: dto.username,
      text: dto.text,
      language: dto.language,
      rawContextJson: dto.rawContext ?? {},
      extractionConfidence: dto.extractionConfidence ?? 0,
      extractionWarnings: dto.extractionWarnings ?? [],
      lastSeenAt: now,
      updatedAt: now,
    };

    if (tweetId) {
      postSet.tweetId = tweetId;
    }

    await db.collection('posts').updateOne(
      { _id: postId, userId },
      {
        $set: postSet,
        $setOnInsert: {
          _id: postId,
          firstSeenAt: now,
          createdAt: now,
        },
      },
      { upsert: true },
    );
    this.logger.log(
      `DB saveFullContext:post ${existingPost ? 'updated' : 'inserted'} postId=${postId.toHexString()}`,
    );

    const mediaDocs = (dto.media ?? []).map((mediaItem) => {
      const mediaUrl = this.toStringValue(mediaItem.mediaUrl ?? mediaItem.url);
      return {
        _id: new ObjectId(),
        userId,
        postId,
        mediaType: this.toStringValue(
          mediaItem.mediaType ?? mediaItem.type,
          'unknown',
        ),
        mediaUrl,
        normalizedMediaUrl: this.normalizeMediaUrl(mediaUrl),
        altText: this.toStringValue(mediaItem.altText),
        ocrText: this.toStringValue(mediaItem.ocrText),
        metadataJson: mediaItem,
        createdAt: now,
        updatedAt: now,
      };
    });

    for (const mediaDoc of mediaDocs) {
      const { _id, createdAt, ...mediaSet } = mediaDoc;
      await db.collection('post_media').updateOne(
        {
          userId,
          postId,
          normalizedMediaUrl: mediaDoc.normalizedMediaUrl ?? mediaDoc.mediaUrl,
        },
        {
          $set: {
            ...mediaSet,
            updatedAt: now,
          },
          $setOnInsert: {
            _id,
            createdAt,
          },
        },
        { upsert: true },
      );
    }
    if (mediaDocs.length > 0) {
      this.logger.log(
        `DB saveFullContext:media upserted count=${mediaDocs.length} postId=${postId.toHexString()}`,
      );
    }

    const relatedPostIds = new Map<string, ObjectId>();
    for (const relatedPost of dto.relatedPosts ?? []) {
      const relatedPostId = await this.upsertContextPost(db, {
        userId,
        platform,
        now,
        post: relatedPost,
      });
      const role = this.toStringValue(relatedPost.role);
      const tweetId = this.toStringValue(relatedPost.tweetId);
      const postUrl = this.normalizePostUrl(
        this.toStringValue(relatedPost.postUrl),
      );
      if (role) relatedPostIds.set(`role:${role}`, relatedPostId);
      if (tweetId) relatedPostIds.set(`tweet:${tweetId}`, relatedPostId);
      if (postUrl) relatedPostIds.set(`url:${postUrl}`, relatedPostId);
      await this.upsertPostMedia(
        db,
        userId,
        relatedPostId,
        this.toArrayValue(relatedPost.media),
        now,
      );
    }
    if ((dto.relatedPosts ?? []).length > 0) {
      this.logger.log(
        `DB saveFullContext:relatedPosts upserted count=${(dto.relatedPosts ?? []).length} postId=${postId.toHexString()}`,
      );
    }

    for (const relation of dto.relations ?? []) {
      const relationType = this.toStringValue(relation.relationType, 'context');
      const role = this.toStringValue(relation.role);
      const targetTweetId = this.toStringValue(relation.targetTweetId);
      const targetPostUrl = this.normalizePostUrl(
        this.toStringValue(relation.targetPostUrl),
      );
      const targetPostId =
        (role ? relatedPostIds.get(`role:${role}`) : undefined) ??
        (targetTweetId
          ? relatedPostIds.get(`tweet:${targetTweetId}`)
          : undefined) ??
        (targetPostUrl
          ? relatedPostIds.get(`url:${targetPostUrl}`)
          : undefined);

      if (!targetPostId || !relationType) continue;
      await db.collection('post_relations').updateOne(
        {
          userId,
          sourcePostId: postId,
          targetPostId,
          relationType,
        },
        {
          $set: {
            userId,
            sourcePostId: postId,
            targetPostId,
            relationType,
            metadataJson: relation.metadata ?? relation,
            updatedAt: now,
          },
          $setOnInsert: {
            _id: new ObjectId(),
            createdAt: now,
          },
        },
        { upsert: true },
      );
    }

    if (dto.analysis && analysisId) {
      await db.collection('post_analysis').insertOne({
        _id: analysisId,
        userId,
        postId,
        mode: this.toStringValue(dto.analysis.mode, 'full_context'),
        textSummary: this.toStringValue(dto.analysis.textSummary),
        imageSummary: this.toStringValue(dto.analysis.imageSummary),
        combinedContext: this.toStringValue(dto.analysis.combinedContext),
        topic: this.toStringValue(dto.analysis.topic),
        tone: this.toStringValue(dto.analysis.tone),
        intent: this.toStringValue(dto.analysis.intent),
        commentStrategy: this.toStringValue(dto.analysis.commentStrategy),
        warnings: this.toArrayValue(dto.analysis.warnings),
        rawAiResponse: dto.analysis,
        createdAt: now,
      });
      this.logger.log(
        `DB saveFullContext:analysis inserted analysisId=${analysisId.toHexString()} postId=${postId.toHexString()}`,
      );
    }

    const suggestionDocs = (dto.suggestions ?? []).map((suggestion) => ({
      _id: new ObjectId(),
      userId,
      postId,
      analysisId,
      text: this.toStringValue(suggestion.text, ''),
      language: this.toStringValue(suggestion.language ?? dto.language),
      tone: this.toStringValue(suggestion.tone),
      meaningVi: this.toStringValue(suggestion.meaningVi),
      risk: this.toStringValue(suggestion.risk),
      optimizationScore: this.toNumberValue(
        suggestion.optimizationScore ?? suggestion.score,
      ),
      optimizationReason: this.toArrayValue(
        suggestion.optimizationReason ?? suggestion.reason,
      ),
      avoidReason: this.toArrayValue(
        suggestion.avoidReason ?? suggestion.avoid,
      ),
      used: false,
      createdAt: now,
    }));

    if (suggestionDocs.length > 0) {
      await db.collection('comment_suggestions').insertMany(suggestionDocs);
      this.logger.log(
        `DB saveFullContext:suggestions inserted count=${suggestionDocs.length} postId=${postId.toHexString()}`,
      );
    }

    this.logger.log(
      `DB saveFullContext:done postId=${postId.toHexString()} media=${mediaDocs.length} suggestions=${suggestionDocs.length}`,
    );

    return {
      success: true,
      postId: postId.toHexString(),
      analysisId: analysisId?.toHexString() ?? null,
      mediaCount: mediaDocs.length,
      suggestionIds: suggestionDocs.map((suggestion) =>
        suggestion._id.toHexString(),
      ),
      warnings: dto.extractionWarnings ?? [],
    };
  }

  async logCommentAction(dto: LogCommentActionDto) {
    const db = await this.mongoService.db();
    await this.ensureDataIndexes();
    const userId = this.requireUserId(dto.userId);
    const now = new Date();
    const actionId = new ObjectId();
    const postId = this.toObjectId(dto.postId);
    const suggestionId = dto.suggestionId
      ? this.toObjectId(dto.suggestionId)
      : undefined;

    await db.collection('comment_actions').insertOne({
      _id: actionId,
      userId,
      postId,
      suggestionId,
      actionType: dto.actionType,
      commentText: dto.commentText,
      metadataJson: dto.metadata ?? {},
      createdAt: now,
    });

    if (suggestionId) {
      const timestampField = this.getSuggestionTimestampField(dto.actionType);
      await db.collection('comment_suggestions').updateOne(
        { _id: suggestionId, userId },
        {
          $set: {
            used: [
              'copied',
              'inserted',
              'sent_manually',
              'sent_detected',
              'mark_as_sent',
              'saved',
            ].includes(dto.actionType),
            ...(timestampField ? { [timestampField]: now } : {}),
          },
        },
      );
    }

    if (
      [
        'copied',
        'inserted',
        'edited',
        'sent_manually',
        'sent_detected',
        'mark_as_sent',
        'saved',
      ].includes(dto.actionType) &&
      dto.commentText
    ) {
      await this.storeUsedCommentMemory(userId, dto, actionId, now);
    }

    return {
      success: true,
      actionId: actionId.toHexString(),
    };
  }

  async detectPublishedComment(dto: DetectPublishedCommentDto) {
    const db = await this.mongoService.db();
    await this.ensureDataIndexes();
    const userId = this.requireUserId(dto.userId);
    const now = new Date();
    const postId = this.toObjectId(dto.postId);
    const suggestionId = dto.suggestionId
      ? this.toObjectId(dto.suggestionId)
      : undefined;
    const commentTweetId =
      dto.commentTweetId ?? this.extractTweetId(dto.commentUrl);
    const publishedCommentId = new ObjectId();
    const query = commentTweetId
      ? { userId, commentTweetId }
      : {
          userId,
          postId,
          normalizedCommentText: this.normalizeText(dto.commentText),
          detectedBy: dto.detectedBy,
        };

    await db.collection('published_comments').updateOne(
      query,
      {
        $set: {
          userId,
          postId,
          suggestionId,
          parentPostUrl: dto.parentPostUrl,
          parentTweetId: dto.parentTweetId,
          commentUrl: this.normalizePostUrl(dto.commentUrl) ?? dto.commentUrl,
          commentTweetId,
          commentText: dto.commentText,
          normalizedCommentText: this.normalizeText(dto.commentText),
          commentLanguage: dto.commentLanguage,
          wasAiGenerated: dto.wasAiGenerated ?? true,
          wasEdited: dto.wasEdited ?? false,
          detectedBy: dto.detectedBy,
          detectionConfidence: dto.detectionConfidence ?? 0,
          rawDetectionJson: dto.rawDetection ?? {},
          updatedAt: now,
        },
        $setOnInsert: {
          _id: publishedCommentId,
          publishedAt: now,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    await this.logCommentAction({
      userId,
      postId: dto.postId,
      suggestionId: dto.suggestionId,
      actionType:
        dto.detectedBy === 'user_confirmed' ? 'mark_as_sent' : 'sent_detected',
      commentText: dto.commentText,
      metadata: {
        commentUrl: dto.commentUrl,
        commentTweetId,
        detectedBy: dto.detectedBy,
        detectionConfidence: dto.detectionConfidence ?? 0,
      },
    });

    return {
      success: true,
      publishedCommentId: publishedCommentId.toHexString(),
      commentTweetId: commentTweetId ?? null,
      saved: true,
    };
  }

  async getCommentOverview(userId: string) {
    const db = await this.mongoService.db();
    const [
      postsAnalyzed,
      commentsGenerated,
      actions,
      postTypes,
      extractionWarningCount,
      bestPickUsage,
    ] = await Promise.all([
      db.collection('posts').countDocuments({ userId }),
      db.collection('comment_suggestions').countDocuments({ userId }),
      this.countActions(userId),
      this.countPostsByType(userId),
      db.collection('posts').countDocuments({
        userId,
        extractionWarnings: { $exists: true, $ne: [] },
      }),
      this.getBestPickUsage(userId),
    ]);

    return {
      userId,
      postsAnalyzed,
      commentsGenerated,
      actions,
      postTypes,
      extractionWarningCount,
      bestPickUsage,
    };
  }

  async getCommentHistory(filters: {
    userId?: string;
    language?: string;
    tone?: string;
    used?: string;
    postType?: string;
    actionType?: string;
    limit?: string;
  }) {
    const db = await this.mongoService.db();
    const userId = this.requireUserId(filters.userId);
    const limit = Math.min(Number(filters.limit ?? 50), 100);
    const suggestionMatch: Record<string, unknown> = { userId };

    if (filters.language) suggestionMatch.language = filters.language;
    if (filters.tone) suggestionMatch.tone = filters.tone;
    if (filters.used === 'true') suggestionMatch.used = true;
    if (filters.used === 'false') suggestionMatch.used = false;

    const suggestions = await db
      .collection('comment_suggestions')
      .find(suggestionMatch)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    const postIds = suggestions
      .map((suggestion) => suggestion.postId)
      .filter(Boolean);
    const posts = await db
      .collection('posts')
      .find({ userId, _id: { $in: postIds } })
      .toArray();
    const postsById = new Map(posts.map((post) => [String(post._id), post]));
    const mediaRows = await db
      .collection('post_media')
      .find({ userId, postId: { $in: postIds } })
      .sort({ createdAt: 1 })
      .toArray();
    const mediaByPostId = new Map<string, unknown[]>();
    for (const media of mediaRows) {
      const key = String(media.postId ?? '');
      if (!key) continue;
      const current = mediaByPostId.get(key) ?? [];
      current.push({
        mediaType: media.mediaType,
        mediaUrl: media.mediaUrl,
        altText: media.altText,
        ocrText: media.ocrText,
      });
      mediaByPostId.set(key, current);
    }
    const actionQuery: Record<string, unknown> = { userId };
    if (filters.actionType) actionQuery.actionType = filters.actionType;
    const actions = await db
      .collection('comment_actions')
      .find(actionQuery)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    const actionsBySuggestionId = new Map<string, unknown[]>();

    for (const action of actions) {
      const key = String(action.suggestionId ?? '');
      if (!key) continue;
      const current = actionsBySuggestionId.get(key) ?? [];
      current.push(action);
      actionsBySuggestionId.set(key, current);
    }

    const analysisIds = suggestions
      .map((suggestion) => suggestion.analysisId)
      .filter((analysisId): analysisId is ObjectId => analysisId instanceof ObjectId);
    const analyses = analysisIds.length
      ? await db
          .collection('post_analysis')
          .find({ userId, _id: { $in: analysisIds } })
          .toArray()
      : [];
    const analysesById = new Map(
      analyses.map((analysis) => [String(analysis._id), analysis]),
    );

    return {
      userId,
      items: suggestions
        .map((suggestion) => {
          const post = postsById.get(String(suggestion.postId));
          const analysis = analysesById.get(String(suggestion.analysisId));
          return {
            suggestionId: String(suggestion._id),
            postId: String(suggestion.postId),
            analysisId: suggestion.analysisId
              ? String(suggestion.analysisId)
              : undefined,
            postType: post?.postType,
            postUrl: post?.postUrl,
            tweetId: post?.tweetId,
            postText: post?.text,
            authorName: post?.authorName,
            username: post?.username,
            media: mediaByPostId.get(String(suggestion.postId)) ?? [],
            text: suggestion.text,
            language: suggestion.language,
            tone: suggestion.tone,
            meaningVi: suggestion.meaningVi,
            risk: suggestion.risk,
            optimizationScore: suggestion.optimizationScore,
            optimizationReason: suggestion.optimizationReason ?? [],
            avoidReason: suggestion.avoidReason ?? [],
            used: suggestion.used ?? false,
            actions: actionsBySuggestionId.get(String(suggestion._id)) ?? [],
            analysis: analysis
              ? {
                  mode: analysis.mode,
                  textSummary: analysis.textSummary,
                  imageSummary: analysis.imageSummary,
                  combinedContext: analysis.combinedContext,
                  topic: analysis.topic,
                  tone: analysis.tone,
                  intent: analysis.intent,
                  commentStrategy: analysis.commentStrategy,
                  warnings: analysis.warnings ?? [],
                }
              : undefined,
            createdAt: suggestion.createdAt,
          };
        })
        .filter(
          (item) => !filters.postType || item.postType === filters.postType,
        ),
    };
  }

  private async storeUsedCommentMemory(
    userId: string,
    dto: LogCommentActionDto,
    actionId: ObjectId,
    now: Date,
  ) {
    const db = await this.mongoService.db();
    const post = await db
      .collection('posts')
      .findOne({ _id: this.toObjectId(dto.postId), userId });
    const suggestion = dto.suggestionId
      ? await db
          .collection('comment_suggestions')
          .findOne({ _id: this.toObjectId(dto.suggestionId), userId })
      : null;

    await db.collection('used_comment_memories').insertOne({
      _id: new ObjectId(),
      userId,
      suggestionId: dto.suggestionId
        ? this.toObjectId(dto.suggestionId)
        : undefined,
      postId: this.toObjectId(dto.postId),
      actionId,
      text: dto.commentText,
      normalizedText: this.normalizeText(dto.commentText ?? ''),
      language: suggestion?.language ?? post?.language,
      tone: suggestion?.tone,
      postType: post?.postType,
      actionType: dto.actionType,
      similarityKey: this.buildSimilarityKey(dto.commentText ?? ''),
      createdAt: now,
    });
  }

  private async countActions(userId: string) {
    const db = await this.mongoService.db();
    const rows = await db
      .collection('comment_actions')
      .aggregate([
        { $match: { userId } },
        { $group: { _id: '$actionType', count: { $sum: 1 } } },
      ])
      .toArray();
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  private requireUserId(userId?: string): string {
    if (!userId) {
      throw new BadRequestException('Authenticated userId is required');
    }
    return userId;
  }

  private async countPostsByType(userId: string) {
    const db = await this.mongoService.db();
    return db
      .collection('posts')
      .aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: '$postType',
            count: { $sum: 1 },
            warnings: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      { $size: { $ifNull: ['$extractionWarnings', []] } },
                      0,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray();
  }

  private async getBestPickUsage(userId: string) {
    const db = await this.mongoService.db();
    const bestSuggestions = await db
      .collection('comment_suggestions')
      .countDocuments({ userId, optimizationScore: { $gte: 80 } });
    const usedBestSuggestions = await db
      .collection('comment_suggestions')
      .countDocuments({ userId, optimizationScore: { $gte: 80 }, used: true });
    return {
      bestSuggestions,
      usedBestSuggestions,
      usageRate:
        bestSuggestions > 0
          ? Math.round((usedBestSuggestions / bestSuggestions) * 100)
          : 0,
    };
  }

  private getSuggestionTimestampField(
    actionType: LogCommentActionDto['actionType'],
  ): string | undefined {
    if (actionType === 'copied') return 'copiedAt';
    if (actionType === 'inserted') return 'insertedAt';
    if (actionType === 'saved') return 'savedAt';
    return undefined;
  }

  private toObjectId(value: string): ObjectId {
    return ObjectId.isValid(value) ? new ObjectId(value) : new ObjectId();
  }

  private toStringValue(value: unknown, fallback?: string): string | undefined {
    return typeof value === 'string' ? value : fallback;
  }

  private toNumberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private toArrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private buildSimilarityKey(text: string): string {
    return this.normalizeText(text)
      .replace(/[😂🤣😭🔥✨.!?。！？、]/gu, '')
      .slice(0, 120);
  }

  private async getUsageEventCounts(db: Collection<UsageEventDocument>) {
    const rows = await db
      .aggregate<UsageEventCountRow>([
        { $group: { _id: '$eventName', count: { $sum: 1 } } },
      ])
      .toArray();

    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  private async getAverageAnalyzeLatency(db: Collection<UsageEventDocument>) {
    const rows = await db
      .aggregate<UsageEventLatencyRow>([
        {
          $match: {
            eventName: 'analyze_succeeded',
            latencyMs: { $exists: true },
          },
        },
        { $group: { _id: null, averageLatencyMs: { $avg: '$latencyMs' } } },
      ])
      .toArray();

    return rows.length > 0 ? Math.round(rows[0].averageLatencyMs ?? 0) : 0;
  }

  private async ensureDataIndexes(): Promise<void> {
    if (!this.indexesPromise) {
      this.indexesPromise = this.createDataIndexes();
    }

    await this.indexesPromise;
  }

  private async createDataIndexes(): Promise<void> {
    const db = await this.mongoService.db();
    await this.recreatePostTweetIdIndexIfNeeded(db);
    await Promise.all([
      db.collection('posts').createIndex(
        { userId: 1, platform: 1, tweetId: 1 },
        {
          unique: true,
          partialFilterExpression: { tweetId: { $type: 'string' } },
        },
      ),
      db
        .collection('posts')
        .createIndex(
          { userId: 1, platform: 1, contentHash: 1 },
          { unique: true, sparse: true },
        ),
      db.collection('posts').createIndex({ userId: 1, createdAt: -1 }),
      db
        .collection('post_media')
        .createIndex(
          { userId: 1, postId: 1, normalizedMediaUrl: 1 },
          { unique: true, sparse: true },
        ),
      db
        .collection('post_analysis')
        .createIndex({ userId: 1, postId: 1, createdAt: -1 }),
      db
        .collection('post_relations')
        .createIndex(
          { userId: 1, sourcePostId: 1, targetPostId: 1, relationType: 1 },
          { unique: true },
        ),
      db
        .collection('post_relations')
        .createIndex({ userId: 1, sourcePostId: 1 }),
      db
        .collection('comment_suggestions')
        .createIndex({ userId: 1, postId: 1, createdAt: -1 }),
      db
        .collection('comment_actions')
        .createIndex({ userId: 1, postId: 1, actionType: 1, createdAt: -1 }),
      db
        .collection('published_comments')
        .createIndex(
          { userId: 1, commentTweetId: 1 },
          { unique: true, sparse: true },
        ),
      db
        .collection('published_comments')
        .createIndex({ userId: 1, postId: 1, publishedAt: -1 }),
    ]);
  }

  private normalizePostUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    const match = url.match(/^(https?:\/\/[^/]+\/[^/]+\/status\/\d+)/);
    return match?.[1]?.replace('twitter.com', 'x.com') ?? url;
  }

  private async upsertContextPost(
    db: Db,
    input: {
      userId: string;
      platform: string;
      now: Date;
      post: Record<string, unknown>;
    },
  ): Promise<ObjectId> {
    const postUrl = this.normalizePostUrl(
      this.toStringValue(input.post.postUrl),
    );
    const tweetId = this.toNonEmptyString(input.post.tweetId);
    const text = this.toStringValue(input.post.text);
    const username = this.toStringValue(input.post.username);
    const firstMedia = this.toArrayValue(input.post.media)[0];
    const firstMediaRecord =
      firstMedia && typeof firstMedia === 'object' && !Array.isArray(firstMedia)
        ? (firstMedia as Record<string, unknown>)
        : undefined;
    const contentHash = this.buildPostContentHash({
      platform: input.platform,
      postUrl,
      tweetId,
      username,
      text,
      firstMediaUrl: this.toStringValue(
        firstMediaRecord?.mediaUrl ?? firstMediaRecord?.url,
      ),
    });
    const query = tweetId
      ? { userId: input.userId, platform: input.platform, tweetId }
      : { userId: input.userId, platform: input.platform, contentHash };
    const existingPost = await db.collection('posts').findOne(query);
    const postId =
      existingPost?._id instanceof ObjectId ? existingPost._id : new ObjectId();

    const postSet: Record<string, unknown> = {
      userId: input.userId,
      platform: input.platform,
      postUrl,
      contentHash,
      postType: this.toStringValue(input.post.postType, 'unknown'),
      authorName: this.toStringValue(input.post.authorName),
      username,
      text,
      language: this.toStringValue(input.post.language),
      rawContextJson: input.post,
      lastSeenAt: input.now,
      updatedAt: input.now,
    };

    if (tweetId) {
      postSet.tweetId = tweetId;
    }

    await db.collection('posts').updateOne(
      { _id: postId, userId: input.userId },
      {
        $set: postSet,
        $setOnInsert: {
          _id: postId,
          firstSeenAt: input.now,
          createdAt: input.now,
        },
      },
      { upsert: true },
    );

    this.logger.log(
      `DB saveFullContext:contextPost ${existingPost ? 'updated' : 'inserted'} postId=${postId.toHexString()} key=${tweetId ? `tweet:${tweetId}` : `hash:${contentHash.slice(0, 12)}`}`,
    );

    return postId;
  }

  private async recreatePostTweetIdIndexIfNeeded(db: Db): Promise<void> {
    const posts = db.collection('posts');
    const indexName = 'userId_1_platform_1_tweetId_1';
    const expectedPartialFilter = { tweetId: { $type: 'string' } };
    const indexes = await posts.indexes();
    const currentIndex = indexes.find((index) => index.name === indexName);
    const hasExpectedPartialFilter =
      JSON.stringify(currentIndex?.partialFilterExpression) ===
      JSON.stringify(expectedPartialFilter);

    if (currentIndex && !hasExpectedPartialFilter) {
      this.logger.warn(
        `DB indexes: dropping legacy index ${indexName}; null tweetId values break unique upserts`,
      );
      await posts.dropIndex(indexName);
    }
  }

  private async upsertPostMedia(
    db: Db,
    userId: string,
    postId: ObjectId,
    mediaItems: unknown[],
    now: Date,
  ): Promise<void> {
    for (const mediaItem of mediaItems) {
      if (
        !mediaItem ||
        typeof mediaItem !== 'object' ||
        Array.isArray(mediaItem)
      )
        continue;
      const media = mediaItem as Record<string, unknown>;
      const mediaUrl = this.toStringValue(media.mediaUrl ?? media.url);
      if (!mediaUrl) continue;
      const normalizedMediaUrl = this.normalizeMediaUrl(mediaUrl);
      await db.collection('post_media').updateOne(
        {
          userId,
          postId,
          normalizedMediaUrl: normalizedMediaUrl ?? mediaUrl,
        },
        {
          $set: {
            userId,
            postId,
            mediaType: this.toStringValue(
              media.mediaType ?? media.type,
              'unknown',
            ),
            mediaUrl,
            normalizedMediaUrl,
            altText: this.toStringValue(media.altText),
            ocrText: this.toStringValue(media.ocrText),
            metadataJson: media,
            updatedAt: now,
          },
          $setOnInsert: {
            _id: new ObjectId(),
            createdAt: now,
          },
        },
        { upsert: true },
      );
    }
  }

  private normalizeMediaUrl(url: string | undefined): string | undefined {
    return url?.split('?')[0];
  }

  private extractTweetId(url: string | undefined): string | undefined {
    return url?.match(/\/status\/(\d+)/)?.[1];
  }

  private toNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private buildPostContentHash(input: {
    platform: string;
    postUrl?: string;
    tweetId?: string;
    username?: string;
    text?: string;
    firstMediaUrl?: string;
  }): string {
    const stableParts = input.tweetId
      ? [input.platform, input.tweetId]
      : [
          input.platform,
          this.normalizePostUrl(input.postUrl),
          input.username,
          this.normalizeText(input.text ?? ''),
          this.normalizeMediaUrl(input.firstMediaUrl),
        ];

    return createHash('sha256')
      .update(stableParts.filter(Boolean).join('|'))
      .digest('hex');
  }

  async draftPost(
    userId: string,
    topic: string | undefined,
    language: string,
    count: number,
  ): Promise<{ drafts: string[] }> {
    const db = await this.mongoService.db();
    const recentAnalyses = await db
      .collection('post_analysis')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const contextSnippets = recentAnalyses
      .slice(0, 10)
      .map((a) => [a.topic, a.intent, a.textSummary].filter(Boolean).join(' — '))
      .filter(Boolean)
      .join('\n');

    const systemPrompt = `You are a native ${language} social media content creator for X/Twitter.
Generate ${count} short, authentic posts (tweets) written by a real ${language} speaker.
Each post must feel natural, non-promotional, and community-appropriate.
Return ONLY a JSON array of strings: ["post1", "post2", ...]
No markdown, no explanation outside the JSON array.`;

    const userPrompt = `${topic ? `Topic: ${topic}\n` : ''}${contextSnippets ? `Context from recent analyzed posts the user engages with:\n${contextSnippets}\n` : ''}Generate ${count} posts in ${language}.`;

    const raw = await this.aiReplyPackService.generateText(systemPrompt, userPrompt);
    const match = raw.match(/\[[\s\S]*\]/);
    const drafts: string[] = match ? (JSON.parse(match[0]) as string[]) : [raw.trim()];
    return { drafts: drafts.slice(0, count) };
  }

  async getGrowthReport(userId: string, days: number) {
    const db = await this.mongoService.db();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [actionsByDay, analyzeByDay, toneBreakdown, actionTypeBreakdown] = await Promise.all([
      db.collection('comment_actions').aggregate<{ _id: string; count: number }>([
        { $match: { userId, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),

      db.collection('usage_events').aggregate<{ _id: string; count: number; avgLatencyMs: number }>([
        { $match: { userId, eventName: 'analyze_succeeded', createdAt: { $gte: since.toISOString() } } },
        { $group: { _id: { $substr: ['$createdAt', 0, 10] }, count: { $sum: 1 }, avgLatencyMs: { $avg: '$latencyMs' } } },
        { $sort: { _id: 1 } },
      ]).toArray(),

      db.collection('used_comment_memories').aggregate<{ _id: string; count: number }>([
        { $match: { userId, createdAt: { $gte: since } } },
        { $group: { _id: '$tone', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),

      db.collection('comment_actions').aggregate<{ _id: string; count: number }>([
        { $match: { userId, createdAt: { $gte: since } } },
        { $group: { _id: '$actionType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
    ]);

    const dateSet = new Set([...actionsByDay.map(r => r._id), ...analyzeByDay.map(r => r._id)]);
    const actionsMap = new Map(actionsByDay.map(r => [r._id, r.count]));
    const analyzeMap = new Map(analyzeByDay.map(r => [r._id, { count: r.count, avgLatencyMs: r.avgLatencyMs }]));
    const timeline = [...dateSet].sort().map(date => ({
      date,
      actions: actionsMap.get(date) ?? 0,
      analyzed: analyzeMap.get(date)?.count ?? 0,
      avgLatencyMs: Math.round(analyzeMap.get(date)?.avgLatencyMs ?? 0),
    }));

    const totalActions = actionsByDay.reduce((sum, r) => sum + r.count, 0);
    const totalAnalyzed = analyzeByDay.reduce((sum, r) => sum + r.count, 0);

    return {
      period: days,
      timeline,
      totals: {
        actions: totalActions,
        analyzed: totalAnalyzed,
        usageRate: totalAnalyzed > 0 ? Math.round((totalActions / totalAnalyzed) * 100) / 100 : 0,
      },
      toneBreakdown: toneBreakdown.map(r => ({ tone: r._id ?? 'unknown', count: r.count })),
      actionTypeBreakdown: actionTypeBreakdown.map(r => ({ actionType: r._id ?? 'unknown', count: r.count })),
    };
  }
}
