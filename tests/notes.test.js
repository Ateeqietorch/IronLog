// Notes on exercises and workouts, ending an exercise early, and the coach
// adding exercises (today and to the program).
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog, exerciseFromSpec, mergeCatalogs } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { buildSession, logSet, toRows, stopExercise, resumeExercise, setExerciseNote, sessionDone, isDone, applyChanges, describeChange, validateChange } from "../ui/session.js";
import { rowsToObjects, objectToRow, LOG_COLUMNS } from "../data/log.js";
import { loadProgram, insertSlot } from "../data/program.js";

const index = indexCatalog(CURATED);
const week = { week: 2, of: 5, deload: false };
const legs = { key: "Legs", label: "Legs", exercises: [
  { name: "Hack squat", exerciseId: "hack-squat", sets: 3, repRange: [6, 10], unilateral: false, programWeight: 180 },
  { name: "Leg press", exerciseId: "leg-press", sets: 3, repRange: [8, 12], unilateral: false, programWeight: 300 },
  { name: "Leg extension", exerciseId: "leg-extension", sets: 2, repRange: [10, 15], unilateral: false, programWeight: 120 },
] };
const fresh = () => buildSession({ day: legs, index, models: {}, date: "2026-10-26", weekInfo: week });

test("ending an exercise after 2 sets counts it as done and says so in the log", () => {
  let s = fresh();
  s = logSet(s, 1, { load: 300, reps: 10, rir: 2 });
  s = logSet(s, 1, { load: 300, reps: 9, rir: 2 });
  s = stopExercise(s, 1, "left adductor felt strained");
  const e = s.exercises[1];
  assert.equal(isDone(e), true);
  assert.equal(e.sets, 2);
  const rows = toRows(s);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][6], "Stopped after 2 of 3 sets: left adductor felt strained");
  assert.equal(rows[0].length, LOG_COLUMNS.length, "every column, including the workout note");
  // Resume puts the planned sets back
  const r = resumeExercise(s, 1);
  assert.equal(r.exercises[1].sets, 3);
  assert.equal(r.exercises[1].stopped, undefined);
});

test("the engine's own note never lands in the Notes column; the lifter's does", () => {
  let s = fresh();
  s.exercises[0].note = "No history yet. Pick a weight…"; // engine text for manual exercises
  s = logSet(s, 0, { load: 180, reps: 8, rir: 2 });
  assert.equal(toRows(s)[0][6], "");
  s = setExerciseNote(s, 0, "  felt it in my knees  ");
  assert.equal(toRows(s)[0][6], "felt it in my knees");
});

test("workout note is on every row; skipped exercises are named in it", () => {
  let s = fresh();
  s = logSet(s, 0, { load: 180, reps: 8, rir: 2 });
  s.workoutNote = "Finished yesterday's legs today";
  s = stopExercise(s, 2, "out of time");
  const rows = toRows(s);
  assert.ok(rows.every((r) => r[16] === "Finished yesterday's legs today · Skipped Leg extension: out of time"), rows[0][16]);
  // Finish-early path: stop everything left, and the workout is done
  for (const i of [0, 1]) s = stopExercise(s, i);
  assert.equal(sessionDone(s), true);
});

test("notes survive a round trip through the sheet, with every other column intact", () => {
  let s = fresh();
  s = logSet(s, 0, { load: 180, reps: 8, rir: 2 });
  s = setExerciseNote(s, 0, "good depth");
  s.workoutNote = "slept badly";
  const rows = toRows(s);
  const objs = rowsToObjects([LOG_COLUMNS, ...rows]);
  assert.equal(objs[0].notes, "good depth");
  assert.equal(objs[0].sessionNote, "slept badly");
  assert.deepEqual(objectToRow(objs[0]).map(String), rows[0].map(String));
  // Old v2 rows (A–J only) still read, with no workout note
  const old = rowsToObjects([LOG_COLUMNS, ["2026-01-02", "Legs", "Leg press", 1, 300, 10, "", "2026-01-02_Legs", "8", "1"]]);
  assert.equal(old[0].sessionNote, "");
});

test("coach adds an exercise today without touching the others", () => {
  let s = fresh();
  s = logSet(s, 0, { load: 180, reps: 8, rir: 2 });
  const change = { type: "add_exercise", toExerciseId: "seated-leg-curl", numbers: [{ load: 110, reps: 12 }, { load: 110, reps: 11 }] };
  assert.equal(validateChange(s, change, index, { days: [legs] }), null);
  const before = s.exercises.map((e) => e.ex.id);
  s = applyChanges(s, [change], { index, models: {} });
  assert.deepEqual(s.exercises.map((e) => e.ex.id), [...before, "seated-leg-curl"]);
  const added = s.exercises[3];
  assert.equal(added.sets, 2);
  assert.deepEqual(added.plan.sets.map((x) => [x.load, x.reps]), [[110, 12], [110, 11]]);
  assert.equal(added.slotIndex, -1, "today-only add isn't a program slot");
  assert.equal(s.exercises[0].logged.length, 1, "logged sets kept");
  assert.equal(s.cur, 0, "still on the exercise in progress");
  assert.match(describeChange(s, { ...change, toName: "Seated leg curl" }, index), /^Add Seated leg curl: 110×12, 110×11 \(today only\)$/);
});

test("coach adds a brand-new exercise at a position", () => {
  const spec = exerciseFromSpec({ name: "Copenhagen plank", pattern: "hip-adduction", equipment: "bodyweight", contributions: { adductors: 1 } }, index).ex;
  const idx = indexCatalog(mergeCatalogs([spec], CURATED));
  let s = buildSession({ day: legs, index: idx, models: {}, date: "2026-10-26", weekInfo: week });
  s = applyChanges(s, [{ type: "add_exercise", toExerciseId: spec.id, toPosition: 1, sets: 2 }], { index: idx, models: {} });
  assert.equal(s.exercises[1].ex.id, spec.id);
  assert.equal(s.exercises[1].sets, 2);
  assert.deepEqual(s.exercises.map((e) => e.i), [0, 1, 2, 3]);
});

test("permanent add puts it in the stored program", () => {
  const storage = { exercises: { Legs: legs.exercises.map((e) => ({ name: e.name, sets: e.sets, repMin: e.repRange[0], repMax: e.repRange[1] })) }, dayLabels: {} };
  const program = loadProgram(index, storage);
  const r = insertSlot(program, storage, "Legs", 2, index.byId.get("seated-leg-curl"), { sets: 3 });
  assert.equal(r.slotIndex, 2);
  assert.deepEqual(r.storage.exercises.Legs.map((e) => e.name), ["Hack squat", "Leg press", "Seated leg curl", "Leg extension"].map((n, i) => (i === 2 ? index.byId.get("seated-leg-curl").name : n)));
  assert.equal(insertSlot(program, storage, "Legs", Infinity, index.byId.get("seated-leg-curl")).slotIndex, 3, "past the end appends");
  assert.equal(insertSlot(program, storage, "Nope", 0, index.byId.get("seated-leg-curl")), null);
});
