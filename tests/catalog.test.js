import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName, nameKey, similarity, indexCatalog, resolveExercise,
  mapHistoryNames, validateExercise, MUSCLES, PATTERNS,
} from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";

const index = indexCatalog(CURATED);

test("normalizeName expands shorthand, singularizes, drops punctuation", () => {
  assert.equal(normalizeName("Incline DB Press"), "incline dumbbell press");
  assert.equal(normalizeName("Tricep Rope Pushdowns"), "triceps rope pushdown");
  assert.equal(normalizeName("V Bar Pressdown"), "v bar pushdown");
  assert.equal(normalizeName("  Leg Curl (Lying) "), "leg curl lying");
  assert.equal(normalizeName("Single-Arm DB Row"), "single arm dumbbell row");
});

test("nameKey is order-insensitive", () => {
  assert.equal(nameKey("Leg Curl (Seated)"), nameKey("Seated leg curl"));
});

test("similarity is 1 for equivalent names and low for different exercises", () => {
  assert.equal(similarity("Lying Leg Curl", "Leg Curl (Lying)"), 1);
  assert.ok(similarity("Seated leg curl", "Lying leg curl") < 0.9);
  assert.ok(similarity("Hack squat", "Leg extension") < 0.4);
});

test("every curated record is valid, uses the vocabularies, and ids/names don't collide", () => {
  for (const ex of CURATED) assert.deepEqual(validateExercise(ex), [], ex.id);
  assert.deepEqual(index.conflicts, []);
  const used = new Set(CURATED.flatMap((e) => Object.keys(e.contributions)));
  for (const m of used) assert.ok(MUSCLES.includes(m), m);
  for (const e of CURATED) assert.ok(PATTERNS.includes(e.pattern), e.pattern);
});

test("resolve: exact id, exact name, alias", () => {
  assert.equal(resolveExercise("hack-squat", index).via, "id");
  assert.equal(resolveExercise("Hack Squat", index).match.id, "hack-squat");
  assert.equal(resolveExercise("leg curl (lying)", index).match.id, "lying-leg-curl");
  assert.equal(resolveExercise("Facing Away Cable Curl", index).match.id, "bayesian-cable-curl");
  assert.equal(resolveExercise("Mid-Back Row Machine", index).match.id, "machine-row");
});

test("resolve never substring-matches: 'Row' asks instead of guessing", () => {
  const r = resolveExercise("Row", index);
  assert.equal(r.match, undefined);
});

test("resolve: unknown exercise is notFound, never Other", () => {
  const r = resolveExercise("Pendulum Squat", index);
  assert.equal(r.match, undefined);
  assert.ok(r.notFound || r.suggestions);
});

test("resolve: close typo is a strong suggestion, still not a silent match", () => {
  const r = resolveExercise("Hack Squatt", index);
  assert.equal(r.match, undefined);
  assert.equal(r.suggestions[0].exercise.id, "hack-squat");
  assert.equal(r.strong, true);
});

test("mapHistoryNames sends ambiguous names to review, honors decisions", () => {
  const names = [
    { name: "Hack Squat", count: 23 },
    { name: "Weighted Pull-Up / Lat Pulldown", count: 19 },
    { name: "Machine Incline Press", count: 12 },
  ];
  const a = mapHistoryNames(names, index);
  assert.deepEqual(a.mapped.map((m) => m.id), ["hack-squat"]);
  assert.deepEqual(a.review.map((r) => r.name), ["Weighted Pull-Up / Lat Pulldown", "Machine Incline Press"]);
  const b = mapHistoryNames(names, index, { "Machine Incline Press": "plate-loaded-incline-press" });
  assert.equal(b.mapped.find((m) => m.name === "Machine Incline Press").id, "plate-loaded-incline-press");
});

test("validateExercise rejects bad records", () => {
  const bad = { ...CURATED[0], id: "Bad Id", contributions: { chest: 0.5, pecs: 1 } };
  const problems = validateExercise(bad);
  assert.ok(problems.some((p) => p.includes("slug")));
  assert.ok(problems.some((p) => p.includes("unknown muscle")));
});

test("free-exercise-db seed is valid, never shadows curated entries, and merges below them", async () => {
  const { FREE_EXERCISE_DB } = await import("../engine/seed/free-exercise-db.js");
  const { mergeCatalogs } = await import("../engine/catalog.js");
  assert.ok(FREE_EXERCISE_DB.length > 300);
  for (const ex of FREE_EXERCISE_DB) assert.deepEqual(validateExercise(ex), [], ex.id);
  const full = indexCatalog(mergeCatalogs(CURATED, FREE_EXERCISE_DB));
  assert.deepEqual(full.conflicts, []);
  assert.equal(resolveExercise("Hack Squat", full).match.source, "seed");
  // a curated record with the same id as an incoming one keeps the curated version
  const merged = mergeCatalogs([{ ...CURATED[0], name: "Mine" }], CURATED);
  assert.equal(merged.find((e) => e.id === CURATED[0].id).name, "Mine");
});
