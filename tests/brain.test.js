import { test } from "node:test";
import assert from "node:assert/strict";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { planDay, coachSnapshot, inferDaysPerWeek } from "../engine/brain.js";
import { resolveDirectives } from "../engine/directives.js";

const index = indexCatalog(CURATED);
const slot = (id, sets, lo, hi) => ({ name: index.byId.get(id).name, exerciseId: id, sets, repRange: [lo, hi], unilateral: false, programWeight: null });
const program = { days: [
  { key: "Push", label: "Push", exercises: [slot("barbell-bench-press", 3, 6, 10), slot("incline-dumbbell-press", 3, 8, 12), slot("cable-lateral-raise", 3, 12, 20), slot("overhead-cable-triceps-extension", 3, 10, 15)] },
  { key: "Pull", label: "Pull", exercises: [slot("lat-pulldown", 3, 8, 12), slot("chest-supported-t-bar-row", 3, 8, 12), slot("incline-dumbbell-curl", 3, 10, 15)] },
  { key: "Legs", label: "Legs", exercises: [slot("hack-squat", 3, 6, 10), slot("romanian-deadlift", 3, 6, 10), slot("seated-leg-curl", 3, 10, 15), slot("standing-calf-raise", 3, 10, 15)] },
] };
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

// A history of Push/Pull/Legs every other day.
function history(start, sessions, perf = {}) {
  const out = [];
  for (let i = 0; i < sessions; i++) {
    const day = program.days[i % 3];
    const date = addDays(start, i * 2);
    for (const s of day.exercises) {
      const base = perf[s.exerciseId] ?? { load: 100, reps: s.repRange[0] + 1 };
      for (let k = 0; k < s.sets; k++) out.push({ date, id: s.exerciseId, side: "both", setIndex: k, load: base.load, reps: Math.max(1, base.reps - k), rir: 2 });
    }
  }
  return out;
}

test("planDay: every exercise gets a lever, sets, effort and a reason", () => {
  const sets = history("2026-10-01", 9);
  const plan = planDay({ day: program.days[0], program, date: "2026-10-20", sets, index, directives: resolveDirectives([]) });
  assert.equal(plan.weekInfo.week, 3);
  assert.ok(plan.exercises.length >= 4);
  for (const it of plan.exercises) {
    assert.ok(it.decision.lever, it.ex.id);
    assert.ok(it.sets >= 1);
    assert.ok(it.rir >= 0 && it.rir <= 4);
    assert.ok(typeof it.decision.text === "string" && it.decision.text.length > 10);
  }
  assert.ok(plan.minutes > 20);
  assert.ok(coachSnapshot(plan).muscles.chest);
});

test("same history in, same plan out", () => {
  const sets = history("2026-10-01", 9);
  const a = planDay({ day: program.days[0], program, date: "2026-10-20", sets, index, directives: resolveDirectives([]) });
  const b = planDay({ day: program.days[0], program, date: "2026-10-20", sets, index, directives: resolveDirectives([]) });
  assert.deepEqual(coachSnapshot(a), coachSnapshot(b));
});

test("a tight time budget pairs isolation work into supersets, then trims sets", () => {
  const sets = history("2026-10-01", 9);
  const roomy = planDay({ day: program.days[0], program, date: "2026-10-20", sets, index, directives: resolveDirectives([]) });
  assert.equal(roomy.supersets.length, 0);
  const tight = planDay({ day: program.days[0], program, date: "2026-10-20", sets, index, directives: resolveDirectives([{ id: "s", kind: "schedule", minutes: 40, at: "2026-10-01" }]) });
  assert.ok(tight.supersets.length >= 1, JSON.stringify(tight.notes));
  assert.ok(tight.minutes < roomy.minutes);
  assert.ok(tight.notes.some((n) => n.rule === "time"));
});

test("still sore today: that muscle gets fewer sets and an extra rep in the tank", () => {
  const sets = history("2026-10-01", 9);
  const dir = resolveDirectives([]);
  const base = planDay({ day: program.days[0], program, date: "2026-10-20", sets, index, directives: dir });
  const sore = planDay({ day: program.days[0], program, date: "2026-10-20", sets, index, directives: dir, feedback: [{ date: "2026-10-20", muscle: "chest", soreness: 3 }] });
  const chestSets = (p) => p.exercises.filter((e) => e.ex.contributions.chest === 1).reduce((a, e) => a + e.sets, 0);
  assert.ok(chestSets(sore) < chestSets(base));
  const bench = (p) => p.exercises.find((e) => e.ex.id === "barbell-bench-press");
  assert.equal(bench(sore).rir, bench(base).rir + 1);
  assert.ok(sore.notes.some((n) => n.rule === "sore"));
});

