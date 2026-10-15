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

test("coach: runs the tool loop, saves memories, returns proposals and text", () => {
  const b = loadBackend({
    props: { ANTHROPIC_API_KEY: "sk-test" },
    fetchReplies: [
      { body: { stop_reason: "tool_use", content: [
        { type: "text", text: "Let's protect that shoulder." },
        { type: "tool_use", id: "t1", name: "remember", input: { note: "Left shoulder pain on overhead pressing (Oct 2026)." } },
        { type: "tool_use", id: "t2", name: "propose_changes", input: { summary: "Swap overhead press for machine lateral raise today", changes: [{ type: "switch_exercise", exerciseIndex: 2, toExerciseId: "machine-lateral-raise" }] } },
      ] } },
      { body: { stop_reason: "end_turn", content: [{ type: "text", text: "Tap Apply if you want it." }] } },
    ],
  });
  const r = b.post({ action: "coach", messages: [{ role: "user", content: "my shoulder hurts on OHP" }], context: { day: "Push" } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.reply, /protect that shoulder[\s\S]*Tap Apply/);
  assert.equal(r.proposals.length, 1);
  assert.equal(r.proposals[0].changes[0].toExerciseId, "machine-lateral-raise");
  assert.deepEqual(r.remembered, ["Left shoulder pain on overhead pressing (Oct 2026)."]);
  assert.equal(b.sheet("CoachMemory").rows.length, 2);
  // second call sent the tool results back, and the system prompt carries context
  assert.equal(b.fetched.length, 2);
  assert.match(b.fetched[0].payload.system, /"day":"Push"/);
  assert.equal(b.fetched[1].payload.messages.at(-1).content[0].type, "tool_result");
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
