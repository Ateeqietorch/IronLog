// Acceptance tests for the generator rework (IRONLOG_GENERATOR_SPEC.md §5)
// and the end-of-workout assessment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { loadProgram } from "../data/program.js";
import { chooseNextDay, mainMuscles, muscleState, recovered } from "../engine/recovery.js";
import { validateDay, checkDay, DEFAULT_CONSTRAINTS, spinalLoad, isAvoided } from "../engine/validate.js";
import { rankAlternatives } from "../engine/alternatives.js";
import { assessSession } from "../engine/assess.js";
import { buildSession, logSet } from "../ui/session.js";

const index = indexCatalog(CURATED);
const S = (name, sets, lo = 8, hi = 12, weight = 100) => ({ name, sets, repMin: lo, repMax: hi, weight });

// Shaped like the real v2 program that produced the complaint.
const storage = {
  exercises: {
    "Day 1 — Legs A": [S("Hack squat", 3, 6, 10), S("Romanian deadlift", 3, 6, 10), S("Seated leg curl", 3), S("Leg extension", 2), S("Standing calf raise", 3)],
    "Day 2 — Legs B": [S("Leg press", 3), S("Lying leg curl", 3), S("Barbell hip thrust", 3), S("Single-leg extension", 2), S("Seated calf raise", 3)],
    "Day 3 — Pull": [S("Pendlay row", 4, 6, 10), S("Seated cable row", 2), S("Chest supported DB row", 3), S("Lat pulldown", 3), S("Face pull", 3, 12, 20), S("Incline dumbbell curl", 3, 10, 15), S("Hammer curl", 3, 10, 15)],
    "Day 4 — Push": [S("Incline dumbbell press", 3), S("Machine chest press", 2), S("Cable lateral raise", 3, 12, 20), S("Overhead cable triceps extension", 3), S("Pec deck", 2)],
  },
  dayLabels: {},
};
const program = loadProgram(index, storage);
const dayByLabel = (l) => program.days.find((d) => d.label === l);

// Log every set of a day on a date at 2 reps in reserve.
function rowsFor(day, date) {
  return day.exercises.flatMap((e) => Array.from({ length: e.sets }, (_, i) => ({
    date, day: day.key, exercise: e.name, set: i + 1, weight: 100, reps: 10, rpe: 8, sessionKey: `${date}_${day.key}`,
  })));
}

test("1. after Legs A the next session is not Legs B", () => {
  const rows = rowsFor(dayByLabel("Legs A"), "2026-10-17");
  const pick = chooseNextDay(program, rows, index, "2026-10-18");
  assert.notEqual(pick.day.label, "Legs B");
  assert.notEqual(pick.day.label, "Legs A");
  assert.match(pick.reason, /Legs B waits/);
});

test("1b. a day explicitly allowed back-to-back can follow its pair", () => {
  const p = { ...program, days: program.days.map((d) => (d.label === "Legs B" ? { ...d, allowBackToBack: true } : d)) };
  const rows = rowsFor(dayByLabel("Legs A"), "2026-10-17");
  // Push and Pull are recovered too, so only check Legs B is no longer blocked.
  const pick = chooseNextDay({ days: [p.days[1]] }, rows, index, "2026-10-18");
  assert.equal(pick.day.label, "Legs B");
  assert.equal(pick.forced, false);
});

test("2. the old pull day fails the hard checks and gets fixed", () => {
  const pull = dayByLabel("Pull");
  const before = checkDay(pull, { index, constraints: DEFAULT_CONSTRAINTS });
  const rules = new Set(before.map((i) => i.rule));
  assert.ok(rules.has("avoid"));
  assert.ok(rules.has("pattern-sets"));
  assert.ok(rules.has("pattern-count"));

  const { day, notes, issues } = validateDay(pull, { index, constraints: DEFAULT_CONSTRAINTS });
  const ids = day.exercises.map((e) => e.exerciseId);
  assert.ok(!ids.includes("barbell-pendlay-row"));
  assert.ok(ids.includes("chest-supported-t-bar-row"), "preferred T-bar row replaces Pendlay");
  assert.ok(!ids.includes("chest-supported-db-row"), "near-identical DB row dropped");
  const rowSets = day.exercises.filter((e) => index.byId.get(e.exerciseId)?.pattern === "horizontal-row").reduce((a, e) => a + e.sets, 0);
  assert.ok(rowSets <= 6, `row sets ${rowSets}`);
  assert.deepEqual(issues, []);
  // 7. every change is explained
  assert.ok(notes.some((n) => /Pendlay/.test(n.text) && /T-bar/.test(n.text)));
  assert.ok(notes.some((n) => /dumbbell row|DB row/i.test(n.text)));
  // slot positions survive for trials and permanent switches
  const tbar = day.exercises.find((e) => e.exerciseId === "chest-supported-t-bar-row");
  assert.equal(tbar.origIndex, 0);
});

