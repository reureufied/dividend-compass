// Utilities for fuzzy matching asset names (space-insensitive, case-insensitive)

/**
 * Normalize OCR'd asset names: replace verbose Korean ETF suffixes with "ETF".
 * Handles variations with spaces, punctuation, e.g. "증권상장지수투자신탁",
 * "증권 상장 지수 투자 신탁", with optional trailing 제N호/주식형/혼합형 etc.
 */
export const cleanAssetName = (s: string): string => {
  if (!s) return s;
  let out = s
    // remove spaces between the 6 chars of 증권상장지수투자신탁
    .replace(/증\s*권\s*상\s*장\s*지\s*수\s*투\s*자\s*신\s*탁/g, "ETF");
  // strip trailing fund-class noise like "제1호", "(주식)", "(주식-파생형)"
  out = out.replace(/\s*제\s*\d+\s*호/g, "");
  return out.replace(/\s{2,}/g, " ").trim();
};

export const normalizeAsset = (s: string): string =>
  cleanAssetName(s ?? "").toLowerCase().replace(/\s+/g, "").trim();

// Known Korean asset-management issuer prefixes that often appear before the brand
const ISSUER_PREFIXES = [
  "한국투자", "미래에셋", "삼성", "kb", "신한", "nh아문디", "nh", "키움", "한화",
  "하나", "교보", "우리", "흥국", "메리츠", "현대", "디비", "유진", "타임폴리오",
  "에셋플러스", "트러스톤", "브이아이", "이스트스프링", "kim",
];

// Strip parentheses content (e.g. "(H)", "(합성)"), issuer prefix, and whitespace
export const coreAssetName = (s: string): string => {
  let n = normalizeAsset(s).replace(/\([^)]*\)/g, "");
  for (const p of ISSUER_PREFIXES) {
    if (n.startsWith(p)) { n = n.slice(p.length); break; }
  }
  return n.trim();
};

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

const ratio = (a: string, b: string): number => {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
};

export const similarity = (a: string, b: string): number => {
  const base = ratio(normalizeAsset(a), normalizeAsset(b));
  const ca = coreAssetName(a);
  const cb = coreAssetName(b);
  const core = ca && cb ? ratio(ca, cb) : 0;
  let contain = 0;
  if (ca && cb) {
    const [shorter, longer] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
    if (shorter.length >= 4 && longer.includes(shorter)) {
      contain = shorter.length / longer.length;
    }
  }
  return Math.max(base, core, contain);
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
