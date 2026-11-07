import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { setChange, allocateSets, muscleTargets, comparePerformance, exposuresPerWeek, LANDMARKS } from "../engine/volume.js";
import { blockFor, rirFor, deloadSignal } from "../engine/block.js";
import { cleanDirective, resolveDirectives, describeDirective, activeDirectives } from "../engine/directives.js";

const index = indexCatalog(CURATED);
const ex = (id) => index.byId.get(id);

test("feedback → set change follows the RP-style table", () => {
  assert.equal(setChange({ s: 0, p: 0, w: 0 }).d, 2);   // under-dosed
  assert.equal(setChange({ s: 1, p: 1, w: 1 }).d, 1);   // room for more
  assert.equal(setChange({ s: 2, p: 1, w: 1 }).d, 0);   // just recovered: hold
  assert.equal(setChange({ s: 3, p: 0, w: 0 }).d, -1);  // still sore
  assert.equal(setChange({ s: 2, p: 2, w: 2 }).d, -1);  // overreaching
  assert.equal(setChange({ s: 1, p: 2, w: 1 }).d, 0);   // great pump already
  // performance overrides
  assert.equal(setChange({ s: 0, p: 0, w: 0, perf: -1 }).d, 0);
  assert.equal(setChange({ s: 0, p: 0, w: 0, perf: -1, prevPerf: -1 }).d, -1);
  // no feedback: grow only when progressing and still below the productive range
  assert.equal(setChange({ perf: 1, belowProductive: true }).d, 1);
  assert.equal(setChange({ perf: 1, belowProductive: false }).d, 0);
  assert.equal(setChange({ perf: 0 }).d, 0);
});

test("allocation adds sets to the muscle's own exercise, isolation first, and trims what's over", () => {
  const slots = [
    { ex: ex("barbell-bench-press"), sets: 3 },
    { ex: ex("barbell-overhead-press"), sets: 3 },
    { ex: ex("cable-lateral-raise"), sets: 2 },
    { ex: ex("triceps-rope-pushdown"), sets: 3 },
  ];
  const r = allocateSets(slots, { "side-delts": 6, triceps: 4 });
  assert.equal(r.sets[2], 4); // laterals went up (overhead press already gives 1.5)
  assert.ok(r.sets[3] < 3);    // pushdowns came down: pressing already covers triceps
  assert.equal(r.sets[0], 3);  // bench untouched (chest not listed)
});

test("comparePerformance: same load uses total reps; different load uses strength", () => {
  const a = { sets: [{ setIndex: 0, load: 100, reps: 10 }, { setIndex: 1, load: 100, reps: 9 }] };
  assert.equal(comparePerformance(a, { sets: [{ setIndex: 0, load: 100, reps: 11 }, { setIndex: 1, load: 100, reps: 9 }] }), 1);
  assert.equal(comparePerformance(a, { sets: [{ setIndex: 0, load: 100, reps: 10 }, { setIndex: 1, load: 100, reps: 8 }] }), 0);
  assert.equal(comparePerformance(a, { sets: [{ setIndex: 0, load: 100, reps: 8 }, { setIndex: 1, load: 100, reps: 8 }] }), -1);
  assert.equal(comparePerformance(a, { sets: [{ setIndex: 0, load: 110, reps: 9 }] }), 1);
});

test("muscle targets start from the program, move with feedback, and respect floors", () => {
  const program = { days: [{ key: "Push", exercises: [{ exerciseId: "cable-lateral-raise", sets: 3 }, { exerciseId: "barbell-bench-press", sets: 3 }] }] };
  const freq = exposuresPerWeek(program, index, 2); // Push twice a week
  assert.equal(freq["side-delts"], 2);
  const block = { start: "2026-10-01" };
  const sessions = [
    { date: "2026-10-01", perMuscle: { "side-delts": 3, chest: 3 }, perf: {} },
    { date: "2026-10-04", perMuscle: { "side-delts": 3, chest: 3 }, perf: {} },
  ];
  const feedback = [
    { date: "2026-10-01", muscle: "side-delts", pump: 0, workload: 0 },
    { date: "2026-10-04", muscle: "side-delts", soreness: 0, pump: 0, workload: 0 },
    { date: "2026-10-08", muscle: "side-delts", soreness: 0 },
  ];
  const t = muscleTargets({ sessions, feedback, block, freq, program, index, date: "2026-10-08" });
  // program gives 3 per session, but the weekly floor (8 at 2×/week) lifts it to 4
  assert.equal(t["side-delts"].start, 4);
  // two exposures of low pump / easy / never sore: +2 each
  assert.equal(t["side-delts"].perSession, 8);
  assert.equal(t["side-delts"].history.length, 2);
  // front delts are indirect-only by default
  assert.equal(t["front-delts"].level, "indirect");
  // a "still sore" answer today pulls it back
  const t2 = muscleTargets({ sessions, feedback: [...feedback.slice(0, 2), { date: "2026-10-08", muscle: "side-delts", soreness: 3 }], block, freq, program, index, date: "2026-10-08" });
  assert.ok(t2["side-delts"].perSession < t["side-delts"].perSession);
});

