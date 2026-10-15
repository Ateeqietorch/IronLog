// Rebuild every exercise's strength model from logged history
// (COACH-ENGINE-SPEC.md §11 step 2) and measure how well the engine would
// have predicted each session (§9). Pure: takes rows, returns models + stats.
import { resolveExercise } from "./catalog.js";
import {
  newModel, prepareForSession, updateModel, closeSession, predictReps,
  fitK, fitFatigueDecay, cleanSet,
} from "./model.js";

// "L:90/R:90" → { L: 90, R: 90 }; "90" → { both: 90 }
export function parseSided(v) {
  const s = String(v ?? "").trim();
  if (!s) return {};
  if (/[LR]:/i.test(s)) {
    const out = {};
    for (const m of s.matchAll(/([LR])\s*:\s*([\d.]+)/gi)) out[m[1].toUpperCase()] = Number(m[2]);
    return out;
  }
  const n = Number(s);
  return Number.isFinite(n) ? { both: n } : {};
}

// rows: [{ date, exercise, set, weight, reps, rpe }] (raw sheet values).
// Returns working sets with resolved ids, one entry per side.
export function normalizeRows(rows, index, aliasDecisions = {}) {
  const out = [];
  const unresolved = new Map();
  for (const r of rows) {
    const name = String(r.exercise ?? "").trim();
    if (!name || !r.date) continue;
    const id = aliasDecisions[name] ?? resolveExercise(name, index).match?.id;
    if (!id) { unresolved.set(name, (unresolved.get(name) ?? 0) + 1); continue; }
    const w = parseSided(r.weight), n = parseSided(r.reps);
    const rpe = r.rpe === "" || r.rpe == null ? null : Number(r.rpe);
    const rir = rpe == null || Number.isNaN(rpe) ? null : Math.max(0, 10 - rpe);
    const sides = Object.keys(w).filter((s) => n[s] != null);
    for (const side of sides) {
      out.push({ date: String(r.date).slice(0, 10), id, side, setIndex: Math.max(0, Number(r.set) - 1 || 0), load: w[side], reps: n[side], rir });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id) || a.side.localeCompare(b.side) || a.setIndex - b.setIndex);
  return { sets: out, unresolved: [...unresolved].map(([name, count]) => ({ name, count })) };
}

const modelKey = (id, side) => `${id}|${side}`;

function runPass(sets, index, seedModels = {}) {
  const models = {};
  const errors = [];
  const lastSession = {};
  // group sets into sessions per exercise-side
  const groups = [];
  let cur = null;
  for (const s of sets) {
    const key = `${s.date}|${s.id}|${s.side}`;
    if (!cur || cur.key !== key) { cur = { key, date: s.date, id: s.id, side: s.side, sets: [] }; groups.push(cur); }
    cur.sets.push(s);
  }
  for (const g of groups) {
    const k = modelKey(g.id, g.side);
    if (!models[k]) {
      const ex = index.byId.get(g.id);
      const seed = seedModels[k];
      models[k] = newModel(g.id, { side: g.side, kClass: ex?.kClass, k: seed?.k });
      if (seed) models[k].fatigueDecay = seed.fatigueDecay;
    }
    // Predict the whole session from the pre-session model, like the app would.
    const exposuresBefore = models[k].exposures;
    const prevSession = lastSession[k];
    const pre = prepareForSession(models[k], g.date);
    if (pre.logE1rm != null) {
      for (const s of g.sets) {
        const c = cleanSet(s);
        if (!c) continue;
        const pred = predictReps(pre, c);
        // "Relevant" = a load the engine could actually have prescribed:
        // within reach of a normal hypertrophy set (≤ 25 reps to failure).
        // Warm-ups, light days and typos fall outside it.
        const predRtf = pred + c.rir;
        const relevant = predRtf >= 1 && predRtf <= 25;
        // Naive comparison: same reps as the same set last session, load-adjusted.
        const prev = prevSession?.find((p) => p.setIndex === c.setIndex) ?? prevSession?.[prevSession.length - 1];
        const naive = prev ? prev.reps * (prev.load / c.load) : null;
        errors.push({ id: g.id, side: g.side, date: g.date, predicted: pred, actual: c.reps, rirKnown: c.rirKnown, relevant, exposuresBefore, naiveError: naive == null ? null : naive - c.reps, error: pred - c.reps });
      }
    }
    let m = pre;
    for (const s of g.sets) m = updateModel(m, { ...s, date: g.date });
    models[k] = closeSession(m, g.date);
    const cleaned = g.sets.map((s) => cleanSet(s)).filter(Boolean);
    if (cleaned.length) lastSession[k] = cleaned;
  }
  return { models, errors };
}

function mae(list) {
  if (!list.length) return null;
  return Math.round((list.reduce((a, e) => a + Math.abs(e.error), 0) / list.length) * 100) / 100;
}
function bias(list) {
  if (!list.length) return null;
  return Math.round((list.reduce((a, e) => a + e.error, 0) / list.length) * 100) / 100;
}

// Two passes: the first learns k and fatigue decay per exercise, the second
// replays with them so the reported accuracy reflects the tuned models.
export function replayHistory(rows, index, { aliasDecisions = {} } = {}) {
  const { sets, unresolved } = normalizeRows(rows, index, aliasDecisions);
  const first = runPass(sets, index);
  const tuned = {};
  for (const [k, m] of Object.entries(first.models)) tuned[k] = fitK(fitFatigueDecay(m));
  const second = runPass(sets, index, tuned);
  const models = {};
  for (const [k, m] of Object.entries(second.models)) {
    models[k] = { ...m, k: tuned[k].k, kN: tuned[k].kN, fatigueDecay: tuned[k].fatigueDecay };
  }

  const byExercise = {};
  for (const e of second.errors) (byExercise[e.id] ??= []).push(e);
  const perExercise = Object.entries(byExercise).map(([id, list]) => {
    const withRir = list.filter((e) => e.rirKnown);
    return {
      id, sets: list.length, maeAll: mae(list), maeWithRir: mae(withRir), setsWithRir: withRir.length, bias: bias(list),
    };
  }).sort((a, b) => b.sets - a.sets);

  const withRir = second.errors.filter((e) => e.rirKnown);
  const relevant = second.errors.filter((e) => e.relevant);
  const relevantRir = relevant.filter((e) => e.rirKnown);
  const settledCmp = relevant.filter((e) => e.exposuresBefore >= 3 && e.naiveError != null);
  const naiveMae = (list) => (list.length ? Math.round((list.reduce((a, e) => a + Math.abs(e.naiveError), 0) / list.length) * 100) / 100 : null);
  for (const pe of perExercise) {
    const list = relevant.filter((e) => e.id === pe.id);
    pe.relevantSets = list.length; pe.maeRelevant = mae(list);
  }
  return {
    models,
    unresolved,
    errors: second.errors,
    stats: {
      workingSets: sets.length,
      predictedSets: second.errors.length,
      maeAll: mae(second.errors),
      maeWithRir: mae(withRir),
      setsWithRir: withRir.length,
      bias: bias(second.errors),
      relevantSets: relevant.length,
      maeRelevant: mae(relevant),
      maeRelevantWithRir: mae(relevantRir),
      relevantSetsWithRir: relevantRir.length,
      biasRelevant: bias(relevant),
      settledSets: settledCmp.length,
      maeSettled: mae(settledCmp),
      naiveMaeSettled: naiveMae(settledCmp),
      biasSettled: bias(settledCmp),
      perExercise,
    },
  };
}
