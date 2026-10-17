// Reproduces the Oct 16 bug: Finish tapped repeatedly while the save was slow,
// plus the reconnect and app-open retries, wrote the workout several times.
import { test } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const calls = [];
let fail = false;
globalThis.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : { action: new URL(url).searchParams.get("action") };
  calls.push(body);
  await new Promise((r) => setTimeout(r, 30)); // slow network
  if (fail) throw new TypeError("Load failed");
  return { json: async () => ({ ok: true }) };
};

const store = await import("../ui/store.js");
const { logSet } = await import("../ui/session.js");

async function freshWorkout() {
  await store.boot({ fixture: { rows: [], program: { exercises: null } } });
  let s = store.state.session;
  s = logSet(s, 0, { load: 100, reps: 10, rir: 2 });
  s = logSet(s, 0, { load: 100, reps: 9, rir: 1 });
  store.setSession(s);
}

test("tapping Finish repeatedly and retrying saves the workout exactly once", async () => {
  await freshWorkout();
  calls.length = 0;
  const results = await Promise.all([store.finishSession(), store.finishSession(), store.finishSession(), store.retryPending(), store.retryPending()]);
  await store.retryPending();
  const saves = calls.filter((c) => c.action === "replace_session");
  assert.equal(saves.length, 1, JSON.stringify(calls.map((c) => c.action)));
  assert.equal(saves[0].rows.length, 2);
  assert.equal(calls.filter((c) => c.action === "write").length, 0, "no old-style appends");
  assert.equal(results.filter((r) => r?.ok).length, 1);
  assert.equal(store.hasPending(), false);
  assert.equal(store.state.sync, "saved");
});

test("an offline save stays pending and a later retry sends the same rows once", async () => {
  await freshWorkout();
  calls.length = 0;
  fail = true;
  const r = await store.finishSession();
  assert.equal(r.pending, true);
  assert.equal(store.hasPending(), true);
  fail = false;
  await Promise.all([store.retryPending(), store.retryPending()]);
  assert.equal(calls.filter((c) => c.action === "replace_session").length, 2, "one failed try + one retry");
  assert.equal(store.hasPending(), false);
});
