import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBackend } from "./helpers/fakeAppsScript.js";

const LOG = [["Date", "Day", "Exercise", "Set", "Weight", "Reps", "Notes", "SessionKey", "", ""],
  ["2026-09-15", "Push A", "Hack Squat", 1, 270, 10, "", "2026-09-15_Push A", 8, 1]];

test("GET actions stay open, as in v2 (only program backup checks the key)", () => {
  const b = loadBackend({ sheets: { Sheet1: LOG }, props: { PROGRAM_AUTH_TOKEN: "k1" } });
  assert.equal(b.get({ action: "read" }).ok, true);
  assert.deepEqual(b.get({ action: "save_program", token: "wrong" }), { ok: false, msg: "unauthorized" });
});

test("POST tables: upsert, update in place, list, delete", () => {
  const b = loadBackend({ props: { PROGRAM_AUTH_TOKEN: "k" } });
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

test("coach: answers in one call when it already has text, saves memories, returns proposals", () => {
  const b = loadBackend({
    props: { ANTHROPIC_API_KEY: "sk-test" },
    fetchReplies: [
      { body: { stop_reason: "tool_use", content: [
        { type: "text", text: "Let's protect that shoulder." },
        { type: "tool_use", id: "t1", name: "remember", input: { note: "Left shoulder pain on overhead pressing (Oct 2026)." } },
        { type: "tool_use", id: "t2", name: "propose_changes", input: { summary: "Swap overhead press for machine lateral raise today", changes: [{ type: "switch_exercise", exerciseIndex: 2, toExerciseId: "machine-lateral-raise" }] } },
      ] } },
    ],
  });
  const r = b.post({ action: "coach", requestId: "abc", messages: [{ role: "user", content: "my shoulder hurts on OHP" }], context: { day: "Push" } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.reply, "Let's protect that shoulder.");
  assert.equal(r.proposals[0].changes[0].toExerciseId, "machine-lateral-raise");
  assert.deepEqual(r.remembered, ["Left shoulder pain on overhead pressing (Oct 2026)."]);
  assert.equal(b.sheet("CoachMemory").rows.length, 2);
  assert.equal(b.fetched.length, 1, "no second round-trip");
  assert.match(b.fetched[0].payload.system, /"day":"Push"/);
  // the answer is parked so a phone that dropped the request can collect it
  assert.equal(b.post({ action: "coach_result", requestId: "abc" }).reply, "Let's protect that shoulder.");
  assert.equal(b.post({ action: "coach_result", requestId: "nope" }).pending, true);
});

test("coach: a tool-only turn gets a follow-up call, and an empty answer is never returned", () => {
  const b = loadBackend({
    props: { ANTHROPIC_API_KEY: "sk-test" },
    fetchReplies: [
      { body: { stop_reason: "tool_use", content: [
        { type: "tool_use", id: "t2", name: "propose_changes", input: { summary: "Swap", changes: [] } },
      ] } },
      { body: { stop_reason: "end_turn", content: [] } },
    ],
  });
  const r = b.post({ action: "coach", messages: [{ role: "user", content: "swap it" }], context: {} });
  assert.equal(b.fetched.length, 2);
  assert.equal(b.fetched[1].payload.messages.at(-1).content[0].type, "tool_result");
  assert.equal(r.reply, "Here's what I'd change:");
});

const HDR = ["Date", "Day", "Exercise", "Set", "Weight", "Reps", "Notes", "SessionKey", "RPE", "Completed"];
const row = (key, ex, set, w = 100, reps = 10) => [key.slice(0, 10), "Legs A", ex, set, w, reps, "", key, 8, 1, ex.toLowerCase(), w, reps, 2, "", "3.0.0"];

test("replace_session: saving the same workout repeatedly never duplicates sets", () => {
  const other = ["2026-10-14", "Push A", "Bench", 1, 185, 8, "", "2026-10-14_Push A", 8, 1];
  const b = loadBackend({ sheets: { Sheet1: [HDR, other] } });
  const key = "2026-10-16_Legs A";
  const rows = [row(key, "Calf", 1), row(key, "Calf", 2), row(key, "Curl", 1)];
  for (let i = 0; i < 4; i++) assert.equal(b.post({ action: "replace_session", sessionKey: key, rows }).ok, true);
  const sheet = b.sheet("Sheet1");
  assert.equal(sheet.rows.length, 1 + 1 + 3);
  assert.deepEqual(sheet.rows[1], other, "other sessions untouched");
  assert.ok(sheet.insertedCols >= 6, "widened the sheet for the v3 columns");
  // an edit replaces, not appends
  b.post({ action: "replace_session", sessionKey: key, rows: [row(key, "Calf", 1, 110)] });
  assert.equal(sheet.rows.length, 3);
  assert.equal(sheet.rows[2][4], 110);
});

test("replace_session refuses rows from another session", () => {
  const b = loadBackend({ sheets: { Sheet1: [HDR] } });
  const r = b.post({ action: "replace_session", sessionKey: "2026-10-16_Legs A", rows: [row("2026-10-15_Push A", "Bench", 1)] });
  assert.equal(r.ok, false);
});

test("dedupe_log: removes repeated sets, keeps one of each and every other row", () => {
  const k = "2026-10-16_Legs A";
  const rows = [HDR, row("2026-10-14_Push A", "Bench", 1), row(k, "Calf", 3), row(k, "Calf", 1), row(k, "Calf", 3), row(k, "Press", 1),
    row(k, "Calf", 1), row(k, "Calf", 2), row(k, "Press", 1), row(k, "Press", 1)];
  const b = loadBackend({ sheets: { Sheet1: rows } });
  const r = b.post({ action: "dedupe_log" });
  assert.equal(r.removed, 4);
  const left = b.sheet("Sheet1").rows.slice(1).map((x) => `${x[7].slice(11)}|${x[2]}|${x[3]}`).sort();
  assert.deepEqual(left, ["Legs A|Calf|1", "Legs A|Calf|2", "Legs A|Calf|3", "Legs A|Press|1", "Push A|Bench|1"]);
  assert.equal(b.post({ action: "dedupe_log" }).removed, 0);
});

test("coach: falls back to the older model id if the new one isn't available", () => {
  const b = loadBackend({
    props: { ANTHROPIC_API_KEY: "sk-test" },
    fetchReplies: [
      { code: 404, body: { error: { message: "model not found" } } },
      { body: { stop_reason: "end_turn", content: [{ type: "text", text: "Hi." }] } },
    ],
  });
  const r = b.post({ action: "coach", messages: [{ role: "user", content: "hey" }], context: {} });
  assert.equal(r.reply, "Hi.");
  assert.equal(b.fetched[1].payload.model, "claude-sonnet-5");
});
