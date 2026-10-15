// Reading and writing the workout log (the "Sheet1" tab).
// Columns A–J are the v2 format and stay as they are; v3 appends K–P.
import { get } from "./sheets.js";

export const LOG_COLUMNS = ["Date", "Day", "Exercise", "Set", "Weight", "Reps", "Notes", "SessionKey", "RPE", "Completed",
  "ExerciseId", "PlannedLoad", "PlannedReps", "PlannedRIR", "PredictedReps", "EngineVersion"];

export const cleanDate = (raw) => String(raw ?? "").slice(0, 10);

export function rowsToObjects(values) {
  return (values ?? []).slice(1).filter((r) => r && r[0] && r[2]).map((r) => ({
    date: cleanDate(r[0]), day: String(r[1] ?? ""), exercise: String(r[2] ?? ""), set: r[3], weight: r[4], reps: r[5],
    notes: r[6] ?? "", sessionKey: String(r[7] ?? ""), rpe: r[8] ?? "", completed: r[9] ?? "", exerciseId: r[10] ?? "",
  }));
}

export async function readLog(opts) {
  const d = await get("read", {}, opts);
  return rowsToObjects(d.rows);
}

export async function readBodyweight(opts) {
  try {
    const d = await get("read_bodyweight", {}, opts);
    const rows = (d.rows ?? []).slice(1).filter((r) => r[0] && Number(r[1]) > 0)
      .map((r) => ({ date: cleanDate(r[0]), weight: Number(r[1]) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length - 1].weight : null;
  } catch { return null; }
}

// Replace a session in the sheet: clear its rows, then write in chunks small
// enough for a GET URL.
export async function writeSession(sessionKey, rows, opts, chunk = 10) {
  await get("clear", { sessionKey }, opts);
  for (let i = 0; i < rows.length; i += chunk) {
    await get("write", { rows: JSON.stringify(rows.slice(i, i + chunk)) }, opts);
  }
}
