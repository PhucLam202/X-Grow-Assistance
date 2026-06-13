import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LanguageDetectorService } from '../common/language/language-detector.service';
import { MongoService } from '../mongo/mongo.service';
import { SubmitFeedSnapshotDto } from './dto/submit-feed-snapshot.dto';
import {
  FeedCandidateClassification,
  FeedContentType,
  FeedSnapshotResult,
  StoredFeedCandidate,
  StoredFeedSnapshot,
} from './types/feed-intelligence.types';

const FEED_SNAPSHOTS_COLLECTION = 'feed_snapshots';

@Injectable()
export class FeedIntelligenceService {
  constructor(
    private readonly languageDetector: LanguageDetectorService,
    private readonly mongoService: MongoService,
  ) {}

  async submitSnapshot(
    dto: SubmitFeedSnapshotDto,
  ): Promise<FeedSnapshotResult> {
    const db = await this.mongoService.db();
    const snapshotId = dto.snapshotId || `snap_${randomUUID()}`;
    const seen = new Set<string>();
    const candidates: StoredFeedCandidate[] = [];
    let ignoredPosts = 0;

    dto.posts.forEach((post) => {
      const key = post.tweetId ?? post.postUrl ?? this.normalizeText(post.text);
      if (!key || seen.has(key)) {
        ignoredPosts += 1;
        return;
      }
      seen.add(key);

      if (this.shouldIgnore(post.text, post.media.length)) {
        ignoredPosts += 1;
        return;
      }

      const classification = this.classify(post.text, post.media.length);
      const score = this.scoreCandidate(
        classification,
        post.text,
        post.media.length,
      );
      candidates.push({
        id: randomUUID(),
        snapshotId,
        postUrl: post.postUrl,
        tweetId: post.tweetId,
        username: post.username,
        authorName: post.authorName,
        text: post.text,
        language: classification.language,
        niche: classification.niche,
        topic: classification.topic,
        contentType: classification.contentType,
        mediaCount: post.media.length,
        metrics: post.metrics,
        timestamps: post.timestamps ?? {
          extractedAt: post.detectedAt,
        },
        score,
        hasQuestion: classification.hasQuestion,
        needsVisionAnalysis: classification.needsVisionAnalysis,
        rawTextLength: post.text.length,
        createdAt: new Date().toISOString(),
      });
    });

    const snapshot: StoredFeedSnapshot = {
      id: snapshotId,
      source: dto.source,
      capturedAt: dto.capturedAt,
      visiblePostCount: dto.visiblePostCount,
      acceptedPosts: candidates.length,
      ignoredPosts,
      candidates,
      createdAt: new Date().toISOString(),
    };

    await db
      .collection(FEED_SNAPSHOTS_COLLECTION)
      .updateOne({ id: snapshotId }, { $set: snapshot }, { upsert: true });

    return {
      snapshotId,
      acceptedPosts: candidates.length,
      ignoredPosts,
      summary: {
        visiblePostCount: dto.visiblePostCount,
        usefulCandidates: candidates.length,
        byNiche: this.countBy(candidates, 'niche'),
        byContentType: this.countBy(candidates, 'contentType'),
        averageScore: this.roundScore(this.getAverageScore(candidates)),
        bestScore: this.getBestScore(candidates),
        readyForScoring: candidates.length > 0,
      },
      topCandidates: candidates
        .slice()
        .sort((left, right) => right.score - left.score)
        .slice(0, 5)
        .map((candidate) => ({
          id: candidate.id,
          postUrl: candidate.postUrl,
          tweetId: candidate.tweetId,
          username: candidate.username,
          authorName: candidate.authorName,
          text: candidate.text,
          language: candidate.language,
          niche: candidate.niche,
          topic: candidate.topic,
          contentType: candidate.contentType,
          mediaCount: candidate.mediaCount,
          metrics: candidate.metrics,
          timestamps: candidate.timestamps,
          score: candidate.score,
        })),
      next: {
        canScore: candidates.length > 0,
        scoringEndpoint:
          candidates.length > 0
            ? '/api/v1/opportunities/score-snapshot'
            : undefined,
      },
    };
  }

  async getSnapshot(
    snapshotId: string,
  ): Promise<StoredFeedSnapshot | undefined> {
    const db = await this.mongoService.db();
    const snapshot = await db
      .collection<StoredFeedSnapshot>(FEED_SNAPSHOTS_COLLECTION)
      .findOne({ id: snapshotId });
    return snapshot ?? undefined;
  }

