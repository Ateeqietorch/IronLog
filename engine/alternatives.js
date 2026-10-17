// Ranked replacements for an exercise (COACH-ENGINE-SPEC.md §6.1).
// Same movement pattern and the same muscles count most; exercises you have
// history on rank higher because the coach can give exact numbers for them
// straight away. Long-length bias breaks ties (research §2.7).
import { normalizeName, similarity } from "./catalog.js";

function cosine(a = {}, b = {}) {
  let dot = 0, na = 0, nb = 0;
  for (const [m, v] of Object.entries(a)) { na += v * v; dot += v * (b[m] ?? 0); }
  for (const v of Object.values(b)) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const hasHistory = (models, id) => ["both", "L", "R"].some((s) => models?.[`${id}|${s}`]?.logE1rm != null);

export function rankAlternatives(ex, list, { models = {}, exclude = [], limit = 12 } = {}) {
  if (!ex) return [];
  const skip = new Set([ex.id, ...exclude]);
  return list
    .filter((c) => !skip.has(c.id))
    .map((c) => {
      const overlap = cosine(ex.contributions, c.contributions);
      const samePattern = c.pattern === ex.pattern;
      const known = hasHistory(models, c.id);
      const score = (samePattern ? 3 : 0) + 2 * overlap + (known ? 0.6 : 0)
        + (c.source === "free-exercise-db" ? -0.6 : 0) + 0.3 * (c.lengthenedBias ?? 0.5);
      return { ex: c, score, overlap, samePattern, known };
    })
    .filter((r) => r.samePattern || r.overlap >= 0.5)
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name))
    .slice(0, limit);
}

// Free-text search across one or more exercise lists (deduped by id).
export function searchExercises(query, lists, { models = {}, limit = 20 } = {}) {
  const q = normalizeName(query);
  if (!q) return [];
  const words = q.split(" ").filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const c of list) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const names = [c.name, ...(c.aliases ?? [])].map(normalizeName);
      const allWords = names.some((n) => words.every((w) => n.includes(w)));
      const sim = Math.max(...names.map((n) => similarity(n, q)));
      if (!allWords && sim < 0.45) continue;
      const score = (allWords ? 1 : 0) + sim + (hasHistory(models, c.id) ? 0.3 : 0) + (c.source === "free-exercise-db" ? -0.2 : 0);
      out.push({ ex: c, score, known: hasHistory(models, c.id) });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
