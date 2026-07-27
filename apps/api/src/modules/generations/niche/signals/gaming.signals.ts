import type { NicheSignalDefinition } from '../niche.types';
import { any, en, ja, vi } from './kw';

export const GAMING_SIGNALS: NicheSignalDefinition = {
  niche: 'gaming',
  version: '1.0.0',
  strong: [
    en('gameplay', /\bgameplay\b/),
    en('speedrun', /\bspeed ?runs?\b/),
    en('esports', /\b(esports|e-sports|pro scene)\b/),
    any('platform', /\b(playstation|ps5|xbox|nintendo switch|steam deck)\b/),
    any('title', /\b(valorant|league of legends|minecraft|fortnite|apex)\b/),
    any(
      'title2',
      /\b(elden ring|baldur'?s gate|zelda|genshin|counter[- ]?strike)\b/,
    ),
    en('genre', /\b(fps|mmo|rpg|roguelike|soulslike|battle royale)\b/),
    en('gacha', /\b(gacha|banner pull|loot box)\b/),
    en('patch', /\b(patch notes|nerfed|buffed|meta build)\b/),
    ja('game-ja', /ゲーム実況|ガチャ|switch|プレイ動画/),
    vi('game-vi', /trò chơi điện tử|game thủ|liên minh huyền thoại/),
  ],
  weak: [
    en('game', /\bgames?\b/),
    en('player', /\bplayers?\b/),
    en('boss', /\bboss (fight|rush)\b/),
    en('dlc', /\b(dlc|expansion pack)\b/),
    en('grind', /\b(grind(ing)?|farming)\b/),
    ja('ge-mu', /ゲーム|対戦/),
  ],
  hashtagAliases: [
    'gaming',
    'gamer',
    'videogames',
    'esports',
    'twitch',
    'steam',
    'nintendo',
    'playstation',
  ],
  cashtags: [],
  domains: ['steampowered.com', 'twitch.tv', 'ign.com'],
};
