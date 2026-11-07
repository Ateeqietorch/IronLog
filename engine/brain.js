// The coach's brain (COACH-BRAIN.md). Pure.
//
// One function plans a training day end to end, and everything the Train
// screen shows and the AI coach says comes from it:
//   1. block      — which week of the block you're in, deload or not, effort target
//   2. muscles    — sets per session per muscle from your feedback and performance,
//                   weekly floors so nothing gets left behind
//   3. sets       — those muscle targets turned into set counts per exercise
//   4. add-ons    — a short extra exercise for a lagging small muscle
//   5. levers     — per exercise: add reps, add load, hold, back off, intensify…
//   6. time       — fit the session to your time budget (supersets, then trims)
//   7. order      — lagging muscles move earlier so they don't get skipped
// Directives (from you or the coach) are inputs to every step; nothing else
// changes a number.
import { daysBetween, defaultK } from "./model.js";
import {
  LANDMARKS, ADD_ON_OK, SESSION_CAP, EXPOSURE_MIN, volumeByDate, rollingWeek, exposuresPerWeek,
  muscleTargets, allocateSets, comparePerformance, primaryOnDay,
} from "./volume.js";
import { exerciseHistory, decide, effectiveRange, leverLabel } from "./progress.js";
import { blockFor, rirFor, isFinalWeek, deloadSignal } from "./block.js";
import { niceMuscleName as nice } from "./directives.js";

export const DEFAULT_MINUTES = 75;
export const MAX_SETS = 5; // per exercise per session
const SMALL = new Set(["side-delts", "rear-delts", "biceps", "triceps", "calves", "abs", "forearms", "traps"]);
// The exercise to use when adding work for a muscle no program day covers well.
export const ADD_ON_DEFAULTS = Object.freeze({
  "side-delts": "cable-lateral-raise", "rear-delts": "reverse-pec-deck", biceps: "incline-dumbbell-curl",
  triceps: "overhead-cable-triceps-extension", calves: "standing-calf-raise", abs: "cable-crunch",
});

const r1 = (x) => Math.round(x * 10) / 10;
const listText = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// Sessions per week you've actually been training (last 4 weeks of the
// current block, ignoring breaks), clamped to 2–6.
export function inferDaysPerWeek(dates, date, blockStart = null) {
  const from = blockStart && daysBetween(blockStart, date) >= 7 ? blockStart : null;
  const recent = [...new Set(dates)].filter((d) => d <= date && daysBetween(d, date) < 28 && (!from || d >= from));
  if (!recent.length) return 3;
  const span = Math.max(7, Math.min(28, daysBetween(recent.sort()[0], date) + 1));
  return Math.max(2, Math.min(6, Math.round((recent.length * 7) / span)));
}

// Per-date per-muscle volume and performance, for the volume model.
export function sessionSummaries(sets, index) {
  const byDate = volumeByDate(sets, index);
  const ids = [...new Set(sets.map((s) => s.id))];
  const perf = new Map(); // date -> muscle -> sum of comparisons
  for (const id of ids) {
    const ex = index.byId.get(id);
    if (!ex) continue;
    const h = exerciseHistory(sets, id);
    const k = defaultK(ex.kClass);
    for (let i = 1; i < h.length; i++) {
      if (daysBetween(h[i - 1].date, h[i].date) > 14) continue;
      const c = comparePerformance(h[i - 1], h[i], k);
      if (c == null) continue;
      if (!perf.has(h[i].date)) perf.set(h[i].date, {});
      const d = perf.get(h[i].date);
      for (const [m, w] of Object.entries(ex.contributions ?? {})) if (w >= 1) d[m] = (d[m] ?? 0) + c;
    }
  }
  return [...byDate.keys()].sort().map((date) => ({
    date, perMuscle: byDate.get(date),
    perf: Object.fromEntries(Object.entries(perf.get(date) ?? {}).map(([m, v]) => [m, Math.sign(v)])),
  }));
}

