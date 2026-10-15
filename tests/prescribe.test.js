// Engine scenarios from COACH-ENGINE-SPEC.md §12 (Phase 2: 1, 2, 3, 4, 7, 8, 11, 12).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newModel, updateModel, closeSession, prepareForSession, e1rm, fitK, fitFatigueDecay,
  rtf, loadFor, predictReps,
} from "../engine/model.js";
import { prescribe, recalcRemaining, ladderFor, aimReps } from "../engine/prescribe.js";
import { CURATED } from "../engine/seed/curated.js";

const EX = Object.fromEntries(CURATED.map((e) => [e.id, e]));

// Log a whole session into a model.
function logSession(model, date, sets) {
  let m = prepareForSession(model, date);
  sets.forEach(([load, reps, rir], i) => { m = updateModel(m, { load, reps, rir, setIndex: i, date }); });
  return closeSession(m, date);
}

// A settled model: several weeks of consistent data around a known strength.
function settled(id, E, k, { weeks = 6, date0 = "2026-08-01", reps = 8, rir = 2 } = {}) {
  let m = newModel(id, { k });
  for (let w = 0; w < weeks; w++) {
    const d = new Date(Date.parse(date0 + "T00:00:00Z") + w * 7 * 86400000).toISOString().slice(0, 10);
    const L = loadFor(E, reps + rir, k);
    m = logSession(m, d, [[L, reps, rir], [L, reps, rir]]);
  }
  return m;
}

