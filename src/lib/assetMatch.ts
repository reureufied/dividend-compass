// Utilities for fuzzy matching asset names (space-insensitive, case-insensitive)

export const normalizeAsset = (s: string): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, "").trim();

export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
};

export const similarity = (a: string, b: string): number => {
  const na = normalizeAsset(a);
  const nb = normalizeAsset(b);
  if (!na && !nb) return 1;
  const max = Math.max(na.length, nb.length);
  if (max === 0) return 1;
  return 1 - levenshtein(na, nb) / max;
};

/**
 * Find a likely "canonical" asset name from a list of existing names.
 * Returns the best match if its similarity ≥ threshold and it isn't an exact (normalized) match.
 */
export const findSimilarAsset = (
  candidate: string,
  existing: string[],
  threshold = 0.8
): string | null => {
  const nc = normalizeAsset(candidate);
  if (!nc) return null;
  let best: { name: string; score: number } | null = null;
  for (const name of existing) {
    const ne = normalizeAsset(name);
    if (!ne) continue;
    if (ne === nc && name === candidate) return null; // already exact same
    const score = similarity(candidate, name);
    if (!best || score > best.score) best = { name, score };
  }
  if (!best) return null;
  if (best.name === candidate) return null;
  if (normalizeAsset(best.name) === nc) return best.name; // space/case difference
  return best.score >= threshold ? best.name : null;
};
