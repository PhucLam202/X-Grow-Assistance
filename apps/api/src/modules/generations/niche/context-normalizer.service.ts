import { Injectable } from '@nestjs/common';

import type {
  NicheClassificationInput,
  NicheSignalSource,
  NormalizedNicheContext,
} from './niche.types';

const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const MENTION_PATTERN = /@([A-Za-z0-9_]{1,15})\b/g;
const LINK_PATTERN = /https?:\/\/[^\s<>"']+/g;
const CASHTAG_PATTERN = /\$([A-Za-z]{2,6})\b/g;

@Injectable()
export class ContextNormalizerService {
  /**
   * Merges every available context source into one searchable blob and derives
   * hashtags / mentions / links / cashtags from the raw text.
   *
   * Deriving rather than requiring them means the extension does not have to
   * send structured entities: a post body with `#ai` and `$BTC` in it yields
   * the same signals as an explicitly populated `hashtags` array.
   */
  normalize(input: NicheClassificationInput): NormalizedNicheContext {
    const segments = this.collectSegments(input);
    const rawText = segments.map((segment) => segment.text).join('\n');

    const hashtags = this.dedupe([
      ...(input.hashtags ?? []).map((tag) => this.stripPrefix(tag, '#')),
      ...this.matchAll(rawText, HASHTAG_PATTERN),
    ]);

    const mentions = this.dedupe([
      ...(input.mentions ?? []).map((handle) => this.stripPrefix(handle, '@')),
      ...this.matchAll(rawText, MENTION_PATTERN),
    ]);

    const links = this.dedupe([
      ...(input.links ?? []),
      ...this.matchAll(rawText, LINK_PATTERN, false),
    ]);

    const cashtags = this.dedupe(this.matchAll(rawText, CASHTAG_PATTERN)).map(
      (tag) => tag.toUpperCase(),
    );

    return {
      searchText: rawText.toLowerCase().replace(/\s+/g, ' ').trim(),
      segments,
      hashtags,
      mentions,
      links,
      domains: this.toDomains(links),
      cashtags,
      isEmpty: rawText.trim().length === 0,
    };
  }

  private collectSegments(
    input: NicheClassificationInput,
  ): Array<{ source: NicheSignalSource; text: string }> {
    const candidates: Array<{ source: NicheSignalSource; text?: string }> = [
      { source: 'post_text', text: input.postText },
      { source: 'quoted_post', text: input.quotedPostText },
      { source: 'thread', text: (input.threadContext ?? []).join(' ') },
      { source: 'alt_text', text: input.altText },
      { source: 'vision', text: input.visionText },
      { source: 'author_bio', text: input.authorBio },
      {
        source: 'author_topics',
        text: (input.recentAuthorTopics ?? []).join(' '),
      },
      { source: 'hashtag', text: (input.hashtags ?? []).join(' ') },
    ];

    return candidates
      .filter(
        (candidate): candidate is { source: NicheSignalSource; text: string } =>
          typeof candidate.text === 'string' &&
          candidate.text.trim().length > 0,
      )
      .map((candidate) => ({
        source: candidate.source,
        text: candidate.text.trim(),
      }));
  }

  private matchAll(
    text: string,
    pattern: RegExp,
    useCaptureGroup = true,
  ): string[] {
    // Fresh RegExp per call: the module-level patterns carry `g`, so sharing
    // lastIndex across calls would silently skip matches.
    const scoped = new RegExp(pattern.source, pattern.flags);
    const results: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = scoped.exec(text)) !== null) {
      const value = useCaptureGroup ? match[1] : match[0];
      if (value) results.push(value);
    }

    return results;
  }

  private toDomains(links: string[]): string[] {
    return this.dedupe(
      links
        .map((link) => {
          try {
            return new URL(link).hostname.toLowerCase().replace(/^www\./, '');
          } catch {
            return '';
          }
        })
        .filter((host) => host.length > 0),
    );
  }

  private stripPrefix(value: string, prefix: string): string {
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
  }

  private dedupe(values: string[]): string[] {
    return [
      ...new Set(
        values.map((value) => value.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }
}
