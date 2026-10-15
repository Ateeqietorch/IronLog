// Exercise catalog: controlled vocabularies, name normalization, and
// exercise resolution (COACH-ENGINE-SPEC.md §3.1, §3.6).
//
// Identity rule: an exercise is its `id`, never its display name. Typed names
// resolve through exact id → exact alias → suggestions. There is no substring
// matching and nothing ever silently falls into an "Other" bucket.

export const MUSCLES = Object.freeze([
  "chest", "front-delts", "side-delts", "rear-delts", "lats", "upper-back",
  "traps", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes",
  "adductors", "calves", "abs", "lower-back",
]);

export const PATTERNS = Object.freeze([
  "horizontal-press", "incline-press", "vertical-press", "fly", "lateral-raise",
  "rear-delt", "vertical-pull", "horizontal-row", "pullover", "elbow-flexion",
  "elbow-extension", "squat-free", "squat-machine", "leg-press", "hip-hinge",
  "knee-flexion", "knee-extension", "hip-extension", "hip-adduction",
  "hip-abduction", "calf-raise", "trunk", "shrug",
]);

export const EQUIPMENT = Object.freeze([
  "barbell", "dumbbell", "cable", "machine-stack", "machine-plate", "smith",
  "bodyweight", "assisted", "band",
]);

export const LOAD_TYPES = Object.freeze([
  "plates", "stack", "dumbbell-pair", "dumbbell-single", "bodyweight-plus",
  "assisted", "fixed",
]);

export const STABILITY = Object.freeze(["high", "medium", "low"]);
export const K_CLASSES = Object.freeze(["upper-compound", "lower-free", "leg-press", "isolation"]);
export const SOURCES = Object.freeze(["seed", "free-exercise-db", "ai-lookup", "manual"]);

// Threshold below which a catalog entry isn't worth offering as "did you mean".
export const SUGGEST_MIN = 0.55;
// At or above this, the top suggestion is flagged `strong` (UI can preselect
// it), but it is still a question to the lifter, never a silent match.
export const STRONG_MATCH = 0.9;

// Words that change nothing about which exercise it is.
const FILLER = new Set(["the", "a", "an", "of", "with", "on", "machine's", "same", "time", "btw"]);

// Shorthand and spelling variants lifters actually type.
const SYNONYMS = {
  db: "dumbbell", dbs: "dumbbell", dumbell: "dumbbell", dumbells: "dumbbell",
  bb: "barbell", ez: "ez", "e-z": "ez",
  ohp: "overhead press", rdl: "romanian deadlift", rdls: "romanian deadlift",
  sldl: "stiff leg deadlift", ext: "extension", exts: "extension",
  tricep: "triceps", bicep: "biceps", tri: "triceps", bi: "biceps",
  pressdown: "pushdown", pulldowns: "pulldown", pullup: "pull up", pullups: "pull up",
  chinup: "chin up", chinups: "chin up", pushup: "push up", pushups: "push up",
    raises: "raise", curls: "curl", rows: "row", presses: "press", flyes: "fly",
  flys: "fly", flies: "fly", squats: "squat", lunges: "lunge", extensions: "extension",
  "1": "single", one: "single", "single-arm": "single arm", "single-leg": "single leg",
  sm: "smith", smithmachine: "smith",
  vbar: "v bar", "v-bar": "v bar",
  bw: "bodyweight",
};

const KEEP_S = new Set(["triceps", "biceps", "abs", "calves", "glutes", "quads", "lats", "delts", "hamstrings"]);
function singular(t) {
  if (KEEP_S.has(t)) return t;
  return t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
}

// Lowercase, strip punctuation, expand shorthand, singularize simple plurals,
// drop filler words. Token order is preserved; `nameKey` sorts tokens for
// order-insensitive comparison ("leg curl seated" == "seated leg curl").
export function normalizeName(name) {
  if (name == null) return "";
  const tokens = String(name)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .flatMap((t) => (SYNONYMS[t] ?? t).split(" "))
    .map((t) => t.replace(/-/g, " ")).join(" ").split(" ")
    .map(singular)
    .map((t) => SYNONYMS[t] ?? t)
    .filter((t) => t && !FILLER.has(t));
  return tokens.join(" ");
}

export function nameKey(name) {
  return normalizeName(name).split(" ").filter(Boolean).sort().join(" ");
}

export function slugify(name) {
  return normalizeName(name).replace(/\s+/g, "-").slice(0, 60) || "exercise";
}

