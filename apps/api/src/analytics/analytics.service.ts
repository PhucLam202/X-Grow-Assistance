import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TrackUsageEventDto } from './dto/track-usage-event.dto';
import { StoredUsageEvent } from './types/usage-event.types';

const MAX_EVENTS = 1000;

@Injectable()
export class AnalyticsService {
  private readonly events: StoredUsageEvent[] = [];

  track(dto: TrackUsageEventDto): { ok: true } {
    this.events.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...dto,
    });

    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    return { ok: true };
  }

  getSummary() {
    const byEventName = this.events.reduce<Record<string, number>>(
      (summary, event) => {
        summary[event.eventName] = (summary[event.eventName] ?? 0) + 1;
        return summary;
      },
      {},
    );

    const successfulAnalyzeEvents = this.events.filter(
      (event) =>
        event.eventName === 'analyze_succeeded' &&
        event.latencyMs !== undefined,
    );
    const averageLatencyMs = successfulAnalyzeEvents.length
      ? Math.round(
          successfulAnalyzeEvents.reduce(
            (total, event) => total + (event.latencyMs ?? 0),
            0,
          ) / successfulAnalyzeEvents.length,
        )
      : 0;

    return {
      totalEvents: this.events.length,
      byEventName,
      averageLatencyMs,
      latestEvents: this.events.slice(-20).reverse(),
    };
  }
}
