import type { NichePolicy } from '../niche-policy.interface';
import { AI_ML_POLICY } from './ai-ml.policy';
import { ANIME_MANGA_POLICY } from './anime-manga.policy';
import { BUSINESS_POLICY } from './business.policy';
import { CAREER_POLICY } from './career.policy';
import { CRYPTO_POLICY } from './crypto.policy';
import { EDUCATION_POLICY } from './education.policy';
import { FINANCE_PERSONAL_POLICY } from './finance-personal.policy';
import { FOOD_POLICY } from './food.policy';
import { FOOTBALL_POLICY } from './football.policy';
import { GAMING_POLICY } from './gaming.policy';
import { GENERAL_POLICY } from './general.policy';
import { HEALTH_FITNESS_POLICY } from './health-fitness.policy';
import { MOVIES_TV_POLICY } from './movies-tv.policy';
import { MUSIC_POLICY } from './music.policy';
import { NEWS_POLICY } from './news.policy';
import { PRODUCTIVITY_POLICY } from './productivity.policy';
import { SCIENCE_POLICY } from './science.policy';
import { STARTUP_POLICY } from './startup.policy';
import { TECH_POLICY } from './tech.policy';
import { TRAVEL_POLICY } from './travel.policy';

/**
 * Thêm một niche mới: thêm key vào `types/niche.types.ts`, tạo
 * `<niche>.policy.ts` cạnh file này, rồi thêm 1 dòng vào danh sách dưới.
 * Không đụng resolver, prompt adapter hay orchestrator.
 *
 * Khác `signals/index.ts`: `general` BẮT BUỘC có mặt ở đây — nó là policy
 * fallback mà resolver dùng khi primary niche không có policy đăng ký.
 */
export const DEFAULT_NICHE_POLICIES: NichePolicy[] = [
  GENERAL_POLICY,
  TECH_POLICY,
  AI_ML_POLICY,
  CRYPTO_POLICY,
  BUSINESS_POLICY,
  STARTUP_POLICY,
  CAREER_POLICY,
  ANIME_MANGA_POLICY,
  GAMING_POLICY,
  FOOTBALL_POLICY,
  NEWS_POLICY,
  HEALTH_FITNESS_POLICY,
  FINANCE_PERSONAL_POLICY,
  EDUCATION_POLICY,
  TRAVEL_POLICY,
  FOOD_POLICY,
  MUSIC_POLICY,
  MOVIES_TV_POLICY,
  SCIENCE_POLICY,
  PRODUCTIVITY_POLICY,
];

export {
  AI_ML_POLICY,
  ANIME_MANGA_POLICY,
  BUSINESS_POLICY,
  CAREER_POLICY,
  CRYPTO_POLICY,
  EDUCATION_POLICY,
  FINANCE_PERSONAL_POLICY,
  FOOD_POLICY,
  FOOTBALL_POLICY,
  GAMING_POLICY,
  GENERAL_POLICY,
  HEALTH_FITNESS_POLICY,
  MOVIES_TV_POLICY,
  MUSIC_POLICY,
  NEWS_POLICY,
  PRODUCTIVITY_POLICY,
  SCIENCE_POLICY,
  STARTUP_POLICY,
  TECH_POLICY,
  TRAVEL_POLICY,
};