test("3. an avoided exercise never shows up as a swap suggestion", () => {
  const cable = index.byId.get("seated-cable-row");
  const avoid = (c) => !!isAvoided(c, DEFAULT_CONSTRAINTS);
  const ranked = rankAlternatives(cable, index.list, { avoid });
  assert.ok(ranked.length > 0);
  assert.ok(!ranked.some((r) => r.ex.id === "barbell-pendlay-row"));
});

test("4. with the lower back flagged, at most one heavy spine lift per session", () => {
  const day = { key: "x", label: "Heavy legs", exercises: [
    { name: "Romanian deadlift", exerciseId: "romanian-deadlift", sets: 3, repRange: [6, 10] },
    { name: "Dumbbell Romanian deadlift", exerciseId: "dumbbell-romanian-deadlift", sets: 3, repRange: [8, 12] },
    { name: "Hack squat", exerciseId: "hack-squat", sets: 3, repRange: [6, 10] },
  ] };
  const { day: fixed } = validateDay(day, { index, constraints: DEFAULT_CONSTRAINTS });
  const heavy = fixed.exercises.filter((e) => spinalLoad(index.byId.get(e.exerciseId)) === "high");
  assert.ok(heavy.length <= 1);
});

test("4b. no heavy spine lifts while the lower back is still recovering", () => {
  const legs = dayByLabel("Legs A");
  const rows = rowsFor(legs, "2026-10-17");
  const st = muscleState(rows, index, "2026-10-18");
  const { day } = validateDay(legs, { index, constraints: DEFAULT_CONSTRAINTS, recovery: st, recoveredFn: (m) => recovered(st, m, "2026-10-18") });
  assert.ok(!day.exercises.some((e) => spinalLoad(index.byId.get(e.exerciseId)) === "high"));
});

test("5. curl volume shrinks when rows and pulldowns already hit the biceps", () => {
  const { day } = validateDay(dayByLabel("Pull"), { index, constraints: DEFAULT_CONSTRAINTS });
  const curls = day.exercises.filter((e) => index.byId.get(e.exerciseId)?.pattern === "elbow-flexion").reduce((a, e) => a + e.sets, 0);
  const load = day.exercises.reduce((a, e) => a + (index.byId.get(e.exerciseId)?.contributions?.biceps ?? 0) * e.sets, 0);
  assert.ok(load <= 10, `biceps fractional sets ${load}`);
  assert.ok(curls < 6, `curl sets ${curls}`);
});

test("6. three days in a row give three different focuses", () => {
  let rows = [];
  const focus = [];
  for (const date of ["2026-10-16", "2026-10-17", "2026-10-18"]) {
    const pick = chooseNextDay(program, rows, index, date);
    focus.push(mainMuscles(pick.day, index).sort().join(","));
    rows = [...rows, ...rowsFor(pick.day, date)];
  }
  assert.equal(new Set(focus).size, 3, focus.join(" | "));
});

test("assessment says closer when lifts go up with honest effort", () => {
  const day = { key: "Day 4 — Push", label: "Push", exercises: [
    { name: "Incline dumbbell press", exerciseId: "incline-dumbbell-press", sets: 2, repRange: [8, 12], programWeight: 60 },
    { name: "Machine chest press", exerciseId: "machine-chest-press", sets: 2, repRange: [8, 12], programWeight: 140 },
  ] };
  const past = [
    ...["2026-09-20", "2026-10-11"].flatMap((date, w) => day.exercises.flatMap((e) => [1, 2].map((set) => ({
      date, day: day.key, exercise: e.name, set, weight: e.programWeight + w * 5, reps: 9, rpe: 8, sessionKey: `${date}_x`,
    })))),
  ];
  let s = buildSession({ day, index, models: {}, date: "2026-10-18", weekInfo: { week: 2, of: 5, deload: false } });
  for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
    s = logSet(s, i, { load: day.exercises[i].programWeight + 10, reps: 10, rir: 2 });
    s.exercises[i].logged = s.exercises[i].logged.map((l) => ({ ...l, plannedRir: 2 }));
  }
  const todayRows = s.exercises.flatMap((e) => e.logged.map((l) => ({ date: "2026-10-18", day: day.key, exercise: e.name, set: l.index + 1, weight: l.load, reps: l.reps, rpe: 8, sessionKey: "t" })));
  const a = assessSession({ session: s, rows: [...past, ...todayRows], index, date: "2026-10-18" });
  assert.equal(a.verdict, "closer");
  assert.ok(a.strength.every((x) => x.status === "up"));
  assert.ok(a.lines.some((l) => /last month/i.test(l)));
  assert.ok(a.lines.some((l) => /Weekly sets/.test(l)));
});

test("assessment is a baseline the first time", () => {
  const day = { key: "d", label: "Push", exercises: [{ name: "Pec deck", exerciseId: "pec-deck", sets: 1, repRange: [10, 15], programWeight: 100 }] };
  let s = buildSession({ day, index, models: {}, date: "2026-10-18", weekInfo: { week: 1, of: 5, deload: false } });
  s = logSet(s, 0, { load: 100, reps: 12, rir: 2 });
  const a = assessSession({ session: s, rows: [], index, date: "2026-10-18" });
  assert.equal(a.verdict, "baseline");
});
