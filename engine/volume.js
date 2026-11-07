// Per-muscle volume model (COACH-BRAIN.md §3). Pure.
//
// Sets are a progression lever of their own, decided per muscle, not per
// exercise: each muscle carries a "sets per session" target that starts from
// what you've actually been doing, moves with your feedback (soreness, pump,
// workload) and your performance, and is held between a floor (enough to
// grow) and a ceiling (what you can recover from). The week view is that
// target times how often the muscle actually gets trained.
//
// Landmarks are weekly fractional hard sets (direct = 1, indirect = 0.5,
// Pelland et al. 2025). They're priors, not prescriptions: your own feedback
// moves you within them.
import { daysBetween } from "./model.js";

//                      MV  MEV  MAV  MRV
export const LANDMARKS = Object.freeze({
  chest: [4, 8, 12, 22],
  lats: [4, 8, 12, 22],
  "upper-back": [4, 8, 12, 24],
  "side-delts": [4, 8, 14, 26],
  "rear-delts": [2, 6, 10, 22],
  biceps: [4, 8, 12, 22],
  triceps: [4, 6, 10, 20],
  quads: [4, 8, 12, 20],
  hamstrings: [3, 6, 10, 18],
  glutes: [0, 4, 8, 16],
  calves: [4, 8, 12, 20],
  "front-delts": [0, 0, 0, 16],
  traps: [0, 0, 0, 20],
  abs: [0, 0, 0, 20],
  adductors: [0, 0, 0, 16],
  forearms: [0, 0, 0, 16],
  "lower-back": [0, 0, 0, 8],
});

// Muscles the engine actively grows. The rest get indirect work only unless
// you or the coach give them a priority.
export const GROWN = Object.freeze(Object.keys(LANDMARKS).filter((m) => LANDMARKS[m][1] > 0));
// Small muscles recover fast enough to add a short block of sets on a day
// that doesn't otherwise train them (the frequency lever).
export const ADD_ON_OK = Object.freeze(["side-delts", "rear-delts", "biceps", "triceps", "calves", "abs"]);

// Hypertrophy returns per session flatten around ~11 fractional sets per
// muscle (Remmert et al. 2025).
export const SESSION_CAP = 11;
// A muscle counts as trained in a session once it gets this many fractional sets.
export const EXPOSURE_MIN = 2;
// Hard set: logged 4 or fewer reps in reserve, or not rated.
const isHard = (s) => s.rir == null || s.rir <= 4;

const r1 = (x) => Math.round(x * 10) / 10;
export const PRIORITIES = Object.freeze(["specialize", "grow", "maintain"]);

// Fractional hard sets per muscle, per session date. `sets` come from
// normalizeRows (one entry per side for unilateral work; only one side counts).
export function volumeByDate(sets, index) {
  const out = new Map();
  for (const s of sets) {
    if (s.side === "R" || !isHard(s)) continue;
    const ex = index.byId.get(s.id);
    if (!ex) continue;
    if (!out.has(s.date)) out.set(s.date, {});
    const d = out.get(s.date);
    for (const [m, c] of Object.entries(ex.contributions ?? {})) d[m] = (d[m] ?? 0) + c;
  }
  return out;
}

// Rolling 7-day volume (date and the 6 days before it).
export function rollingWeek(byDate, date, { days = 7, includeDate = true } = {}) {
  const out = {};
  for (const [d, v] of byDate) {
    const ago = daysBetween(d, date);
    if (ago < 0 || ago >= days || (!includeDate && ago === 0)) continue;
    for (const [m, x] of Object.entries(v)) out[m] = (out[m] ?? 0) + x;
  }
  for (const m of Object.keys(out)) out[m] = r1(out[m]);
  return out;
}

// Fractional sets a program day gives each muscle at its listed set counts.
export function dayVolume(day, index, setsOf = (slot) => slot.sets ?? 3) {
  const out = {};
  for (const slot of day.exercises ?? []) {
    const ex = slot.exerciseId ? index.byId.get(slot.exerciseId) : null;
    if (!ex) continue;
    const n = setsOf(slot);
    for (const [m, c] of Object.entries(ex.contributions ?? {})) out[m] = (out[m] ?? 0) + c * n;
  }
  return out;
}

