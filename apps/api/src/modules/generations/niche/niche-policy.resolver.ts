import { Injectable } from '@nestjs/common';
import { DEFAULT_NICHE } from '../types/niche.types';
import type { Niche } from '../types/niche.types';
import type { Tone } from '../types/style.types';
import type { NicheDetectionResult } from './niche.types';
import {
  DEGRADED_STYLE_RULE,
  MAX_SECONDARY_POLICIES,
  NEUTRAL_TONES,
  POLICY_DEGRADE_CONFIDENCE_THRESHOLD,
} from './niche-policy.interface';
import type {
  NichePolicy,
  NicheSafetyPattern,
  NichePolicyDegradeReason,
  NichePolicyVersionRef,
  ResolveNichePolicyInput,
  ResolvedNichePolicy,
} from './niche-policy.interface';
import { getNichePolicy } from './niche-policy.registry';

/** Bao nhiêu vocabulary hint được lấy từ mỗi secondary niche. */
const SECONDARY_VOCAB_PER_NICHE = 6;

/** Trần số hint rút được từ `evidence`. */
const MAX_CONTEXT_VOCAB_HINTS = 8;

/** Prefix của `evidence` mang nghĩa vocabulary thật sự. */
const VOCAB_EVIDENCE_PREFIXES = ['strong:', 'weak:', 'hashtag:', 'cashtag:'];

