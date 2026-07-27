import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const BUSINESS_SIGNALS: NicheSignalDefinition = {
  niche: 'business',
  version: '1.0.0',
  strong: [
    en('revenue', /\b(revenue|arr|mrr|profit margin)\b/),
    en('b2b', /\b(b2b|b2c|saas)\b/),
    en('enterprise', /\benterprise (sales|deal|customer)s?\b/),
    en('gtm', /\bgo[- ]to[- ]market\b/),
    en('market-share', /\bmarket share\b/),
    en('acquisition', /\b(acquisition|acquired|merger)\b/),
    en('valuation', /\bvaluation\b/),
    en('churn', /\b(churn|retention rate|ltv|cac)\b/),
    en('pricing-strategy', /\bpricing (strategy|model|tier)s?\b/),
    en('supply-chain', /\bsupply chain\b/),
    vi('doanh-thu', /doanh thu|lợi nhuận|kinh doanh/),
    ja('keiei', /売上|経営|ビジネスモデル/),
  ],
  weak: [
    en('business', /\bbusiness\b/),
    en('growth', /\bgrowth\b/),
    en('sales', /\bsales\b/),
    en('customer', /\bcustomers?\b/),
    en('strategy', /\bstrateg(y|ic)\b/),
    en('margin', /\bmargins?\b/),
    vi('khach-hang', /khách hàng|thị trường/),
    ja('bijinesu', /ビジネス|顧客/),
  ],
  hashtagAliases: [
    'business',
    'saas',
    'b2b',
    'marketing',
    'sales',
    'growth',
    'ecommerce',
  ],
  cashtags: [],
  domains: ['hbr.org', 'bloomberg.com', 'forbes.com'],
};
