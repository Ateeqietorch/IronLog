import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBackend } from "./helpers/fakeAppsScript.js";

const LOG = [["Date", "Day", "Exercise", "Set", "Weight", "Reps", "Notes", "SessionKey", "", ""],
  ["2026-09-15", "Push A", "Hack Squat", 1, 270, 10, "", "2026-09-15_Push A", 8, 1]];

test("every GET action is rejected without the device key", () => {
  const b = loadBackend({ sheets: { Sheet1: LOG }, props: { PROGRAM_AUTH_TOKEN: "k1" } });
  for (const action of ["read", "clear", "write", "read_bodyweight", "ai_review", "ai_reconsider", "save_program"]) {
    assert.deepEqual(b.get({ action }), { ok: false, msg: "unauthorized" }, action);
    assert.deepEqual(b.get({ action, token: "wrong" }), { ok: false, msg: "unauthorized" }, action);
  }
  assert.equal(b.sheet("Sheet1").rows.length, 2, "nothing was cleared");
});

test("GET works with the right key, and the first key ever sent is adopted", () => {
  const b = loadBackend({ sheets: { Sheet1: LOG } });
  assert.equal(b.get({ action: "read", token: "first" }).ok, true);
  assert.equal(b.props.PROGRAM_AUTH_TOKEN, "first");
  assert.equal(b.get({ action: "read", token: "second" }).ok, false);
});

test("POST tables: upsert, update in place, list, delete", () => {
  const b = loadBackend({ props: { PROGRAM_AUTH_TOKEN: "k" } });
  assert.equal(b.post({ action: "table_list", table: "Exercises" }).ok, false, "no token");
  let r = b.post({ action: "table_upsert", token: "k", table: "Exercises",
    records: [{ key: "pendulum-squat", value: { id: "pendulum-squat", name: "Pendulum squat" } },
              { key: "belt-squat", value: { id: "belt-squat" } },
              { key: "belt-squat", value: { id: "belt-squat", name: "Belt squat" } }] });
  assert.equal(r.ok, true);
  assert.equal(b.sheet("Exercises").rows.length, 3, "header + 2 rows, duplicate key collapsed");
  b.post({ action: "table_upsert", token: "k", table: "Exercises", records: [{ key: "pendulum-squat", value: { id: "pendulum-squat", name: "Pendulum" } }] });
  r = b.post({ action: "table_list", token: "k", table: "Exercises" });
  assert.deepEqual(r.records.map((x) => [x.key, x.value.name]), [["pendulum-squat", "Pendulum"], ["belt-squat", "Belt squat"]]);
  assert.equal(b.post({ action: "table_delete", token: "k", table: "Exercises", keys: ["belt-squat"] }).deleted, 1);
  assert.equal(b.post({ action: "table_list", token: "k", table: "Exercises" }).records.length, 1);
});

test("POST rejects unknown tables", () => {
  const b = loadBackend({ props: { PROGRAM_AUTH_TOKEN: "k" } });
  assert.match(b.post({ action: "table_list", token: "k", table: "Sheet1" }).msg, /unknown table/);
});
