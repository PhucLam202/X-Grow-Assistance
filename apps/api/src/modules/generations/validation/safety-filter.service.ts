import { Injectable } from '@nestjs/common';
import type { GeneratedCandidate } from '../candidates/candidate.types';
import type {
  NicheSafetyPattern,
  ResolvedNichePolicy,
} from '../niche/niche-policy.interface';
import { GLOBAL_SAFETY_PATTERNS } from './global-safety-patterns';
import type { CandidatePenalty, RejectReason } from './validation.types';

export interface SafetyFilterResult {
  /** candidateId → lý do reject. */
  rejects: Map<string, RejectReason[]>;
  penalties: CandidatePenalty[];
}

/**
 * Safety deterministic theo niche.
 *
 * Chạy trên `safetyPatterns` (bản máy chạy được của `safetyRules`) chứ không
 * trên `safetyRules` — prose chỉ model đọc được. Global lexicon chạy trước và
 * luôn chạy: nó không phụ thuộc policy nào.
 *
 * Không có LLM call ở đây, và cũng không được có: Phase 6 đã chốt "1 LLM call
 * mỗi request".
 */
@Injectable()
export class SafetyFilterService {
  filter(
    candidates: GeneratedCandidate[],
    policy: ResolvedNichePolicy,
  ): SafetyFilterResult {
    const rejects = new Map<string, RejectReason[]>();
    const penalties: CandidatePenalty[] = [];

    const patterns: NicheSafetyPattern[] = [
      ...GLOBAL_SAFETY_PATTERNS,
      ...policy.safetyPatterns,
    ];

    for (const candidate of candidates) {
      for (const pattern of patterns) {
        if (!pattern.pattern.test(candidate.text)) continue;

        const isGlobal = pattern.id.startsWith('global.');
        const detail = `${pattern.reason} (${pattern.id})`;

        if (pattern.severity === 'reject') {
          rejects.set(candidate.id, [
            ...(rejects.get(candidate.id) ?? []),
            {
              code: isGlobal ? 'global_safety' : 'niche_safety',
              detail,
            },
          ]);
          // Một reject là đủ để loại; chạy hết pattern chỉ làm log dài hơn.
          break;
        }

        penalties.push({
          candidateId: candidate.id,
          code: isGlobal ? 'global_safety_soft' : 'niche_safety_soft',
          detail,
        });
      }
    }

    return { rejects, penalties };
  }
}
