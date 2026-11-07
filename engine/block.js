// Training blocks (mesocycles) worked out from the log (COACH-BRAIN.md §4).
// Pure. A block is a few weeks of rising effort followed by a deload week.
// It's derived from your session dates every time, so it can't drift:
//   - a break of 14+ days ends the block; the next session starts a new one
//     (re-entry week)
//   - shorter breaks pause the block instead of skipping you ahead into a deload
//   - after the accumulation weeks comes one deload week, then a new block
//   - you or the coach can start a deload or a new block early
import { daysBetween } from "./model.js";

export const RIR_SCHEDULES = Object.freeze({
  4: [3, 2, 1, 1],
  5: [3, 2, 2, 1, 1],
  6: [3, 3, 2, 2, 1, 1],
});
export const DELOAD_RIR = 4;
export const BREAK_DAYS = 14;

const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// sessionDates: unique training dates (any order). opts: { weeks, deloadFrom, newBlockFrom }
// Returns { start, week, of, deload, reentry, paused, deloadEnds, number, reason }
export function blockFor(sessionDates, date, { weeks = 5, deloadFrom = null, newBlockFrom = null } = {}) {
  const N = RIR_SCHEDULES[weeks] ? weeks : 5;
  const dates = [...new Set(sessionDates.filter((d) => d && d <= date))].sort();
  // Anchor: the first session after the last long break (or ever).
  let start = dates[0] ?? date;
  let reentry = false;
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1], dates[i]) >= BREAK_DAYS) { start = dates[i]; reentry = true; }
  }
  const lastSession = dates[dates.length - 1];
  if (lastSession && daysBetween(lastSession, date) >= BREAK_DAYS) { start = date; reentry = true; }
  if (newBlockFrom && newBlockFrom <= date && newBlockFrom > start) { start = newBlockFrom; reentry = false; }
  let number = 1;
  // Walk forward through completed blocks (accumulation + deload) with pauses.
  for (let guard = 0; guard < 52; guard++) {
    if (deloadFrom && deloadFrom >= start && deloadFrom <= date) {
      const into = daysBetween(deloadFrom, date);
      const w = weekOf(start, deloadFrom, dates);
      if (into < 7) return { start, week: N + 1, of: N, deload: true, early: true, reentry: false, paused: w.paused, deloadEnds: addDays(deloadFrom, 7), number, reason: "Deload started early." };
      start = addDays(deloadFrom, 7); number++; reentry = false; deloadFrom = null;
      continue;
    }
    const w = weekOf(start, date, dates);
    if (w.week <= N) return { start, week: w.week, of: N, deload: false, reentry: reentry && w.week === 1, paused: w.paused, number };
    if (w.week === N + 1) return { start, week: N + 1, of: N, deload: true, reentry: false, paused: w.paused, deloadEnds: w.endOf(N + 1), number, reason: `Week ${N + 1}: deload after ${N} weeks of building.` };
    start = w.endOf(N + 1); number++; reentry = false;
  }
  return { start, week: 1, of: N, deload: false, reentry: false, paused: 0, number };
}

// Weeks into a block, not counting days lost to breaks of more than a week:
// a day counts unless it's more than 7 days after the latest session.
function weekOf(start, date, dates) {
  const inBlock = new Set(dates.filter((d) => d >= start && d <= date));
  let eff = 0, paused = 0, lastS = start;
  const effAt = []; // effective day count at each calendar day
  for (let d = start, i = 0; d <= date && i < 800; d = addDays(d, 1), i++) {
    if (inBlock.has(d)) lastS = d;
    if (daysBetween(lastS, d) > 7) paused++; else eff++;
    effAt.push([d, eff]);
  }
  // First calendar day on which `weeks` full effective weeks are complete
  // (the day the next block starts).
  const endOf = (weeks) => {
    const hit = effAt.find(([, e]) => e > weeks * 7);
    return hit ? hit[0] : addDays(date, 1);
  };
  return { week: Math.floor(Math.max(0, eff - 1) / 7) + 1, paused, endOf };
}

// Target reps in reserve for an exercise this week.
// offset: +1 easier / −1 harder (directive or the muscle's recovery today).
export function rirFor(block, exercise, offset = 0) {
  if (block.deload) return DELOAD_RIR;
  const sched = RIR_SCHEDULES[block.of] ?? RIR_SCHEDULES[5];
  let r = sched[Math.min(block.week, sched.length) - 1] + offset;
  if (block.reentry) r = Math.max(r, 3);
  const compound = exercise?.kClass && exercise.kClass !== "isolation";
  return Math.max(compound ? 1 : 0, Math.min(5, r));
}

export const isFinalWeek = (block) => !block.deload && block.week >= block.of;

// Data-driven deload check (COACH-ENGINE-SPEC §5.4): two muscles with
// performance down on their last two exposures, or two exercises flagged
// painful in the last 10 days. Returns null or { reason }.
export function deloadSignal({ musclePerf = {}, joints = [], date }) {
  const down = Object.entries(musclePerf).filter(([, list]) => list.length >= 2 && list.slice(-2).every((p) => p === -1)).map(([m]) => m);
  const painful = joints.filter((j) => j.joints === 2 && daysBetween(j.date, date) <= 10);
  const painfulEx = [...new Set(painful.map((j) => j.exerciseId))];
  if (down.length >= 2) return { reason: `Performance dropped two sessions running on ${down.slice(0, 3).join(", ")}.`, muscles: down };
  if (painfulEx.length >= 2) return { reason: `Joint pain flagged on ${painfulEx.length} exercises in the last 10 days.`, exercises: painfulEx };
  return null;
}

export function blockLine(block, rir) {
  if (block.deload) return "Deload week · easy sets, half the volume";
  if (block.reentry) return `Re-entry week · ${rir} in the tank`;
  return `Week ${block.week} of ${block.of} · ${rir} in the tank`;
}