test("good feedback grows a muscle's sets; a lagging small muscle gets an add-on elsewhere", () => {
  const sets = history("2026-10-01", 9);
  const fb = [];
  for (let i = 0; i < 9; i += 3) {
    const date = addDays("2026-10-01", i * 2);
    fb.push({ date, muscle: "side-delts", pump: 0, workload: 0 }, { date: addDays(date, 6), muscle: "side-delts", soreness: 0 });
  }
  const dir = resolveDirectives([]);
  const plain = planDay({ day: program.days[0], program, date: "2026-10-19", sets, index, directives: dir });
  const fed = planDay({ day: program.days[0], program, date: "2026-10-19", sets, index, directives: dir, feedback: fb });
  const target = (p) => p.muscles["side-delts"].perSession;
  assert.ok(target(fed) > target(plain), `${target(fed)} vs ${target(plain)}`);
  // Side delts and biceps each get one exercise on one day, at 2 days a week:
  // structurally short, so Legs day gets a short add-on for one of them.
  const sparse = history("2026-10-01", 3);
  const legs = planDay({ day: program.days[2], program, date: "2026-10-12", sets: sparse, index, directives: resolveDirectives([{ id: "s", kind: "schedule", daysPerWeek: 2, at: "2026-10-01" }]) });
  assert.ok(legs.addOn, JSON.stringify(legs.notes));
  assert.ok(["side-delts", "biceps", "rear-delts"].includes(legs.addOn.muscle), legs.addOn.muscle);
  assert.ok(legs.exercises.some((e) => e.addOn === legs.addOn.muscle));
  // and the coach can switch add-ons off
  const off = planDay({ day: program.days[2], program, date: "2026-10-12", sets: sparse, index, directives: resolveDirectives([{ id: "s", kind: "schedule", daysPerWeek: 2, at: "2026-10-01" }, { id: "t", kind: "technique", block: ["add-ons"], at: "2026-10-01" }]) });
  assert.equal(off.addOn, null);
});

test("deload week halves the sets and every lever is deload", () => {
  const sets = history("2026-09-01", 18);
  const plan = planDay({ day: program.days[0], program, date: "2026-10-08", sets, index, directives: resolveDirectives([]) });
  assert.equal(plan.weekInfo.deload, true);
  assert.ok(plan.exercises.every((e) => e.decision.lever === "deload" && e.rir === 4 && e.sets <= 2));
});

test("days per week is read from the log when you haven't set it", () => {
  const dates = ["2026-10-01", "2026-10-03", "2026-10-06", "2026-10-08", "2026-10-10", "2026-10-13", "2026-10-15"];
  assert.equal(inferDaysPerWeek(dates, "2026-10-16"), 3);
});

// ── Simulation: 12 weeks of a lifter who follows the plan ────────────────
// True strength rises ~0.6%/week on every lift; the lifter reports pump low
// and recovery early on side delts (they want more), and normal elsewhere.
test("simulation: progress happens on several levers, not just weight", () => {
  const truth = { "barbell-bench-press": 230, "incline-dumbbell-press": 85, "cable-lateral-raise": 30, "overhead-cable-triceps-extension": 90, "lat-pulldown": 200, "chest-supported-t-bar-row": 170, "incline-dumbbell-curl": 40, "hack-squat": 400, "romanian-deadlift": 330, "seated-leg-curl": 190, "standing-calf-raise": 330 };
  let sets = history("2026-09-01", 3, {
    "barbell-bench-press": { load: 180, reps: 8 }, "incline-dumbbell-press": { load: 60, reps: 10 }, "cable-lateral-raise": { load: 15, reps: 14 },
    "overhead-cable-triceps-extension": { load: 50, reps: 12 }, "lat-pulldown": { load: 150, reps: 10 }, "chest-supported-t-bar-row": { load: 120, reps: 10 },
    "incline-dumbbell-curl": { load: 20, reps: 12 }, "hack-squat": { load: 300, reps: 8 }, "romanian-deadlift": { load: 245, reps: 8 },
    "seated-leg-curl": { load: 140, reps: 12 }, "standing-calf-raise": { load: 250, reps: 12 },
  });
  const feedback = [];
  const levers = new Set();
  const latSets = [];
  const sideDelt = [];
  let date = "2026-09-07";
  let deloads = 0;
  for (let n = 0; n < 36; n++) {
    const day = program.days[n % 3];
    const plan = planDay({ day, program, date, sets, index, feedback, directives: resolveDirectives([]) });
    if (plan.weekInfo.deload) deloads++;
    else if (plan.block.number === 1) sideDelt.push(plan.muscles["side-delts"].perSession);
    const weeks = (Date.parse(date) - Date.parse("2026-09-01")) / (7 * 864e5);
    for (const it of plan.exercises) {
      levers.add(it.decision.lever);
      if (it.ex.id === "cable-lateral-raise") latSets.push(it.sets);
      const k = it.ex.kClass === "isolation" ? 34 : 32;
      const E = truth[it.ex.id] * (1 + 0.006 * weeks);
      (it.decision.sets ?? []).forEach((s, i) => {
        const capacity = Math.floor(k * ((E * 0.975 ** i) / s.load - 1));
        const reps = Math.max(1, Math.min(capacity - s.rir, capacity));
        sets.push({ date, id: it.ex.id, side: "both", setIndex: i, load: s.load, reps, rir: Math.max(0, capacity - reps) });
      });
    }
    if (day.key === "Push") feedback.push({ date, muscle: "side-delts", pump: 0, workload: 0 }, { date: addDays(date, 6), muscle: "side-delts", soreness: 1 });
    date = addDays(date, 2 + (n % 2)); // 3 sessions a week
  }
  for (const l of ["add-reps", "add-load", "deload"]) assert.ok(levers.has(l), `missing lever ${l}: ${[...levers]}`);
  assert.ok(deloads >= 1);
  // Low pump / easy / recovered early on side delts: their sets per session
  // climb through the first block.
  assert.ok(Math.max(...sideDelt) > sideDelt[0], `side delt target ${sideDelt}`);
  // Side delts only get one exercise on one day, so another day picks up an add-on.
  assert.ok(levers.size >= 4, [...levers].join(","));
  // Loads went up on the main lifts.
  const top = (id) => Math.max(...sets.filter((s) => s.id === id && s.date >= "2026-11-15").map((s) => s.load));
  assert.ok(top("barbell-bench-press") > 180, String(top("barbell-bench-press")));
  assert.ok(top("hack-squat") > 300, String(top("hack-squat")));
});
