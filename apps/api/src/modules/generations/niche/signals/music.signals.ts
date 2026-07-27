import type { NicheSignalDefinition } from '../niche.types';
import { any, en, ja, vi } from './kw';

export const MUSIC_SIGNALS: NicheSignalDefinition = {
  niche: 'music',
  version: '1.0.0',
  strong: [
    en('album', /\b(albums?|ep drop|debut single)\b/),
    any('platform', /\b(spotify|soundcloud|bandcamp|apple music)\b/),
    en('vinyl', /\b(vinyl|record store|pressing)\b/),
    en('live', /\b(setlist|tour dates?|concert tickets?|encore)\b/),
    en('instrument', /\b(guitar riff|bass line|drum fill|synth patch)\b/),
    en('production', /\b(remix|mastering|producer credit|sampled)\b/),
    any('genre', /\b(k[- ]?pop|hip[- ]?hop|jazz|lo[- ]?fi|indie rock)\b/),
    en('charts', /\b(billboard|chart[- ]topping|streaming numbers)\b/),
    vi('am-nhac', /âm nhạc|bài hát|ca sĩ|ca khúc/),
    ja('ongaku', /音楽|ライブ|バンド|新曲/),
  ],
  weak: [
    en('music', /\bmusic\b/),
    en('song', /\bsongs?\b/),
    en('band', /\bbands?\b/),
    en('artist', /\bartists?\b/),
    en('playlist', /\bplaylists?\b/),
    ja('kyoku', /曲|歌/),
  ],
  hashtagAliases: [
    'music',
    'newmusic',
    'nowplaying',
    'kpop',
    'hiphop',
    'vinyl',
    'spotify',
  ],
  cashtags: [],
  domains: ['spotify.com', 'soundcloud.com', 'bandcamp.com'],
};
