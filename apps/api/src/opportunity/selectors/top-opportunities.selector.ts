import { Injectable } from '@nestjs/common';
import type { OpportunitySnapshotItem } from '../types/opportunity.types';

@Injectable()
export class TopOpportunitiesSelector {
  select(
    items: OpportunitySnapshotItem[],
    limit = 5,
  ): OpportunitySnapshotItem[] {
    return items
      .slice()
      .sort((left, right) => {
        const scoreDelta = right.score.total - left.score.total;
        if (scoreDelta !== 0) return scoreDelta;
        return left.score.recommendedAction === 'skip' ? 1 : -1;
      })
      .slice(0, limit);
  }
}
