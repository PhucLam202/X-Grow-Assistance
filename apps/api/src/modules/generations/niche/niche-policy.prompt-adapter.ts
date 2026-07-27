import type { ResolvedNichePolicy } from './niche-policy.interface';

/**
 * Nén một `ResolvedNichePolicy` thành đoạn instruction ngắn cho prompt sinh
 * candidate (Phase 4). Đây là ranh giới duy nhất giữa policy registry và prompt
 * — thêm niche mới không đụng file này.
 */
export interface NichePromptBudget {
  totalChars: number;
  vocabularyHints: number;
  avoidPhrases: number;
  allowedSlang: number;
  safetyRules: number;
  styleRules: number;
  examples: number;
  exampleFieldChars: number;
  itemChars: number;
}

/**
 * `totalChars = 2200` — con số đo được, không phải ước lượng.
 *
 * Render đủ 20 policy hiện có cho thấy: một niche đơn tốn 1434–1827 ký tự, ghép
 * thêm 2 secondary tốn 1954–2334. 2200 đặt ngay trên trần của trường hợp đơn,
 * nên niche đơn luôn giữ được cả examples; chỉ trường hợp ghép nhiều niche mới
 * phải nhả bớt, và thứ nhả đầu tiên đúng là example — phần trùng lặp nhiều nhất
 * với style rules. Tổng system prompt vẫn ~9 KB, cùng bậc với
 * `NICHE_INSTRUCTIONS` hiện tại (~7 KB template + ~1.3 KB entry giàu nhất).
 */
export const NICHE_PROMPT_BUDGET: NichePromptBudget = {
  totalChars: 2200,
  vocabularyHints: 16,
  avoidPhrases: 10,
  allowedSlang: 8,
  safetyRules: 8,
  styleRules: 8,
  examples: 2,
  exampleFieldChars: 160,
  itemChars: 80,
};

/**
 * Các bậc giảm, xếp theo mật độ thông tin trên mỗi ký tự: example đắt nhất và
 * trùng lặp nhiều nhất với style rules nên đi trước; `safetyRules` không bao giờ
 * có mặt ở đây.
 */
const REDUCTION_STEPS: Array<Partial<NichePromptBudget>> = [
  { examples: 1 },
  { examples: 0 },
  { allowedSlang: 4 },
  { allowedSlang: 0 },
  { vocabularyHints: 10 },
  { vocabularyHints: 6 },
  { styleRules: 5 },
  { avoidPhrases: 6 },
  { vocabularyHints: 3 },
];

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

function bulletList(items: string[], max: number, itemChars: number): string {
  return items
    .slice(0, max)
    .map((item) => `- ${truncate(item, itemChars)}`)
    .join('\n');
}

function inlineList(items: string[], max: number, itemChars: number): string {
  return items
    .slice(0, max)
    .map((item) => truncate(item, itemChars))
    .join(', ');
}

