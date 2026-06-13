export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function keywordScore(
  text: string,
  patterns: RegExp[],
  pointsPerMatch: number,
  base = 0,
): number {
  const matches = patterns.filter((pattern) => pattern.test(text)).length;
  return clampScore(base + matches * pointsPerMatch);
}

export function safeNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}
