// Per-exercise progression (COACH-BRAIN.md §2). Pure.
//
// Every session each exercise gets one lever, chosen from what you actually
// did last time — not from the calendar:
//   add-reps     same weight, one more rep per set (two if it was easy)
//   add-load     you reached the top of the range: next weight up, reps reset
//   coarse       next weight is too big a jump (20 → 25 lb dumbbells): more reps first
//   hold         last time was a grind, or you've been away 11–28 days: own the numbers
//   back-off     two sessions in a row under the range: lighter, back in range
//   recalibrate  away 4+ weeks: a little lighter, set 1 checks it
//   intensify    no progress for several sessions: same numbers plus a technique
//                (myo-reps or long-length partials) on the last set
//   calibrate    no history: the caller runs the cold start
//
// Why anchored to last time: on Ateeq's log, "same reps as last time" predicts
// the next session (±1.4 reps) better than the strength model with logged
// reps-in-reserve (±2.3) — self-rated RIR is too noisy to steer by. So reps
// and loads come from your own previous sets; the strength model is only used
// to convert between weights when the load changes.
import { daysBetween, defaultK } from "./model.js";
import { ladderFor, toEffective, aimReps } from "./prescribe.js";
import { comparePerformance } from "./volume.js";

export const LEVERS = Object.freeze(["add-reps", "add-load", "coarse", "hold", "back-off", "recalibrate", "intensify", "deload", "calibrate"]);
export const DEFAULT_DECAY = 0.975; // per-set strength drop at a steady effort, from Ateeq's sets
export const HOLD_AFTER = 16;      // days away before "match last time" instead of progressing
export const RECALIBRATE_AFTER = 28;

// Sessions for one exercise from normalizeRows output, oldest first.
// Unilateral sides merge into one set per set number: same load, the weaker
// side's reps.
export function exerciseHistory(sets, id) {
  const byDate = new Map();
  for (const s of sets) {
    if (s.id !== id || !(s.load > 0) || !(s.reps > 0)) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, new Map());
    const d = byDate.get(s.date);
    const prev = d.get(s.setIndex);
    if (!prev) d.set(s.setIndex, { setIndex: s.setIndex, load: s.load, reps: s.reps, rir: s.rir });
    else d.set(s.setIndex, { ...prev, load: Math.max(prev.load, s.load), reps: Math.min(prev.reps, s.reps), rir: prev.rir ?? s.rir });
  }
  return [...byDate].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, m]) => ({ date, sets: [...m.values()].sort((a, b) => a.setIndex - b.setIndex) }));
}

// The rep range in force: the slot's, then any directive (a per-exercise or
// per-pattern range, then a minimum-reps floor).
export function effectiveRange(slotRange, ex, dir = null) {
  let [lo, hi] = slotRange ?? ex?.defaultRepRange ?? [8, 12];
  const kind = ex?.kClass === "isolation" ? "isolation" : "compound";
  const rr = dir?.repRanges ?? {};
  const pick = rr[ex?.id] ?? rr[ex?.pattern] ?? rr[kind] ?? rr.all;
  if (pick) [lo, hi] = pick;
  const floor = dir?.minReps?.[ex?.id] ?? dir?.minReps?.[kind] ?? dir?.minReps?.all;
  if (floor && lo < floor) { const span = Math.max(2, hi - lo); lo = floor; hi = Math.max(hi, lo + span); }
  return [lo, hi];
}

// Trailing sessions without improvement (gaps over 14 days reset the count).
export function stallCount(history, k = 30) {
  let n = 0;
  for (let i = history.length - 1; i >= 1; i--) {
    if (daysBetween(history[i - 1].date, history[i].date) > 14) break;
    const c = comparePerformance(history[i - 1], history[i], k);
    if (c === 1) break;
    n++;
  }
  return n;
}

const rirClamp = (rir, r) => Math.max(Math.max(0, r - 1), Math.min(r + 2, rir ?? r));

// Candidate loads with their effective weight, lightest effective first.
function candidates(ex, ladder, bodyweight) {
  const bw = bodyweight > 0 ? bodyweight : null;
  const eff = (v) => (["bodyweight-plus", "assisted"].includes(ex.loadType) && !bw ? (ex.loadType === "assisted" ? 300 - v : 100 + v) : toEffective(ex, v, bw));
  return ladder.map((v) => ({ logged: v, eff: eff(v) })).filter((c) => c.eff > 0).sort((a, b) => a.eff - b.eff);
}