function render(
  resolved: ResolvedNichePolicy,
  budget: NichePromptBudget,
): string {
  const sections: string[] = [];

  const secondary = resolved.appliedSecondaryNiches;
  sections.push(
    `## NICHE POLICY: ${resolved.niche}` +
      (secondary.length > 0 ? `, secondary: ${secondary.join(', ')}` : ''),
  );

  sections.push(truncate(resolved.description, 240));

  if (resolved.provisional) {
    sections.push(
      `This niche is PROVISIONAL (confidence ${resolved.confidence.toFixed(2)}). ` +
        'If the post clearly belongs to a different community, use that ' +
        "community's voice instead and report the niche you chose. Avoid " +
        'community-specific slang and in-jokes.',
    );
  }

  // Không bao giờ bị giảm hoặc cắt — kể cả khi tổng vượt cap.
  sections.push(
    `SAFETY (non-negotiable):\n${bulletList(
      resolved.safetyRules,
      budget.safetyRules,
      Number.MAX_SAFE_INTEGER,
    )}`,
  );

  if (resolved.styleRules.length > 0 && budget.styleRules > 0) {
    sections.push(
      `STYLE:\n${bulletList(resolved.styleRules, budget.styleRules, budget.itemChars)}`,
    );
  }

  if (resolved.avoidPhrases.length > 0 && budget.avoidPhrases > 0) {
    sections.push(
      `NEVER OPEN WITH OR USE: ${inlineList(
        resolved.avoidPhrases,
        budget.avoidPhrases,
        budget.itemChars,
      )}`,
    );
  }

  sections.push(
    `TONE: ${resolved.recommendedTones.join(', ')}\n` +
      `INTENT: ${resolved.recommendedIntents.join(', ')}`,
  );

  if (resolved.vocabularyHints.length > 0 && budget.vocabularyHints > 0) {
    sections.push(
      `VOCABULARY THAT FITS: ${inlineList(
        resolved.vocabularyHints,
        budget.vocabularyHints,
        budget.itemChars,
      )}`,
    );
  }

  // Section biến mất hoàn toàn khi rỗng (degraded luôn cho slang rỗng).
  if (resolved.allowedSlang.length > 0 && budget.allowedSlang > 0) {
    sections.push(
      `SLANG YOU MAY USE: ${inlineList(
        resolved.allowedSlang,
        budget.allowedSlang,
        budget.itemChars,
      )}`,
    );
  }

  if (resolved.examples.length > 0 && budget.examples > 0) {
    const rendered = resolved.examples
      .slice(0, budget.examples)
      .map(
        (example) =>
          `Post: ${truncate(example.post, budget.exampleFieldChars)}\n` +
          `Good: ${truncate(example.goodReply, budget.exampleFieldChars)}\n` +
          `Bad: ${truncate(example.badReply, budget.exampleFieldChars)}\n` +
          `Why: ${truncate(example.reason, budget.exampleFieldChars)}`,
      )
      .join('\n\n');

    sections.push(`EXAMPLES:\n${rendered}`);
  }

  return sections.join('\n\n');
}

export function buildNichePolicyPrompt(
  resolved: ResolvedNichePolicy,
  budget: NichePromptBudget = NICHE_PROMPT_BUDGET,
): string {
  let current: NichePromptBudget = { ...budget };
  let output = render(resolved, current);

  for (const step of REDUCTION_STEPS) {
    if (output.length <= budget.totalChars) return output;
    current = { ...current, ...step };
    output = render(resolved, current);
  }

  if (output.length <= budget.totalChars) return output;

  // Bậc cuối: cắt cứng mọi section trừ header và SAFETY. Nếu riêng safety đã
  // vượt cap thì chuỗi trả về vẫn dài hơn cap — đó là hành vi đúng, an toàn
  // không bao giờ bị hy sinh cho ngân sách prompt.
  const separator = '\n\n';
  const sections = output.split(separator);
  const protectedCount = sections.findIndex((s) =>
    s.startsWith('SAFETY (non-negotiable):'),
  );
  const keep = sections.slice(0, protectedCount + 1);
  const rest = sections.slice(protectedCount + 1);

  // Trừ cả separator nối vào và ký tự `…` mà `truncate` thêm khi phải cắt —
  // thiếu hai khoản này thì kết quả vượt cap đúng 3 ký tự.
  const remaining =
    budget.totalChars - keep.join(separator).length - separator.length - 1;

  if (remaining <= 0) return keep.join(separator);

  return [...keep, truncate(rest.join(separator), remaining)].join(separator);
}

/** Delegate có chủ đích: hai code path cho cùng một con số sẽ lệch nhau. */
export function estimateNichePolicyPromptSize(
  resolved: ResolvedNichePolicy,
  budget: NichePromptBudget = NICHE_PROMPT_BUDGET,
): number {
  return buildNichePolicyPrompt(resolved, budget).length;
}
