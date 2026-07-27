import type { NicheSignalDefinition } from '../niche.types';
import { any, en, ja, vi } from './kw';

export const PRODUCTIVITY_SIGNALS: NicheSignalDefinition = {
  niche: 'productivity',
  version: '1.0.0',
  strong: [
    en('deep-work', /\bdeep work\b/),
    en('time-blocking', /\b(time[- ]block(ing)?|calendar blocking|pomodoro)\b/),
    en('pkm', /\b(second brain|zettelkasten|para method|gtd)\b/),
    any('tool', /\b(notion|obsidian|todoist|things ?3|roam research)\b/),
    en('inbox', /\binbox zero\b/),
    en('habits', /\b(habit (tracker|stacking)|streak tracking)\b/),
    en('review', /\b(weekly review|daily standup ritual)\b/),
    en('focus', /\b(focus mode|distraction[- ]free|context switching)\b/),
    en('procrastination', /\bprocrastinat(e|ion|ing)\b/),
    vi('nang-suat', /năng suất|quản lý thời gian|thói quen tốt/),
    ja('seisansei', /生産性|習慣化|効率化|タスク管理/),
  ],
  weak: [
    en('productivity', /\bproductiv(e|ity)\b/),
    en('habit', /\bhabits?\b/),
    en('workflow', /\bworkflows?\b/),
    en('routine', /\broutines?\b/),
    en('todo', /\b(to[- ]?do list|task list)\b/),
    ja('shukan', /習慣|効率/),
  ],
  hashtagAliases: [
    'productivity',
    'buildinginpublic',
    'notion',
    'obsidian',
    'timemanagement',
    'deepwork',
    'pkm',
  ],
  cashtags: [],
  domains: ['notion.so', 'todoist.com', 'obsidian.md'],
};