const repsAt = (E, eff, k, decay, i, r) => Math.round(k * ((E * decay ** i) / eff - 1) - r);

// Decide today's sets for one exercise.
// history: exerciseHistory(); model: strength model (for k and decay);
// rir: target reps in reserve today; sets: how many sets the brain allocated.
export function decide({ ex, history, model = null, repRange, rir = 2, sets: nSets = 3, date, gymProfile = null, ladder = null,
  bodyweight = null, policy = "balanced", techniques = { "myo-reps": true, "lengthened-partials": true }, finalWeek = false, deload = false,
  muscleGapDays = null }) {
  if (!history?.length) return { lever: "calibrate", text: "No history on this one yet, so set 1 is a calibration set a little short of failure; the rest of today's sets are set from it.", reason: { lever: "calibrate", range: repRange, rir } };
  const k = model?.k ?? defaultK(ex.kClass);
  const decay = Math.min(0.99, Math.max(0.94, model?.fatigueDecay && model.fatigueDecay < 1 ? model.fatigueDecay : DEFAULT_DECAY));
  const [lo, hi] = repRange;
  const aim = aimReps(repRange, policy);
  const last = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const gap = Math.max(0, daysBetween(last.date, date));
  // Top set: the heaviest load you used (ramping up is common), and of the
  // sets at that load, the first one.
  const topLoad = Math.max(...last.sets.map((s) => s.load));
  const top = last.sets.find((s) => s.load === topLoad);
  const lad = candidates(ex, ladder ?? ladderFor(ex, gymProfile), bodyweight);
  const effOf = (logged) => candidates(ex, [logged], bodyweight)[0]?.eff ?? logged;
  const isolation = ex.kClass === "isolation";
  const r = rir;
  const eTop = effOf(top.load);
  // Strength shown last time: the best of the sets at the top load, each
  // adjusted back to "fresh" for the sets before it.
  const Elast = Math.max(...last.sets.filter((s) => s.load === topLoad)
    .map((s) => (eTop * (1 + (s.reps + rirClamp(s.rir, r)) / k)) / decay ** Math.max(0, last.sets.indexOf(s) - last.sets.indexOf(top))));
  const stalls = stallCount(history, k);
  const fmt = (xs) => xs.map((s) => `${s.load}×${s.reps}`).join(", ");
  const lastText = fmt(last.sets);
  const base = { gapDays: gap, last: { date: last.date, sets: last.sets.map((s) => ({ load: s.load, reps: s.reps, rir: s.rir })) }, range: [lo, hi], aim, rir: r, stalls };

  // Sets from a strength estimate: a load for set 1 near the aim, then the
  // same load with fatigue, dropping to a lighter "back-off" load for any set
  // that would fall under the range.
  const fromEstimate = (E, rr, { maxEff = Infinity, minEff = 0 } = {}) => {
    const ideal = E / (1 + (aim + rr) / k);
    const pool = lad.filter((c) => c.eff <= maxEff + 1e-9 && c.eff >= minEff - 1e-9);
    const usable = pool.length ? pool : lad;
    let pick = usable.reduce((b, c) => (Math.abs(c.eff - ideal) < Math.abs(b.eff - ideal) ? c : b), usable[0]);
    const out = [];
    let cur = pick;
    for (let i = 0; i < nSets; i++) {
      let reps = repsAt(E, cur.eff, k, decay, i, rr);
      if (reps < lo - 1 && i > 0) {
        const lighter = [...lad].reverse().find((c) => c.eff < cur.eff && repsAt(E, c.eff, k, decay, i, rr) >= lo);
        if (lighter) { cur = lighter; reps = repsAt(E, cur.eff, k, decay, i, rr); }
      }
      out.push({ index: i, load: cur.logged, reps: Math.max(1, Math.min(reps, hi + 3)), rir: rr, backoff: cur !== pick || undefined });
    }
    return out;
  };

  // Sets anchored to last time: same load per set, reps + inc, capped at the
  // top of the range (or above it when the ladder is too coarse).
  const anchored = (inc, { cap = hi } = {}) => {
    const out = [];
    for (let i = 0; i < nSets; i++) {
      const b = last.sets[Math.min(i, last.sets.length - 1)];
      const extra = i >= last.sets.length ? -1 : 0; // a set you didn't do last time: one fewer
      const grind = b.rir === 0 && r >= 1;
      const add = grind ? 0 : inc;
      // Lighter (ramp-up or back-off) sets aren't held to the top of the range.
      const c = b.load < topLoad ? Math.max(cap, b.reps) : cap;
      out.push({ index: i, load: b.load, reps: Math.max(1, Math.min(c, b.reps + add + extra)), rir: r });
    }
    // Keep sets in the range: a set that would fall under it gets a lighter load.
    const t0 = out.find((x) => x.load === topLoad) ?? out[0];
    const E1 = (effOf(t0.load) * (1 + (t0.reps + r) / k)) / decay ** out.indexOf(t0);
    for (let i = 1; i < out.length; i++) {
      if (out[i].reps >= lo - 1) continue;
      const lighter = [...lad].reverse().find((c) => c.eff < effOf(out[i].load) && repsAt(E1, c.eff, k, decay, i, r) >= lo);
      if (lighter) {
        for (let j = i; j < out.length; j++) out[j] = { ...out[j], load: lighter.logged, reps: Math.max(lo, Math.min(hi, repsAt(E1, lighter.eff, k, decay, j, r))), backoff: true };
        break;
      }
    }
    return out;
  };

  const result = (lever, setsOut, text, extra = {}) => {
    const s = setsOut.map((x, i) => ({ ...x, last: i === setsOut.length - 1 }));
    if (finalWeek && isolation && r <= 1) s[s.length - 1] = { ...s[s.length - 1], rir: 0 };
    return { lever, load: s[0].load, sets: s, text, reason: { ...base, lever, ...extra } };
  };

  // Deload: same weights, reps well short of failure, half the sets (the
  // brain halves the count).
  if (deload) {
    const setsOut = anchored(0).map((s) => ({ ...s, reps: Math.max(Math.min(lo, s.reps), s.reps - 3), rir: 4 }));
    return result("deload", setsOut, `Deload: same weights as last time, about 4 reps short of failure, half the sets. Recovery is the point this week.`);
  }
  // Away a while: be conservative and let set 1 recalibrate.
  if (gap > RECALIBRATE_AFTER) {
    const f = 1 - Math.min(0.1, (0.008 * (gap - 14)) / 7);
    const E = Elast * f;
    const setsOut = fromEstimate(E, r + 1);
    // One fewer set only when the muscle itself has been idle that long,
    // not just this exercise.
    const idle = muscleGapDays == null || muscleGapDays > 28;
    return result("recalibrate", idle ? setsOut.slice(0, Math.max(2, nSets - 1)) : setsOut,
      `Back after ${gap} days, so about ${Math.round((1 - f) * 100)}% lighter with an extra rep in the tank. Set 1 checks it and the rest adjust.`,
      { detrainPct: Math.round((1 - f) * 100) });
  }
  // Strength holds for weeks (Bosquet 2013), so a normal rotation of 10–16
  // days between exposures still progresses; 17–28 days, match last time.
  if (gap > HOLD_AFTER) {
    return result("hold", anchored(0), `${gap} days since last time, so match it before pushing: ${fmt(anchored(0))}.`);
  }

  const grind = top.rir === 0 && r >= 1 && top.reps < hi;
  const easy = top.rir != null && top.rir >= r + 2;
  const atTop = top.reps >= hi || (easy && top.reps >= hi - 1);

  if (atTop) {
    // Next weight up: the heaviest rung whose predicted set-1 reps still land
    // near the bottom of the range (at least one rung).
    const heavier = lad.filter((c) => c.eff > eTop + 1e-9);
    // One rung at least; beyond that at most ~5% (compounds) or ~10%
    // (isolation, coarser steps) per session, landing nearest the aim.
    const maxEff = Math.max(heavier[0]?.eff ?? 0, eTop * (1 + (isolation ? 0.1 : 0.05)));
    const fits = heavier.filter((c) => c.eff <= maxEff + 1e-9 && repsAt(Elast, c.eff, k, decay, 0, r) >= lo);
    if (fits.length) {
      const pick = fits.reduce((b, c) => {
        const db = Math.abs(repsAt(Elast, b.eff, k, decay, 0, r) - aim), dc = Math.abs(repsAt(Elast, c.eff, k, decay, 0, r) - aim);
        return dc < db || (dc === db && c.eff > b.eff) ? c : b;
      }, fits[0]);
      const setsOut = fromEstimate(Elast, r, { maxEff: pick.eff, minEff: pick.eff });
      return result("add-load", setsOut, `${top.reps} reps last time hit the top of ${lo}–${hi}, so the weight goes up: ${fmt(setsOut)}.`, { from: top.load, to: pick.logged });
    }
    // The next rung is too big a jump (coarse dumbbells, stacks): earn it with reps.
    if (top.reps < hi + 3 && heavier.length) {
      const setsOut = anchored(1, { cap: hi + 3 });
      return result("coarse", setsOut, `The next weight up (${heavier[0].logged}) is too big a jump from ${top.load}, so more reps at ${top.load} first: ${fmt(setsOut)}.`, { next: heavier[0].logged });
    }
    if (heavier.length) {
      const pick = heavier[0];
      const setsOut = fromEstimate(Elast, r, { maxEff: pick.eff, minEff: pick.eff }).map((s) => ({ ...s, reps: Math.max(lo - 1, s.reps) }));
      return result("add-load", setsOut, `You've earned the jump to ${pick.logged}: ${fmt(setsOut)}. Expect the reps to start low.`, { from: top.load, to: pick.logged, bigJump: true });
    }
  }

  if (top.reps < lo) {
    const prevLoad = prev ? Math.max(...prev.sets.map((s) => s.load)) : null;
    const prevTop = prev?.sets?.find((s) => s.load === prevLoad);
    const twice = prevTop && daysBetween(prev.date, last.date) <= 21 && prevTop.reps < lo && prevTop.load >= top.load;
    if (twice) {
      const setsOut = fromEstimate(Elast, r, { maxEff: eTop - 1e-6 });
      return result("back-off", setsOut, `Two sessions in a row under ${lo} reps at ${top.load}, so lighter to get back in range: ${fmt(setsOut)}.`, { from: top.load, to: setsOut[0].load });
    }
    const ti = last.sets.indexOf(top);
    const setsOut = anchored(0).map((s, i) => (i === ti ? { ...s, reps: Math.max(s.reps, Math.min(lo, top.reps + 1)) } : s));
    return result("hold", setsOut, `Under the range last time (${top.reps} at ${top.load}). Same weight, aim for ${setsOut[ti]?.reps ?? lo}: ${fmt(setsOut)}.`);
  }

  if (grind) {
    const setsOut = anchored(0);
    return result("hold", setsOut, `Set 1 went to failure last time, so same numbers today and own them: ${fmt(setsOut)}.`);
  }

  const inc = easy ? 2 : 1;
  const setsOut = anchored(inc);
  const technique = stalls >= 2 ? pickTechnique(ex, techniques) : null;
  if (technique) {
    return result("intensify", setsOut, `No progress for ${stalls} sessions, so same plan plus ${technique === "myo-reps" ? "myo-reps after the last set (rest 15 s, 3–5 reps, repeat 3×)" : "long-length partials after the last set (half reps in the stretched half until failure)"}: ${fmt(setsOut)}.`, { technique });
  }
  return result("add-reps", setsOut, `${easy ? "Last time looked easy, so two more reps" : "One more rep than last time"}: ${fmt(setsOut)}.`, { inc });
}

