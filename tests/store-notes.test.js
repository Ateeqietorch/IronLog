// Store-level: re-saving a past workout's notes, and the coach's permanent add.
import { test } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push(opts?.body ? JSON.parse(opts.body) : { action: new URL(url).searchParams.get("action") });
  return { json: async () => ({ ok: true }) };
};

const store = await import("../ui/store.js");
const { LOG_COLUMNS } = await import("../data/log.js");

const row = (set, notes = "") => ({ date: "2026-10-25", day: "Legs", exercise: "Leg press", set, weight: 300, reps: 10, notes, sessionKey: "2026-10-25_Legs", rpe: "8", completed: "1",
  exerciseId: "leg-press", plannedLoad: 300, plannedReps: 10, plannedRir: 2, predictedReps: "", engineVersion: "3.0", sessionNote: "" });

test("adding notes to a saved workout re-writes it with only the notes changed", async () => {
  await store.boot({ fixture: { rows: [row(1), row(2)], program: { exercises: null } } });
  calls.length = 0;
  const r = await store.updateSessionNotes("2026-10-25_Legs", { exerciseNotes: { "Leg press": "Stopped after 2 sets, left adductor" }, sessionNote: "Finished the next day" });
  assert.equal(r.ok, true);
  const save = calls.find((c) => c.action === "replace_session");
  assert.equal(save.sessionKey, "2026-10-25_Legs");
  assert.equal(save.rows.length, 2);
  assert.equal(save.rows[0].length, LOG_COLUMNS.length);
  assert.equal(save.rows[0][6], "Stopped after 2 sets, left adductor");
  assert.equal(save.rows[0][16], "Finished the next day");
  assert.deepEqual(save.rows[0].slice(10, 16), ["leg-press", 300, 10, 2, "", "3.0"], "planned columns kept");
  assert.equal(store.state.rows.filter((x) => x.sessionKey === "2026-10-25_Legs").every((x) => x.sessionNote === "Finished the next day"), true);
  assert.equal(store.hasPending(), false);
});

test("coach's permanent add goes into today's workout and the program day", async () => {
  await store.boot({ fixture: { rows: [], program: { exercises: null } } });
  const s = store.state.session;
  const day = store.state.program.days.find((d) => d.key === s.dayKey);
  const n = day.exercises.length;
  const problems = store.applyProposal([{ type: "add_exercise", toExerciseId: "seated-leg-curl", sets: 2, scope: "permanent" }]);
  assert.deepEqual(problems, []);
  const after = store.state.program.days.find((d) => d.key === s.dayKey);
  assert.equal(after.exercises.length, n + 1);
  assert.equal(after.exercises[n].exerciseId, "seated-leg-curl");
  const added = store.state.session.exercises.at(-1);
  assert.equal(added.ex.id, "seated-leg-curl");
  assert.equal(added.slotIndex, n);
});
