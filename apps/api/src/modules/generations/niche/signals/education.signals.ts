import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const EDUCATION_SIGNALS: NicheSignalDefinition = {
  niche: 'education',
  version: '1.0.0',
  strong: [
    en('curriculum', /\b(curriculum|syllabus|lesson plan)\b/),
    en('degree', /\b(phd|masters degree|undergraduate|graduate program)\b/),
    en('thesis', /\b(thesis|dissertation)\b/),
    en('scholarship', /\b(scholarships?|tuition fees?|financial aid)\b/),
    en('online-course', /\b(online courses?|mooc|coursera|bootcamp)\b/),
    en('teaching', /\b(teaching (method|assistant)|classroom management)\b/),
    en('exam', /\b(exam prep|standardized test|sat score|ielts|toefl)\b/),
    en('admission', /\b(university admission|college application)\b/),
    vi('giao-duc', /giáo dục|học tập|sinh viên|đại học|ôn thi/),
    ja('kyouiku', /教育|受験|大学|勉強法/),
  ],
  weak: [
    en('learn', /\blearn(ing)?\b/),
    en('student', /\bstudents?\b/),
    en('course', /\bcourses?\b/),
    en('school', /\bschools?\b/),
    en('teacher', /\b(teachers?|professors?)\b/),
    ja('benkyou', /勉強|授業/),
  ],
  hashtagAliases: [
    'education',
    'edtech',
    'learning',
    'students',
    'teaching',
    'university',
    'studytwt',
  ],
  cashtags: [],
  domains: ['coursera.org', 'edx.org', 'khanacademy.org'],
};