const iso = (d0, days) => new Date(Date.parse(d0 + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);

test("load–reps curve round-trips", () => {
  const E = 300, k = 32;
  assert.ok(Math.abs(rtf(E, loadFor(E, 10, k), k) - 10) < 1e-9);
});

test("first logged set sets the estimate; later sets move it less as confidence grows", () => {
  let m = newModel("hack-squat", { kClass: "leg-press" });
  m = updateModel(m, { load: 270, reps: 10, rir: 2, setIndex: 0, date: "2026-09-01" });
  const e1 = e1rm(m);
  assert.ok(Math.abs(e1 - 270 * (1 + 12 / 42)) < 0.5);
  const sd1 = m.logVar;
  m = updateModel(m, { load: 270, reps: 12, rir: 2, setIndex: 0, date: "2026-09-01" });
  assert.ok(m.logVar < sd1);
});

test("non-working sets (0 lb or 0 reps) are ignored", () => {
  const m0 = newModel("lying-leg-curl", { kClass: "isolation" });
  assert.equal(updateModel(m0, { load: 0, reps: 0, rir: null, setIndex: 0 }), m0);
  assert.equal(updateModel(m0, { load: 90, reps: 0, rir: null, setIndex: 2 }), m0);
});

test("§12.1 on-plan sessions keep progressing week to week", () => {
  const ex = EX["incline-dumbbell-press"];
  let m = settled(ex.id, 85, 32);
  const loads = [], reps = [];
  let date = iso("2026-08-01", 42);
  for (let w = 0; w < 4; w++) {
    const p = prescribe({ model: m, exercise: ex, repRange: [8, 12], rir: 2, sets: 3, date });
    loads.push(p.load); reps.push(p.sets[0].reps);
    const before = e1rm(m);
    m = logSession(m, date, p.sets.map((s) => [s.load, s.reps, 2]));
    const gain = (e1rm(m) - before) / before;
    assert.ok(gain > 0.002 && gain < 0.02, `week ${w} gain ${gain}`);
    date = iso(date, 7);
  }
  // Over four weeks the prescription moves forward: more load, or same load and more reps.
  const progressed = loads[3] > loads[0] || (loads[3] === loads[0] && reps[3] > reps[0]);
  assert.ok(progressed, JSON.stringify({ loads, reps }));
});

test("§12.2 a far-too-easy hack squat session moves load to what performance supports (v2 gave 282.5 × 9)", () => {
  const ex = EX["hack-squat"];
  let m = newModel(ex.id, { kClass: "leg-press", e1rm: 360, sd: 0.15 });
  m = { ...m, lastExposure: "2026-09-08", exposures: 4 };
  m = logSession(m, "2026-09-15", [[270, 10, 4], [270, 10, 3.5], [270, 10, 3]]);
  const p = prescribe({ model: m, exercise: ex, repRange: [6, 10], rir: 2, sets: 3, date: "2026-09-22", lastLoad: 270 });
  assert.ok(p.load >= 285 && p.load <= 300, `load ${p.load}`);
  assert.ok(p.sets[0].reps >= 7 && p.sets[0].reps <= 9, `reps ${p.sets[0].reps}`);
});

test("§12.3 too hard: load or reps drop, but never more than one rung below last session", () => {
  const ex = EX["barbell-bench-press"];
  let m = settled(ex.id, 230, 32, { reps: 8 });
  const date = iso("2026-08-01", 42);
  const p1 = prescribe({ model: m, exercise: ex, repRange: [6, 10], rir: 2, sets: 3, date });
  // Logged at failure with far fewer reps than planned
  m = logSession(m, date, [[p1.load, 4, 0], [p1.load, 3, 0], [p1.load, 2, 0]]);
  const p2 = prescribe({ model: m, exercise: ex, repRange: [6, 10], rir: 2, sets: 3, date: iso(date, 7), lastLoad: p1.load });
  const ladder = ladderFor(ex);
  const oneRungDown = ladder[ladder.indexOf(p1.load) - 1];
  assert.ok(p2.load < p1.load || p2.sets[0].reps < p1.sets[0].reps);
  assert.ok(p2.load >= oneRungDown, `${p2.load} < ${oneRungDown}`);
});

test("§12.4 coarse dumbbells: stays on 20s with more reps until the 25s fit the range", () => {
  const ex = EX["dumbbell-lateral-raise"];
  const ladder = [10, 15, 20, 25, 30];
  let m = settled(ex.id, 32, 34, { reps: 15, rir: 2 });
  const date = iso("2026-08-01", 42);
  const p = prescribe({ model: m, exercise: ex, repRange: [12, 20], rir: 2, sets: 3, date, ladder });
  assert.equal(p.load, 20);
  // A much stronger lifter gets moved to 25s
  const strong = settled(ex.id, 38, 34, { reps: 15, rir: 2 });
  const p2 = prescribe({ model: strong, exercise: ex, repRange: [12, 20], rir: 2, sets: 3, date, ladder });
  assert.equal(p2.load, 25);
  // At 20s, reps may exceed the top of the range by up to 3 rather than jumping early
  const mid = settled(ex.id, 33.5, 34, { reps: 15, rir: 2 });
  const p3 = prescribe({ model: mid, exercise: ex, repRange: [12, 20], rir: 2, sets: 3, date, ladder });
  assert.equal(p3.load, 20);
  assert.ok(p3.sets[0].reps > 20 && p3.sets[0].reps <= 23, `reps ${p3.sets[0].reps}`);
});

test("§12.7 10-day gap: one extra rep in reserve, estimate not cut", () => {
  const ex = EX["romanian-deadlift"];
  const m = settled(ex.id, 300, 34);
  const last = m.lastExposure;
  const p = prescribe({ model: m, exercise: ex, repRange: [6, 10], rir: 2, sets: 3, date: iso(last, 12) });
  assert.equal(p.reason.rir, 3);
  assert.equal(p.reason.extraRir, 1);
  assert.ok(p.reason.e1rm >= Math.round(e1rm(m)) - 0.5, "no strength cut");
  const longGap = prescribe({ model: m, exercise: ex, repRange: [6, 10], rir: 2, sets: 3, date: iso(last, 35) });
  assert.equal(longGap.reason.rir, 4);
  assert.equal(longGap.sets.length, 2);
  assert.match(p.text, /12 days/);
});

test("§12.8 unilateral: separate sides, load set by the weaker side", () => {
  const ex = EX["single-arm-cable-row"];
  const L = settled(ex.id, 90, 32, { reps: 12 });
  const R = settled(ex.id, 100, 32, { reps: 12 });
  const date = iso("2026-08-01", 42);
  const p = prescribe({ models: { L: { ...L, side: "L" }, R: { ...R, side: "R" } }, exercise: ex, repRange: [10, 15], rir: 2, sets: 3, date });
  const onlyL = prescribe({ model: L, exercise: ex, repRange: [10, 15], rir: 2, sets: 3, date });
  assert.equal(p.reason.side, "L");
  assert.equal(p.load, onlyL.load);
  assert.match(p.text, /left side/);
});

test("§12.11 in-session: a set 2 RIR harder than planned changes the next set; locked sets don't move", () => {
  const ex = EX["incline-dumbbell-press"];
  const m = settled(ex.id, 85, 32);
  const date = iso("2026-08-01", 42);
  const plan = prescribe({ model: m, exercise: ex, repRange: [8, 12], rir: 2, sets: 4, date });
  const s0 = plan.sets[0];
  const after = recalcRemaining({ plan, model: m, exercise: ex, repRange: [8, 12], date,
    loggedSets: [{ index: 0, load: s0.load, reps: s0.reps, rir: 0 }], locked: [2] });
  assert.ok(after.sets[1].reps < plan.sets[1].reps || after.sets[1].load < plan.sets[1].load, JSON.stringify(after.sets));
  assert.deepEqual(after.sets[2], plan.sets[2], "locked set untouched");
  assert.deepEqual(after.sets[0], plan.sets[0], "logged set untouched");
  // Logging exactly as planned changes nothing
  const same = recalcRemaining({ plan, model: m, exercise: ex, repRange: [8, 12], date,
    loggedSets: [{ index: 0, load: s0.load, reps: s0.reps, rir: 2 }] });
  assert.deepEqual(same.sets.map((s) => [s.load, s.reps]), plan.sets.map((s) => [s.load, s.reps]));
});

test("§12.12 determinism: same history in, same prescription out", () => {
  const ex = EX["leg-press"];
  const a = prescribe({ model: settled(ex.id, 600, 42), exercise: ex, repRange: [8, 12], rir: 2, sets: 3, date: "2026-09-20" });
  const b = prescribe({ model: settled(ex.id, 600, 42), exercise: ex, repRange: [8, 12], rir: 2, sets: 3, date: "2026-09-20" });
  assert.deepEqual(a, b);
});

test("policy shifts the aim within the rep range", () => {
  assert.equal(aimReps([8, 12]), 10);
  assert.equal(aimReps([8, 12], "reps-first"), 11);
  assert.equal(aimReps([8, 12], "load-first"), 9);
});

test("bodyweight exercises prescribe added load from effective strength", () => {
  const ex = EX["dip"];
  // 150 lb lifter, dips 0.95 × bw = 142.5 effective; strong enough for added weight
  const m = settled(ex.id, 250, 32, { reps: 8 });
  const p = prescribe({ model: m, exercise: ex, repRange: [6, 12], rir: 2, sets: 3, date: iso("2026-08-01", 42), bodyweight: 150 });
  assert.ok(p.load > 0 && p.load < 100, `added ${p.load}`);
  assert.equal(prescribe({ model: m, exercise: ex, date: "2026-09-20" }).needsBodyweight, true);
});

test("no data yet → asks for calibration instead of guessing", () => {
  assert.equal(prescribe({ model: newModel("hack-squat"), exercise: EX["hack-squat"], date: "2026-09-20" }).needsCalibration, true);
});

test("k is learned only across rep zones, and blends toward the default", () => {
  const kTrue = 42;
  let m = newModel("leg-press", { kClass: "leg-press" });
  m = { ...m, k: 30, kDefault: 30 }; // start from a wrong default
  let d = "2026-07-01";
  for (let w = 0; w < 10; w++) {
    const reps = w % 2 ? 6 : 14;
    m = logSession(m, d, [[loadFor(600, reps + 2, kTrue), reps, 2]]);
    d = iso(d, 7);
  }
  const fitted = fitK(m);
  assert.ok(fitted.k > 34, `k ${fitted.k}`);
  // same reps every time → no evidence about k → unchanged
  let flat = newModel("leg-press", { kClass: "leg-press" });
  for (let w = 0; w < 10; w++) flat = logSession(flat, iso("2026-07-01", 7 * w), [[400, 10, 2]]);
  assert.equal(fitK(flat).k, flat.k);
});

test("fatigue decay is learned from within-session drop-off", () => {
  let m = newModel("barbell-bench-press", { kClass: "upper-compound" });
  for (let w = 0; w < 6; w++) m = logSession(m, iso("2026-07-01", 7 * w), [[185, 9, 1], [185, 7, 1], [185, 5, 1]]);
  const f = fitFatigueDecay(m);
  assert.ok(f.fatigueDecay < 0.98 && f.fatigueDecay >= 0.93, `${f.fatigueDecay}`);
});

test("predictReps matches the curve at the current estimate", () => {
  const m = settled("leg-extension", 200, 34, { reps: 12 });
  const p = predictReps(m, { load: loadFor(e1rm(m), 14, m.k), rir: 2, setIndex: 0 });
  assert.ok(Math.abs(p - 12) < 1e-6);
});