  private shouldIgnore(text: string, mediaCount: number): boolean {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText && mediaCount === 0) return true;
    if (normalizedText.length < 8 && mediaCount === 0) return true;
    if (/^promoted$/i.test(normalizedText)) return true;
    return false;
  }

  private classify(
    text: string,
    mediaCount: number,
  ): FeedCandidateClassification {
    const normalizedText = this.normalizeText(text);
    const contentType = this.detectContentType(normalizedText, mediaCount);

    return {
      language: this.languageDetector.detect(text),
      ...this.detectNicheAndTopic(normalizedText),
      contentType,
      hasMedia: mediaCount > 0,
      hasQuestion: /[?？]$|\b(why|how|what|which|do you|should)\b/i.test(text),
      needsVisionAnalysis: mediaCount > 0,
    };
  }

  private detectContentType(text: string, mediaCount: number): FeedContentType {
    if (mediaCount === 0) return text ? 'text' : 'unknown';
    if (/meme|😂|🤣|ｗｗ|笑|lol|lmao/i.test(text))
      return 'image_meme_candidate';
    if (text) return 'mixed';
    return 'image';
  }

  private detectNicheAndTopic(
    text: string,
  ): Pick<FeedCandidateClassification, 'niche' | 'topic'> {
    if (
      /anime|manga|one piece|naruto|jujutsu|vtuber|アニメ|漫画|マンガ|ワンピース/i.test(
        text,
      )
    ) {
      return {
        niche: 'anime_manga',
        topic: this.pickTopic(text, [
          'one piece',
          'jujutsu',
          'naruto',
          'vtuber',
        ]),
      };
    }
    if (/bitcoin|btc|eth|crypto|solana|airdrop|token|web3|defi/i.test(text)) {
      return {
        niche: 'crypto',
        topic: this.pickTopic(text, ['bitcoin', 'eth', 'solana', 'airdrop']),
      };
    }
    if (
      /football|soccer|premier league|transfer|goal|match|messi|ronaldo/i.test(
        text,
      )
    ) {
      return {
        niche: 'football',
        topic: this.pickTopic(text, ['transfer', 'premier league', 'goal']),
      };
    }
    if (
      /ai|openai|claude|gemini|startup|code|developer|typescript|react/i.test(
        text,
      )
    ) {
      return {
        niche: 'tech',
        topic: this.pickTopic(text, ['ai', 'startup', 'typescript', 'react']),
      };
    }
    if (/market|business|sales|founder|product|growth|revenue/i.test(text)) {
      return {
        niche: 'business',
        topic: this.pickTopic(text, ['growth', 'revenue', 'product']),
      };
    }
    return { niche: 'general', topic: 'general' };
  }

  private scoreCandidate(
    classification: FeedCandidateClassification,
    text: string,
    mediaCount: number,
  ): number {
    const length = this.normalizeText(text).length;
    let score = 30;

    if (classification.niche !== 'general') score += 18;
    if (classification.hasQuestion) score += 18;
    if (classification.hasMedia) score += 14;
    if (classification.contentType === 'mixed') score += 10;
    if (classification.contentType === 'image_meme_candidate') score += 8;
    if (length >= 40 && length <= 280) score += 10;
    if (length > 280) score -= 8;
    if (length < 25 && mediaCount === 0) score -= 12;
    if (classification.language === 'unknown') score -= 6;
    if (classification.contentType === 'unknown') score -= 10;

    return this.clampScore(score);
  }

  private pickTopic(text: string, topics: string[]): string {
    const matchedTopic = topics.find((topic) => text.includes(topic));
    return matchedTopic ?? topics[0] ?? 'general';
  }

  private normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private roundScore(score: number): number {
    return Math.round(score * 10) / 10;
  }

  private getAverageScore(items: Array<{ score: number }>): number {
    if (items.length === 0) return 0;
    return items.reduce((total, item) => total + item.score, 0) / items.length;
  }

  private getBestScore(items: Array<{ score: number }>): number {
    return items.length ? Math.max(...items.map((item) => item.score)) : 0;
  }

  private countBy<T extends Record<string, unknown>>(
    items: T[],
    key: keyof T,
  ): Record<string, number> {
    return items.reduce<Record<string, number>>((summary, item) => {
      const value = String(item[key] ?? 'unknown');
      summary[value] = (summary[value] ?? 0) + 1;
      return summary;
    }, {});
  }
}
