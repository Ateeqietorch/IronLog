// Rebuilds every strength model from a workout-log CSV export and reports
// how accurately the engine would have predicted your sessions.
// Usage: node scripts/replay.js <log.csv> [--json models.json]
import { readFileSync, writeFileSync } from "node:fs";
import { indexCatalog, mergeCatalogs } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { FREE_EXERCISE_DB } from "../engine/seed/free-exercise-db.js";
import { replayHistory, normalizeRows } from "../engine/replay.js";
import { e1rm } from "../engine/model.js";
import { logRows } from "./lib/csv.js";

const args = process.argv.slice(2);
const csv = args[0];
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const index = indexCatalog(mergeCatalogs(CURATED, FREE_EXERCISE_DB));
const rows = logRows(readFileSync(csv, "utf8"));
const { models, stats, unresolved } = replayHistory(rows, index);

// Naive baseline for context: "you'll repeat the reps you did last time at that set".
const { sets } = normalizeRows(rows, index);
const last = new Map(); const naive = [];
for (const s of sets) {
  if (!(s.load > 0 && s.reps > 0)) continue;
  const key = `${s.id}|${s.side}|${s.setIndex}`;
  const prev = last.get(key);
  if (prev && prev.date !== s.date) naive.push(Math.abs(prev.reps * (prev.load / s.load) - s.reps));
  last.set(key, s);
}
const naiveMae = Math.round((naive.reduce((a, b) => a + b, 0) / naive.length) * 100) / 100;

console.log(`Working sets: ${stats.workingSets}  ·  predicted: ${stats.predictedSets}  ·  unresolved names: ${unresolved.length}`);
console.log(`Rep-prediction error (MAE): ${stats.maeAll} reps overall, ${stats.maeWithRir} on the ${stats.setsWithRir} sets with RPE logged`);
console.log(`On loads the engine could actually prescribe (${stats.relevantSets} sets): MAE ${stats.maeRelevant}, ${stats.maeRelevantWithRir} with RPE (${stats.relevantSetsWithRir} sets), bias ${stats.biasRelevant}`);
console.log(`After 3+ sessions on an exercise (${stats.settledSets} sets): engine MAE ${stats.maeSettled} vs naive ${stats.naiveMaeSettled}, bias ${stats.biasSettled}`);
console.log(`Average bias: ${stats.bias > 0 ? "+" : ""}${stats.bias} reps (positive = predicted more than you did)`);
console.log(`Naive baseline ("same reps as last time, load-adjusted"): ${naiveMae}`);
console.log("\nPer exercise (most-logged first):");
for (const e of stats.perExercise.slice(0, 40)) {
  const m = models[`${e.id}|both`] ?? models[`${e.id}|L`];
  console.log(`  ${e.id.padEnd(34)} sets ${String(e.sets).padStart(3)}  MAE ${String(e.maeAll).padStart(5)}  relevant ${String(e.relevantSets).padStart(3)} MAE ${String(e.maeRelevant).padStart(5)}  bias ${String(e.bias).padStart(6)}  e1RM ${m ? Math.round(e1rm(m)) : "-"}  k ${m?.k}  decay ${m?.fatigueDecay}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(models, null, 1));
