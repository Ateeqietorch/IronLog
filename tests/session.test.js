import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { newModel, updateModel, closeSession, prepareForSession, loadFor } from "../engine/model.js";
import { buildSession, logSet, target, toRows, sessionDone, stepLoad } from "../ui/session.js";
import { loadProgram, nextDay } from "../data/program.js";

const index = indexCatalog(CURATED);
const week = { week: 2, of: 5, deload: false };

function trained(id, E, k) {
  let m = newModel(id, { k });
  for (let w = 0; w < 4; w++) {
    const d = new Date(Date.parse("2026-09-01T00:00:00Z") + w * 7 * 86400000).toISOString().slice(0, 10);
    m = prepareForSession(m, d);
    m = updateModel(m, { load: loadFor(E, 12, k), reps: 10, rir: 2, setIndex: 0, date: d });
    m = closeSession(m, d);
  }
  return m;
}

const day = { key: "Push A", label: "Push", exercises: [
  { name: "Incline Dumbbell Press", exerciseId: "incline-dumbbell-press", sets: 3, repRange: [8, 12], unilateral: false, programWeight: 65 },
  { name: "Machine Chest Press", exerciseId: "machine-chest-press", sets: 2, repRange: [8, 12], unilateral: false, programWeight: 140 },
  { name: "Mystery Thing", exerciseId: null, sets: 2, repRange: [10, 15], unilateral: false, programWeight: 30 },
] };

test("session plans coached, calibrating, and manual exercises", () => {
  const s = buildSession({ day, index, models: { "incline-dumbbell-press|both": trained("incline-dumbbell-press", 85, 32) }, date: "2026-09-29", weekInfo: week });
  assert.deepEqual(s.exercises.map((e) => e.mode), ["coached", "calibrating", "manual"]);
  assert.equal(s.exercises[0].plan.reason.rir, 2);
  // calibrating starts one rep easier
  assert.equal(s.exercises[1].plan.reason.rir, 3);
  assert.equal(s.sessionKey, "2026-09-29_Push A");
});

test("logging walks through sets, recalculates, and moves to the next exercise", () => {
  let s = buildSession({ day, index, models: { "incline-dumbbell-press|both": trained("incline-dumbbell-press", 85, 32) }, date: "2026-09-29", weekInfo: week });
  const t0 = target(s.exercises[0]);
  s = logSet(s, 0, { load: t0.load, reps: t0.reps, rir: 0 }, 1000); // much harder than planned
  const t1 = target(s.exercises[0]);
  assert.ok(t1.reps < s.exercises[0].plan.sets[1].reps + 1);
  s = logSet(s, 0, { load: t1.load, reps: t1.reps, rir: 2 });
  s = logSet(s, 0, { load: t1.load, reps: t1.reps, rir: 2 });
  assert.equal(s.cur, 1);
  assert.equal(sessionDone(s), false);
});

test("calibration: set 1 on a new exercise resets the rest of the sets to what you showed", () => {
  let s = buildSession({ day, index, models: {}, date: "2026-09-29", weekInfo: week });
  const e = s.exercises[1];
  const before = e.plan.sets[1];
  // Way stronger than the old program weight suggested
  s = logSet(s, 1, { load: e.plan.sets[0].load, reps: 20, rir: 3 });
  const after = s.exercises[1].plan.sets[1];
  assert.ok(after.load > before.load || after.reps > before.reps + 2, JSON.stringify({ before, after }));
});

test("manual exercises become coached after set 1 if they're in the catalog", () => {
  const d2 = { ...day, exercises: [{ name: "Leg Extension", exerciseId: "leg-extension", sets: 3, repRange: [10, 15], unilateral: false, programWeight: null }] };
  let s = buildSession({ day: d2, index, models: {}, date: "2026-09-29", weekInfo: week });
  assert.equal(s.exercises[0].mode, "manual");
  s = logSet(s, 0, { load: 120, reps: 14, rir: 2 });
  assert.equal(s.exercises[0].mode, "calibrating");
  assert.equal(s.exercises[0].plan.sets[1].load > 0, true);
});

test("rows keep the v2 columns and add planned-vs-actual", () => {
  let s = buildSession({ day, index, models: { "incline-dumbbell-press|both": trained("incline-dumbbell-press", 85, 32) }, date: "2026-09-29", weekInfo: week });
  const t = target(s.exercises[0]);
  s = logSet(s, 0, { load: t.load, reps: t.reps, rir: 2 });
  const [row] = toRows(s);
  assert.deepEqual(row.slice(0, 10), ["2026-09-29", "Push A", "Incline Dumbbell Press", 1, t.load, t.reps, "", "2026-09-29_Push A", "8", "1"]);
  assert.equal(row[10], "incline-dumbbell-press");
  assert.equal(row[11], t.load);
  assert.equal(row.length, 17); // + Q, the workout note
});

