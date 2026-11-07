// The coach agent's tools act on the same engine that plans the workout:
// a directive changes today's numbers, a proposal changes nothing until
// applied, undo puts everything back, and soreness re-plans the day.
import { test } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const calls = [];
globalThis.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : { action: new URL(url).searchParams.get("action") };
  calls.push(body);
  if (body.action === "coach_step") {
    // First call: the model asks for a directive; second: it answers.
    const toolTurn = !Array.isArray(body.messages.at(-1).content);
    return { json: async () => (toolTurn
      ? { ok: true, stop_reason: "tool_use", content: [{ type: "tool_use", id: "u1", name: "set_directive", input: { kind: "rep_floor", minReps: 10, scope: "all", mode: "apply" } }] }
      : { ok: true, stop_reason: "end_turn", content: [{ type: "text", text: "Done: nothing under 10 reps now." }] }) };
  }
  if (body.action === "table_list") return { json: async () => ({ ok: true, records: [] }) };
  return { json: async () => ({ ok: true }) };
};

const store = await import("../ui/store.js");
const agent = await import("../ui/agent.js");

const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const today = store.today();
const E = (name, sets, repMin, repMax) => ({ name, sets, repMin, repMax, weight: "" });
const program = { exercises: { Push: [E("Barbell Bench Press", 3, 6, 10), E("Incline Dumbbell Press", 3, 8, 12), E("Cable Lateral Raise", 3, 12, 20)] }, dayLabels: { Push: "Push" } };
// Two earlier Push workouts.
const rows = [];
for (const [ago, reps] of [[9, 7], [5, 8]]) {
  const date = addDays(today, -ago), key = `${date}_Push`;
  [["Barbell Bench Press", 185], ["Incline Dumbbell Press", 60], ["Cable Lateral Raise", 15]].forEach(([ex, load]) => {
    for (let i = 1; i <= 3; i++) rows.push({ date, day: "Push", exercise: ex, set: i, weight: load, reps: (ex === "Cable Lateral Raise" ? 13 : reps) - (i - 1), notes: "", sessionKey: key, rpe: "8", completed: "1", exerciseId: "" });
  });
}

async function fresh() {
  mem.clear();
  await store.boot({ fixture: { rows, program } });
}

test("the day is planned by the brain: levers, block, time estimate", async () => {
  await fresh();
  const s = store.state.session;
  assert.equal(s.engine, "brain");
  assert.ok(s.block && s.minutes > 0);
  const bench = s.exercises.find((e) => e.ex?.id === "barbell-bench-press");
  assert.equal(bench.lever, "add-reps");
  assert.equal(bench.plan.sets[0].reps, 9); // 185 × 8 last time → 9
});

test("a directive from the coach changes today's numbers through the engine", async () => {
  await fresh();
  const sink = { actions: [], proposals: [] };
  const out = await agent.runTool("set_directive", { kind: "rep_floor", minReps: 10, scope: "all", mode: "apply" }, sink);
  assert.match(out.applied, /under 10 reps/);
  assert.equal(sink.actions.length, 1);
  const bench = store.state.session.exercises.find((e) => e.ex?.id === "barbell-bench-press");
  assert.ok(bench.slot.repRange[0] >= 10, JSON.stringify(bench.slot.repRange));
  assert.ok(bench.plan.sets.every((x) => x.reps >= 9), JSON.stringify(bench.plan.sets));
  // undo puts it back
  agent.undoAction(sink.actions[0]);
  assert.equal(store.liveDirectives().length, 0);
  const again = store.state.session.exercises.find((e) => e.ex?.id === "barbell-bench-press");
  assert.equal(again.slot.repRange[0], 6);
});

test("a proposal changes nothing until it's applied", async () => {
  await fresh();
  const sink = { actions: [], proposals: [] };
  await agent.runTool("set_directive", { kind: "muscle_priority", muscle: "side-delts", level: "specialize", mode: "propose" }, sink);
  assert.equal(sink.proposals.length, 1);
  assert.equal(store.liveDirectives().length, 0);
  const err = await agent.applyProposalCard(sink.proposals[0]);
  assert.equal(err, null);
  assert.equal(store.directives().priorities["side-delts"], "specialize");
});

test("still sore before the first set: that muscle's sets drop and effort eases", async () => {
  await fresh();
  const before = store.state.session.exercises.find((e) => e.ex?.id === "barbell-bench-press");
  store.addFeedback({ date: today, muscle: "chest", soreness: 3 });
  const after = store.state.session.exercises.find((e) => e.ex?.id === "barbell-bench-press");
  const chest = (s) => s.exercises.filter((e) => e.ex?.contributions?.chest === 1).reduce((a, e) => a + e.sets, 0);
  assert.equal(after.rir, before.rir + 1);
  assert.ok(chest(store.state.session) <= chest({ exercises: [before, store.state.session.exercises.find((e) => e.ex?.id === "incline-dumbbell-press")] }));
});

test("read tools return the engine's real state", async () => {
  await fresh();
  const plan = await agent.runTool("get_plan", {}, { actions: [], proposals: [] });
  assert.ok(plan.today.some((l) => /Barbell bench press: 185x9/.test(l)), plan.today.join("\n"));
  const ex = await agent.runTool("get_exercise", { exercise: "bench press" }, { actions: [], proposals: [] });
  assert.equal(ex.id, "barbell-bench-press");
  assert.equal(ex.history.length, 2);
  const m = await agent.runTool("get_muscle", { muscle: "side-delts" }, { actions: [], proposals: [] });
  assert.ok(m.now);
});

test("the agent loop: the model calls a tool, the app runs it, the model answers", async () => {
  await fresh();
  calls.length = 0;
  const r = await agent.runAgent([{ role: "user", content: "no sets under 10 reps" }]);
  assert.equal(r.reply, "Done: nothing under 10 reps now.");
  assert.equal(r.actions.length, 1);
  const steps = calls.filter((c) => c.action === "coach_step");
  assert.equal(steps.length, 2);
  assert.ok(steps[0].tools.some((t) => t.name === "set_directive"));
  assert.match(JSON.stringify(steps[0].system), /IronLog/);
  assert.equal(steps[1].messages.at(-1).content[0].type, "tool_result");
  assert.equal(store.directives().minReps.all, 10);
});
