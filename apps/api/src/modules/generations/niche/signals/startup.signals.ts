import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const STARTUP_SIGNALS: NicheSignalDefinition = {
  niche: 'startup',
  version: '1.0.0',
  strong: [
    en('founder', /\b(co[- ]?)?founders?\b/),
    en('round', /\b(seed round|series [abc]|pre[- ]seed)\b/),
    en('vc', /\b(venture capital|vc firm|\bvcs\b)/),
    en('accelerator', /\b(y combinator|ycombinator|techstars|accelerator)\b/),
    en('pmf', /\b(product[- ]market fit|pmf)\b/),
    en('mvp', /\bmvp\b/),
    en('bootstrapped', /\b(bootstrapp?ed|indie hacker|solo founder)\b/),
    en('cap-table', /\b(cap table|term sheet|safe note|equity split)\b/),
    en('pitch', /\bpitch deck\b/),
    en('angel', /\bangel investors?\b/),
    en('runway', /\b(runway|burn rate)\b/),
    vi('khoi-nghiep', /khởi nghiệp|gọi vốn|nhà sáng lập/),
    ja('startup-ja', /スタートアップ|起業|資金調達/),
  ],
  weak: [
    en('startup', /\bstart[- ]?ups?\b/),
    en('launch', /\blaunch(ed|ing)?\b/),
    en('funding', /\bfunding\b/),
    en('traction', /\btraction\b/),
    en('shipped', /\bshipp?ed\b/),
    ja('kigyou', /創業|投資家/),
  ],
  hashtagAliases: [
    'startup',
    'startups',
    'buildinpublic',
    'indiehackers',
    'founders',
    'venturecapital',
    'yc',
  ],
  cashtags: [],
  domains: ['producthunt.com', 'ycombinator.com', 'crunchbase.com'],
};