test("priorities: specialize starts higher, maintain drops to the minimum", () => {
  const program = { days: [{ key: "Pull", exercises: [{ exerciseId: "incline-dumbbell-curl", sets: 4 }] }] };
  const freq = exposuresPerWeek(program, index, 2);
  const base = muscleTargets({ sessions: [], block: { start: "2026-10-01" }, freq, program, index, date: "2026-10-01" });
  const spec = muscleTargets({ sessions: [], block: { start: "2026-10-01" }, freq, program, index, priorities: { biceps: "specialize" }, date: "2026-10-01" });
  const maint = muscleTargets({ sessions: [], block: { start: "2026-10-01" }, freq, program, index, priorities: { biceps: "maintain" }, date: "2026-10-01" });
  assert.ok(spec.biceps.perSession > base.biceps.perSession);
  assert.ok(maint.biceps.perSession < base.biceps.perSession);
  assert.ok(LANDMARKS.biceps[1] > 0);
});

test("blocks: breaks of 14+ days restart, shorter breaks pause, deload after the build weeks", () => {
  const dates = ["2026-09-01", "2026-09-03", "2026-09-05", "2026-10-16", "2026-10-18"];
  const b = blockFor(dates, "2026-10-20");
  assert.equal(b.start, "2026-10-16");
  assert.equal(b.week, 1);
  assert.equal(b.reentry, true);
  // three weeks later
  const d2 = [...dates, "2026-10-23", "2026-10-30", "2026-11-04"];
  assert.equal(blockFor(d2, "2026-11-06").week, 4);
  // a 10-day pause doesn't push you ahead
  const d3 = ["2026-10-01", "2026-10-03", "2026-10-15"];
  const b3 = blockFor(d3, "2026-10-15");
  assert.equal(b3.week, 2);
  assert.equal(b3.paused, 4);
  // week 6 of a 5-week block is the deload; week 7 starts block 2
  const steady = []; for (let i = 0; i < 45; i += 2) steady.push(new Date(Date.parse("2026-09-01") + i * 864e5).toISOString().slice(0, 10));
  assert.equal(blockFor(steady, "2026-10-07").deload, true);
  const next = blockFor(steady, "2026-10-14");
  assert.equal(next.deload, false);
  assert.equal(next.number, 2);
  assert.equal(next.week, 1);
});

test("early deload and new block from directives", () => {
  const dates = ["2026-10-01", "2026-10-03", "2026-10-06", "2026-10-08"];
  const d = blockFor(dates, "2026-10-09", { deloadFrom: "2026-10-09" });
  assert.equal(d.deload, true);
  assert.equal(d.early, true);
  const after = blockFor([...dates, "2026-10-10"], "2026-10-17", { deloadFrom: "2026-10-09" });
  assert.equal(after.deload, false);
  assert.equal(after.number, 2);
  const nb = blockFor(dates, "2026-10-09", { newBlockFrom: "2026-10-09" });
  assert.equal(nb.week, 1);
  assert.equal(nb.start, "2026-10-09");
});

test("RIR by week; compounds never below 1; deload 4; recovery offset", () => {
  const b = (week) => ({ week, of: 5, deload: false });
  assert.deepEqual([1, 2, 3, 4, 5].map((w) => rirFor(b(w), ex("cable-lateral-raise"))), [3, 2, 2, 1, 1]);
  assert.equal(rirFor(b(5), ex("barbell-bench-press"), -1), 1);
  assert.equal(rirFor(b(5), ex("cable-lateral-raise"), -1), 0);
  assert.equal(rirFor({ week: 6, of: 5, deload: true }, ex("cable-lateral-raise")), 4);
  assert.equal(rirFor(b(4), ex("cable-lateral-raise"), 1), 2);
});

test("deload signal: two muscles down twice, or pain on two exercises", () => {
  assert.equal(deloadSignal({ musclePerf: { chest: [0, -1, -1] }, date: "2026-10-10" }), null);
  assert.ok(deloadSignal({ musclePerf: { chest: [-1, -1], quads: [1, -1, -1] }, date: "2026-10-10" }));
  assert.ok(deloadSignal({ joints: [{ date: "2026-10-08", exerciseId: "a", joints: 2 }, { date: "2026-10-09", exerciseId: "b", joints: 2 }], date: "2026-10-10" }));
});

test("directives validate, override by scope, and keep tombstones", () => {
  assert.equal(cleanDirective({ kind: "rep_floor", minReps: 0 }), null);
  assert.equal(cleanDirective({ kind: "muscle_priority", muscle: "wings", level: "grow" }), null);
  const list = [
    cleanDirective({ id: "1", kind: "rep_floor", minReps: 6, scope: "all", at: "2026-10-01" }),
    cleanDirective({ id: "2", kind: "rep_floor", minReps: 8, scope: "all", at: "2026-10-05" }),
    cleanDirective({ id: "3", kind: "muscle_priority", muscle: "side-delts", level: "specialize", at: "2026-10-05" }),
    { ...cleanDirective({ id: "4", kind: "schedule", minutes: 50, at: "2026-10-06" }), removed: true },
  ];
  assert.equal(activeDirectives(list).length, 2);
  const r = resolveDirectives(list);
  assert.equal(r.minReps.all, 8);
  assert.equal(r.priorities["side-delts"], "specialize");
  assert.equal(r.schedule.minutes, null);
  assert.equal(describeDirective(list[2]), "Prioritize side delts");
});

test("technique switches are independent, and the latest one for each wins", () => {
  const r = resolveDirectives([
    { id: "d1", kind: "technique", block: ["add-ons"], at: "2026-11-06" },
    { id: "d2", kind: "technique", allow: ["supersets"], at: "2026-11-07" },
    { id: "d3", kind: "technique", block: ["supersets"], at: "2026-11-07" },
  ]);
  assert.equal(r.techniques["add-ons"], false);
  assert.equal(r.techniques.supersets, false);
  assert.equal(r.techniques["myo-reps"], true);
});
