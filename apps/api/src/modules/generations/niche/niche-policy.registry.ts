import type { Niche } from '../types/niche.types';
import type { NichePolicy } from './niche-policy.interface';
import { DEFAULT_NICHE_POLICIES } from './policies';

/**
 * Open registry cho niche policy: đăng ký được bất kỳ lúc nào, kể cả sau khi
 * ship, mà không đụng resolver/prompt adapter/orchestrator.
 *
 * Khác `signal-registry.ts` một điểm có chủ đích: đăng ký trùng bị REJECT thay
 * vì ghi đè im lặng (doc Phase 3, test case 3). Ghi đè im lặng ở signal registry
 * thì vô hại, nhưng ở đây nó sẽ âm thầm đổi cả giọng lẫn safety rules của một
 * niche — dạng lỗi không ai phát hiện được cho tới khi đọc output. Muốn thay
 * thật thì phải nói ra: `{ override: true }`.
 */
const registry = new Map<Niche, NichePolicy>();

export class NichePolicyRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NichePolicyRegistrationError';
  }
}

export interface RegisterNichePolicyOptions {
  /** Thay policy đang có thay vì throw. */
  override?: boolean;
}

export function registerNichePolicy(
  policy: NichePolicy,
  options?: RegisterNichePolicyOptions,
): void {
  const existing = registry.get(policy.niche);

  if (existing && !options?.override) {
    throw new NichePolicyRegistrationError(
      `Niche policy "${policy.niche}" is already registered ` +
        `(version ${existing.version}). Pass { override: true } to replace it.`,
    );
  }

  registry.set(policy.niche, policy);
}

export function getNichePolicy(niche: Niche): NichePolicy | undefined {
  return registry.get(niche);
}

export function getAllNichePolicies(): NichePolicy[] {
  return [...registry.values()];
}

export function getRegisteredPolicyNiches(): Niche[] {
  return [...registry.keys()];
}

export function hasNichePolicy(niche: Niche): boolean {
  return registry.has(niche);
}

/** Khôi phục bộ mặc định. Test-only escape hatch sau khi đăng ký ad-hoc. */
export function resetNichePolicies(): void {
  registry.clear();
  DEFAULT_NICHE_POLICIES.forEach((policy) => registerNichePolicy(policy));
}

/** Xoá sạch registry. Test-only — luôn đi kèm `resetNichePolicies`. */
export function clearNichePolicies(): void {
  registry.clear();
}

// ⚠️ Phải là arrow, không phải `.forEach(registerNichePolicy)`: `forEach` truyền
// (value, index, array) nên `index` sẽ rơi vào slot `options`.
DEFAULT_NICHE_POLICIES.forEach((policy) => registerNichePolicy(policy));