// Myo-reps suit machines and cables; long-length partials suit exercises that
// load the muscle stretched (Wolf et al. 2025; Strey et al. 2026). Free-weight
// compounds get neither.
export function pickTechnique(ex, allowed = {}) {
  const machine = ex.stability === "high" || ex.equipment === "cable";
  if (ex.kClass !== "isolation" && !machine) return null;
  if ((ex.lengthenedBias ?? 0.5) >= 0.65 && allowed["lengthened-partials"] !== false) return "lengthened-partials";
  if (allowed["myo-reps"] !== false) return "myo-reps";
  if (allowed["lengthened-partials"] !== false) return "lengthened-partials";
  return null;
}

// Plain-language name for a lever, for chips on the Train screen.
export function leverLabel(d) {
  if (!d) return "";
  switch (d.lever) {
    case "add-reps": return d.reason?.inc > 1 ? "+2 reps" : "+1 rep";
    case "add-load": return d.reason?.to != null && d.reason?.from != null ? `+${Math.round((d.reason.to - d.reason.from) * 10) / 10} lb` : "Heavier";
    case "coarse": return "+1 rep";
    case "hold": return "Hold";
    case "back-off": return "Back off";
    case "recalibrate": return "Recalibrate";
    case "intensify": return d.reason?.technique === "myo-reps" ? "+ Myo-reps" : "+ Partials";
    case "deload": return "Deload";
    case "calibrate": return "Calibrate";
    default: return "";
  }
}