// Muscles a day trains directly (a prime-mover slot for it).
export function primaryOnDay(day, index) {
  const out = new Set();
  for (const slot of day.exercises ?? []) {
    const ex = slot.exerciseId ? index.byId.get(slot.exerciseId) : null;
    for (const [m, c] of Object.entries(ex?.contributions ?? {})) if (c >= 1) out.add(m);
  }
  return out;
}

// How many times a week each muscle gets trained directly, given the program
// and how many days a week you actually train.
export function exposuresPerWeek(program, index, daysPerWeek) {
  const n = program.days.length || 1;
  const count = {};
  for (const day of program.days) for (const m of primaryOnDay(day, index)) count[m] = (count[m] ?? 0) + 1;
  const out = {};
  for (const m of Object.keys(LANDMARKS)) out[m] = r1(((count[m] ?? 0) * daysPerWeek) / n);
  return out;
}

// ── Feedback → set change (RP-style, COACH-BRAIN.md §3.3) ──────────────────
// soreness s: 0 never sore · 1 healed early · 2 healed just in time · 3 still sore
//   (asked before the muscle's first set; describes recovery from LAST time)
// pump p: 0 low · 1 good · 2 great            (after the muscle's last set)
// workload w: 0 easy · 1 about right · 2 a lot  (after the muscle's last set)
// perf: +1 better than last time · 0 same · −1 worse (computed from the log)
export function setChange({ s = null, p = null, w = null, perf = null, prevPerf = null, belowProductive = false }) {
  const twoDowns = perf === -1 && prevPerf === -1;
  let d;
  let why;
  if (s == null && p == null && w == null) {
    // No feedback: only grow a muscle that's clearly progressing and still
    // below the productive zone; otherwise hold.
    if (twoDowns) { d = -1; why = "performance down twice in a row"; }
    else if (perf === 1 && belowProductive) { d = 1; why = "performing better and still below the productive range"; }
    else { d = 0; why = perf === -1 ? "performance dipped; holding" : "no feedback; holding"; }
    return { d, why };
  }
  const S = s ?? 1, P = p ?? 1, W = w ?? 1;
  if (S === 3) { d = -1; why = "still sore from last time"; }
  else if (W === 2 && S === 2) { d = -1; why = "heavy workload and only just recovered"; }
  else if (S <= 1 && W <= 1) {
    if (P === 0 && W === 0) { d = 2; why = "low pump, easy workload, recovered early"; }
    else if (P <= 1) { d = 1; why = "recovered early with room to do more"; }
    else { d = S === 0 ? 1 : 0; why = S === 0 ? "great pump and never sore" : "great pump already; holding"; }
  } else { d = 0; why = W === 2 ? "workload already high" : "recovered just in time; holding"; }
  if (twoDowns && d > -1) { d = -1; why = "performance down twice in a row"; }
  else if (perf === -1 && d > 0) { d = 0; why = "performance dipped; holding"; }
  return { d, why };
}

