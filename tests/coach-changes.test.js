import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog, mergeCatalogs, exerciseFromSpec } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { buildSession, logSet, applyChanges, describeChange, target } from "../ui/session.js";
import { loadProgram, updateSlot } from "../data/program.js";

const week = { week: 2, of: 5, deload: false };
const day = { key: "Pull", label: "Pull", exercises: [
  { name: "Lat pulldown", exerciseId: "lat-pulldown", sets: 3, repRange: [8, 12], unilateral: false, programWeight: 150 },
  { name: "Incline dumbbell curl", exerciseId: "incline-dumbbell-curl", sets: 3, repRange: [10, 15], unilateral: false, programWeight: 25 },
] };

test("coach can create an exercise that isn't in the catalog, by the name the lifter used", () => {
  const index = indexCatalog(CURATED);
  const r = exerciseFromSpec({ name: "Incline machine curl", pattern: "elbow-flexion", equipment: "machine-stack", contributions: { biceps: 1 } }, index);
  assert.ok(r.ex, JSON.stringify(r.problems));
  assert.equal(r.ex.name, "Incline machine curl");
  assert.equal(r.ex.loadType, "stack");
  assert.notEqual(r.ex.id, "machine-preacher-curl");
  // Naming an existing exercise reuses it instead of duplicating
  assert.equal(exerciseFromSpec({ name: "Preacher curl machine", pattern: "elbow-flexion", equipment: "machine-stack", contributions: { biceps: 1 } }, index).ex.id, "machine-preacher-curl");
});

test("switch with coach numbers: exact sets, and they stick when done as planned", () => {
  const spec = exerciseFromSpec({ name: "Incline machine curl", pattern: "elbow-flexion", equipment: "machine-stack", contributions: { biceps: 1 } }).ex;
  const index = indexCatalog(mergeCatalogs([spec], CURATED));
  let s = buildSession({ day, index, models: {}, date: "2026-10-24", weekInfo: week });
  const change = { type: "switch_exercise", exerciseIndex: 1, toExerciseId: spec.id, fromName: "Incline dumbbell curl", toName: spec.name,
    numbers: [{ load: 50, reps: 12, rir: 2 }, { load: 50, reps: 11, rir: 2 }, { load: 50, reps: 10, rir: 2 }] };
  s = applyChanges(s, [change], { index, models: {} });
  const e = s.exercises[1];
  assert.equal(e.ex.id, spec.id);
  assert.equal(e.sets, 3);
  assert.deepEqual(e.plan.sets.map((x) => [x.load, x.reps]), [[50, 12], [50, 11], [50, 10]]);
  assert.equal(e.mode, "calibrating");
  s = logSet(s, 1, { load: 50, reps: 12, rir: 2 });
  assert.deepEqual(target(s.exercises[1]), s.exercises[1].plan.sets[1]);
  assert.equal(target(s.exercises[1]).reps, 11, "as planned → coach's numbers stay");
  // Way harder than planned → the rest adapt
  s = logSet(s, 1, { load: 50, reps: 8, rir: 0 });
  const t = target(s.exercises[1]);
  assert.ok(t.load < 50 || t.reps < 10, JSON.stringify(t));
  // Card names are pinned, so after applying it still reads correctly
  assert.equal(describeChange(s, change, index), "Swap Incline dumbbell curl for Incline machine curl (today only): 50×12, 50×11, 50×10");
});

test("set_numbers overrides today's numbers; set count follows the list", () => {
  const index = indexCatalog(CURATED);
  let s = buildSession({ day, index, models: {}, date: "2026-10-24", weekInfo: week });
  s = applyChanges(s, [{ type: "set_numbers", exerciseIndex: 0, numbers: [{ load: 140, reps: 10 }, { load: 140, reps: 9 }, { load: 130, reps: 10 }, { load: 120, reps: 12 }] }], { index, models: {} });
  assert.equal(s.exercises[0].sets, 4);
  assert.deepEqual(s.exercises[0].plan.sets.map((x) => x.load), [140, 140, 130, 120]);
});

test("permanent rep range and set count update the stored program", () => {
  const index = indexCatalog(CURATED);
  const program = loadProgram(index, { exercises: { Pull: [{ name: "Lat pulldown", sets: 3, repMin: 8, repMax: 12 }] }, dayLabels: {} });
  const next = updateSlot(program, { exercises: { Pull: [{ name: "Lat pulldown", sets: 3, repMin: 8, repMax: 12 }] } }, "Pull", 0, { sets: 4, repRange: [6, 10] });
  assert.deepEqual(next.exercises.Pull[0], { name: "Lat pulldown", sets: 4, repMin: 6, repMax: 10 });
});
