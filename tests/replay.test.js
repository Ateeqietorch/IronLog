import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSided, normalizeRows, replayHistory } from "../engine/replay.js";
import { indexCatalog } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { e1rm } from "../engine/model.js";

const index = indexCatalog(CURATED);

test("parseSided reads plain and L/R values", () => {
  assert.deepEqual(parseSided("90"), { both: 90 });
  assert.deepEqual(parseSided("L:90/R:85"), { L: 90, R: 85 });
  assert.deepEqual(parseSided(""), {});
});

test("normalizeRows resolves names, splits sides, converts RPE to RIR, skips blanks", () => {
  const rows = [
    { date: "2026-09-01", exercise: "Single Leg Leg Press", set: 1, weight: "L:90/R:85", reps: "L:8/R:9", rpe: "8" },
    { date: "2026-09-01", exercise: "Hack Squat", set: 1, weight: "270", reps: "10", rpe: "" },
    { date: "2026-09-01", exercise: "Totally Unknown Lift", set: 1, weight: "50", reps: "10", rpe: "" },
  ];
  const { sets, unresolved } = normalizeRows(rows, index);
  assert.equal(sets.length, 3);
  assert.deepEqual(sets.filter((s) => s.id === "single-leg-press").map((s) => [s.side, s.load, s.reps, s.rir]), [["L", 90, 8, 2], ["R", 85, 9, 2]]);
  assert.equal(sets.find((s) => s.id === "hack-squat").rir, null);
  assert.deepEqual(unresolved, [{ name: "Totally Unknown Lift", count: 1 }]);
});

test("replayHistory builds models and reports accuracy", () => {
  const rows = [];
  for (let w = 0; w < 8; w++) {
    const d = new Date(Date.parse("2026-07-01T00:00:00Z") + w * 7 * 86400000).toISOString().slice(0, 10);
    for (let s = 1; s <= 3; s++) rows.push({ date: d, exercise: "Lat Pulldown", set: s, weight: String(150 + w * 2.5), reps: String(10 - s + 1), rpe: "8" });
  }
  const r = replayHistory(rows, index);
  const m = r.models["lat-pulldown|both"];
  assert.ok(m && e1rm(m) > 180 && e1rm(m) < 260, `e1rm ${m && e1rm(m)}`);
  assert.equal(m.exposures, 8);
  assert.ok(r.stats.maeRelevant < 2, `mae ${r.stats.maeRelevant}`);
});
