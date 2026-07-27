import { GLOBAL_BANNED_OPENERS } from '../candidates/candidate-prompt.builder';
import type { GeneratedCandidate } from '../candidates/candidate.types';
import type { CandidatePenalty, RejectReason } from './validation.types';
import {
  containsPhrase,
  openingWords,
  startsWithPhrase,
} from './text-normalizer';

export interface ClicheDetectionInput {
  candidates: GeneratedCandidate[];
  /** `ResolvedNichePolicy.avoidPhrases` — đã merge primary + secondary. */
  policyAvoidPhrases: string[];
  userBlockedPhrases: string[];
}

export interface ClicheDetectionResult {
  /** candidateId → lý do reject. */
  rejects: Map<string, RejectReason[]>;
  penalties: CandidatePenalty[];
  /** Quá nửa batch mở đầu giống nhau. */
  batchOpenerRepeated: boolean;
}

/**
 * Ngưỡng cho rule batch của doc Phase 5 ("mở đầu bằng 'I think' ở >50%
 * candidate cùng batch").
 */
const BATCH_OPENER_SHARE = 0.5;

/**
 * Bộ dò giọng "synthetic AI".
 *
 * Ba mức, có chủ đích khác nhau:
 *   - user blocked phrase → reject ở bất kỳ vị trí nào. Người dùng đã nói cấm.
 *   - banned opener (global + policy) ở ĐẦU câu → reject. Đây là chỗ giọng AI
 *     lộ ra rõ nhất, và prompt đã cấm tường minh.
 *   - cùng cụm đó nhưng nằm GIỮA câu → penalty. "This is so true, though the
 *     40-minute window is the part that matters" vẫn là một reply có nội dung;
 *     loại nó đi thì mất candidate mà không được gì.
 *   - quá nửa batch mở đầu giống nhau → penalty cho những cái trùng, KHÔNG
 *     reject. Reject sẽ xoá gần hết batch rồi kéo theo một retry mà nguyên nhân
 *     thật (prompt/model đang lặp) không được sửa.
 *
 * Nguồn cụm lấy từ `GLOBAL_BANNED_OPENERS` của Phase 4 — đúng như comment ở đó
 * dặn: "Export để Phase 5 lọc trên cùng một nguồn thay vì tự dựng danh sách thứ
 * hai rồi lệch nhau."
 */
export function detectCliches(
  input: ClicheDetectionInput,
): ClicheDetectionResult {
  const rejects = new Map<string, RejectReason[]>();
  const penalties: CandidatePenalty[] = [];

  const bannedOpeners = [
    ...new Set([...GLOBAL_BANNED_OPENERS, ...input.policyAvoidPhrases]),
  ];

  for (const candidate of input.candidates) {
    const blocked = input.userBlockedPhrases.find((phrase) =>
      containsPhrase(candidate.text, phrase),
    );

    if (blocked) {
      push(rejects, candidate.id, {
        code: 'user_blocked_phrase',
        detail: `Contains the phrase "${blocked}" which the user blocked.`,
      });
      continue;
    }

    const opener = bannedOpeners.find((phrase) =>
      startsWithPhrase(candidate.text, phrase),
    );

    if (opener) {
      push(rejects, candidate.id, {
        code: 'cliche_opener',
        detail: `Opens with the banned phrase "${opener}".`,
      });
      continue;
    }

    const midSentence = bannedOpeners.find((phrase) =>
      containsPhrase(candidate.text, phrase),
    );

    if (midSentence) {
      penalties.push({
        candidateId: candidate.id,
        code: 'cliche_phrase',
        detail: `Uses the clichéd phrase "${midSentence}" mid-sentence.`,
      });
    }
  }

  const batchOpenerRepeated = flagRepeatedOpeners(
    input.candidates,
    rejects,
    penalties,
  );

  return { rejects, penalties, batchOpenerRepeated };
}

function flagRepeatedOpeners(
  candidates: GeneratedCandidate[],
  rejects: Map<string, RejectReason[]>,
  penalties: CandidatePenalty[],
): boolean {
  // Candidate đã bị reject không tính vào mẫu: một batch 4 cái mà 2 cái bị loại
  // vì opener sáo rỗng thì "2/2 cái còn lại mở giống nhau" là 100% của một mẫu
  // quá nhỏ để kết luận.
  const surviving = candidates.filter((c) => !rejects.has(c.id));
  if (surviving.length < 3) return false;

  const groups = new Map<string, string[]>();

  for (const candidate of surviving) {
    const opening = openingWords(candidate.text);
    if (!opening) continue;
    groups.set(opening, [...(groups.get(opening) ?? []), candidate.id]);
  }

  let repeated = false;

  for (const [opening, ids] of groups) {
    if (ids.length / surviving.length <= BATCH_OPENER_SHARE) continue;

    repeated = true;
    for (const id of ids) {
      penalties.push({
        candidateId: id,
        code: 'batch_opener_repetition',
        detail: `More than half of the batch opens with "${opening}".`,
      });
    }
  }

  return repeated;
}

function push(
  map: Map<string, RejectReason[]>,
  id: string,
  reason: RejectReason,
): void {
  map.set(id, [...(map.get(id) ?? []), reason]);
}
