import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const FINANCE_PERSONAL_SIGNALS: NicheSignalDefinition = {
  niche: 'finance_personal',
  version: '1.0.0',
  strong: [
    en('index-fund', /\b(index funds?|etfs?|s&p 500|vti|voo)\b/),
    en('retirement', /\b(401\(?k\)?|roth ira|pension fund|superannuation)\b/),
    en('compound', /\bcompound interest\b/),
    en('mortgage', /\b(mortgage rate|refinanc(e|ing)|home loan)\b/),
    en('credit', /\b(credit score|credit card debt|apr)\b/),
    en('emergency', /\b(emergency fund|sinking fund)\b/),
    en('dividend', /\b(dividends?|yield on cost)\b/),
    en('networth', /\b(net worth|financial independence|fire movement)\b/),
    en('budget', /\b(budgeting|savings rate|debt payoff|snowball method)\b/),
    vi('tai-chinh', /tài chính cá nhân|tiết kiệm|lãi suất|đầu tư dài hạn/),
    ja('toushi', /資産運用|貯金|投資信託|nisa/),
  ],
  weak: [
    en('money', /\bmoney\b/),
    en('invest', /\binvest(ing|ment)?\b/),
    en('savings', /\bsavings?\b/),
    en('expense', /\bexpenses?\b/),
    en('income', /\b(income|paycheck)\b/),
    ja('okane', /お金|家計/),
  ],
  hashtagAliases: [
    'personalfinance',
    'finance',
    'financepersonal',
    'finance_personal',
    'investing',
    'fire',
    'savings',
    'budgeting',
  ],
  cashtags: ['SPY', 'VOO', 'VTI', 'QQQ'],
  domains: ['bogleheads.org', 'morningstar.com'],
};
