import type { ScoredCandidate } from '../scoring/scoring.types';
import type { SuggestionDto } from '../dto/reply-pack-response.dto';
import type { CandidatePenalty } from '../validation/validation.types';

/**
 * `ScoredCandidate` (Phase 6, thang 0–1) → `SuggestionDto` (contract Phase 1,
 * thang 0–100).
 *
 * Vì sao giữ nguyên shape `score` cũ thay vì thay bằng `scores` mới: extension
 * đọc `s.score.total` như một field bắt buộc và render `{s.score.total}/100`
 * (`apps/extension/src/sidepanel/App.tsx`). Đổi shape là làm vỡ client đang chạy.
 * `scores` mới được thêm BÊN CẠNH, để client sau này dùng thang 0–1 đầy đủ.
 *
 * Bản đồ giữa hai bộ tên (bộ cũ không có empathy/conversation, bộ mới không có
 * visibility):
 *   total         ← finalScore
 *   postFit       ← postFit
 *   specificity   ← specificity
 *   native        ← naturalness
 *   engagementHook← conversationPotential
 *   visibility    ← nicheFit   (đúng giọng cộng đồng là thứ quyết định reply có
 *                               được nhìn thấy trong niche đó hay không)
 */
export function toSuggestionDto(
  candidate: ScoredCandidate,
  index: number,
  options: { generationRunId: string; penalties: CandidatePenalty[] },
): SuggestionDto {
  const { scores } = candidate;

  return {
    suggestionId: `${options.generationRunId}-${index + 1}`,
    text: candidate.text,
    ...(candidate.meaning ? { meaningVi: candidate.meaning } : {}),
    ...(candidate.scoreReasons.length > 0
      ? { whyItWorks: candidate.scoreReasons[0] }
      : {}),
    score: {
      total: toPercent(scores.finalScore),
      postFit: toPercent(scores.postFit),
      visibility: toPercent(scores.nicheFit),
      specificity: toPercent(scores.specificity),
      native: toPercent(scores.naturalness),
      engagementHook: toPercent(scores.conversationPotential),
    },
    scores: {
      postFit: scores.postFit,
      specificity: scores.specificity,
      naturalness: scores.naturalness,
      nicheFit: scores.nicheFit,
      empathyFit: scores.empathyFit,
      conversationPotential: scores.conversationPotential,
      safetyScore: scores.safetyScore,
      userStyleFit: scores.userStyleFit,
      ruleScore: scores.ruleScore,
      ...(scores.modelSelfScore === undefined
        ? {}
        : { modelSelfScore: scores.modelSelfScore }),
      finalScore: scores.finalScore,
      scoringMethod: candidate.scoringMethod,
    },
    risk: resolveRisk(candidate, options.penalties),
    tone: candidate.tone,
    niche: candidate.niche,
    intent: candidate.intent,
    length: candidate.length,
    energy: candidate.energy,
    referencedConcept: candidate.referencedConcept,
  };
}

/**
 * `high` không bao giờ xuất hiện: candidate vi phạm safety cứng đã bị Phase 5
 * loại, nên thứ tệ nhất còn sót lại là một cờ mềm. Extension chặn nút copy khi
 * `risk === 'high'`, và chặn một reply đã qua toàn bộ safety filter là sai.
 */
function resolveRisk(
  candidate: ScoredCandidate,
  penalties: CandidatePenalty[],
): 'low' | 'medium' | 'high' {
  const hasSoftSafetyFlag = penalties.some(
    (penalty) =>
      penalty.candidateId === candidate.id && penalty.code.includes('safety'),
  );

  return hasSoftSafetyFlag || candidate.scores.safetyScore < 1
    ? 'medium'
    : 'low';
}

function toPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}
