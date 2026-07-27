import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const SCIENCE_SIGNALS: NicheSignalDefinition = {
  niche: 'science',
  version: '1.0.0',
  strong: [
    en('peer-review', /\b(peer[- ]review(ed)?|preprint|replication crisis)\b/),
    en('method', /\b(hypothesis|control group|double[- ]blind|p[- ]value)\b/),
    en('trial', /\bclinical trials?\b/),
    en('physics', /\b(quantum (mechanics|computing)|particle physics|higgs)\b/),
    en(
      'space',
      /\b(astrophysics|exoplanet|telescope|black hole|nasa mission)\b/,
    ),
    en('bio', /\b(genome|crispr|rna|protein folding|microbiome)\b/),
    en('neuro', /\bneuroscience\b/),
    en(
      'paper',
      /\b(published in nature|published in science|journal article)\b/,
    ),
    vi('khoa-hoc', /khoa học|nghiên cứu|thí nghiệm/),
    ja('kagaku', /科学|研究|論文|実験/),
  ],
  weak: [
    en('study', /\bstud(y|ies)\b/),
    en('research', /\bresearch(ers?)?\b/),
    en('data', /\bdata set\b/),
    en('experiment', /\bexperiments?\b/),
    en('theory', /\btheor(y|ies)\b/),
    ja('kenkyuu', /研究者|データ/),
  ],
  hashtagAliases: [
    'science',
    'research',
    'academia',
    'physics',
    'biology',
    'space',
    'neuroscience',
  ],
  cashtags: [],
  domains: [
    'arxiv.org',
    'nature.com',
    'science.org',
    'pubmed.ncbi.nlm.nih.gov',
  ],
};
