import type { NicheSignalDefinition } from '../niche.types';
import { any, en, ja, vi } from './kw';

export const MOVIES_TV_SIGNALS: NicheSignalDefinition = {
  niche: 'movies_tv',
  version: '1.0.0',
  strong: [
    en('box-office', /\bbox office\b/),
    en('craft', /\b(screenplay|cinematography|score by|director'?s cut)\b/),
    any('studio', /\b(netflix|hbo|a24|disney\+|prime video|apple tv\+)\b/),
    en('season', /\b(season finale|series premiere|season \d+)\b/),
    en('production', /\b(casting|reshoots|post[- ]production)\b/),
    en('trailer', /\btrailer (drop(ped|s)?|released)\b/),
    en('awards', /\b(oscars?|academy awards?|emmys?|cannes)\b/),
    en('spoiler', /\bspoilers?\b/),
    vi('phim', /điện ảnh|bộ phim|diễn viên|phim truyền hình/),
    ja('eiga', /映画|ドラマ|俳優|実写化/),
  ],
  weak: [
    en('movie', /\bmovies?\b/),
    en('film', /\bfilms?\b/),
    en('series', /\bseries\b/),
    en('actor', /\b(actor|actress)e?s?\b/),
    en('director', /\bdirectors?\b/),
    ja('shichou', /視聴|配信/),
  ],
  hashtagAliases: [
    'movies',
    'movie',
    'film',
    'tv',
    'moviestv',
    'movies_tv',
    'netflix',
    'cinema',
    'oscars',
  ],
  cashtags: [],
  domains: ['imdb.com', 'netflix.com', 'letterboxd.com'],
};
