import { DEFAULT_NICHE, NICHES, isNiche } from '../types/niche.types';
import type { Niche } from '../types/niche.types';
import type { NicheSignalDefinition } from './niche.types';
import { DEFAULT_NICHE_SIGNALS } from './signals';

/**
 * Open registry: niches can be registered at any time, including after ship,
 * without touching the cascade services. Mirrors the shape Phase 3 uses for
 * niche policies.
 */
const registry = new Map<Niche, NicheSignalDefinition>();

export function registerNicheSignals(definition: NicheSignalDefinition): void {
  registry.set(definition.niche, definition);
}

export function getNicheSignals(
  niche: Niche,
): NicheSignalDefinition | undefined {
  return registry.get(niche);
}

export function getAllNicheSignals(): NicheSignalDefinition[] {
  return [...registry.values()];
}

export function getRegisteredNiches(): Niche[] {
  return [...registry.keys()];
}

/** Restores the built-in set. Test-only escape hatch after ad-hoc registration. */
export function resetNicheSignals(): void {
  registry.clear();
  DEFAULT_NICHE_SIGNALS.forEach(registerNicheSignals);
}

/** Empties the registry entirely. Test-only — pair with `resetNicheSignals`. */
export function clearNicheSignals(): void {
  registry.clear();
}

/**
 * Structured validation of the registry. Returns a list of problems so callers
 * can decide whether to throw (bootstrap) or just assert (tests).
 *
 * `general` is intentionally excluded: it is the fallback niche and has no
 * keyword vocabulary of its own.
 */
export function validateNicheSignalRegistry(): string[] {
  const problems: string[] = [];

  for (const niche of NICHES) {
    if (niche === DEFAULT_NICHE) continue;
    if (!registry.has(niche)) {
      problems.push(`Niche "${niche}" has no registered signals.`);
    }
  }

  for (const definition of registry.values()) {
    const { niche } = definition;

    if (!isNiche(niche)) {
      problems.push(`Registered signals for unknown niche "${String(niche)}".`);
      continue;
    }
    if (!definition.version) {
      problems.push(`Niche "${niche}" signals are missing a version.`);
    }
    if (definition.strong.length === 0) {
      problems.push(`Niche "${niche}" has no strong signals.`);
    }
    for (const pattern of [...definition.strong, ...definition.weak]) {
      if (pattern.pattern.global) {
        problems.push(
          `Niche "${niche}" pattern "${pattern.label}" uses the g flag; ` +
            'lastIndex would leak between calls.',
        );
      }
    }
  }

  return problems;
}

DEFAULT_NICHE_SIGNALS.forEach(registerNicheSignals);
