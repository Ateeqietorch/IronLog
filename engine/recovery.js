// Recovery and next-session selection (IRONLOG_GENERATOR_SPEC.md §1).
// Pure: rows, catalog index and the date come in; nothing reads the clock.
//
// The old rule was "next day in the list", which put Legs B the day after
// Legs A. Now each program day is scored by how recovered its main muscles
// are and how far behind they are on weekly volume, and a day whose main
// muscles are still recovering is blocked unless nothing else qualifies (or
// the day is explicitly allowed back-to-back).
import { normalizeRows } from "./replay.js";
import { daysBetween } from "./model.js";

export const LARGE = new Set(["chest", "lats", "upper-back", "quads", "hamstrings", "glutes", "adductors"]);
export const SPINE = new Set(["lower-back"]);
// Rows only carry a date, so windows are whole days.
// [after a light session, after 5+ hard sets]
export const WINDOWS = { large: [2, 3], small: [1, 2], spine: [2, 3] };
export const HEAVY_SETS = 5;
// A muscle counts as a day's main muscle once the day gives it this many
// fractional sets (e.g. 3 sets at 1.0, or 6 sets at 0.5).
export const MAIN_MIN = 3;
// Only meaningful contributors count toward recovery (0.5 and up).
const MIN_CREDIT = 0.5;
export const WEEKLY_TARGET = [10, 20];

const sizeOf = (m) => (SPINE.has(m) ? "spine" : LARGE.has(m) ? "large" : "small");
const rpeWeight = (rir) => (rir == null ? 0.9 : rir >= 4 ? 0 : rir === 3 ? 0.8 : rir === 2 ? 0.9 : 1);

export function windowFor(muscle, stimulus) {
  const w = WINDOWS[sizeOf(muscle)];
  return stimulus >= HEAVY_SETS ? w[1] : w[0];
}

// Per muscle: last day trained, stimulus that day (RPE-weighted fractional
// hard sets) and fractional hard sets in the 7 days up to and including date.
export function muscleState(rows, index, date) {
  const sets = normalizeRows(rows, index).sets.filter((s) => s.side !== "R"); // count a unilateral set once
  const byDay = new Map(); // date -> muscle -> stimulus
  const weekly = {};
  for (const s of sets) {
    if (s.date > date) continue;
    const ex = index.byId.get(s.id);
    if (!ex) continue;
    const w = rpeWeight(s.rir);
    if (!w) continue;
    const ago = daysBetween(s.date, date);
    for (const [m, c] of Object.entries(ex.contributions ?? {})) {
      if (c < MIN_CREDIT) continue;
      if (!byDay.has(s.date)) byDay.set(s.date, {});
      const d = byDay.get(s.date);
      d[m] = (d[m] ?? 0) + c * w;
      if (ago < 7) weekly[m] = (weekly[m] ?? 0) + c;
    }
  }
  const out = {};
  for (const d of [...byDay.keys()].sort()) {
    for (const [m, v] of Object.entries(byDay.get(d))) {
      if (v < 1) continue; // a stray half-set doesn't make it a training day for that muscle
      out[m] = { lastTrained: d, stimulus: Math.round(v * 10) / 10 };
    }
  }
  for (const m of new Set([...Object.keys(out), ...Object.keys(weekly)])) {
    out[m] = { lastTrained: null, stimulus: 0, ...out[m], weeklySets: Math.round((weekly[m] ?? 0) * 10) / 10 };
  }
  return out;
}

// Is this muscle recovered on `date`? Unknown muscles are.
export function recovered(st, muscle, date) {
  const s = st[muscle];
  if (!s?.lastTrained) return { ok: true, daysLeft: 0 };
  const since = daysBetween(s.lastTrained, date);
  const need = windowFor(muscle, s.stimulus);
  return { ok: since >= need, daysLeft: Math.max(0, need - since), since, need };
}

// Fractional sets per muscle a program day would give.
export function dayLoad(day, index) {
  const load = {};
  for (const slot of day.exercises ?? []) {
    const ex = slot.exerciseId ? index.byId.get(slot.exerciseId) : null;
    if (!ex) continue;
    for (const [m, c] of Object.entries(ex.contributions ?? {})) {
      if (c < MIN_CREDIT) continue;
      load[m] = (load[m] ?? 0) + c * (slot.sets ?? 3);
    }
  }
  return load;
}

export function mainMuscles(day, index) {
  return Object.entries(dayLoad(day, index)).filter(([, v]) => v >= MAIN_MIN).map(([m]) => m);
}