// Seconds a set takes: the reps, setting up, and the rest after it.
export function setSeconds(ex, reps = 10) {
  const compound = ex && ex.kClass !== "isolation";
  const rest = compound ? (reps <= 10 ? 150 : 120) : 90;
  return Math.round(reps * 3.5 + 10 + rest);
}

export function estimateMinutes(items) {
  let s = 0, firstCompound = true;
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it)) continue;
    const partner = it.supersetWith != null ? items.find((x) => x.key === it.supersetWith) : null;
    const reps = (x) => x.decision?.sets?.[0]?.reps ?? x.repRange?.[1] ?? 10;
    if (partner && !seen.has(partner)) {
      // Rest for one muscle while the other works: one shared rest per round.
      const rounds = Math.max(it.sets, partner.sets);
      s += rounds * (reps(it) * 3.5 + reps(partner) * 3.5 + 25 + 75) + 90;
      seen.add(partner);
    } else {
      s += it.sets * setSeconds(it.ex, reps(it)) + 60;
    }
    if (it.ex && it.ex.kClass !== "isolation") { s += firstCompound ? 180 : 60; firstCompound = false; }
    seen.add(it);
  }
  return Math.round(s / 60);
}

// Two isolation exercises can share rest when they don't train the same
// prime mover. Opposing muscles (biceps/triceps, chest/rear delts) first.
const ANTAGONIST = [["biceps", "triceps"], ["chest", "rear-delts"], ["quads", "hamstrings"], ["side-delts", "biceps"], ["side-delts", "triceps"], ["calves", "abs"], ["rear-delts", "triceps"], ["side-delts", "hamstrings"]];
function pairScore(a, b) {
  const pa = Object.entries(a.ex.contributions).filter(([, c]) => c >= 1).map(([m]) => m);
  const pb = Object.entries(b.ex.contributions).filter(([, c]) => c >= 1).map(([m]) => m);
  if (pa.some((m) => (b.ex.contributions[m] ?? 0) > 0) || pb.some((m) => (a.ex.contributions[m] ?? 0) > 0)) return -1;
  return ANTAGONIST.some(([x, y]) => (pa.includes(x) && pb.includes(y)) || (pa.includes(y) && pb.includes(x))) ? 2 : 1;
}

