import { Injectable } from '@nestjs/common';

import type {
  DeterministicNicheMatch,
  NicheScore,
  NicheSignalDefinition,
  NicheSourceSignal,
  NormalizedNicheContext,
} from './niche.types';
import { getAllNicheSignals } from './signal-registry';

export const STRONG_SIGNAL_WEIGHT = 3;
export const WEAK_SIGNAL_WEIGHT = 1;
export const DETERMINISTIC_SIGNAL_WEIGHT = 5;

@Injectable()
export class LightweightClassifierService {
  /**
   * High-precision signals that do not depend on prose: cashtags, hashtags that
   * name a niche outright, and link hosts. A single hit here is trustworthy on
   * its own, unlike a keyword hit.
   */
  matchDeterministic(
    context: NormalizedNicheContext,
  ): DeterministicNicheMatch[] {
    const matches: DeterministicNicheMatch[] = [];

    for (const definition of getAllNicheSignals()) {
      const evidence: string[] = [];
      const sourceSignals: NicheSourceSignal[] = [];

      for (const cashtag of definition.cashtags) {
        if (context.cashtags.includes(cashtag.toUpperCase())) {
          evidence.push(`cashtag:$${cashtag.toUpperCase()}`);
          sourceSignals.push({
            source: 'cashtag',
            signal: `$${cashtag.toUpperCase()}`,
            weight: DETERMINISTIC_SIGNAL_WEIGHT,
          });
        }
      }

      for (const alias of definition.hashtagAliases) {
        if (context.hashtags.includes(alias.toLowerCase())) {
          evidence.push(`hashtag:#${alias.toLowerCase()}`);
          sourceSignals.push({
            source: 'hashtag',
            signal: `#${alias.toLowerCase()}`,
            weight: DETERMINISTIC_SIGNAL_WEIGHT,
          });
        }
      }

      for (const domain of definition.domains) {
        if (context.domains.some((host) => this.hostMatches(host, domain))) {
          evidence.push(`link:${domain}`);
          sourceSignals.push({
            source: 'link',
            signal: domain,
            weight: DETERMINISTIC_SIGNAL_WEIGHT,
          });
        }
      }

      if (evidence.length > 0) {
        matches.push({ niche: definition.niche, evidence, sourceSignals });
      }
    }

    return matches;
  }

  /**
   * Keyword scoring over the normalized context. Pure rules — never calls an
   * LLM. Returns every niche that matched at least once, best score first.
   */
  score(context: NormalizedNicheContext): NicheScore[] {
    if (context.isEmpty) return [];

    return getAllNicheSignals()
      .map((definition) => this.scoreNiche(definition, context))
      .filter((result): result is NicheScore => result !== null)
      .sort((a, b) => b.score - a.score || a.niche.localeCompare(b.niche));
  }

  private scoreNiche(
    definition: NicheSignalDefinition,
    context: NormalizedNicheContext,
  ): NicheScore | null {
    const evidence: string[] = [];
    const sourceSignals: NicheSourceSignal[] = [];
    let strongHits = 0;
    let weakHits = 0;
    let score = 0;

    for (const keyword of definition.strong) {
      if (!keyword.pattern.test(context.searchText)) continue;
      strongHits += 1;
      score += STRONG_SIGNAL_WEIGHT;
      evidence.push(`strong:${keyword.label}`);
      sourceSignals.push({
        source: this.attributeSource(keyword.pattern, context),
        signal: keyword.label,
        weight: STRONG_SIGNAL_WEIGHT,
      });
    }

    for (const keyword of definition.weak) {
      if (!keyword.pattern.test(context.searchText)) continue;
      weakHits += 1;
      score += WEAK_SIGNAL_WEIGHT;
      evidence.push(`weak:${keyword.label}`);
      sourceSignals.push({
        source: this.attributeSource(keyword.pattern, context),
        signal: keyword.label,
        weight: WEAK_SIGNAL_WEIGHT,
      });
    }

    if (score === 0) return null;

    return {
      niche: definition.niche,
      score,
      strongHits,
      weakHits,
      evidence,
      sourceSignals,
    };
  }

  /**
   * Attributes a keyword hit back to the segment it came from, so `evidence`
   * can distinguish "the author wrote this" from "the image described this".
   */
  private attributeSource(
    pattern: RegExp,
    context: NormalizedNicheContext,
  ): NicheSourceSignal['source'] {
    const segment = context.segments.find((candidate) =>
      pattern.test(candidate.text.toLowerCase()),
    );

    return segment?.source ?? 'post_text';
  }

  private hostMatches(host: string, domain: string): boolean {
    return host === domain || host.endsWith(`.${domain}`);
  }
}
