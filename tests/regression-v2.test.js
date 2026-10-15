// Documents v2 behavior that COACH-ENGINE-SPEC.md §0 identifies as broken.
// These tests describe what the old engine does today, not what it should do.
// When v3 replaces a mechanism, the matching test here is deleted (Phase 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadV2, V2_SOURCE } from "./helpers/loadV2.js";

const v2 = loadV2();

function session(name, sets) {
  return [{ rows: sets.map(([weight, reps, rpe], i) => ({ exercise: name, set: i + 1, weight, reps, rpe, notes: "" })) }];
}

test("§0.3 unknown exercises get no muscle credit (fall into Other)", () => {
  for (const name of ["Pendulum Squat", "Belt Squat", "Hip Adduction", "Cable Y-Raise", "Machine Preacher Curl", "Smith Machine Incline Press"]) {
    assert.deepEqual({ ...v2.getMuscleContributions(name) }, { Other: 1 }, name);
  }
});

test("§0.3 fuzzy substring matching misattributes generic names", () => {
  // "Row" matches Upright Row and credits shoulders, not back.
  const row = v2.getMuscleContributions("Row");
  assert.equal(row.Shoulders, 1);
  assert.ok((row.Back ?? 0) < 1);
});

test("§0.2 far-too-easy session only moves load by a fixed step", () => {
  const ex = { name: "Hack Squat", sets: 3, repMin: 6, repMax: 10, weight: 270 };
  // 10,10,10 at RPE 6 / 6.5 / 7 is roughly 3–4 reps in reserve
  const t = v2.computeTarget(ex, session(ex.name, [[270, 10, 6], [270, 10, 6.5], [270, 10, 7]]), { inDeload: false });
  assert.equal(t.weight, 282.5);
  assert.equal(t.reps, 9);
  // ...while its own estimate supports far more
  assert.ok(t.estE1RM > 385, `estE1RM ${t.estE1RM}`);
});

test("§0.1 on-target sessions just add a rep, regardless of how close to failure", () => {
  const ex = { name: "Incline Dumbbell Press", sets: 3, repMin: 8, repMax: 10, weight: 62 };
  const t = v2.computeTarget(ex, session(ex.name, [[62, 10, 8], [62, 10, 8.5], [62, 9, 9]]), { inDeload: false });
  assert.equal(t.reason, "maintain");
  assert.equal(t.weight, 62);
});

test("§0.4 swapping an exercise rewrites the saved program", () => {
  const i = V2_SOURCE.indexOf('getElementById("swap-confirm").onclick');
  const handler = V2_SOURCE.slice(i, V2_SOURCE.indexOf("toast(\"Exercise swapped\")", i));
  assert.match(handler, /activeExArray\(\)\[swapIdx\]\s*=/);
  assert.match(handler, /persistExercises\(\)/);
});