// Sørensen–Dice coefficient on character bigrams of the order-insensitive key.
export function similarity(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s) => {
    const m = new Map();
    const t = ` ${s} `;
    for (let i = 0; i < t.length - 1; i++) {
      const g = t.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const gx = grams(x), gy = grams(y);
  let overlap = 0, nx = 0, ny = 0;
  for (const v of gx.values()) nx += v;
  for (const v of gy.values()) ny += v;
  for (const [g, v] of gx) overlap += Math.min(v, gy.get(g) ?? 0);
  return (2 * overlap) / (nx + ny);
}

// Build lookup indexes once per catalog. `catalog` is an array of records.
export function indexCatalog(catalog) {
  const byId = new Map();
  const byKey = new Map(); // nameKey(name or alias) -> id
  const conflicts = [];
  for (const ex of catalog) {
    if (byId.has(ex.id)) { conflicts.push({ type: "duplicate-id", id: ex.id }); continue; }
    byId.set(ex.id, ex);
  }
  // Names first so a curated name always beats another entry's alias.
  for (const pass of ["name", "alias"]) {
    for (const ex of byId.values()) {
      const labels = pass === "name" ? [ex.name] : (ex.aliases ?? []);
      for (const label of labels) {
        const k = nameKey(label);
        if (!k) continue;
        const prior = byKey.get(k);
        if (prior && prior !== ex.id) { conflicts.push({ type: `${pass}-collision`, key: k, ids: [prior, ex.id] }); continue; }
        byKey.set(k, ex.id);
      }
    }
  }
  return { byId, byKey, list: [...byId.values()], conflicts };
}

// Resolve a typed name to a catalog entry.
// Returns one of:
//   { match: record, via: "id" | "alias" }
//   { suggestions: [{ exercise, score }], strong: boolean }
//   { notFound: true }
export function resolveExercise(input, index, { limit = 3 } = {}) {
  const raw = String(input ?? "").trim();
  if (!raw) return { notFound: true };
  if (index.byId.has(raw)) return { match: index.byId.get(raw), via: "id" };
  const k = nameKey(raw);
  if (index.byKey.has(k)) return { match: index.byId.get(index.byKey.get(k)), via: "alias" };

  const scored = [];
  for (const ex of index.list) {
    let best = similarity(raw, ex.name);
    for (const a of ex.aliases ?? []) best = Math.max(best, similarity(raw, a));
    if (best >= SUGGEST_MIN) scored.push({ exercise: ex, score: Math.round(best * 1000) / 1000 });
  }
  scored.sort((a, b) => b.score - a.score || sourceRank(a.exercise) - sourceRank(b.exercise));
  if (!scored.length) return { notFound: true };
  return { suggestions: scored.slice(0, limit), strong: scored[0].score >= STRONG_MATCH };
}

function sourceRank(ex) {
  return { seed: 0, manual: 1, "ai-lookup": 2, "free-exercise-db": 3 }[ex.source] ?? 4;
}

// Map every distinct historical exercise string to an id (spec §11 step 1).
// `names` is [{ name, count }]; `decisions` is { [rawName]: id } from the
// lifter's review answers. Nothing unmatched is dropped — it goes to review.
export function mapHistoryNames(names, index, decisions = {}) {
  const mapped = [];
  const review = [];
  for (const { name, count = 0 } of names) {
    if (decisions[name] && index.byId.has(decisions[name])) {
      mapped.push({ name, count, id: decisions[name], via: "decision" });
      continue;
    }
    const r = resolveExercise(name, index);
    if (r.match) mapped.push({ name, count, id: r.match.id, via: r.via });
    else review.push({ name, count, suggestions: (r.suggestions ?? []).map((s) => ({ id: s.exercise.id, name: s.exercise.name, score: s.score })) });
  }
  review.sort((a, b) => b.count - a.count);
  return { mapped, review };
}

// Structural validation for a catalog record. Returns a list of problems
// (empty = valid). Used for seed data, AI lookups, and manual entries alike.
export function validateExercise(ex) {
  const p = [];
  if (!ex || typeof ex !== "object") return ["not an object"];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(ex.id ?? "")) p.push("id must be a lowercase slug");
  if (!ex.name) p.push("name required");
  if (!PATTERNS.includes(ex.pattern)) p.push(`unknown pattern: ${ex.pattern}`);
  if (!EQUIPMENT.includes(ex.equipment)) p.push(`unknown equipment: ${ex.equipment}`);
  if (!LOAD_TYPES.includes(ex.loadType)) p.push(`unknown loadType: ${ex.loadType}`);
  if (typeof ex.unilateral !== "boolean") p.push("unilateral must be boolean");
  const c = ex.contributions ?? {};
  const entries = Object.entries(c);
  if (!entries.length) p.push("contributions required");
  for (const [m, v] of entries) {
    if (!MUSCLES.includes(m)) p.push(`unknown muscle: ${m}`);
    if (!(v > 0 && v <= 1)) p.push(`contribution out of range: ${m}=${v}`);
  }
  if (entries.length && !entries.some(([, v]) => v === 1)) p.push("needs one prime mover at 1.0");
  if (!(ex.lengthenedBias >= 0 && ex.lengthenedBias <= 1)) p.push("lengthenedBias must be 0–1");
  if (!STABILITY.includes(ex.stability)) p.push(`unknown stability: ${ex.stability}`);
  if (!K_CLASSES.includes(ex.kClass)) p.push(`unknown kClass: ${ex.kClass}`);
  const r = ex.defaultRepRange;
  if (!Array.isArray(r) || r.length !== 2 || !(r[0] >= 1 && r[1] >= r[0])) p.push("defaultRepRange must be [lo, hi]");
  if (!SOURCES.includes(ex.source)) p.push(`unknown source: ${ex.source}`);
  return p;
}

// Primary muscle(s): every muscle at 1.0.
export function primaryMuscles(ex) {
  return Object.entries(ex.contributions ?? {}).filter(([, v]) => v >= 1).map(([m]) => m);
}

// Fractional credit for a muscle from one hard set of this exercise.
export function credit(ex, muscle) {
  return ex.contributions?.[muscle] ?? 0;
}

// Merge catalog sources. Earlier lists win on id collisions, so pass them in
// precedence order: the lifter's own sheet entries (manual / AI lookups),
// then curated seed, then free-exercise-db.
export function mergeCatalogs(...lists) {
  const byId = new Map();
  for (const list of lists) for (const ex of list ?? []) if (!byId.has(ex.id)) byId.set(ex.id, ex);
  return [...byId.values()];
}
