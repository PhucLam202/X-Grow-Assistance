import { Injectable, Logger } from '@nestjs/common';
import { AiReplyPackService } from '../../ai/ai-reply-pack.service';
import { DetectedLanguage } from '../../common/language/language.types';
import { MongoService } from '../../mongo/mongo.service';
import { CommentSuggestion } from '../../reply-pack/types/reply-pack.types';
import {
  CommentStyle,
  ComposerInput,
  ComposerOutput,
  GeneratedComment,
  UserMemoryRef,
} from '../types/comment-intelligence.types';
import { CommentQualityRankerService } from './comment-quality-ranker.service';
import { CommentStyleMapperService } from './comment-style-mapper.service';
import { DriverDecisionReplyPackAdapterService } from './driver-decision-reply-pack-adapter.service';

@Injectable()
export class CommentComposerService {
  private readonly logger = new Logger(CommentComposerService.name);

  constructor(
    private readonly styleMapper: CommentStyleMapperService,
    private readonly replyPackAdapter: DriverDecisionReplyPackAdapterService,
    private readonly aiReplyPackService: AiReplyPackService,
    private readonly ranker: CommentQualityRankerService,
    private readonly mongoService: MongoService,
  ) {}

  async fetchUserMemory(userId: string): Promise<UserMemoryRef | undefined> {
    try {
      const db = await this.mongoService.db();
      const doc = await db.collection('comment_memory_profiles').findOne({ userId });
      if (!doc) return undefined;
      return {
        preferredTones: (doc.preferredTones as string[]) ?? [],
        blockedPhrases: (doc.blockedPhrases as string[]) ?? [],
        styleNotes: doc.styleNotes as string | undefined,
      };
    } catch {
      return undefined;
    }
  }

  async compose(composerInput: ComposerInput): Promise<ComposerOutput> {
    if (!composerInput.decision.shouldComment) {
      return {
        bestPick: null,
        alternatives: [],
        warnings: [
          ...composerInput.decision.warnings,
          'driver_recommended_skip',
        ],
      };
    }

    const userMemory = composerInput.userMemory;

    const styles = this.styleMapper
      .getStyles(composerInput.decision)
      .slice(0, 3);

    // Run all style AI calls concurrently — reduces latency from N×T to max(T).
    const settled = await Promise.allSettled(
      styles.map((style) => this.generateForStyle(composerInput, style, userMemory)),
    );

    const candidates: GeneratedComment[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const style = styles[i];

      if (result.status === 'fulfilled') {
        const { generatedCandidates, styleWarnings } = result.value;
        warnings.push(...styleWarnings);
        candidates.push(...generatedCandidates);
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : 'unknown_error';
        warnings.push(`composer_ai_generation_failed:${style}:${message}`);
        this.logger.warn(`AI composer failed for style=${style}: ${message}`);
        candidates.push(this.fallbackCandidate(composerInput, style));
      }
    }

    const ranked = this.ranker.rank(composerInput, candidates);
    return {
      ...ranked,
      warnings: [...ranked.warnings, ...warnings],
    };
  }

  private async generateForStyle(
    composerInput: ComposerInput,
    style: CommentStyle,
    userMemory?: UserMemoryRef,
  ): Promise<{ generatedCandidates: GeneratedComment[]; styleWarnings: string[] }> {
    const dto = this.replyPackAdapter.toDto(composerInput, style);
    const replyPack = await this.aiReplyPackService.generateReplyPack({
      dto: {
        ...dto,
        translationLanguage: dto.explanationLanguage ?? 'vi',
      },
      detectedLanguage: this.toDetectedLanguage(
        composerInput.input.mainPost.language,
      ),
      targetLanguage:
        dto.targetCommentLanguage === 'same_as_original'
          ? composerInput.decision.recommendedLanguage
          : dto.targetCommentLanguage,
      userMemory,
    });

    const generatedCandidates = this.fromSuggestions(style, replyPack.suggestions);

    if (generatedCandidates.length === 0) {
      return {
        generatedCandidates: [this.fallbackCandidate(composerInput, style)],
        styleWarnings: [`composer_ai_no_suggestions:${style}`],
      };
    }

    return { generatedCandidates, styleWarnings: [] };
  }

  private fromSuggestions(
    style: CommentStyle,
    suggestions: CommentSuggestion[],
  ): GeneratedComment[] {
    return suggestions.map((suggestion, index) => ({
      text: suggestion.text,
      label: `${style}_${index + 1}`,
      style,
      score: suggestion.score?.total ?? 60,
      reason:
        suggestion.whyItWorks ||
        suggestion.meaningVi ||
        'AI-generated candidate',
      risk: suggestion.risk,
    }));
  }

  private fallbackCandidate(
    input: ComposerInput,
    style: CommentStyle,
  ): GeneratedComment {
    const text = this.getFallbackText(input, style);
    return {
      text,
      label: `${style}_fallback`,
      style,
      score: style === 'safe' ? 64 : 58,
      reason: 'Deterministic fallback generated from driver decision',
      risk: 'low',
    };
  }

  private getFallbackText(input: ComposerInput, style: CommentStyle): string {
    const { decision } = input;
    if (style === 'question') return 'What made this stand out to you most?';
    if (style === 'funny')
      return decision.recommendedLanguage === 'vi'
        ? 'đúng vibe này luôn'
        : 'this has the exact energy';
    if (style === 'value_add')
      return 'The useful part is how specific this angle is, not just the takeaway.';
    if (decision.zone === 'achievement_congrats')
      return 'Well deserved, this milestone says a lot.';
    if (decision.zone === 'emotional_support')
      return 'That sounds heavy, but the way you framed it feels really honest.';
    return 'This is a solid angle, especially with that context.';
  }

  private toDetectedLanguage(language: string | undefined): DetectedLanguage {
    if (
      language === 'ja' ||
      language === 'en' ||
      language === 'vi' ||
      language === 'ko' ||
      language === 'zh'
    ) {
      return language;
    }

    return 'unknown';
  }
}
