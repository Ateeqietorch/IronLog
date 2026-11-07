// Macros in the app: setup gives targets, weigh-ins feed the trend, the
// coach can change the goal (with undo), and nothing is stored twice a day.
import { test } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const calls = [];
globalThis.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : Object.fromEntries(new URL(url).searchParams);
  calls.push(body);
  return { json: async () => ({ ok: true, records: [], rows: [] }) };
};
const store = await import("../ui/store.js");
const agent = await import("../ui/agent.js");
const E = (name) => ({ name, sets: 3, repMin: 8, repMax: 12, weight: "" });
await store.boot({ fixture: { rows: [], program: { exercises: { A: [E("Leg Extension")] }, dayLabels: { A: "A" } }, weights: [] } });

test("setup → first targets; weigh-in saved once per day and sent to the sheet", async () => {
  assert.equal(store.nutritionView().target, null);
  store.logWeight(151);
  store.logWeight(150.6); // same day: replaces
  assert.equal(store.state.weights.length, 1);
  assert.equal(store.state.bodyweight, 150.6);
  const c = store.setNutrition({ profile: { sex: "male", age: 29, heightIn: 69, activity: "moderate" }, goal: { type: "cut", ratePct: 0.5 } });
  assert.ok(c && c.kcal > 1900 && c.kcal < 2400, JSON.stringify(c));
  const v = store.nutritionView();
  assert.equal(v.target.kcal, c.kcal);
  assert.equal(v.target.protein, 151); // 1 g/lb on a cut (trend ≈ 150.6)
  await store.flushWeights();
  const writes = calls.filter((x) => x.action === "write_bodyweight");
  assert.equal(writes.at(-1).weight, "150.6");
});

test("food logs merge per day", () => {
  store.logIntake({ kcal: 1200 });
  store.logIntake({ protein: 90 });
  const t = store.nutritionView().today;
  assert.equal(t.kcal, 1200);
  assert.equal(t.protein, 90);
});

test("coach changes the goal through the engine, and undo restores it", async () => {
  const before = store.nutritionView().target.kcal;
  const sink = { actions: [], proposals: [] };
  const out = await agent.runTool("set_nutrition", { mode: "apply", goal: "gain", ratePct: 0.25 }, sink);
  assert.ok(out.applied);
  const after = store.nutritionView().target.kcal;
  assert.ok(after > before + 300, `${before} → ${after}`);
  assert.equal(sink.actions.length, 1);
  agent.undoAction(sink.actions[0]);
  assert.equal(store.state.nutrition.goal.type, "cut");
  assert.equal(store.nutritionView().target.kcal, before);
  const n = await agent.runTool("get_nutrition", {}, sink);
  assert.equal(n.target.kcal, before);
});