test("unilateral sets are written in the v2 L/R format", () => {
  const d = { key: "Legs A", label: "Legs", exercises: [{ name: "Single Leg Leg Press", exerciseId: "single-leg-press", sets: 2, repRange: [8, 12], unilateral: true, programWeight: 90 }] };
  let s = buildSession({ day: d, index, models: {}, date: "2026-09-29", weekInfo: week });
  s = logSet(s, 0, { load: 90, reps: { L: 10, R: 11 }, rir: 2 });
  const [row] = toRows(s);
  assert.equal(row[4], "L:90/R:90");
  assert.equal(row[5], "L:10/R:11");
});

test("stepper moves along the real load ladder", () => {
  const db = index.byId.get("incline-dumbbell-press");
  assert.equal(stepLoad(db, 65, 1), 70);
  assert.equal(stepLoad(db, 50, 1), 55);
  assert.equal(stepLoad(db, 50, -1), 47.5);
});

test("program: v2 program is read and mapped; template is the fallback; rotation picks the next day", () => {
  const p = loadProgram(index, { exercises: { "Day 1 — Push": [{ name: "Incline Dumbbell Press", sets: 3, repMin: 8, repMax: 10, weight: 65 }], "Push A": [{ name: "Lat Pulldown", sets: 3, repMin: 8, repMax: 12, weight: 155 }] }, dayLabels: {} });
  assert.equal(p.source, "v2");
  assert.deepEqual(p.days.map((d) => d.label), ["Push", "Push A"]);
  assert.equal(p.days[0].exercises[0].exerciseId, "incline-dumbbell-press");
  assert.equal(nextDay(p, [{ date: "2026-09-15", day: "Day 1 — Push (Override)" }]).key, "Push A");
  const t = loadProgram(index, { exercises: null, dayLabels: {} });
  assert.equal(t.source, "template");
  assert.ok(t.days.every((d) => d.exercises.every((e) => index.byId.has(e.exerciseId))));
});

import { applyChanges, validateChange, describeChange } from "../ui/session.js";

test("coach proposals: switch, set count, skip and move apply to today only", () => {
  const models = { "incline-dumbbell-press|both": trained("incline-dumbbell-press", 85, 32) };
  const s = buildSession({ day, index, models, date: "2026-09-29", weekInfo: week });
  const changes = [
    { type: "switch_exercise", exerciseIndex: 1, toExerciseId: "pec-deck" },
    { type: "set_count", exerciseIndex: 0, sets: 2 },
    { type: "skip_exercise", exerciseIndex: 2 },
  ];
  for (const c of changes) assert.equal(validateChange(s, c, index, { days: [] }), null);
  assert.match(describeChange(s, changes[0], index), /Swap Machine chest press for Pec deck/);
  const t = applyChanges(s, changes, { index, models });
  assert.deepEqual(t.exercises.map((e) => e.ex?.id ?? e.name), ["incline-dumbbell-press", "pec-deck"]);
  assert.equal(t.exercises[0].sets, 2);
  assert.equal(t.exercises[1].switchedFrom, "Machine chest press");
  assert.equal(day.exercises[1].exerciseId, "machine-chest-press", "program untouched");
  const moved = applyChanges(t, [{ type: "move_exercise", exerciseIndex: 1, toPosition: 0 }], { index, models });
  assert.equal(moved.exercises[0].ex.id, "pec-deck");
});

test("switching after some sets keeps those sets and moves the rest to the new exercise", () => {
  let s = buildSession({ day, index, models: {}, date: "2026-09-29", weekInfo: week });
  s = logSet(s, 1, { load: 140, reps: 10, rir: 2 });
  assert.equal(validateChange(s, { type: "switch_exercise", exerciseIndex: 1, toExerciseId: "pec-deck" }, index, { days: [] }), null);
  assert.match(validateChange(s, { type: "switch_exercise", exerciseIndex: 0, toExerciseId: "made-up" }, index, { days: [] }), /catalog/);
  const t = applyChanges(s, [{ type: "switch_exercise", exerciseIndex: 1, toExerciseId: "pec-deck" }], { index, models: {} });
  assert.deepEqual(t.exercises.map((e) => e.ex?.id ?? e.name), ["incline-dumbbell-press", "machine-chest-press", "pec-deck", "Mystery Thing"]);
  assert.equal(t.exercises[1].sets, 1, "old exercise is done with the set you logged");
  assert.equal(t.exercises[1].logged.length, 1);
  assert.equal(t.exercises[2].sets, 1, "one set left goes to the pec deck");
  assert.equal(t.exercises[2].slotIndex, 1);
  assert.equal(toRows(t).length, 1);
});
