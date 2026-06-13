import { Injectable, NotFoundException } from '@nestjs/common';
import { FeedIntelligenceService } from '../feed-intelligence/feed-intelligence.service';
import { TopOpportunitiesSelector } from './selectors/top-opportunities.selector';
import { scoreOpportunity } from '../../../../packages/opportunity-scoring/src/index';
import {
  candidateFromStoredFeedCandidate,
  OpportunityScore,
  OpportunityScoringInput,
  OpportunitySnapshotItem,
  OpportunitySnapshotSummary,
} from './types/opportunity.types';

@Injectable()
export class OpportunityService {
  constructor(
    private readonly feedIntelligenceService: FeedIntelligenceService,
    private readonly topOpportunitiesSelector: TopOpportunitiesSelector,
  ) {}

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