function dedupeById(patterns: NicheSafetyPattern[]): NicheSafetyPattern[] {
  const seen = new Set<string>();
  const out: NicheSafetyPattern[] = [];

  for (const pattern of patterns) {
    if (seen.has(pattern.id)) continue;
    seen.add(pattern.id);
    out.push({ ...pattern });
  }

  return out;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

/**
 * Rút vocabulary từ `NicheDetectionResult.evidence`.
 *
 * Đây là thứ giữ cho rule "unknown niche → fallback general nhưng vẫn giữ
 * vocabulary hint từ context gốc" không thành khẩu hiệu suông: khi primary niche
 * không có policy, ngữ cảnh mà cascade đã phát hiện vẫn đi tiếp vào prompt.
 *
 * `link:` bị loại vì một tên domain không phải từ vựng cộng đồng; `manual:` và
 * các sentinel (`no_signal_matched`, `empty_context`, …) cũng vậy.
 */
export function extractVocabularyHintsFromEvidence(
  evidence: string[],
): string[] {
  const hints: string[] = [];

  for (const entry of evidence) {
    const prefix = VOCAB_EVIDENCE_PREFIXES.find((p) => entry.startsWith(p));
    if (!prefix) continue;

    const raw = entry.slice(prefix.length).replace(/^[#$]/, '');
    if (!raw) continue;

    // Ticker giữ nguyên hoa/thường vì chữ hoa mang nghĩa; còn lại chuẩn hoá.
    const hint =
      prefix === 'cashtag:'
        ? raw.trim()
        : raw.replace(/[-_]+/g, ' ').trim().toLowerCase();

    if (hint) hints.push(hint);
  }

  return dedupe(hints).slice(0, MAX_CONTEXT_VOCAB_HINTS);
}

/**
 * Ghép policy của primary + secondary niche thành policy hiệu lực cho một
 * request, có tính tới confidence và cờ chờ Phase 4 chốt niche.
 *
 * Bất biến quan trọng: resolver KHÔNG chứa danh sách niche, không `switch`,
 * không `if (niche === ...)`. Thêm một niche mới chỉ cần đăng ký policy — file
 * này không đổi một dòng nào.
 */
@Injectable()
export class NichePolicyResolver {
  resolve(input: ResolveNichePolicyInput): ResolvedNichePolicy {
    const confidence = Math.min(1, Math.max(0, input.confidence || 0));

    // S2 — primary, có fallback về general.
    let primary = getNichePolicy(input.primaryNiche);
    const fallbackUsed = primary === undefined;

    if (!primary) {
      primary = getNichePolicy(DEFAULT_NICHE);
      if (!primary) {
        throw new Error(
          'Niche policy registry is missing the "general" fallback policy.',
        );
      }
    }

    const effectiveNiche = primary.niche;

    // S3 — secondaries: giữ thứ tự input, bỏ trùng/không dùng được, cap 2.
    const secondaries: NichePolicy[] = [];
    const seenSecondary = new Set<Niche>();

    for (const niche of input.secondaryNiches) {
      if (secondaries.length >= MAX_SECONDARY_POLICIES) break;
      if (niche === effectiveNiche || niche === DEFAULT_NICHE) continue;
      if (seenSecondary.has(niche)) continue;

      const policy = getNichePolicy(niche);
      if (!policy) continue;

      seenSecondary.add(niche);
      secondaries.push(policy);
    }

    // S4 — degrade.
    const degradeReasons: NichePolicyDegradeReason[] = [];
    if (confidence < POLICY_DEGRADE_CONFIDENCE_THRESHOLD) {
      degradeReasons.push('low_confidence');
    }
    if (input.needsGenerationTimeClassification) {
      degradeReasons.push('needs_generation_time_classification');
    }
    const degraded = degradeReasons.length > 0;

    // Rộng hơn `degraded`: sau fallback thì niche vẫn là phỏng đoán, kể cả khi
    // confidence bằng 1.0 (ví dụ user chọn tay một niche chưa có policy).
    const provisional = degraded || fallbackUsed;

    // S5 — vocabulary cứu từ evidence.
    const contextVocabularyHints = extractVocabularyHintsFromEvidence(
      input.evidence ?? [],
    );

    // S6 — merge.
    const vocabularyHints = dedupe([
      ...primary.vocabularyHints,
      ...secondaries.flatMap((p) =>
        p.vocabularyHints.slice(0, SECONDARY_VOCAB_PER_NICHE),
      ),
      ...contextVocabularyHints,
    ]);

    // Cấm đoán luôn cộng dồn: một post `news` chạm crypto vẫn phải giữ
    // disclaimer tài chính của crypto.
    const avoidPhrases = dedupe([
      ...primary.avoidPhrases,
      ...secondaries.flatMap((p) => p.avoidPhrases),
    ]);
    const safetyRules = dedupe([
      ...primary.safetyRules,
      ...secondaries.flatMap((p) => p.safetyRules),
    ]);

    // Cùng lý lẽ với `safetyRules`, nhưng dedupe theo `id` thay vì theo nội
    // dung: hai `RegExp` không so sánh được bằng value.
    const safetyPatterns = dedupeById([
      ...(primary.safetyPatterns ?? []),
      ...secondaries.flatMap((p) => p.safetyPatterns ?? []),
    ]);

    const allowedSlang = degraded ? [] : [...primary.allowedSlang];

    const recommendedTones = degraded
      ? this.toNeutralTones(primary.recommendedTones)
      : [...primary.recommendedTones];

    const styleRules = degraded
      ? [...primary.styleRules, DEGRADED_STYLE_RULE]
      : [...primary.styleRules];

    // S7 — versioning.
    const policyVersions: NichePolicyVersionRef[] = [
      primary,
      ...secondaries,
    ].map((p) => ({ niche: p.niche, version: p.version }));
    const resolvedVersion =
      policyVersions.map((p) => `${p.niche}@${p.version}`).join('+') +
      (degraded ? '|degraded' : '') +
      (fallbackUsed ? '|fallback' : '');

    return {
      // Kế thừa NichePolicy — mọi array là bản copy, không bao giờ trả reference
      // của policy đã đăng ký ra ngoài.
      niche: effectiveNiche,
      version: primary.version,
      description: primary.description,
      vocabularyHints,
      avoidPhrases,
      allowedSlang,
      recommendedTones,
      recommendedIntents: [...primary.recommendedIntents],
      safetyRules,
      safetyPatterns,
      styleRules,
      examples: primary.examples.map((example) => ({ ...example })),

      requestedPrimaryNiche: input.primaryNiche,
      appliedSecondaryNiches: secondaries.map((p) => p.niche),
      confidence,
      resolvedVersion,
      policyVersions,
      fallbackUsed,
      degraded,
      degradeReasons,
      provisional,
      contextVocabularyHints,
    };
  }

  /** Cầu nối 1 dòng cho orchestrator ở Phase 4. */
  resolveFromDetection(result: NicheDetectionResult): ResolvedNichePolicy {
    return this.resolve({
      primaryNiche: result.primaryNiche,
      secondaryNiches: result.secondaryNiches,
      confidence: result.confidence,
      needsGenerationTimeClassification:
        result.needsGenerationTimeClassification,
      evidence: result.evidence,
    });
  }

  /**
   * Giữ lại tone trung tính của niche; nếu niche chỉ có tone fandom (ví dụ
   * `football` → football_fan/funny_light/casual_supportive) thì giao vẫn còn
   * `casual_supportive`. Trường hợp giao rỗng mới rơi về toàn bộ NEUTRAL_TONES,
   * để field này không bao giờ rỗng.
   */
  private toNeutralTones(tones: Tone[]): Tone[] {
    const kept = tones.filter((tone) => NEUTRAL_TONES.includes(tone));
    return kept.length > 0 ? kept : [...NEUTRAL_TONES];
  }
}
