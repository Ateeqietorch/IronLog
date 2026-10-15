// Per-exercise strength model (COACH-ENGINE-SPEC.md §4.1, §4.2, §4.5, §4.6).
//
//   RTF(L) = k × (E / L − 1)     reps to failure at load L
//   L(RTF) = E / (1 + RTF / k)   load for a given reps to failure
//
// E (one-rep strength) is tracked as x = ln E with variance P and updated
// from every logged set like a one-dimensional Kalman filter. k (how many
// reps you get per % of strength — differs by exercise) and the per-set
// fatigue decay are learned from your own data. Pure functions only; dates
// are ISO "YYYY-MM-DD" strings passed in by the caller.

export const K_DEFAULTS = Object.freeze({
  "upper-compound": 32,
  "lower-free": 34,
  "leg-press": 42,
  isolation: 34,
});
export const K_MIN = 24, K_MAX = 50;
export const DECAY_DEFAULT = 0.98, DECAY_MIN = 0.93, DECAY_MAX = 1.0;

export const DEFAULTS = {
  processSdPerWeek: 0.04,      // week-to-week drift in strength + equipment/day noise (tuned on history, see DECISIONS.md)
  detrainSdPerWeek: 0.02,      // extra uncertainty per week beyond 14 days off
  expectedGainPerWeek: 0.01,   // "assume you got a bit stronger, then check" — see DECISIONS.md
  maxGainDays: 7,              // the expected-gain step covers at most a week
  gainOffAfterDays: 10,        // after a gap this long, assume no gain (§4.6)
  priorSdNew: 0.15,            // brand-new exercise (§4.2)
  baseObsSd: 0.04,             // measurement noise of one well-reported set
  unknownRir: 0.5,             // unrated sets in your log were mostly near failure
  unknownRirNoise: 2,          // sets without RIR are trusted half as much (sd ×2)
  maxRir: 6,
  obsKeep: 60,                 // observations kept for fitting k and decay
  submaxDownweight: 4,         // unrated sets weaker than expected: variance ×4
  gateSigma: 2.5,              // cap any single update at 2.5 standard deviations
  learningExposures: 4,        // exposures treated as "still learning the movement"
  learningSd: 0.04,            // extra uncertainty per session while learning
};

export function daysBetween(a, b) {
  const t = (s) => Date.parse(String(s).slice(0, 10) + "T00:00:00Z");
  return Math.round((t(b) - t(a)) / 86400000);
}

export const rtf = (E, L, k) => k * (E / L - 1);
export const loadFor = (E, reps, k) => E / (1 + reps / k);
export const e1rmFrom = (L, reps, k) => L * (1 + reps / k);

export function defaultK(kClass) {
  return K_DEFAULTS[kClass] ?? 34;
}

// A fresh model. Without a prior estimate, the first logged set sets it.
export function newModel(exerciseId, { side = "both", kClass, k, e1rm, sd = DEFAULTS.priorSdNew } = {}) {
  return {
    exerciseId, side,
    logE1rm: e1rm ? Math.log(e1rm) : null,
    logVar: sd * sd,
    k: k ?? defaultK(kClass),
    kDefault: k ?? defaultK(kClass),
    kN: 0,
    fatigueDecay: DECAY_DEFAULT,
    rirBias: 0,
    lastExposure: null,
    exposures: 0,
    obs: [],
  };
}

export const e1rm = (m) => (m.logE1rm == null ? null : Math.exp(m.logE1rm));
export const sd = (m) => Math.sqrt(m.logVar);

// Advance the model to a session date: grow uncertainty with time away and
// apply the expected-progress step (none after a long gap or in a deload).
export function prepareForSession(model, date, { deload = false, opts = DEFAULTS } = {}) {
  const m = { ...model };
  if (m.logE1rm == null || !m.lastExposure) return m;
  const days = Math.max(0, daysBetween(m.lastExposure, date));
  const weeks = days / 7;
  m.logVar += opts.processSdPerWeek ** 2 * weeks;
  if (days > 14) m.logVar += opts.detrainSdPerWeek ** 2 * ((days - 14) / 7);
  // The first few exposures to an exercise improve fast (you're learning the
  // movement and the machine), so stay quick to update early on.
  if (m.exposures < opts.learningExposures) m.logVar += opts.learningSd ** 2;
  if (!deload && days > 0 && days <= opts.gainOffAfterDays) {
    m.logE1rm += opts.expectedGainPerWeek * Math.min(days, opts.maxGainDays) / 7;
  }
  return m;
}

// Measurement noise for one set (spec §4.2; Halperin 2022: reports are more
// accurate close to failure and at ≤12 reps).
export function obsVariance(reps, rir, rirKnown, opts = DEFAULTS) {
  let s = opts.baseObsSd * (1 + rir / 2) * (reps > 12 ? 1.5 : 1);
  if (!rirKnown) s *= opts.unknownRirNoise;
  return s * s;
}

// Normalize a logged set. Returns null for anything that isn't a working set.
export function cleanSet(set, opts = DEFAULTS) {
  const load = Number(set.load), reps = Number(set.reps);
  if (!(load > 0) || !(reps > 0)) return null;
  const rirKnown = set.rir != null && set.rir !== "" && !Number.isNaN(Number(set.rir));
  const rir = rirKnown ? Math.min(opts.maxRir, Math.max(0, Number(set.rir))) : opts.unknownRir;
  return { load, reps, rir, rirKnown, setIndex: Math.max(0, Number(set.setIndex) || 0), date: set.date ?? null };
}

