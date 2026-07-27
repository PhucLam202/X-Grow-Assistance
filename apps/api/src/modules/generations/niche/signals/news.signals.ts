import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const NEWS_SIGNALS: NicheSignalDefinition = {
  niche: 'news',
  version: '1.0.0',
  strong: [
    en('breaking', /\bbreaking(:| news)\b/),
    en('press', /\bpress (conference|release|briefing)\b/),
    en('politics', /\b(parliament|congress|senate|prime minister)\b/),
    en('election', /\b(elections?|ballot|voter turnout)\b/),
    en('policy', /\b(sanctions?|ceasefire|treaty|executive order)\b/),
    en('legal', /\b(court ruling|indictment|lawsuit filed|verdict)\b/),
    en('official', /\b(president|government) (said|announced|confirmed)\b/),
    vi('thoi-su', /thời sự|chính phủ|bầu cử|quốc hội/),
    ja('sokuho', /速報|政府|選挙|会見/),
  ],
  weak: [
    en('news', /\bnews\b/),
    en('report', /\breports?\b/),
    en('announced', /\bannounced\b/),
    en('statement', /\b(official )?statements?\b/),
    en('update', /\blive updates?\b/),
    ja('nyusu', /ニュース|報道/),
  ],
  hashtagAliases: ['news', 'breaking', 'breakingnews', 'politics', 'worldnews'],
  cashtags: [],
  domains: ['reuters.com', 'apnews.com', 'bbc.com', 'nytimes.com'],
};
