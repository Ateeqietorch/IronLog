// Weigh-in entries can be edited and deleted; deletes reach the sheet and
// survive a reload while still pending.
import { test } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const calls = [];
let fail = false;
globalThis.fetch = async (url, opts) => {
  if (fail) throw new Error("offline");
  const body = opts?.body ? JSON.parse(opts.body) : Object.fromEntries(new URL(url).searchParams);
  calls.push(body);
  return { json: async () => ({ ok: true, records: [], rows: [] }) };
};
const store = await import("../ui/store.js");
const E = (name) => ({ name, sets: 3, repMin: 8, repMax: 12, weight: "" });
await store.boot({ fixture: { rows: [], program: { exercises: { A: [E("Leg Extension")] }, dayLabels: { A: "A" } }, weights: [{ date: "2026-11-01", weight: 160 }, { date: "2026-11-05", weight: 158.4 }] } });

test("edit a past weigh-in", async () => {
  store.logWeight(158.8, "2026-11-05");
  assert.deepEqual(store.state.weights.map((x) => x.weight), [160, 158.8]);
  assert.equal(store.state.bodyweight, 158.8);
  await store.flushWeights();
  assert.equal(calls.filter((c) => c.action === "write_bodyweight").at(-1).weight, "158.8");
});

test("delete the latest weigh-in: bodyweight falls back, sheet gets a delete", async () => {
  calls.length = 0;
  assert.equal(store.removeWeight("2026-11-05"), true);
  assert.deepEqual(store.state.weights, [{ date: "2026-11-01", weight: 160 }]);
  assert.equal(store.state.bodyweight, 160);
  await store.flushWeights();
  assert.deepEqual(calls.map((c) => [c.action, c.date]), [["delete_bodyweight", "2026-11-05"]]);
  assert.equal(store.removeWeight("2026-11-05"), false);
});

test("a delete made offline stays pending and is retried", async () => {
  fail = true;
  store.removeWeight("2026-11-01");
  await store.flushWeights();
  const pend = JSON.parse(localStorage.getItem("il4:weightsPending"));
  assert.deepEqual(pend, [{ date: "2026-11-01", weight: null }]);
  fail = false; calls.length = 0;
  await store.flushWeights();
  assert.deepEqual(calls.map((c) => c.action), ["delete_bodyweight"]);
  assert.deepEqual(JSON.parse(localStorage.getItem("il4:weightsPending")), []);
});