// ── Per-muscle targets across the current block ────────────────────────────
// sessions: [{ date, perMuscle: { m: fractional sets }, perf: { m: -1|0|1 } }]
//   in date order (from the brain), including sessions before the block for
//   the baseline.
// feedback: [{ date, muscle, soreness?, pump?, workload? }]
// Returns { [muscle]: { level, perSession, start, weekly, floor, cap, freq, done7, history: [...] } }
export function muscleTargets({ sessions, feedback = [], block, freq, program, index, priorities = {}, nudges = [], date }) {
  const fbBy = new Map(); // `${date}|${muscle}` -> merged feedback
  for (const f of feedback) {
    const k = `${f.date}|${f.muscle}`;
    fbBy.set(k, { ...(fbBy.get(k) ?? {}), ...stripUndef(f) });
  }
  const programPer = programPerExposure(program, index);
  const out = {};
  for (const m of Object.keys(LANDMARKS)) {
    const [MV, MEV, MAV, MRV] = LANDMARKS[m];
    const level = priorities[m] ?? (MEV > 0 ? "grow" : "indirect");
    const f = Math.max(freq[m] ?? 0, 0);
    const fEff = Math.max(f, 1); // per-session numbers assume at least weekly exposure
    if (level === "indirect") {
      out[m] = { level, perSession: 0, start: 0, weekly: 0, floor: 0, cap: Math.min(SESSION_CAP, MRV), freq: f, history: [], landmarks: { MV, MEV, MAV, MRV } };
      continue;
    }
    const floorWeekly = level === "maintain" ? MV : MEV;
    let floor = Math.min(SESSION_CAP - 2, floorWeekly / fEff);
    const cap = Math.min(SESSION_CAP, MRV / fEff);
    // Baseline: your recent per-exposure volume before this block, else what
    // the program gives it.
    const before = sessions.filter((x) => x.date < block.start && daysBetween(x.date, block.start) <= 35 && (x.perMuscle[m] ?? 0) >= EXPOSURE_MIN);
    const recent = before.slice(-4).map((x) => x.perMuscle[m]);
    let start = recent.length >= 2 ? median(recent) : (programPer[m] ?? floor);
    if (level === "specialize") start += 2;
    if (level === "maintain") start = Math.max(1, Math.min(start, MV / fEff || 2));
    start = clamp(start, Math.max(1, floor), Math.min(cap, (MAV || MEV) / fEff + (level === "specialize" ? 3 : 0)));
    if (block.carry?.[m] != null && level !== "maintain") start = clamp(block.carry[m], Math.max(1, floor), cap);
    // Within a block a muscle can grow by about 4 sets per session (or 60%),
    // whichever is more, before the next deload.
    const growthCap = Math.min(cap, start + Math.max(4, start * 0.6));
    let per = start;
    const history = [];
    // Walk this block's exposures: each one's feedback sets the next one.
    const exposures = sessions.filter((x) => x.date >= block.start && x.date < date && (x.perMuscle[m] ?? 0) >= EXPOSURE_MIN);
    let prevPerf = null;
    for (let i = 0; i < exposures.length; i++) {
      const e = exposures[i];
      const fb = fbBy.get(`${e.date}|${m}`) ?? {};
      const next = exposures[i + 1];
      // Soreness is reported at the NEXT exposure (or today, for the last one).
      const sNext = next ? fbBy.get(`${next.date}|${m}`)?.soreness ?? null : fbBy.get(`${date}|${m}`)?.soreness ?? null;
      const perf = e.perf?.[m] ?? null;
      const ch = setChange({ s: sNext, p: fb.pump ?? null, w: fb.workload ?? null, perf, prevPerf, belowProductive: per * fEff < (MAV || MEV) });
      const before = per;
      per = clamp(per + ch.d, Math.max(1, floor), growthCap);
      history.push({ date: e.date, d: r1(per - before), why: ch.why, did: r1(e.perMuscle[m]) });
      if (perf != null) prevPerf = perf;
    }
    for (const n of nudges) if (n.muscle === m && n.at >= block.start) per = clamp(per + n.change, 1, cap);
    out[m] = { level, perSession: r1(per), start: r1(start), weekly: r1(per * f), floor: r1(floor), cap: r1(cap), freq: f, history, landmarks: { MV, MEV, MAV, MRV } };
  }
  return out;
}

function programPerExposure(program, index) {
  const sum = {}, n = {};
  for (const day of program?.days ?? []) {
    const v = dayVolume(day, index);
    for (const [m, x] of Object.entries(v)) if (x >= EXPOSURE_MIN) { sum[m] = (sum[m] ?? 0) + x; n[m] = (n[m] ?? 0) + 1; }
  }
  const out = {};
  for (const m of Object.keys(sum)) out[m] = sum[m] / n[m];
  return out;
}

