import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { FREE_EXERCISE_DB } from "../engine/seed/free-exercise-db.js";
import { rankAlternatives, searchExercises } from "../engine/alternatives.js";
import { newModel, updateModel } from "../engine/model.js";
import { buildSession, logSet, applyChanges } from "../ui/session.js";
import { newTrial, applyTrials, recordSession, inReview, resolveTrial, trialSummary } from "../data/trials.js";
import { loadProgram, replaceSlot } from "../data/program.js";

const index = indexCatalog(CURATED);
const week = { week: 2, of: 5, deload: false };

test("alternatives: same pattern and muscles first, known exercises boosted", () => {
  const pd = index.byId.get("lat-pulldown");
  const r = rankAlternatives(pd, index.list);
  assert.ok(r.length >= 3);
  assert.ok(r.slice(0, 3).every((x) => x.samePattern), r.slice(0, 3).map((x) => x.ex.id).join());
  assert.ok(!r.some((x) => x.ex.id === "lat-pulldown"));
  assert.ok(!r.some((x) => (x.ex.contributions.quads ?? 0) > 0.5), "no leg exercises for a pulldown");
  const target = r[2].ex.id;
  const models = { [`${target}|both`]: { logE1rm: Math.log(100) } };
  const boosted = rankAlternatives(pd, index.list, { models });
  assert.ok(boosted.findIndex((x) => x.ex.id === target) < 2);
  assert.equal(boosted.find((x) => x.ex.id === target).known, true);
});

test("search finds curated and database exercises by partial name", () => {
  const r = searchExercises("pendulum squat", [index.list, FREE_EXERCISE_DB]);
  const r2 = searchExercises("db curl", [index.list, FREE_EXERCISE_DB]);
  assert.ok(r2.length && /curl/i.test(r2[0].ex.name), r2.map((x) => x.ex.name).join());
  assert.ok(Array.isArray(r));
  assert.deepEqual(searchExercises("", [index.list]), []);
});

const day = { key: "Push A", label: "Push", exercises: [
  { name: "Incline dumbbell press", exerciseId: "incline-dumbbell-press", sets: 3, repRange: [8, 12], unilateral: false, programWeight: 65 },
  { name: "Machine chest press", exerciseId: "machine-chest-press", sets: 2, repRange: [8, 12], unilateral: false, programWeight: 140 },
] };

test("trial: swaps the slot for N sessions of that day, then asks for a review", () => {
  let trials = [newTrial({ dayKey: "Push A", slotIndex: 1, from: index.byId.get("machine-chest-press"), to: index.byId.get("pec-deck"), sessions: 2, date: "2026-10-01" })];
  // other days untouched
  assert.equal(applyTrials({ ...day, key: "Pull" }, trials, index).exercises[1].exerciseId, "machine-chest-press");
  for (const [n, date] of [[1, "2026-10-01"], [2, "2026-10-04"]]) {
    const d = applyTrials(day, trials, index);
    assert.equal(d.exercises[1].exerciseId, "pec-deck");
    assert.deepEqual([d.exercises[1].trial.n, d.exercises[1].trial.of], [n, 2]);
    let s = buildSession({ day: d, index, models: {}, date, weekInfo: week });
    // not doing the trial exercise doesn't count
    trials = recordSession(trials, s);
    assert.equal(trials[0].done.length, n - 1);
    s = logSet(s, 1, { load: 100, reps: 12, rir: 2 });
    trials = recordSession(trials, s);
    trials = recordSession(trials, s); // finishing twice counts once
  }
  assert.equal(inReview(trials).length, 1);
  assert.equal(applyTrials(day, trials, index).exercises[1].exerciseId, "machine-chest-press", "back to the original while awaiting review");
  const ext = resolveTrial(trials, trials[0].id, "extend");
  assert.equal(ext[0].status, "active");
  assert.equal(ext[0].sessions, 4);
  assert.equal(resolveTrial(trials, trials[0].id, "keep")[0].status, "kept");
});

test("trial summary reports per-session strength from the first set", () => {
  let m = newModel("pec-deck");
  m = updateModel(m, { load: 100, reps: 12, rir: 2, setIndex: 0, date: "2026-10-01" });
  m = updateModel(m, { load: 110, reps: 12, rir: 2, setIndex: 0, date: "2026-10-04" });
  const t = { toId: "pec-deck", done: ["2026-10-01_Push A", "2026-10-04_Push A"] };
  const r = trialSummary(t, { "pec-deck|both": m });
  assert.equal(r.per.length, 2);
  assert.ok(r.changePct > 5);
});

test("trial switch from the Train screen marks today's exercise as session 1", () => {
  const s = buildSession({ day, index, models: {}, date: "2026-10-01", weekInfo: week });
  const t = applyChanges(s, [{ type: "switch_exercise", exerciseIndex: 1, toExerciseId: "pec-deck", trial: { id: "t1", n: 1, of: 3 } }], { index, models: {} });
  assert.equal(t.exercises[1].slot.trial.id, "t1");
  const plain = applyChanges(t, [{ type: "switch_exercise", exerciseIndex: 1, toExerciseId: "cable-crossover" in Object.fromEntries(index.byId) ? "cable-crossover" : "dumbbell-bench-press" }], { index, models: {} });
  assert.equal(plain.exercises[1].slot.trial, undefined, "switching away drops the trial marker");
});

test("permanent switch rewrites the slot in the v2 program format", () => {
  const storage = { exercises: { "Push A": [{ name: "Incline Dumbbell Press", sets: 3, repMin: 8, repMax: 12, weight: 65, restSec: 150 }, { name: "Machine Chest Press", sets: 2, repMin: 8, repMax: 12, weight: 140 }] }, dayLabels: { "Push A": "Push" } };
  const program = loadProgram(index, storage);
  const next = replaceSlot(program, storage, "Push A", 1, index.byId.get("pec-deck"));
  assert.equal(next.exercises["Push A"][1].name, "Pec deck");
  assert.equal(next.exercises["Push A"][1].weight, "");
  assert.equal(next.exercises["Push A"][0].restSec, 150, "other fields kept");
  assert.equal(storage.exercises["Push A"][1].name, "Machine Chest Press", "input not mutated");
  assert.equal(loadProgram(index, next).days[0].exercises[1].exerciseId, "pec-deck");
  // template programs get materialized
  const tpl = loadProgram(index, { exercises: null, dayLabels: {} });
  const t2 = replaceSlot(tpl, { exercises: null }, "Push", 0, index.byId.get("dumbbell-bench-press"));
  assert.equal(loadProgram(index, t2).days[0].exercises[0].exerciseId, "dumbbell-bench-press");
  assert.equal(Object.keys(t2.exercises).length, 5);
});
