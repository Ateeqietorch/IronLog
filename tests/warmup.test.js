import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { warmupSets, warmMuscles } from "../engine/warmup.js";

const byId = Object.fromEntries(CURATED.map((x) => [x.id, x]));
const bench = byId["barbell-bench-press"];

test("cold compound gets a 3-step ramp on real plate loads, all lighter than the work", () => {
  const w = warmupSets({ exercise: bench, workLoad: 185 });
  assert.deepEqual(w.map((x) => x.reps), [8, 5, 2]);
  assert.ok(w.every((x, i) => x.load < 185 && (i === 0 || x.load > w[i - 1].load)));
  assert.ok(w.every((x) => (x.load - 45) % 5 === 0));
});

test("warm muscles: compound gets one feeler set, isolation gets none", () => {
  const warm = new Set(["chest"]);
  assert.equal(warmupSets({ exercise: bench, workLoad: 185, warm }).length, 1);
  const iso = CURATED.find((x) => x.kClass === "isolation" && x.contributions.chest >= 1);
  assert.equal(warmupSets({ exercise: iso, workLoad: 40, warm }).length, 0);
  assert.equal(warmupSets({ exercise: iso, workLoad: 40 }).length, 1);
});

test("light barbell work doesn't produce silly sets below the bar or duplicates", () => {
  const w = warmupSets({ exercise: bench, workLoad: 65 });
  assert.ok(w.every((x) => x.load >= 45 && x.load < 65));
  assert.equal(new Set(w.map((x) => x.load)).size, w.length);
});

test("warmMuscles only counts exercises you've actually started", () => {
  const ex = [{ ex: bench, logged: [] }, { ex: byId["barbell-bench-press"], logged: [{ index: 0 }] }];
  assert.deepEqual([...warmMuscles(ex.slice(0, 1))], []);
  assert.ok(warmMuscles(ex).has("chest"));
});
