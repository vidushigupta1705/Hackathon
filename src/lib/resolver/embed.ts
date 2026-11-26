/**
 * Deterministic, dependency-free embeddings for identifier-like input.
 *
 * Two feature spaces are built and combined:
 *   - word space: identifier words (camelCase / snake_case / path segments), lightly
 *     stemmed so plurals collapse, plus word bigrams
 *   - character space: padded 2/3/4-grams per word (typos, inflections) plus whole
 *     identifier n-grams (transpositions across a camel boundary)
 *
 * Each space is hashed into 256 dimensions and L2-normalised, then blended 68/32.
 * Hashing keeps storage trivial (a JSON array of numbers) and comparison is a dot
 * product. Nothing leaves the process: no API key, no model download, no network hop,
 * so a judge can add a label and see the next request use it immediately.
 */

export const EMBED_DIMS = 256;

/** Words that carry file-system or prose structure rather than domain meaning. */
const STRUCTURAL = new Set([
  "src",
  "lib",
  "dist",
  "build",
  "index",
  "module",
  "modules",
  "default",
  "export",
  "exports",
  "package",
  "packages",
  "json",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "the",
  "a",
  "an",
  "of",
  "to",
  "for",
  "and",
  "or",
  "if",
  "then",
  "what",
  "happens",
  "would",
  "will",
  "it",
  "this",
  "that",
  "is",
  "are",
  "be",
  "do",
  "does",
  "from",
  "with",
  "into",
  "on",
  "in",
  "please",
  "can",
  "you",
]);

function fnv1a(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Clean an input the way a human would before reading it: strip zero-width and control
 * characters, markdown backticks, wrapping quotes or brackets, and trailing
 * punctuation. Internal dots, slashes, `#`, `:` and `@` survive because they carry
 * meaning in qualified names and routes.
 */
export function normalizeQuery(raw: string): string {
  if (!raw) return "";
  let s = raw.normalize("NFKC");
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/[\u0000-\u001F\u007F]/g, " ");
  s = s.replace(/`/g, "");
  s = s.replace(/^\s*[>"'“”‘’([{<]+/, "");
  s = s.replace(/[>"'“”‘’)\]}>,;!?]+\s*$/, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Split `UserService.get` into ["user", "service", "get"]. */
function words(text: string): string[] {
  const spaced = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return spaced
    .split(/[^A-Za-z0-9$]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

/** Collapse plurals only — enough for `invoices` / `customers`, not a full stemmer. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function unit(vec: Float32Array): Float32Array {
  let length = 0;
  for (let i = 0; i < vec.length; i++) length += vec[i] * vec[i];
  length = Math.sqrt(length);
  if (length > 0) for (let i = 0; i < vec.length; i++) vec[i] /= length;
  return vec;
}

function addHashed(vec: Float32Array, key: string, weight: number) {
  const h = fnv1a(key);
  const index = h % EMBED_DIMS;
  const sign = (h >>> 31) === 0 ? 1 : -1;
  vec[index] += sign * weight;
}

function wordSpace(ws: string[]): Float32Array {
  const vec = new Float32Array(EMBED_DIMS);
  const seen = new Set<string>();
  const stems: string[] = [];
  for (const w of ws) {
    const s = stem(w);
    stems.push(s);
    if (seen.has(s)) continue;
    seen.add(s);
    addHashed(vec, `w:${s}`, STRUCTURAL.has(s) ? 0.28 : 1);
  }
  for (let i = 0; i + 1 < stems.length; i++) addHashed(vec, `b:${stems[i]}_${stems[i + 1]}`, 0.3);
  return unit(vec);
}

function charSpace(text: string, ws: string[]): Float32Array {
  const vec = new Float32Array(EMBED_DIMS);
  const seen = new Set<string>();
  for (const w of ws) {
    if (w.length < 3 || seen.has(w)) continue;
    seen.add(w);
    const padded = `^${w}$`;
    for (let n = 2; n <= 4; n++) {
      const weight = n === 2 ? 0.22 : n === 3 ? 0.36 : 0.3;
      for (let i = 0; i + n <= padded.length; i++) addHashed(vec, `w${n}:${padded.slice(i, i + n)}`, weight);
    }
  }
  const compact = text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 64);
  if (compact) {
    const padded = `^${compact}$`;
    for (let n = 3; n <= 4; n++) {
      const weight = n === 3 ? 0.16 : 0.12;
      for (let i = 0; i + n <= padded.length; i++) addHashed(vec, `i${n}:${padded.slice(i, i + n)}`, weight);
    }
  }
  return unit(vec);
}

export function embed(text: string): Float32Array {
  const normalized = normalizeQuery(text);
  const vec = new Float32Array(EMBED_DIMS);
  if (!normalized) return vec;
  const ws = words(normalized);
  const w = wordSpace(ws);
  const c = charSpace(normalized, ws);
  for (let i = 0; i < EMBED_DIMS; i++) vec[i] = w[i] * 0.68 + c[i] * 0.32;
  return unit(vec);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

export function roundVector(vec: Float32Array): number[] {
  return Array.from(vec, (x) => Math.round(x * 10000) / 10000);
}

/** The stable key a learned alias is stored under. */
export function aliasKey(raw: string): string {
  return normalizeQuery(raw).toLowerCase();
}
