import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { decide, exerciseHistory, effectiveRange, stallCount, leverLabel, pickTechnique } from "../engine/progress.js";
import { resolveDirectives } from "../engine/directives.js";

const index = indexCatalog(CURATED);
const ex = (id) => index.byId.get(id);
const S = (load, reps, rir = 2) => ({ load, reps, rir });
const sess = (date, sets) => ({ date, sets: sets.map((s, i) => ({ setIndex: i, ...s })) });

test("in range last time: same weight, one more rep per set", () => {
  const h = [sess("2026-10-20", [S(180, 7), S(180, 6), S(180, 5)])];
  const d = decide({ ex: ex("barbell-bench-press"), history: h, repRange: [6, 10], rir: 2, sets: 3, date: "2026-10-27" });
  assert.equal(d.lever, "add-reps");
  assert.deepEqual(d.sets.map((s) => [s.load, s.reps]), [[180, 8], [180, 7], [180, 6]]);
  assert.equal(leverLabel(d), "+1 rep");
});

test("top of the range: the weight goes up one sensible step, reps reset near the middle", () => {
  const h = [sess("2026-10-20", [S(80, 12), S(80, 10), S(80, 9)])];
  const d = decide({ ex: ex("barbell-overhead-press"), history: h, repRange: [6, 10], rir: 1, sets: 3, date: "2026-10-27" });
  assert.equal(d.lever, "add-load");
  assert.equal(d.sets[0].load, 85); // not a 15 lb jump
  assert.ok(d.sets[0].reps >= 6 && d.sets[0].reps <= 10, JSON.stringify(d.sets));
  assert.match(leverLabel(d), /\+5 lb/);
});

test("coarse dumbbells: 20 → 25 lb is too big, so reps go past the range first, then the jump", () => {
  const lat = ex("dumbbell-lateral-raise");
  let h = [sess("2026-10-20", [S(20, 20), S(20, 18), S(20, 16)])];
  const ladder = [5, 10, 15, 20, 25, 30]; // a gym with 5 lb dumbbell steps
  const d1 = decide({ ex: lat, history: h, repRange: [12, 20], rir: 2, sets: 3, date: "2026-10-27", ladder });
  assert.equal(d1.lever, "coarse");
  assert.equal(d1.sets[0].load, 20);
  assert.equal(d1.sets[0].reps, 21);
  h = [sess("2026-10-27", [S(20, 23), S(20, 21), S(20, 19)])];
  const d2 = decide({ ex: lat, history: h, repRange: [12, 20], rir: 2, sets: 3, date: "2026-11-03", ladder });
  assert.equal(d2.lever, "add-load");
  assert.equal(d2.sets[0].load, 25);
  assert.ok(d2.sets[0].reps >= 11);
});

test("a failed first set holds the numbers instead of adding", () => {
  const h = [sess("2026-10-20", [S(100, 8, 0), S(100, 7, 0)])];
  const d = decide({ ex: ex("chest-supported-t-bar-row"), history: h, repRange: [6, 10], rir: 2, sets: 2, date: "2026-10-27" });
  assert.equal(d.lever, "hold");
  assert.deepEqual(d.sets.map((s) => s.reps), [8, 7]);
});

test("one session under the range holds; two in a row backs off", () => {
  const exr = ex("preacher-curl");
  const one = [sess("2026-10-20", [S(85, 6), S(85, 6)])];
  assert.equal(decide({ ex: exr, history: one, repRange: [8, 12], rir: 1, sets: 2, date: "2026-10-27" }).lever, "hold");
  const two = [sess("2026-10-13", [S(85, 7), S(85, 6)]), sess("2026-10-20", [S(85, 6), S(85, 5)])];
  const d = decide({ ex: exr, history: two, repRange: [8, 12], rir: 1, sets: 2, date: "2026-10-27" });
  assert.equal(d.lever, "back-off");
  assert.ok(d.sets[0].load < 85);
  assert.ok(d.sets[0].reps >= 8);
});