const NICE = { "upper-back": "upper back", "lower-back": "lower back", "front-delts": "front delts", "side-delts": "side delts", "rear-delts": "rear delts" };
export const niceMuscle = (m) => NICE[m] ?? m;
export const listText = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// Score every program day for `date`.
// `prepare(day)` lets the caller score the day as it would actually be built
// (after the validator swaps out avoided exercises).
export function scoreDays(program, rows, index, date, { prepare = (d) => d } = {}) {
  const st = muscleState(rows, index, date);
  return program.days.map((raw, order) => {
    const day = prepare(raw);
    const main = mainMuscles(day, index);
    const notReady = main.filter((m) => !recovered(st, m, date).ok);
    // Indirect load: rows and hinges both tax the lower back.
    const load = dayLoad(day, index);
    const spineBusy = (load["lower-back"] ?? 0) >= 1.5 && !recovered(st, "lower-back", date).ok;
    const ready = main.length ? (main.length - notReady.length) / main.length : 1;
    // Volume need: how far the main muscles are under the weekly minimum.
    const need = main.length ? main.reduce((a, m) => a + Math.max(0, WEEKLY_TARGET[0] - (st[m]?.weeklySets ?? 0)), 0) / (main.length * WEEKLY_TARGET[0]) : 0;
    // Days since this exact day was last done (rotation fairness).
    const lastDone = lastDoneDate(rows, day.key);
    const staleness = lastDone ? Math.min(14, daysBetween(lastDone, date)) / 14 : 1;
    const score = ready * 2 + need + staleness * 0.5 - (spineBusy ? 0.5 : 0) - order * 0.001;
    return { day: raw, main, notReady, spineBusy, ready, need, staleness, score, allowBackToBack: !!day.allowBackToBack };
  });
}

function lastDoneDate(rows, key) {
  let best = null;
  for (const r of rows) {
    if (String(r.day).replace(/ \(Override\)$/, "") === key && (!best || r.date > best)) best = r.date;
  }
  return best;
}

// Pick the next session. Returns { day, reason, forced, scores }.
export function chooseNextDay(program, rows, index, date, opts = {}) {
  if (!program.days.length) return null;
  const scores = scoreDays(program, rows, index, date, opts);
  const st = muscleState(rows, index, date);
  const eligible = scores.filter((s) => (!s.notReady.length && !s.spineBusy) || s.allowBackToBack);
  const pick = (list) => [...list].sort((a, b) => b.score - a.score)[0];
  if (eligible.length) {
    const p = pick(eligible);
    return { day: p.day, reason: reasonFor(p, scores, st, listNext(program, rows)), forced: false, scores };
  }
  // Nothing fully recovered: least-fatigued option.
  const p = [...scores].sort((a, b) => b.ready - a.ready || b.score - a.score)[0];
  const waiting = p.notReady.map(niceMuscle);
  return {
    day: p.day, forced: true, scores,
    reason: waiting.length ? `Everything is still recovering, so this is the freshest option. Go a little easier on ${listText(waiting)}.` : "Everything is still recovering, so this is the freshest option.",
  };
}

// What the old list-order rule would have picked (named in the reason when
// it's the day being held back).
function listNext(program, rows) {
  const keys = program.days.map((d) => d.key);
  const recent = [...rows].filter((r) => keys.includes(String(r.day).replace(/ \(Override\)$/, ""))).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!recent) return null;
  return keys[(keys.indexOf(String(recent.day).replace(/ \(Override\)$/, "")) + 1) % keys.length];
}

function reasonFor(p, scores, st, nextKey) {
  const blocked = scores.filter((s) => s !== p && (s.notReady.length || s.spineBusy) && !s.allowBackToBack);
  const main = p.main.map(niceMuscle);
  const parts = [];
  if (p.allowBackToBack && p.notReady.length) parts.push("This block is set up to train these muscles on back-to-back days.");
  else if (main.length) parts.push(`${cap(listText(main))} ${main.length > 1 ? "are" : "is"} recovered.`);
  if (blocked.length) {
    const b = blocked.find((x) => x.day.key === nextKey) ?? blocked[0];
    const waiting = (b.notReady.length ? b.notReady : ["lower-back"]).map(niceMuscle);
    parts.push(`${b.day.label} waits: ${listText(waiting)} ${waiting.length > 1 ? "need" : "needs"} more time.`);
  }
  const behind = p.main.filter((m) => (st[m]?.weeklySets ?? 0) < WEEKLY_TARGET[0]);
  if (behind.length && behind.length < p.main.length) parts.push(`${cap(listText(behind.map(niceMuscle)))} ${behind.length > 1 ? "are" : "is"} behind on weekly sets.`);
  return parts.join(" ");
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
