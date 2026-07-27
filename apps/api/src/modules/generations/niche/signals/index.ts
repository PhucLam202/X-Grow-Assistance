import type { NicheSignalDefinition } from '../niche.types';
import { AI_ML_SIGNALS } from './ai-ml.signals';
import { ANIME_MANGA_SIGNALS } from './anime-manga.signals';
import { BUSINESS_SIGNALS } from './business.signals';
import { CAREER_SIGNALS } from './career.signals';
import { CRYPTO_SIGNALS } from './crypto.signals';
import { EDUCATION_SIGNALS } from './education.signals';
import { FINANCE_PERSONAL_SIGNALS } from './finance-personal.signals';
import { FOOD_SIGNALS } from './food.signals';
import { FOOTBALL_SIGNALS } from './football.signals';
import { GAMING_SIGNALS } from './gaming.signals';
import { HEALTH_FITNESS_SIGNALS } from './health-fitness.signals';
import { MOVIES_TV_SIGNALS } from './movies-tv.signals';
import { MUSIC_SIGNALS } from './music.signals';
import { NEWS_SIGNALS } from './news.signals';
import { PRODUCTIVITY_SIGNALS } from './productivity.signals';
import { SCIENCE_SIGNALS } from './science.signals';
import { STARTUP_SIGNALS } from './startup.signals';
import { TECH_SIGNALS } from './tech.signals';
import { TRAVEL_SIGNALS } from './travel.signals';

/**
 * Adding a niche means: add the key to `types/niche.types.ts`, drop a
 * `<niche>.signals.ts` file next to this one, and add it to this list.
 * No cascade service changes.
 *
 * `general` has no entry on purpose — it is the fallback, not a niche you can
 * match keywords against.
 */
export const DEFAULT_NICHE_SIGNALS: NicheSignalDefinition[] = [
  AI_ML_SIGNALS,
  ANIME_MANGA_SIGNALS,
  BUSINESS_SIGNALS,
  CAREER_SIGNALS,
  CRYPTO_SIGNALS,
  EDUCATION_SIGNALS,
  FINANCE_PERSONAL_SIGNALS,
  FOOD_SIGNALS,
  FOOTBALL_SIGNALS,
  GAMING_SIGNALS,
  HEALTH_FITNESS_SIGNALS,
  MOVIES_TV_SIGNALS,
  MUSIC_SIGNALS,
  NEWS_SIGNALS,
  PRODUCTIVITY_SIGNALS,
  SCIENCE_SIGNALS,
  STARTUP_SIGNALS,
  TECH_SIGNALS,
  TRAVEL_SIGNALS,
];