test("time away: 11–16 days still progresses, 17–28 holds, 29+ recalibrates lighter", () => {
  const h = [sess("2026-10-01", [S(180, 7), S(180, 6)])];
  const e = ex("barbell-bench-press");
  assert.equal(decide({ ex: e, history: h, repRange: [6, 10], rir: 2, sets: 2, date: "2026-10-13" }).lever, "add-reps");
  assert.equal(decide({ ex: e, history: h, repRange: [6, 10], rir: 2, sets: 2, date: "2026-10-22" }).lever, "hold");
  const d = decide({ ex: e, history: h, repRange: [6, 10], rir: 2, sets: 3, date: "2026-11-10", muscleGapDays: 40 });
  assert.equal(d.lever, "recalibrate");
  assert.ok(d.sets[0].load <= 180);
  assert.equal(d.sets.length, 2); // muscle idle 40 days: one fewer set
  const d2 = decide({ ex: e, history: h, repRange: [6, 10], rir: 2, sets: 3, date: "2026-11-10", muscleGapDays: 4 });
  assert.equal(d2.sets.length, 3); // only this exercise was idle
});

test("a ramp (light first set) uses the heaviest load as the top set", () => {
  const h = [sess("2026-10-20", [S(165, 12), S(180, 10), S(180, 8, 0), S(150, 14)])];
  const d = decide({ ex: ex("seated-leg-curl"), history: h, repRange: [8, 12], rir: 2, sets: 4, date: "2026-10-27" });
  assert.equal(d.lever, "add-reps");
  assert.deepEqual(d.sets.map((s) => s.load), [165, 180, 180, 150]);
  assert.equal(d.sets[1].reps, 11);
  assert.equal(d.sets[2].reps, 8); // that set failed last time: hold it
});

test("sets that would fall under the range drop to a lighter back-off load", () => {
  const h = [sess("2026-10-20", [S(185, 7), S(185, 5), S(185, 4), S(185, 3)])];
  const d = decide({ ex: ex("barbell-bench-press"), history: h, repRange: [6, 10], rir: 2, sets: 4, date: "2026-10-27" });
  assert.equal(d.sets[0].load, 185);
  const late = d.sets.filter((s) => s.backoff);
  assert.ok(late.length >= 1, JSON.stringify(d.sets));
  assert.ok(late.every((s) => s.load < 185 && s.reps >= 5));
});

test("stalled for a few sessions on a machine: same plan plus a technique on the last set", () => {
  const h = [
    sess("2026-10-06", [S(50, 13), S(50, 12)]),
    sess("2026-10-13", [S(50, 13), S(50, 12)]),
    sess("2026-10-20", [S(50, 13), S(50, 11)]),
  ];
  assert.equal(stallCount(h, 34), 2);
  const d = decide({ ex: ex("machine-lateral-raise"), history: h, repRange: [12, 20], rir: 1, sets: 2, date: "2026-10-27" });
  assert.equal(d.lever, "intensify");
  assert.ok(["myo-reps", "lengthened-partials"].includes(d.reason.technique));
  // free-weight compounds never get a technique
  assert.equal(pickTechnique(ex("barbell-bench-press")), null);
});

test("deload: same weights, fewer reps, 4 in the tank", () => {
  const h = [sess("2026-10-20", [S(180, 8), S(180, 7)])];
  const d = decide({ ex: ex("barbell-bench-press"), history: h, repRange: [6, 10], rir: 4, sets: 2, date: "2026-10-27", deload: true });
  assert.equal(d.lever, "deload");
  assert.ok(d.sets.every((s) => s.load === 180 && s.rir === 4 && s.reps <= 6));
});

test("no history → calibrate (the cold start handles it)", () => {
  assert.equal(decide({ ex: ex("leg-press"), history: [], repRange: [8, 12], rir: 2, sets: 3, date: "2026-10-27" }).lever, "calibrate");
});

test("directives: minimum reps raises the range; per-exercise ranges win", () => {
  const dir = resolveDirectives([
    { id: "a", kind: "rep_floor", minReps: 8, scope: "all", at: "2026-10-01" },
    { id: "b", kind: "rep_range", range: [12, 15], scope: "leg-extension", at: "2026-10-02" },
  ]);
  assert.deepEqual(effectiveRange([6, 10], ex("barbell-bench-press"), dir), [8, 12]);
  assert.deepEqual(effectiveRange([10, 15], ex("leg-extension"), dir), [12, 15]);
});

test("unilateral history merges sides into the weaker side's reps", () => {
  const sets = [
    { date: "2026-10-20", id: "single-leg-press", side: "L", setIndex: 0, load: 90, reps: 10, rir: 2 },
    { date: "2026-10-20", id: "single-leg-press", side: "R", setIndex: 0, load: 90, reps: 9, rir: 2 },
  ];
  const h = exerciseHistory(sets, "single-leg-press");
  assert.equal(h.length, 1);
  assert.equal(h[0].sets[0].reps, 9);
});
