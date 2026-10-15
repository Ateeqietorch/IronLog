// Maps every distinct exercise name in a workout-log CSV export to a catalog
// id (COACH-ENGINE-SPEC.md §11 step 1) and prints what needs review.
// Usage: node scripts/map-history.js <log.csv> [decisions.json]
// The CSV is the "Sheet1" tab exported from the IronLog Google Sheet.
// Your log stays on your machine; nothing here is uploaded.
import { readFileSync } from "node:fs";
import { indexCatalog, mergeCatalogs, mapHistoryNames } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { FREE_EXERCISE_DB } from "../engine/seed/free-exercise-db.js";
import { parseCsv } from "./lib/csv.js";

const [csvPath, decisionsPath] = process.argv.slice(2);
const decisions = decisionsPath ? JSON.parse(readFileSync(decisionsPath, "utf8")) : {};

const rows = parseCsv(readFileSync(csvPath, "utf8")).slice(1);
const counts = new Map();
for (const r of rows) { const n = (r[2] ?? "").trim(); if (n) counts.set(n, (counts.get(n) ?? 0) + 1); }
const names = [...counts].map(([name, count]) => ({ name, count }));
const index = indexCatalog(mergeCatalogs(CURATED, FREE_EXERCISE_DB));
const { mapped, review } = mapHistoryNames(names, index, decisions);

console.log(JSON.stringify({ totalNames: names.length, mapped: mapped.length, review: review.length }, null, 0));
console.log("\nMAPPED");
for (const m of mapped.sort((a, b) => b.count - a.count)) console.log(`  ${String(m.count).padStart(3)} sets  ${m.name}  →  ${m.id}  (${m.via})`);
console.log("\nREVIEW");
for (const r of review) console.log(`  ${String(r.count).padStart(3)} sets  ${r.name}  →  ${r.suggestions.map((s) => `${s.id} ${s.score}`).join(" | ") || "no suggestions"}`);
