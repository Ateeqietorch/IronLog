// Exact weight and reps for every set (COACH-ENGINE-SPEC.md §4.3, §4.4,
// §4.6, §4.7). The only place in v3 that decides a load or rep number.
import {
  prepareForSession, e1rm, rtf, loadFor, updateModel, daysBetween,
} from "./model.js";

// Day-to-day readiness spread used only inside a session (§4.4).
export const READINESS_SD = 0.03;

export const POLICIES = Object.freeze(["balanced", "reps-first", "load-first"]);

// ── Load ladders (what loads you can actually make) ───────────────────────

function range(from, to, step) {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const loggedPerSide = (ex) => /per side/i.test(ex.note ?? "");

// Gym profiles (spec §3.5) can override any ladder; otherwise sensible defaults.
export function ladderFor(exercise, gymProfile = null) {
  const L = gymProfile?.ladders ?? {};
  if (Array.isArray(L[exercise.id])) return [...L[exercise.id]].sort((a, b) => a - b);
  switch (exercise.loadType) {
    case "dumbbell-pair":
    case "dumbbell-single":
      return L.dumbbell ?? [...range(2.5, 50, 2.5), ...range(55, 150, 5)];
    case "plates": {
      const smallest = L.plates?.smallest ?? 2.5;
      if (exercise.equipment === "barbell") {
        const bar = L.plates?.bar ?? 45;
        return range(bar, 700, smallest * 2);
      }
      return range(0, 1000, loggedPerSide(exercise) ? smallest : smallest * 2).filter((v) => v > 0);
    }
    case "stack":
      return L.stack ?? [...range(2.5, 50, 2.5), ...range(55, 400, 5)];
    case "bodyweight-plus":
      return range(0, 150, 2.5);
    case "assisted":
      return range(0, 200, 5);
    default:
      return range(1, 500, 1);
  }
}

// Logged load ⇄ effective load (what the model reasons in).
export function toEffective(exercise, logged, bodyweight) {
  if (exercise.loadType === "bodyweight-plus") return bodyweight * (exercise.bwFraction ?? 1) + logged;
  if (exercise.loadType === "assisted") return bodyweight * (exercise.bwFraction ?? 1) - logged;
  return logged;
}

export function aimReps([lo, hi], policy = "balanced") {
  if (policy === "reps-first") return Math.round(hi - (hi - lo) / 3);
  if (policy === "load-first") return Math.round(lo + (hi - lo) / 3);
  return Math.round((lo + hi) / 2);
}

// §4.6: time away adds reps in reserve; a long gap also drops a set.
export function gapAdjustment(lastExposure, date) {
  if (!lastExposure) return { days: null, extraRir: 0, setDelta: 0 };
  const days = daysBetween(lastExposure, date);
  if (days > 28) return { days, extraRir: 2, setDelta: -1 };
  if (days > 10) return { days, extraRir: 1, setDelta: 0 };
  return { days, extraRir: 0, setDelta: 0 };
}

function repsAt(E, effLoad, k, decay, setIndex, rir) {
  return Math.round(rtf(E * decay ** setIndex, effLoad, k) - rir);
}

function nearestIndex(ladder, value) {
  let best = 0;
  for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - value) < Math.abs(ladder[best] - value)) best = i;
  return best;
}

// Pick the load whose set-1 reps land closest to the aim (spec §4.3).
function chooseLoad({ E, k, decay, rir, lo, hi, aim, ladder, exercise, bodyweight, lastLoad, setIndex = 0 }) {
  const ideal = loadFor(E * decay ** setIndex, aim + rir, k);
  let floorLogged = -Infinity;
  if (lastLoad != null && ladder.length) {
    const i = nearestIndex(ladder, lastLoad);
    floorLogged = ladder[Math.max(0, i - 1)]; // never more than one rung below last session
  }
  // For assisted machines more assistance = easier, so "below" flips.
  const assisted = exercise.loadType === "assisted";
  const allowed = ladder.filter((v) => (assisted ? lastLoad == null || v <= ladder[Math.min(ladder.length - 1, nearestIndex(ladder, lastLoad) + 1)] : v >= floorLogged));
  const cands = allowed
    .map((logged) => ({ logged, eff: toEffective(exercise, logged, bodyweight) }))
    .filter((c) => c.eff > 0 && c.eff >= ideal * 0.75 && c.eff <= ideal * 1.25)
    .map((c) => ({ ...c, reps: repsAt(E, c.eff, k, decay, setIndex, rir) }));
  const valid = cands.filter((c) => c.reps >= lo && c.reps <= hi + 3);
  const pool = valid.length ? valid : cands;
  if (!pool.length) {
    // Nothing near the ideal on the ladder (e.g. ideal is lighter than the
    // lightest dumbbell): take the closest rung that's allowed.
    const fallback = (allowed.length ? allowed : ladder).map((logged) => ({ logged, eff: toEffective(exercise, logged, bodyweight) }))
      .filter((c) => c.eff > 0)
      .sort((a, b) => Math.abs(a.eff - ideal) - Math.abs(b.eff - ideal))[0];
    return fallback ? { ...fallback, reps: repsAt(E, fallback.eff, k, decay, setIndex, rir), outOfRange: true } : null;
  }
  pool.sort((a, b) => Math.abs(a.reps - aim) - Math.abs(b.reps - aim) || b.eff - a.eff);
  return { ...pool[0], outOfRange: !valid.length };
}

