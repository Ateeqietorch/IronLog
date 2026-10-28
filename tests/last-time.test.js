import { test } from "node:test";
import assert from "node:assert/strict";
import { pastSessionsFor } from "../ui/session.js";

const row = (o) => ({ date: "2026-10-01", day: "push-a", exercise: "Incline Dumbbell Press", set: 1, weight: 65, reps: 10, rpe: "8", notes: "", sessionKey: "2026-10-01_push-a", exerciseId: "incline-dumbbell-press", sessionNote: "", ...o });

test("last time: newest session first, sets in order, today's session excluded", () => {
  const rows = [
    row({ set: 2, reps: 9, rpe: "9" }), row({}),
    row({ date: "2026-10-08", sessionKey: "2026-10-08_push-a", weight: 70, notes: "left shoulder tight" }),
    row({ date: "2026-10-28", sessionKey: "2026-10-28_push-a", weight: 75 }),
    row({ exercise: "Lat Pulldown", exerciseId: "lat-pulldown" }),
  ];
  const past = pastSessionsFor(rows, { id: "incline-dumbbell-press", name: "Incline Dumbbell Press" }, { excludeKey: "2026-10-28_push-a" });
  assert.equal(past.length, 2);
  assert.equal(past[0].date, "2026-10-08");
  assert.equal(past[0].note, "left shoulder tight");
  assert.deepEqual(past[1].sets.map((s) => [s.set, s.reps, s.rir]), [[1, "10", 2], [2, "9", 1]]);
});

test("last time: old rows without an id match by name or resolver", () => {
  const rows = [
    row({ exerciseId: "", exercise: "incline db press", sessionKey: "", day: "Day 1" }),
    row({ exerciseId: "", exercise: "Incline Dumbbell Press", date: "2026-09-20", sessionKey: "" }),
  ];
  const resolve = (n) => (n === "incline db press" ? "incline-dumbbell-press" : null);
  const past = pastSessionsFor(rows, { id: "incline-dumbbell-press", name: "Incline Dumbbell Press" }, { resolve });
  assert.equal(past.length, 2);
  assert.equal(past[0].name, "incline db press");
  assert.equal(pastSessionsFor(rows, { id: "lat-pulldown", name: "Lat Pulldown" }, { resolve }).length, 0);
});
