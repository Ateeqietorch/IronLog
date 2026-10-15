// Builds engine/seed/free-exercise-db.js from the public-domain (Unlicense)
// free-exercise-db: https://github.com/yuhonas/free-exercise-db
//
// Usage: node scripts/build-seed.js <path/to/exercises.json>
// Download the source first:
//   curl -o exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
//
// Mapping (COACH-ENGINE-SPEC.md §3.1): primary muscles → 1.0, secondary →
// 0.5, mapped into IronLog's muscle vocabulary. Movement pattern is inferred
// from the name; anything that can't be classified, isn't a strength
// exercise, or duplicates a curated entry is left out. These records are
// lower-confidence (0.6) than curated ones and rank below them in search.
import { readFileSync, writeFileSync } from "node:fs";
import { nameKey, normalizeName, slugify, validateExercise } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";

const src = process.argv[2];
if (!src) { console.error("usage: node scripts/build-seed.js <exercises.json>"); process.exit(1); }
const raw = JSON.parse(readFileSync(src, "utf8"));

const MUSCLE = {
  quadriceps: "quads", hamstrings: "hamstrings", glutes: "glutes", calves: "calves",
  chest: "chest", triceps: "triceps", biceps: "biceps", lats: "lats",
  "middle back": "upper-back", traps: "traps", "lower back": "lower-back",
  forearms: "forearms", adductors: "adductors", abductors: "glutes", abdominals: "abs",
  shoulders: "SHOULDER", // resolved by pattern below
};

const has = (n, ...words) => words.some((w) => n.includes(w));

function inferPattern(n, primary, equipment) {
  if (has(n, "calf", "calves")) return "calf-raise";
  if (has(n, "shrug")) return "shrug";
  if (has(n, "wrist", "finger", "neck")) return null;
  if (has(n, "pullover")) return "pullover";
  if (has(n, "face pull", "rear delt", "reverse fly", "reverse flye", "reverse machine fly", "back fly", "back flye", "bent over lateral", "bent-over lateral")) return "rear-delt";
  if (has(n, "fly", "flye", "crossover", "pec deck", "butterfly")) return "fly";
  if (has(n, "lateral raise", "side raise", "upright row", "front raise", "side lateral")) return "lateral-raise";
  if (has(n, "leg curl", "hamstring curl", "glute ham", "nordic")) return "knee-flexion";
  if (has(n, "curl")) return primary.includes("hamstrings") ? "knee-flexion" : "elbow-flexion";
  if (has(n, "leg extension")) return "knee-extension";
  if (has(n, "pushdown", "pressdown", "skull", "triceps extension", "tricep extension", "triceps kickback", "tricep kickback")) return "elbow-extension";
  if (primary.includes("triceps") && has(n, "extension", "kickback")) return "elbow-extension";
  if (has(n, "leg press")) return "leg-press";
  if (has(n, "hack squat")) return "squat-machine";
  if (has(n, "adduct")) return "hip-adduction";
  if (has(n, "abduct")) return "hip-abduction";
  if (has(n, "squat", "lunge", "step-up", "step up", "split squat")) return equipment === "smith" || equipment === "machine-stack" ? "squat-machine" : "squat-free";
  if (has(n, "deadlift", "good morning", "romanian", "rdl")) return "hip-hinge";
  if (has(n, "hip thrust", "glute bridge", "bridge", "hyperextension", "back extension", "kickback", "pull through", "pull-through")) return "hip-extension";
  if (has(n, "pulldown", "pull-down", "pull-up", "pullup", "chin-up", "chinup", "chin up", "pull up")) return "vertical-pull";
  if (has(n, "row")) return "horizontal-row";
  if (has(n, "crunch", "sit-up", "situp", "plank", "leg raise", "knee raise", "russian twist", "ab roller", "rollout", "woodchop", "jackknife")) return "trunk";
  if (primary.includes("abdominals")) return "trunk";
  if (has(n, "incline") && has(n, "press", "bench")) return "incline-press";
  if (has(n, "shoulder press", "overhead press", "military", "arnold", "push press", "seated press", "standing press")) return "vertical-press";
  if (has(n, "bench", "press", "push-up", "pushup", "push up", "dip")) return primary.includes("shoulders") ? "vertical-press" : "horizontal-press";
  return null;
}

