import type { NicheSignalDefinition } from '../niche.types';
import { any, en, ja, vi } from './kw';

export const ANIME_MANGA_SIGNALS: NicheSignalDefinition = {
  niche: 'anime_manga',
  version: '1.0.0',
  strong: [
    any('anime', /\banime\b/),
    any('manga', /\bmanga\b/),
    any('title', /\b(one piece|naruto|bleach|jujutsu kaisen|chainsaw man)\b/),
    any('title2', /\b(demon slayer|attack on titan|frieren|solo leveling)\b/),
    any('vtuber', /\bv[- ]?tubers?\b/),
    any('demographic', /\b(shou?nen|seinen|shoujo|isekai)\b/),
    any('studio', /\b(studio ghibli|mappa|ufotable|kyoto animation)\b/),
    any('fandom', /\b(waifu|husbando|cosplay|oshi)\b/),
    ja('anime-ja', /アニメ|漫画|マンガ/),
    ja('title-ja', /ワンピース|呪術廻戦|鬼滅の刃|進撃の巨人/),
    ja('oshi', /推し|声優|作画/),
    vi('truyen-tranh', /truyện tranh|hoạt hình nhật/),
  ],
  weak: [
    en('episode', /\bepisodes?\b/),
    en('chapter', /\bchapters?\b/),
    en('arc', /\b(story )?arcs?\b/),
    en('sub-dub', /\b(subbed|dubbed|fansub)\b/),
    ja('wa', /\d+話|アニメ化/),
  ],
  hashtagAliases: [
    'anime',
    'manga',
    'animemanga',
    'anime_manga',
    'otaku',
    'vtuber',
    'onepiece',
    'cosplay',
  ],
  cashtags: [],
  domains: ['myanimelist.net', 'crunchyroll.com', 'anilist.co'],
};
