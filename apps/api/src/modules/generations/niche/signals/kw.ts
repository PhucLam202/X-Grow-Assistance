import type { NicheKeywordLanguage, NicheKeywordPattern } from '../niche.types';

function keyword(lang: NicheKeywordLanguage) {
  return (label: string, pattern: RegExp): NicheKeywordPattern => ({
    lang,
    label,
    pattern,
  });
}

/** English keyword. */
export const en = keyword('en');

/** Vietnamese keyword. */
export const vi = keyword('vi');

/** Japanese keyword. */
export const ja = keyword('ja');

/** Language-neutral keyword (product names, tickers, symbols). */
export const any = keyword('any');