function equipmentOf(e, n) {
  if (has(n, "smith")) return ["smith", "plates"];
  switch (e.equipment) {
    case "barbell": case "e-z curl bar": return ["barbell", "plates"];
    case "dumbbell": return ["dumbbell", has(n, "one arm", "one-arm", "single arm", "single-arm") ? "dumbbell-single" : "dumbbell-pair"];
    case "kettlebells": return ["dumbbell", "dumbbell-single"];
    case "cable": return ["cable", "stack"];
    case "machine": return has(n, "leg press", "hack", "plate", "lever", "t-bar") ? ["machine-plate", "plates"] : ["machine-stack", "stack"];
    case "body only": return ["bodyweight", "bodyweight-plus"];
    case "bands": return ["band", "fixed"];
    default: return null;
  }
}

const STAB = { barbell: "low", dumbbell: "low", cable: "medium", "machine-stack": "high", "machine-plate": "high", smith: "high", bodyweight: "medium", band: "medium" };

const curatedKeys = new Set(CURATED.flatMap((c) => [c.name, ...(c.aliases ?? [])].map(nameKey)));
const out = [];
const seen = new Set();
const skipped = { category: 0, equipment: 0, pattern: 0, muscles: 0, duplicate: 0, invalid: 0 };

for (const e of raw) {
  if (!["strength", "powerlifting"].includes(e.category)) { skipped.category++; continue; }
  const n = normalizeName(e.name) + " ";
  const eq = equipmentOf(e, n);
  if (!eq) { skipped.equipment++; continue; }
  const pattern = inferPattern(n, e.primaryMuscles, eq[0]);
  if (!pattern) { skipped.pattern++; continue; }

  const delt = pattern === "lateral-raise" ? "side-delts" : pattern === "rear-delt" ? "rear-delts" : "front-delts";
  const contributions = {};
  const add = (m, v) => {
    const k = MUSCLE[m] === "SHOULDER" ? delt : MUSCLE[m];
    if (k) contributions[k] = Math.max(contributions[k] ?? 0, v);
  };
  e.primaryMuscles.forEach((m) => add(m, 1));
  e.secondaryMuscles.forEach((m) => add(m, 0.5));
  if (!Object.values(contributions).includes(1)) { skipped.muscles++; continue; }

  const key = nameKey(e.name);
  if (curatedKeys.has(key) || seen.has(key)) { skipped.duplicate++; continue; }
  seen.add(key);

  const compound = e.mechanic === "compound";
  const kClass = ["leg-press", "squat-machine"].includes(pattern) ? "leg-press"
    : ["squat-free", "hip-hinge"].includes(pattern) || (pattern === "hip-extension" && compound) ? "lower-free"
    : compound && ["horizontal-press", "incline-press", "vertical-press", "vertical-pull", "horizontal-row"].includes(pattern) ? "upper-compound"
    : "isolation";

  const rec = {
    id: "fedb-" + slugify(e.name),
    name: e.name,
    pattern,
    equipment: eq[0],
    loadType: eq[1],
    unilateral: has(n, "one arm", "one-arm", "single arm", "single-arm", "one leg", "single leg", "unilateral", "lunge", "split squat", "step up", "step-up", "alternating"),
    contributions,
    aliases: [],
    lengthenedBias: 0.5,
    stability: STAB[eq[0]],
    kClass,
    defaultRepRange: kClass === "isolation" ? [10, 15] : [6, 12],
    source: "free-exercise-db",
    confidence: 0.6,
  };
  if (eq[1] === "bodyweight-plus") rec.bwFraction = 0.65;
  if (validateExercise(rec).length) { skipped.invalid++; continue; }
  out.push(rec);
}

out.sort((a, b) => a.id.localeCompare(b.id));
const header = `// GENERATED by scripts/build-seed.js from free-exercise-db (Unlicense,
// https://github.com/yuhonas/free-exercise-db). Do not edit by hand.
// ${out.length} strength exercises; curated entries (seed/curated.js) take precedence.
`;
writeFileSync(new URL("../engine/seed/free-exercise-db.js", import.meta.url),
  header + "export const FREE_EXERCISE_DB = " + JSON.stringify(out) + ";\n");
console.log(`wrote ${out.length} exercises; skipped`, skipped);
