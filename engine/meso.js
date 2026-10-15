// Mesocycle effort schedule (COACH-ENGINE-SPEC.md §5.3). Phase 6 adds the
// volume model and data-driven deload triggers on top of this.
import { daysBetween } from "./model.js";

export const ACCUMULATION_RIR = Object.freeze([3, 2, 2, 1, 1]);
export const DELOAD_RIR = 4;

// meso: { start: "YYYY-MM-DD" }. Returns week info for a date.
export function mesoWeek(meso, date) {
  const len = ACCUMULATION_RIR.length + 1;
  if (!meso?.start) return { week: 1, of: ACCUMULATION_RIR.length, deload: false, cycle: 0 };
  const d = Math.max(0, daysBetween(meso.start, date));
  const w = Math.floor(d / 7);
  const cycle = Math.floor(w / len);
  const inCycle = (w % len) + 1;
  return { week: Math.min(inCycle, ACCUMULATION_RIR.length), of: ACCUMULATION_RIR.length, deload: inCycle === len, cycle };
}

// Target reps in reserve for one exercise this week. Compounds never go
// below 1; isolation may go to 0 on its last set in the final week.
export function targetRir(weekInfo, exercise) {
  if (weekInfo.deload) return DELOAD_RIR;
  const r = ACCUMULATION_RIR[weekInfo.week - 1];
  const compound = exercise?.kClass && exercise.kClass !== "isolation";
  return compound ? Math.max(1, r) : r;
}

export function deloadSets(sets) {
  return Math.max(1, Math.ceil(sets / 2));
}

export function statusLine(weekInfo, rir) {
  if (weekInfo.deload) return "Deload week · easy sets";
  return `Week ${weekInfo.week} of ${weekInfo.of} · leave ${rir} in the tank`;
}
