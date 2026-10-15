import { test } from "node:test";
import assert from "node:assert/strict";
import { mesoWeek, targetRir, statusLine } from "../engine/meso.js";

test("weeks 1–5 accumulate, week 6 deloads, then a new cycle starts", () => {
  const meso = { start: "2026-10-01" };
  assert.deepEqual(mesoWeek(meso, "2026-10-01"), { week: 1, of: 5, deload: false, cycle: 0 });
  assert.equal(mesoWeek(meso, "2026-10-29").week, 5);
  assert.equal(mesoWeek(meso, "2026-11-05").deload, true);
  assert.deepEqual(mesoWeek(meso, "2026-11-12"), { week: 1, of: 5, deload: false, cycle: 1 });
});

test("RIR schedule: 3 → 2 → 2 → 1 → 1, compounds floor at 1, deload 4", () => {
  const iso = { kClass: "isolation" }, comp = { kClass: "upper-compound" };
  assert.deepEqual([1, 2, 3, 4, 5].map((week) => targetRir({ week, deload: false }, iso)), [3, 2, 2, 1, 1]);
  assert.equal(targetRir({ week: 5, deload: false }, comp), 1);
  assert.equal(targetRir({ week: 2, deload: true }, comp), 4);
  assert.equal(statusLine({ week: 3, of: 5, deload: false }, 2), "Week 3 of 5 · leave 2 in the tank");
});
