import type { NicheSignalDefinition } from '../niche.types';
import { any, en, ja, vi } from './kw';

export const FOOTBALL_SIGNALS: NicheSignalDefinition = {
  niche: 'football',
  version: '1.0.0',
  strong: [
    any('competition', /\b(premier league|champions league|la liga|serie a)\b/),
    any('competition2', /\b(world cup|euro 202\d|bundesliga|ligue 1)\b/),
    any('player', /\b(messi|ronaldo|mbapp[ée]|haaland|bellingham)\b/),
    any('club', /\b(man(chester)? (united|city)|real madrid|barcelona)\b/),
    any('club2', /\b(liverpool|arsenal|chelsea|tottenham|bayern)\b/),
    en('transfer', /\btransfer (window|news|rumou?r|fee)\b/),
    en('rules', /\b(offside|penalty kick|var decision|red card)\b/),
    en('award', /\b(ballon d'?or|golden boot)\b/),
    vi('bong-da', /bóng đá|cầu thủ|đội tuyển|ngoại hạng anh/),
    ja('soccer-ja', /サッカー|ワールドカップ|日本代表/),
  ],
  weak: [
    en('football', /\b(football|soccer)\b/),
    en('goal', /\bgoals?\b/),
    en('match', /\b(match|fixture|kickoff)\b/),
    en('striker', /\b(striker|midfielder|goalkeeper|defender)\b/),
    en('club-weak', /\bclubs?\b/),
    ja('shiai', /試合|得点/),
  ],
  hashtagAliases: [
    'football',
    'soccer',
    'premierleague',
    'championsleague',
    'ucl',
    'worldcup',
    'mufc',
    'fcb',
  ],
  cashtags: [],
  domains: ['espn.com', 'premierleague.com', 'transfermarkt.com'],
};