// ── Allocating sets to today's exercises ───────────────────────────────────
// slots: [{ ex, sets, locked? }] (ex = catalog record or null). desired: per
// muscle fractional sets wanted today (only muscles listed get balanced).
// Moves one set at a time toward the targets: adds go to isolation and
// long-length exercises first (cheapest fatigue), removals come off the
// slot with the most sets. Returns { sets: [n per slot], planned: {muscle: x} }.
export function allocateSets(slots, desired, { min = 1, max = 5, patternCap = 6 } = {}) {
  const n = slots.map((s) => s.sets);
  // Sets already on a movement pattern (rows, presses…): adding past the
  // cap is pointless overlap, so additions stop there.
  const patternSets = (p) => slots.reduce((a, s, i) => a + (s.ex?.pattern === p ? n[i] : 0), 0);
  const planned = () => {
    const v = {};
    slots.forEach((s, i) => { for (const [m, c] of Object.entries(s.ex?.contributions ?? {})) v[m] = (v[m] ?? 0) + c * n[i]; });
    return v;
  };
  const addScore = (s) => (s.ex.kClass === "isolation" ? 2 : 0) + (s.ex.lengthenedBias ?? 0.5);
  for (let iter = 0; iter < 40; iter++) {
    const cur = planned();
    const gaps = Object.entries(desired).map(([m, want]) => [m, want - (cur[m] ?? 0)]);
    const candidates = [];
    for (const [m, g] of gaps) {
      if (g >= 0.75) {
        const opts = slots.map((s, i) => [s, i]).filter(([s, i]) => s.ex && !s.locked && (s.ex.contributions?.[m] ?? 0) >= 1 && n[i] < max && patternSets(s.ex.pattern) < patternCap)
          // don't push another muscle past the per-session cap or far over its target
          .filter(([s]) => Object.entries(s.ex.contributions).every(([o, c]) => o === m || ((cur[o] ?? 0) + c <= SESSION_CAP && (desired[o] == null || (cur[o] ?? 0) + c <= desired[o] + 3))));
        if (opts.length) {
          opts.sort((a, b) => addScore(b[0]) - addScore(a[0]) || n[a[1]] - n[b[1]]);
          candidates.push({ g, m, i: opts[0][1], dir: 1 });
        }
      } else if (g <= -1.5) {
        // Being a little over target costs nothing, so only trim clear excess.
        // Isolation work goes first; a compound loses at most one set from
        // what the program gives it (you picked those lifts for a reason).
        const floorOf = (s, i) => (s.ex.kClass === "isolation" ? min : Math.max(min, (s.sets ?? n[i]) - 1));
        const opts = slots.map((s, i) => [s, i]).filter(([s, i]) => s.ex && !s.locked && (s.ex.contributions?.[m] ?? 0) >= 1 && n[i] > floorOf(s, i))
          .filter(([s]) => Object.entries(s.ex.contributions).every(([o, c]) => o === m || desired[o] == null || (cur[o] ?? 0) - c >= desired[o] - 1));
        if (opts.length) {
          opts.sort((a, b) => (b[0].ex.kClass === "isolation") - (a[0].ex.kClass === "isolation") || n[b[1]] - n[a[1]] || addScore(a[0]) - addScore(b[0]));
          candidates.push({ g: -g, m, i: opts[0][1], dir: -1 });
        }
      }
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => b.g - a.g || a.m.localeCompare(b.m));
    const c = candidates[0];
    n[c.i] += c.dir;
  }
  const p = planned();
  for (const k of Object.keys(p)) p[k] = r1(p[k]);
  return { sets: n, planned: p };
}

// ── Performance per muscle per session (from the log) ──────────────────────
// Compares each exercise to its previous session. Same top load: total reps
// across the sets both sessions share (reps-in-reserve ratings are too noisy
// to trust here). Different load: best-set strength, reps-in-reserve
// clamped to 0–2.
export function perfIndex(sets, k = 30) {
  return Math.max(...sets.map((s) => s.load * (1 + (s.reps + Math.min(2, Math.max(0, s.rir ?? 1))) / k)));
}

export function comparePerformance(prev, cur, k = 30) {
  if (!prev?.sets?.length || !cur?.sets?.length) return null;
  const a = [...prev.sets].sort((x, y) => x.setIndex - y.setIndex), b = [...cur.sets].sort((x, y) => x.setIndex - y.setIndex);
  if (a[0].load === b[0].load) {
    const n = Math.min(a.filter((s) => s.load === a[0].load).length, b.filter((s) => s.load === b[0].load).length);
    if (n >= 1) {
      const ra = a.filter((s) => s.load === a[0].load).slice(0, n).reduce((t, s) => t + s.reps, 0);
      const rb = b.filter((s) => s.load === b[0].load).slice(0, n).reduce((t, s) => t + s.reps, 0);
      const d = rb - ra;
      return d >= 1 ? 1 : d <= -Math.max(2, n) ? -1 : 0;
    }
  }
  const r = perfIndex(b, k) / perfIndex(a, k) - 1;
  return r >= 0.01 ? 1 : r <= -0.025 ? -1 : 0;
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const stripUndef = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
