import type { NicheSafetyPattern } from '../niche/niche-policy.interface';

/**
 * Safety áp cho MỌI niche, không phụ thuộc policy nào.
 *
 * Lý do tồn tại: chỉ 4 niche rủi ro cao có `safetyPatterns` riêng, nhưng một
 * reply hứa lợi nhuận hay dụ DM thì hỏng ở bất kỳ niche nào — kể cả `food` hay
 * `music`. Đây là tầng dưới cùng, luôn chạy.
 *
 * Id dùng prefix `global.` (không phải `<niche>.`), nên chúng KHÔNG đi qua
 * `validateNichePolicy` — validator đó chỉ soi pattern do policy sở hữu.
 */
export const GLOBAL_SAFETY_PATTERNS: readonly NicheSafetyPattern[] = [
  {
    id: 'global.guaranteed_money',
    pattern:
      /\b(?:guaranteed|risk[-\s]?free|100%\s*safe)\b(?=[^.!?]*\b(?:returns?|profits?|income|money|gains?)\b)/i,
    reason: 'Promises guaranteed money or risk-free returns.',
    severity: 'reject',
  },
  {
    id: 'global.medical_claim',
    pattern:
      /\b(?:cures?|heals?|reverses?|treats?)\b(?=[^.!?]*\b(?:cancer|diabetes|covid|autism|depression|infertility)\b)/i,
    reason: 'Makes a medical treatment claim.',
    severity: 'reject',
  },
  {
    id: 'global.contact_solicitation',
    pattern:
      /\b(?:dm me|pm me|message me|check my (?:bio|profile|pinned)|link in (?:bio|my bio)|whatsapp|telegram me)\b/i,
    reason: 'Solicits contact or drives traffic off the thread.',
    severity: 'reject',
  },
  {
    id: 'global.impersonation',
    pattern:
      /\b(?:as (?:an? )?(?:official|verified|certified)\b|i (?:work|speak) for\b|on behalf of\b)/i,
    reason: 'Claims an official capacity the user does not have.',
    severity: 'reject',
  },
  {
    id: 'global.ai_self_disclosure',
    pattern: /\b(?:as an ai|as a language model|i'?m an ai|i am an ai)\b/i,
    reason: 'Breaks character as an AI assistant.',
    severity: 'reject',
  },
  {
    id: 'global.slur_adjacent_hostility',
    pattern:
      /\b(?:idiot|moron|stupid|clown|trash|garbage)\b(?=[^.!?]*\b(?:you|your|he|she|they)\b)|\b(?:you'?re|your)\s+(?:an?\s+)?(?:idiot|moron|clown|joke)\b/i,
    reason: 'Attacks the poster instead of engaging the post.',
    severity: 'reject',
  },
  {
    id: 'global.absolute_certainty',
    pattern: /\b(?:this will definitely|there'?s no way this|100% certain)\b/i,
    reason: 'States certainty the context does not support.',
    severity: 'penalty',
  },
];