// Main entry. `model` is one ExerciseModel, or for unilateral exercises pass
// `models: { L, R }` and the weaker side sets the load (spec §4.7).
export function prescribe({
  model, models, exercise, repRange = exercise.defaultRepRange, rir = 2, sets = 3,
  date, ladder, gymProfile = null, policy = "balanced", bodyweight = null,
  lastLoad = null, deload = false,
}) {
  let base = model;
  let side = null;
  if (models) {
    const prepped = Object.entries(models).filter(([, m]) => m?.logE1rm != null)
      .map(([s, m]) => [s, prepareForSession(m, date, { deload })]);
    if (!prepped.length) return { needsCalibration: true };
    prepped.sort((a, b) => a[1].logE1rm - b[1].logE1rm);
    [side] = prepped[0];
    base = models[side];
  }
  if (!base || base.logE1rm == null) return { needsCalibration: true };
  if (["bodyweight-plus", "assisted"].includes(exercise.loadType) && !(bodyweight > 0)) {
    return { needsBodyweight: true };
  }

  const m = prepareForSession(base, date, { deload });
  const gap = gapAdjustment(base.lastExposure, date);
  const r = rir + gap.extraRir;
  const nSets = Math.max(1, sets + gap.setDelta);
  const [lo, hi] = repRange;
  const aim = aimReps(repRange, policy);
  const E = e1rm(m);
  const lad = ladder ?? ladderFor(exercise, gymProfile);

  // The one-rung-down limit protects against overreacting to one bad day.
  // After time away, the extra reps in reserve already lighten things and
  // the limit would only push reps out of range, so it's off.
  const floorLoad = gap.extraRir > 0 ? null : lastLoad;
  const pick = chooseLoad({ E, k: m.k, decay: m.fatigueDecay, rir: r, lo, hi, aim, ladder: lad, exercise, bodyweight, lastLoad: floorLoad });
  if (!pick) return { needsCalibration: true };

  const out = [];
  for (let i = 0; i < nSets; i++) {
    const reps = Math.max(pick.outOfRange ? 1 : lo - 2, 1, repsAt(E, pick.eff, m.k, m.fatigueDecay, i, r));
    out.push({ index: i, load: pick.logged, reps, rir: r, last: i === nSets - 1 });
  }

  const prevE = base.logE1rm != null ? Math.exp(base.logE1rm) : null;
  const reason = {
    e1rm: Math.round(E * 10) / 10,
    changePct: prevE ? Math.round(((E - prevE) / prevE) * 1000) / 10 : null,
    aimReps: aim, rir: r, baseRir: rir, load: pick.logged,
    gapDays: gap.days, extraRir: gap.extraRir, setDelta: gap.setDelta,
    side, outOfRange: pick.outOfRange, k: m.k, decay: m.fatigueDecay,
  };
  return { load: pick.logged, effLoad: pick.eff, sets: out, reason, text: reasonText(reason, exercise) };
}

export function reasonText(r, exercise) {
  const unit = exercise.loadType === "dumbbell-pair" ? " lb each hand" : " lb";
  const parts = [];
  if (r.gapDays != null && r.extraRir > 0) {
    parts.push(`${r.gapDays} days since you last did this, so ${r.extraRir > 1 ? "two extra reps" : "one extra rep"} in the tank today${r.setDelta < 0 ? " and one fewer set" : ""}.`);
  }
  if (r.changePct != null && Math.abs(r.changePct) >= 0.5) {
    parts.push(`Strength estimate ${r.changePct > 0 ? "up" : "down"} ${Math.abs(r.changePct)}%.`);
  }
  if (r.outOfRange) parts.push(`No available load lands in your rep range; ${r.load}${unit} is the closest.`);
  else parts.push(`Aiming for ${r.aimReps} reps with ${r.rir} left; ${r.load}${unit} is the closest load that fits.`);
  if (r.side) parts.push(`Set by your ${r.side === "L" ? "left" : "right"} side, the weaker one.`);
  return parts.join(" ");
}

