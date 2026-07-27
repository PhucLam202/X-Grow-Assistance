import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const CAREER_SIGNALS: NicheSignalDefinition = {
  niche: 'career',
  version: '1.0.0',
  strong: [
    en('resume', /\b(resume|cv)\s*(review|tips|screening)?\b/),
    en('interview', /\b(job|technical|behavioral) interviews?\b/),
    en('hiring', /\b(hiring|we're hiring|open roles?)\b/),
    en('layoff', /\b(laid off|layoffs?)\b/),
    en('promotion', /\b(promotion|promoted to|career ladder)\b/),
    en('salary', /\b(salary negotiation|compensation package|total comp)\b/),
    en('recruiter', /\brecruiters?\b/),
    en('job-offer', /\bjob offers?\b/),
    en('perf-review', /\bperformance reviews?\b/),
    en('career-change', /\b(career (change|switch|pivot)|quiet quitting)\b/),
    vi('tuyen-dung', /tuyển dụng|phỏng vấn|nghỉ việc|đàm phán lương/),
    ja('tenshoku', /転職|就活|面接|履歴書/),
  ],
  weak: [
    en('job', /\bjobs?\b/),
    en('career', /\bcareers?\b/),
    en('manager', /\bmanagers?\b/),
    en('workplace', /\b(workplace|office culture)\b/),
    en('mentor', /\bmentor(ship)?\b/),
    vi('cong-viec', /công việc|sự nghiệp/),
    ja('shigoto', /仕事|職場/),
  ],
  hashtagAliases: [
    'career',
    'careers',
    'hiring',
    'jobs',
    'jobsearch',
    'layoffs',
    'interview',
    'recruiting',
  ],
  cashtags: [],
  domains: ['linkedin.com', 'levels.fyi', 'glassdoor.com'],
};