// Strength implied by one set, adjusted back to "fresh" (set 1) strength.
export function observedE1rm(model, s) {
  const rtfObs = s.reps + s.rir + (model.rirBias ?? 0);
  return (s.load * (1 + rtfObs / model.k)) / model.fatigueDecay ** s.setIndex;
}

// Reps the model expected at this load for this set, given the logged RIR.
export function predictReps(model, s) {
  if (model.logE1rm == null) return null;
  const E = e1rm(model) * model.fatigueDecay ** s.setIndex;
  return rtf(E, s.load, model.k) - s.rir - (model.rirBias ?? 0);
}

// Fold one set into the model. `gainCap` limits how far a single set can
// move the estimate (used in-session, §4.4).
export function updateModel(model, rawSet, { gainCap = 1, opts = DEFAULTS, record = true } = {}) {
  const s = cleanSet(rawSet, opts);
  if (!s) return model;
  const m = { ...model };
  const z = Math.log(observedE1rm(m, s));
  const R = obsVariance(s.reps, s.rir, s.rirKnown, opts);
  if (m.logE1rm == null) {
    m.logE1rm = z;
    m.logVar = Math.max(R, 0.05 ** 2);
  } else {
    let r = R;
    let innov = z - m.logE1rm;
    // A set with no effort rating that looks weaker than expected is most
    // likely just not taken close to failure (a lighter day, a back-off set),
    // so it says little about strength. Trust it much less.
    if (!s.rirKnown && innov < 0) r *= opts.submaxDownweight;
    // Outlier gate: typos ("6 lb" for 60) and odd sets can't drag the
    // estimate more than a plausible amount in one go.
    const gate = opts.gateSigma * Math.sqrt(m.logVar + r);
    innov = Math.max(-gate, Math.min(gate, innov));
    const K = Math.min(gainCap, m.logVar / (m.logVar + r));
    m.logE1rm += K * innov;
    m.logVar = (1 - K) * m.logVar;
  }
  if (record) {
    m.obs = [...m.obs, { load: s.load, reps: s.reps, rir: s.rir, rirKnown: s.rirKnown, setIndex: s.setIndex, date: s.date }].slice(-opts.obsKeep);
  }
  return m;
}

// Mark a session as done (after all its sets were folded in).
export function closeSession(model, date) {
  return { ...model, lastExposure: date, exposures: model.exposures + 1 };
}

// ── Learning k and fatigue decay from the lifter's own data ───────────────

function linFitSse(points) { // [t, y, w]
  let sw = 0, st = 0, sy = 0, stt = 0, sty = 0;
  for (const [t, y, w] of points) { sw += w; st += w * t; sy += w * y; stt += w * t * t; sty += w * t * y; }
  const den = sw * stt - st * st;
  const b = den > 1e-9 ? (sw * sty - st * sy) / den : 0;
  const a = (sy - b * st) / sw;
  let sse = 0;
  for (const [t, y, w] of points) sse += w * (y - a - b * t) ** 2;
  return sse;
}

// Fit k only once you've trained the exercise across rep zones ≥4 reps
// apart (spec §4.1). Grid search for the k that makes your sets agree best
// on one underlying strength trend, then blend toward the default.
export function fitK(model, { minSpread = 4 } = {}) {
  const pts = model.obs.filter((o) => o.rirKnown && o.reps <= 20);
  if (pts.length < 6) return model;
  const r = pts.map((o) => o.reps + o.rir);
  if (Math.max(...r) - Math.min(...r) < minSpread) return model;
  const t0 = pts[0].date;
  let best = { k: model.kDefault, sse: Infinity };
  for (let k = K_MIN; k <= K_MAX; k += 0.5) {
    const points = pts.map((o) => [
      t0 && o.date ? daysBetween(t0, o.date) / 7 : 0,
      Math.log((o.load * (1 + (o.reps + o.rir) / k)) / model.fatigueDecay ** o.setIndex),
      1 / (1 + o.rir / 2),
    ]);
    const sse = linFitSse(points);
    if (sse < best.sse) best = { k, sse };
  }
  const n = new Set(pts.map((o) => o.date)).size;
  const k = (n * best.k + 4 * model.kDefault) / (n + 4);
  return { ...model, k: Math.min(K_MAX, Math.max(K_MIN, Math.round(k * 10) / 10)), kN: n };
}

// Per-set decay from how strength-implied-by-set drops across a session.
export function fitFatigueDecay(model) {
  const byDate = new Map();
  for (const o of model.obs) {
    if (!o.rirKnown || !o.date) continue;
    if (!byDate.has(o.date)) byDate.set(o.date, []);
    byDate.get(o.date).push(o);
  }
  const ratios = [];
  for (const sets of byDate.values()) {
    const first = sets.find((o) => o.setIndex === 0);
    if (!first) continue;
    const e0 = first.load * (1 + (first.reps + first.rir) / model.k);
    for (const o of sets) {
      if (o.setIndex === 0) continue;
      const ei = o.load * (1 + (o.reps + o.rir) / model.k);
      ratios.push(Math.log(ei / e0) / o.setIndex);
    }
  }
  if (ratios.length < 4) return model;
  ratios.sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  const fitted = Math.min(DECAY_MAX, Math.max(DECAY_MIN, Math.exp(med)));
  const n = ratios.length;
  const decay = (n * fitted + 6 * DECAY_DEFAULT) / (n + 6);
  return { ...model, fatigueDecay: Math.round(decay * 1000) / 1000 };
}