// In-session recalculation (spec §4.4). Fold the sets logged so far into a
// session copy of the model (each set moves it at most halfway), then redo
// the sets that haven't started. The load only changes if the current one
// would push reps outside the range; sets in `locked` are never touched.
export function recalcRemaining({ plan, model, models, exercise, loggedSets, locked = [], date, repRange = exercise.defaultRepRange, bodyweight = null, gymProfile = null, ladder, lastLoad = null, gainCap = 0.5 }) {
  if (!plan?.sets?.length) return plan;
  const sideKey = plan.reason?.side;
  const baseModel = models ? models[sideKey ?? "L"] : model;
  // Today's readiness varies more than week-to-week strength does, so the
  // session copy starts with extra uncertainty: a set that runs hot or cold
  // moves today's numbers noticeably without rewriting the long-term model.
  let m = prepareForSession(baseModel, date);
  m = { ...m, logVar: m.logVar + READINESS_SD ** 2 };
  // A set taken to within a rep of failure is a direct reading of today's
  // strength, not noise: today can't be stronger than that set showed.
  // (The half-step cap and outlier gate in updateModel exist for sets that
  // might just have been sandbagged; a near-failure set wasn't.)
  let ceiling = Infinity;
  let ceilingSet = null;
  for (const s of loggedSets) {
    const eff = toEffective(exercise, Number(s.load), bodyweight);
    const setIndex = s.index ?? s.setIndex;
    m = updateModel(m, { load: eff, reps: s.reps, rir: s.rir, setIndex, date }, { gainCap, record: false });
    const rirKnown = s.rir != null && s.rir !== "" && !Number.isNaN(Number(s.rir));
    if (rirKnown && Number(s.rir) <= 1 && eff > 0 && Number(s.reps) > 0) {
      const shown = (eff * (1 + (Number(s.reps) + Number(s.rir)) / m.k)) / m.fatigueDecay ** setIndex;
      if (shown < ceiling) { ceiling = shown; ceilingSet = s; }
    }
  }
  if (ceiling < e1rm(m)) m = { ...m, logE1rm: Math.log(ceiling) };
  const done = new Set(loggedSets.map((s) => s.index ?? s.setIndex));
  const lock = new Set(locked);
  const [lo, hi] = repRange;
  const r = plan.reason.rir;
  const E = e1rm(m);
  // Judge the next set against the load you're actually using, not the one
  // that was planned this morning.
  const lastDone = [...loggedSets].sort((a, b) => (a.index ?? a.setIndex) - (b.index ?? b.setIndex)).pop();
  let load = lastDone ? Number(lastDone.load) : plan.load;
  let eff = toEffective(exercise, load, bodyweight);
  const remaining = plan.sets.filter((s) => !done.has(s.index) && !lock.has(s.index));
  if (!remaining.length) return plan;

  const nextReps = repsAt(E, eff, m.k, m.fatigueDecay, remaining[0].index, r);
  let reloaded = false;
  if (nextReps < lo - 2 || nextReps > hi + 3) {
    // No one-rung-down floor here: that guards against one bad session
    // dragging next week's numbers, but within a session the sets you just
    // did are the evidence. Only the caller's explicit floor applies.
    const pick = chooseLoad({ E, k: m.k, decay: m.fatigueDecay, rir: r, lo, hi, aim: aimReps(repRange), ladder: ladder ?? ladderFor(exercise, gymProfile), exercise, bodyweight, lastLoad, setIndex: remaining[0].index });
    if (pick) { reloaded = pick.logged !== load; load = pick.logged; eff = pick.eff; }
  }
  const sets = plan.sets.map((s) => {
    if (done.has(s.index) || lock.has(s.index)) return s;
    const reps = Math.max(1, repsAt(E, eff, m.k, m.fatigueDecay, s.index, r));
    const changed = reps !== s.reps || load !== s.load;
    return { ...s, load, reps, ...(changed ? { adjusted: true } : {}) };
  });
  const anyChanged = sets.some((s, i) => s !== plan.sets[i] && s.adjusted);
  const unit = exercise.loadType === "dumbbell-pair" ? " lb each hand" : " lb";
  let text = plan.text;
  if (anyChanged) {
    const parts = [];
    if (ceilingSet) parts.push(`${ceilingSet.load}×${ceilingSet.reps} with ${ceilingSet.rir} left puts today's strength at about ${Math.round(E)} lb.`);
    else parts.push(`Adjusted to how the last set went (today's estimate about ${Math.round(E)} lb).`);
    const next = sets.find((s) => !done.has(s.index) && !lock.has(s.index));
    if (next) parts.push(`${reloaded ? "New load: " : "Next: "}${next.load}${unit} for ${next.reps} with ${r} left.`);
    text = parts.join(" ");
  }
  let reason = plan.reason;
  if (anyChanged && baseModel?.logE1rm != null) {
    const prevE = Math.exp(baseModel.logE1rm);
    reason = { ...plan.reason, e1rm: Math.round(E * 10) / 10, changePct: Math.round(((E - prevE) / prevE) * 1000) / 10, load };
  }
  return { ...plan, sets, text, reason, sessionE1rm: Math.round(E * 10) / 10 };
}