// ── Main entry ─────────────────────────────────────────────────────────────
export function planDay({
  day, program, date, sets, index, models = {}, feedback = [], directives = {}, bodyweight = null, gymProfile = null,
  joints = [],
}) {
  const dir = directives;
  const past = sets.filter((s) => s.date < date);
  const dates = [...new Set(past.map((s) => s.date))].sort();
  const block = blockFor(dates, date, { weeks: dir.blockWeeks ?? 5, deloadFrom: dir.deloadFrom, newBlockFrom: dir.newBlockFrom });
  const daysPerWeek = dir.schedule?.daysPerWeek ?? inferDaysPerWeek(dates, date, block.start);
  const budget = dir.schedule?.minutes ?? DEFAULT_MINUTES;
  const summaries = sessionSummaries(past, index);
  const freq = exposuresPerWeek(program, index, daysPerWeek);
  const targets = muscleTargets({
    sessions: summaries, feedback, block, freq, program, index, priorities: dir.priorities ?? {}, nudges: dir.nudges ?? [], date,
  });
  const done7 = rollingWeek(volumeByDate(past, index), date, { includeDate: false });
  const notes = [];
  const todayFb = new Map(feedback.filter((f) => f.date === date && f.muscle).map((f) => [f.muscle, f]));

  // ── Which muscles today trains, and how many sets each should get ────────
  const slotsIn = day.exercises.map((slot, i) => ({ slot, slotIndex: slot.origIndex ?? i, ex: slot.exerciseId ? index.byId.get(slot.exerciseId) ?? null : null }));
  const primaryToday = primaryOnDay(day, index);
  const desired = {};
  const soreToday = new Set();
  for (const m of primaryToday) {
    const t = targets[m];
    if (!t || t.level === "indirect") continue;
    let want = t.perSession;
    const fb = todayFb.get(m);
    if (fb?.soreness === 3) { want = Math.max(1, want - 1); soreToday.add(m); }
    // Weekly floor: if this muscle would still finish the week under its
    // minimum, today makes up some of it (two sets at most).
    const floorWeekly = t.level === "maintain" ? t.landmarks.MV : t.landmarks.MEV;
    const behindBy = floorWeekly - ((done7[m] ?? 0) + want + Math.max(0, t.freq - 1) * t.perSession);
    if (!block.deload && behindBy > 0.5 && !soreToday.has(m)) {
      const add = Math.min(2, Math.round(behindBy));
      want += add;
      t.debt = add;
    }
    want = Math.min(want, SESSION_CAP);
    if (block.deload) want = Math.max(1, want / 2);
    desired[m] = r1(want);
  }

  // ── Add-on: a lagging small muscle that today doesn't train ──────────────
  let addOn = null;
  // Most direct sets a muscle can get in one session of the program: its
  // own exercises at the per-exercise maximum, on its best day.
  const capacity = (m) => Math.max(0, ...program.days.map((d) => d.exercises
    .filter((s) => (index.byId.get(s.exerciseId)?.contributions?.[m] ?? 0) >= 1).length * MAX_SETS));
  if (!block.deload && dir.techniques?.["add-ons"] !== false) {
    // Only when the program structurally can't reach the muscle's weekly
    // minimum at the days you train (e.g. biceps only on a Pull day that comes
    // round every ten days), and the muscle is behind right now.
    const lagging = ADD_ON_OK.filter((m) => {
      const t = targets[m];
      if (!t || !["grow", "specialize"].includes(t.level) || primaryToday.has(m)) return false;
      const structural = t.freq * Math.min(t.perSession, capacity(m)) < t.landmarks.MEV - 1;
      const lastHit = [...summaries].reverse().find((x) => (x.perMuscle[m] ?? 0) >= EXPOSURE_MIN && x.date < date);
      const rested = !lastHit || daysBetween(lastHit.date, date) >= 2;
      return structural && rested && (done7[m] ?? 0) < t.landmarks.MEV - 1;
    }).sort((a, b) => ((done7[a] ?? 0) - targets[a].landmarks.MEV) - ((done7[b] ?? 0) - targets[b].landmarks.MEV) || (targets[b].level === "specialize") - (targets[a].level === "specialize"));
    if (lagging.length) {
      const m = lagging[0];
      const fromProgram = program.days.flatMap((d) => d.exercises).map((s) => s.exerciseId && index.byId.get(s.exerciseId))
        .find((ex) => ex && (ex.contributions?.[m] ?? 0) >= 1 && ex.kClass === "isolation");
      const ex = fromProgram ?? index.byId.get(ADD_ON_DEFAULTS[m]);
      if (ex && !slotsIn.some((s) => s.ex?.id === ex.id)) {
        const n = Math.max(2, Math.min(3, Math.round(targets[m].landmarks.MEV - (done7[m] ?? 0))));
        addOn = { muscle: m, ex, sets: n };
        slotsIn.push({ slot: { name: ex.name, exerciseId: ex.id, sets: n, repRange: ex.defaultRepRange, unilateral: !!ex.unilateral, programWeight: null, addOn: m }, slotIndex: -1, ex, addOn: m });
        desired[m] = n;
      }
    }
  }

  // ── Sets per exercise ────────────────────────────────────────────────────
  const baseSets = slotsIn.map((s) => (block.deload ? Math.max(1, Math.ceil((s.slot.sets ?? 3) / 2)) : (s.slot.sets ?? 3)));
  // Deload weeks just halve the program; the rest of the time the muscle
  // targets decide.
  const alloc = block.deload ? { sets: baseSets } : allocateSets(slotsIn.map((s, i) => ({ ex: s.ex, sets: baseSets[i], locked: !!s.addOn })), desired, { min: 2, max: MAX_SETS });

  // ── Levers per exercise ──────────────────────────────────────────────────
  const lastTrained = {};
  for (const sm of summaries) for (const [m, v] of Object.entries(sm.perMuscle)) if (v >= 1) lastTrained[m] = sm.date;
  const items = slotsIn.map((s, i) => {
    const ex = s.ex;
    const n = alloc.sets[i];
    if (!ex) return { key: i, ...s, sets: n, rir: null, decision: { lever: "manual" }, repRange: s.slot.repRange };
    const prim = Object.entries(ex.contributions).filter(([, c]) => c >= 1).map(([m]) => m);
    const sore = prim.some((m) => soreToday.has(m));
    const lastHit = Math.min(...prim.map((m) => lastTrained[m] != null ? daysBetween(lastTrained[m], date) : 999));
    const p = planExercise({ ex, slot: s.slot, nSets: n, date, sets: past, models, block, directives: dir, gymProfile, bodyweight, extraRir: sore ? 1 : 0, muscleGapDays: lastHit });
    // A brand-new exercise starts with a calibration set; don't pile sets on it.
    if (p.decision.lever === "calibrate") p.sets = Math.min(n, Math.max(3, s.slot.sets ?? 3));
    return { key: i, ...s, ...p, sore };
  });

  // ── Order: compounds first (program order), then lagging muscles, then the rest
  const behind = new Set(Object.entries(targets).filter(([m, t]) => t.debt > 0 || (addOn && addOn.muscle === m)).map(([m]) => m));
  const isCompound = (it) => it.ex && it.ex.kClass !== "isolation";
  const lagScore = (it) => (it.ex && Object.entries(it.ex.contributions).some(([m, c]) => c >= 1 && (behind.has(m) || targets[m]?.level === "specialize")) ? 1 : 0);
  const ordered = [
    ...items.filter(isCompound),
    ...items.filter((it) => !isCompound(it)).map((it, j) => [it, j]).sort((a, b) => lagScore(b[0]) - lagScore(a[0]) || a[1] - b[1]).map(([it]) => it),
  ];
  const isoOrig = items.filter((it) => !isCompound(it));
  const moved = ordered.filter((it) => !isCompound(it)).filter((it, j) => lagScore(it) && !it.addOn && isoOrig.indexOf(it) > j);

  // ── Time: supersets, then trims ──────────────────────────────────────────
  let minutes = estimateMinutes(ordered);
  const supersets = [];
  if (minutes > budget && dir.techniques?.supersets !== false) {
    const iso = ordered.filter((it) => it.ex && it.ex.kClass === "isolation" && it.supersetWith == null);
    const pairs = [];
    for (let a = 0; a < iso.length; a++) for (let b = a + 1; b < iso.length; b++) {
      const sc = pairScore(iso[a], iso[b]);
      if (sc > 0) pairs.push([sc, iso[a], iso[b]]);
    }
    pairs.sort((x, y) => y[0] - x[0] || ordered.indexOf(x[1]) - ordered.indexOf(y[1]));
    for (const [, a, b] of pairs) {
      if (minutes <= budget) break;
      if (a.supersetWith != null || b.supersetWith != null) continue;
      a.supersetWith = b.key; b.supersetWith = a.key;
      const ia = ordered.indexOf(a), ib = ordered.indexOf(b);
      ordered.splice(ib, 1);
      ordered.splice(ia + 1, 0, b);
      supersets.push([a.key, b.key]);
      minutes = estimateMinutes(ordered);
    }
  }
  const trimmed = [];
  if (minutes > budget + 5) {
    // Trim sets from muscles that are already ahead this week, never below 2.
    const ahead = (it) => {
      const prim = it.ex ? Object.entries(it.ex.contributions).filter(([, c]) => c >= 1).map(([m]) => m) : [];
      return Math.max(0, ...prim.map((m) => ((done7[m] ?? 0) + (desired[m] ?? 0)) - (targets[m]?.landmarks?.MEV ?? 0)));
    };
    for (let guard = 0; guard < 12 && minutes > budget + 5; guard++) {
      const cand = ordered.filter((it) => it.ex && it.sets > 2 && !lagScore(it)).sort((a, b) => ahead(b) - ahead(a) || b.sets - a.sets)[0];
      if (!cand) break;
      cand.sets -= 1;
      if (cand.decision?.sets?.length > cand.sets) cand.decision = { ...cand.decision, sets: cand.decision.sets.slice(0, cand.sets).map((x, i, arr) => ({ ...x, last: i === arr.length - 1 })) };
      trimmed.push(cand.ex.name);
      minutes = estimateMinutes(ordered);
    }
  }

  // ── Notes for "Checked before you start" ─────────────────────────────────
  if (block.deload) notes.push({ kind: "note", rule: "block", text: block.early ? "Deload week (started early): same exercises, half the sets, easy effort." : `Deload week after ${block.of} weeks of building: same exercises, half the sets, easy effort.` });
  else if (block.reentry) notes.push({ kind: "note", rule: "block", text: "First week back after a break: a little lighter, sets end 3 reps short of failure, and set 1 of each exercise checks your strength." });
  for (const [m, t] of Object.entries(targets)) {
    if (!(t.debt > 0) || !desired[m]) continue;
    const it = ordered.find((x) => x.ex && (x.ex.contributions?.[m] ?? 0) >= 1 && x.slotIndex !== -1);
    notes.push({ kind: "fix", rule: "volume", muscle: m, text: `${cap(nice(m))}: ${r1(done7[m] ?? 0)} sets in the last 7 days, under the ${t.landmarks.MEV} minimum, so +${t.debt} today${it ? ` on ${it.ex.name}` : ""}.` });
  }
  for (const m of soreToday) notes.push({ kind: "fix", rule: "sore", muscle: m, text: `${cap(nice(m))} still sore: one fewer set and an extra rep in the tank today.` });
  if (addOn) notes.push({ kind: "fix", rule: "add-on", muscle: addOn.muscle, text: `Added ${addOn.ex.name} (${addOn.sets} sets): ${nice(addOn.muscle)} ${r1(done7[addOn.muscle] ?? 0)} of ${targets[addOn.muscle].landmarks.MEV}+ sets this week and today doesn't train them otherwise.` });
  if (moved.length) notes.push({ kind: "fix", rule: "order", text: `Moved ${listText(moved.map((x) => x.ex.name))} earlier so the lagging muscles don't get cut if time runs short.` });
  if (supersets.length) {
    const names = supersets.map(([a, b]) => `${items[a].ex.name} + ${items[b].ex.name}`);
    notes.push({ kind: "fix", rule: "time", text: `Over ${budget} minutes, so supersets: ${listText(names)}. Alternate them and rest about 75 s after each pair.` });
  }
  if (trimmed.length) notes.push({ kind: "fix", rule: "time", text: `Trimmed a set from ${listText([...new Set(trimmed)])} (already at or above your weekly target) to fit ${budget} minutes.` });

  // Volume per muscle after allocation, for the summary.
  const plannedToday = {};
  for (const it of ordered) for (const [m, c] of Object.entries(it.ex?.contributions ?? {})) plannedToday[m] = r1((plannedToday[m] ?? 0) + c * it.sets);
  const muscles = {};
  for (const [m, t] of Object.entries(targets)) {
    if (t.level === "indirect" && !(done7[m] > 0)) continue;
    const done = done7[m] ?? 0;
    muscles[m] = {
      level: t.level, perSession: t.perSession, weeklyTarget: r1(Math.max(t.weekly, t.level === "maintain" ? t.landmarks.MV : t.landmarks.MEV)),
      done7: r1(done), today: plannedToday[m] ?? 0, floor: t.level === "maintain" ? t.landmarks.MV : t.landmarks.MEV, max: t.landmarks.MRV,
      freq: t.freq, status: done < (t.level === "maintain" ? t.landmarks.MV : t.landmarks.MEV) ? "behind" : done > t.landmarks.MRV ? "high" : "ok",
      lastChange: t.history[t.history.length - 1] ?? null, changes: t.history.slice(-6), start: t.start,
    };
  }
  const musclePerf = {};
  for (const sm of summaries.filter((x) => x.date >= block.start)) for (const [m, p] of Object.entries(sm.perf)) (musclePerf[m] ??= []).push(p);
  const signal = block.deload ? null : deloadSignal({ musclePerf, joints, date });

  return {
    date, block, daysPerWeek, budget, minutes, freq,
    weekInfo: { week: block.week, of: block.of, deload: block.deload, reentry: block.reentry },
    exercises: ordered, muscles, notes, supersets, addOn, deloadSignal: signal,
  };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// One exercise's numbers for today: effort target, rep range, lever and sets.
// Used by planDay and whenever a single exercise is re-planned (a switch, an
// added exercise, a set-count change from the coach).
export function planExercise({ ex, slot, nSets, date, sets, models = {}, block, directives = {}, gymProfile = null, bodyweight = null, extraRir = 0, muscleGapDays = null }) {
  const dir = directives;
  const rir = rirFor(block, ex, (dir.effortOffset ?? 0) + extraRir);
  const repRange = effectiveRange(slot?.repRange, ex, dir);
  const history = exerciseHistory(sets.filter((s) => s.date < date), ex.id);
  const model = models[`${ex.id}|both`] ?? models[`${ex.id}|L`] ?? models[`${ex.id}|R`] ?? null;
  const decision = decide({
    ex, history, model, repRange, rir, sets: nSets ?? slot?.sets ?? 3, date, gymProfile, bodyweight, policy: dir.progression ?? "balanced",
    techniques: dir.techniques ?? {}, finalWeek: isFinalWeek(block), deload: block.deload, muscleGapDays,
  });
  return { sets: decision.sets?.length ?? nSets ?? slot?.sets ?? 3, rir, repRange, decision, history: history.slice(-3), label: leverLabel(decision) };
}

// Compact state for the AI coach: what the engine knows and decided.
export function coachSnapshot(plan, { index = null } = {}) {
  if (!plan) return null;
  return {
    block: { week: plan.block.week, of: plan.block.of, deload: plan.block.deload, reentry: plan.block.reentry, started: plan.block.start, number: plan.block.number },
    schedule: { daysPerWeek: plan.daysPerWeek, minutesBudget: plan.budget, estimatedMinutes: plan.minutes },
    muscles: Object.fromEntries(Object.entries(plan.muscles).map(([m, x]) => [m, `${x.done7}/${x.weeklyTarget} sets last 7d (min ${x.floor}, max ${x.max}), ${x.perSession}/session, ${x.freq}×/wk, today ${x.today}, ${x.status}${x.level !== "grow" ? `, ${x.level}` : ""}${x.lastChange && x.lastChange.d ? `, last change ${x.lastChange.d > 0 ? "+" : ""}${x.lastChange.d} (${x.lastChange.why})` : ""}`])),
    today: plan.exercises.map((it) => ({
      name: it.ex?.name ?? it.slot.name, id: it.ex?.id ?? null, sets: it.sets, rir: it.rir, range: it.repRange, lever: it.decision?.lever,
      plan: it.decision?.sets?.map((s) => `${s.load}x${s.reps}`).join(" "), why: it.decision?.text, addOn: it.addOn ?? undefined,
      superset: it.supersetWith != null ? plan.exercises.find((x) => x.key === it.supersetWith)?.ex?.name : undefined,
    })),
    checks: plan.notes.map((n) => n.text),
    deloadSuggested: plan.deloadSignal?.reason ?? null,
  };
}
