// Session state for the Train screen. No DOM here, so it's testable in Node.
// Every number comes from engine/prescribe.js; this file only keeps track of
// which set you're on and turns the finished session into sheet rows.
import { newModel, updateModel, loadFor, defaultK } from "../engine/model.js";
import { prescribe, recalcRemaining, ladderFor, aimReps, toEffective } from "../engine/prescribe.js";
import { targetRir, deloadSets } from "../engine/meso.js";
import { ENGINE_VERSION } from "../engine/index.js";

export const modelFor = (models, id, side = "both") => models[`${id}|${side}`];

function modelsForExercise(models, ex) {
  const L = modelFor(models, ex.id, "L"), R = modelFor(models, ex.id, "R");
  if (ex.unilateral && (L || R)) return { models: { ...(L ? { L } : {}), ...(R ? { R } : {}) } };
  const both = modelFor(models, ex.id) ?? L ?? R;
  return both ? { model: both } : {};
}

const lastLoadOf = (m) => (m?.obs?.length ? m.obs[m.obs.length - 1].load : null);

// A first guess from the weight in your old program: assume it was meant for
// the middle of the rep range with a couple of reps left (spec §6.3 lite;
// Phase 5 adds the full cold-start estimate).
export function coldModel(ex, programWeight, repRange) {
  const k = defaultK(ex.kClass);
  const mid = aimReps(repRange);
  return newModel(ex.id, { kClass: ex.kClass, k, e1rm: programWeight * (1 + (mid + 2) / k), sd: 0.15 });
}

export function planExercise({ slot, ex, models, date, weekInfo, bodyweight, policy, gymProfile }) {
  const baseRir = targetRir(weekInfo, ex);
  const sets = weekInfo.deload ? deloadSets(slot.sets) : slot.sets;
  const common = { exercise: ex, repRange: slot.repRange, rir: baseRir, sets, date, bodyweight, policy, gymProfile, deload: weekInfo.deload };
  const found = modelsForExercise(models, ex);
  if (found.model || found.models) {
    const plan = prescribe({ ...common, ...found, lastLoad: lastLoadOf(found.model ?? Object.values(found.models)[0]) });
    if (!plan.needsCalibration && !plan.needsBodyweight) return { plan, mode: "coached", ...found };
    if (plan.needsBodyweight) return { plan: null, mode: "manual", note: "Log your bodyweight in the classic view so weighted dips and pull-ups can be coached." };
  }
  if (slot.programWeight > 0 && !["bodyweight-plus", "assisted"].includes(ex.loadType)) {
    const model = coldModel(ex, slot.programWeight, slot.repRange);
    const plan = prescribe({ ...common, model, rir: baseRir + 1 });
    plan.text = "First time with the new coach on this one, so set 1 starts light and checks the weight. The rest of the sets adjust to it.";
    return { plan, mode: "calibrating", model };
  }
  return { plan: null, mode: "manual", note: "No history yet. Pick a weight you could do for the top of the range with a few reps left; set 1 calibrates the rest." };
}

export function buildSession({ day, index, models, date, weekInfo, bodyweight = null, policy = "balanced", gymProfile = null }) {
  const exercises = day.exercises.map((slot, i) => {
    const ex = slot.exerciseId ? index.byId.get(slot.exerciseId) : null;
    if (!ex) return { i, slot, name: slot.name, ex: null, mode: "manual", plan: null, logged: [], sets: slot.sets, note: "This exercise isn't in the catalog yet, so it's logged without coaching." };
    const p = planExercise({ slot, ex, models, date, weekInfo, bodyweight, policy, gymProfile });
    return { i, slot, name: slot.name, ex, ...p, logged: [], sets: p.plan?.sets.length ?? slot.sets };
  });
  return {
    date, dayKey: day.key, dayLabel: day.label, sessionKey: `${date}_${day.key}`,
    weekInfo, exercises, cur: 0, bodyweight, policy, gymProfile, startedAt: null, saved: false,
  };
}

export const isDone = (e) => e.logged.length >= e.sets;

export function currentSetIndex(e) {
  return e.logged.length;
}

// What the screen should show for the set you're on.
export function target(e) {
  const si = currentSetIndex(e);
  if (e.plan?.sets?.[si]) return e.plan.sets[si];
  const prev = e.logged[e.logged.length - 1];
  return { index: si, load: prev?.load ?? e.slot.programWeight ?? null, reps: prev ? Math.min(prev.reps?.L ?? prev.reps, prev.reps?.R ?? prev.reps) : e.slot.repRange[1], rir: e.plan?.reason?.rir ?? 2 };
}

const repsMin = (reps) => (typeof reps === "object" ? Math.min(reps.L, reps.R) : reps);

// Log a set and recompute the sets that haven't started.
export function logSet(session, exIdx, entry, now = null) {
  const s = structuredClone(session);
  const e = s.exercises[exIdx];
  if (!s.startedAt) s.startedAt = now;
  const si = entry.index ?? currentSetIndex(e);
  const planned = e.plan?.sets?.[si] ?? null;
  const rec = {
    index: si, load: Number(entry.load), reps: entry.reps, rir: entry.rir,
    plannedLoad: planned?.load ?? null, plannedReps: planned?.reps ?? null, plannedRir: planned?.rir ?? null,
  };
  e.logged = [...e.logged.filter((l) => l.index !== si), rec].sort((a, b) => a.index - b.index);

  if (e.ex && e.logged.length < e.sets) {
    const loggedSets = e.logged.map((l) => ({ index: l.index, load: l.load, reps: repsMin(l.reps), rir: l.rir }));
    const common = { exercise: e.ex, loggedSets, date: s.date, repRange: e.slot.repRange, bodyweight: s.bodyweight, gymProfile: s.gymProfile };
    if (e.plan && (e.mode === "coached" || e.mode === "calibrating")) {
      // Calibration sets snap the estimate to what you just did (spec §6.3).
      e.plan = recalcRemaining({ ...common, plan: e.plan, model: e.model, models: e.models, gainCap: e.mode === "calibrating" && si === 0 ? 1 : 0.5 });
    } else if (!e.plan && e.mode === "manual") {
      // First set on an unknown exercise: build a model from it, then coach the rest.
      let m = newModel(e.ex.id, { kClass: e.ex.kClass });
      const eff = toEffective(e.ex, rec.load, s.bodyweight ?? 0);
      m = updateModel(m, { load: eff, reps: repsMin(rec.reps), rir: rec.rir, setIndex: si, date: s.date });
      const p = prescribe({ model: { ...m, lastExposure: s.date }, exercise: e.ex, repRange: e.slot.repRange, rir: rec.rir, sets: e.sets, date: s.date, bodyweight: s.bodyweight });
      if (!p.needsCalibration && !p.needsBodyweight) {
        p.sets = p.sets.map((x, i) => (i <= si ? { ...x, load: rec.load, reps: repsMin(rec.reps) } : x));
        p.text = "Set 1 calibrated this exercise; the rest of today is coached from it.";
        e.plan = p; e.mode = "calibrating"; e.model = m;
      }
    }
  }
  if (isDone(e)) s.cur = nextUndone(s, exIdx);
  return s;
}

export function nextUndone(s, from) {
  const n = s.exercises.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (!isDone(s.exercises[j])) return j;
  }
  return from;
}

export const sessionDone = (s) => s.exercises.every(isDone);
export const anyLogged = (s) => s.exercises.some((e) => e.logged.length);

// Sheet rows: v2 columns A–J (unchanged) + v3 columns K–P.
export function toRows(s) {
  const rows = [];
  for (const e of s.exercises) {
    for (const l of e.logged) {
      const uni = typeof l.reps === "object";
      const weight = uni ? `L:${l.load}/R:${l.load}` : l.load;
      const reps = uni ? `L:${l.reps.L}/R:${l.reps.R}` : l.reps;
      const rpe = l.rir == null ? "" : String(Math.max(0, 10 - l.rir));
      rows.push([s.date, s.dayKey, e.name, l.index + 1, weight, reps, "", s.sessionKey, rpe, "1",
        e.ex?.id ?? "", l.plannedLoad ?? "", l.plannedReps ?? "", l.plannedRir ?? "", "", ENGINE_VERSION]);
    }
  }
  return rows;
}

// Neighbouring loads for the edit stepper.
export function stepLoad(ex, load, dir, gymProfile = null) {
  if (!ex) return Math.max(0, Number(load || 0) + dir * 5);
  const lad = ladderFor(ex, gymProfile);
  const v = Number(load || 0);
  if (dir > 0) return lad.find((x) => x > v + 1e-9) ?? v;
  return [...lad].reverse().find((x) => x < v - 1e-9) ?? v;
}

export { loadFor };

// ── Coach proposals (applied only after the lifter taps Apply) ─────────────
export function describeChange(s, c, index) {
  const name = (i) => s.exercises[i]?.ex?.name ?? s.exercises[i]?.name ?? `exercise ${i + 1}`;
  switch (c.type) {
    case "switch_exercise": return `Swap ${name(c.exerciseIndex)} for ${index.byId.get(c.toExerciseId)?.name ?? c.toExerciseId} (today only)`;
    case "skip_exercise": return `Skip ${name(c.exerciseIndex)}`;
    case "set_count": return `${name(c.exerciseIndex)}: ${c.sets} sets`;
    case "move_exercise": return `Move ${name(c.exerciseIndex)} to position ${c.toPosition + 1}`;
    case "change_day": return `Switch today's workout to ${c.dayKey}`;
    default: return "Unknown change";
  }
}

export function validateChange(s, c, index, program) {
  const e = s.exercises[c.exerciseIndex];
  if (c.type === "change_day") return program.days.some((d) => d.key === c.dayKey) ? null : "That day isn't in your program.";
  if (!e) return "That exercise isn't in today's workout.";
  if (c.type === "switch_exercise") {
    if (!index.byId.has(c.toExerciseId)) return "That exercise isn't in the catalog.";
    if (e.logged.length) return `You've already logged sets of ${e.ex?.name ?? e.name}.`;
  }
  if (c.type === "set_count" && !(c.sets >= 1)) return "Invalid set count.";
  return null;
}

// Apply a list of changes to today's session (not the program).
export function applyChanges(session, changes, { index, models }) {
  let s = structuredClone(session);
  const wk = s.weekInfo;
  const replan = (e, slot) => {
    const ex = index.byId.get(slot.exerciseId);
    const p = planExercise({ slot, ex, models, date: s.date, weekInfo: wk, bodyweight: s.bodyweight, policy: s.policy, gymProfile: s.gymProfile });
    return { ...e, slot, ex, name: slot.name, ...p, model: p.model, models: p.models, sets: p.plan?.sets.length ?? slot.sets };
  };
  // Removals last so indices stay valid while applying the others.
  const ordered = [...changes].sort((a, b) => (a.type === "skip_exercise") - (b.type === "skip_exercise") || (b.exerciseIndex ?? 0) - (a.exerciseIndex ?? 0));
  for (const c of ordered) {
    const e = s.exercises[c.exerciseIndex];
    if (c.type === "switch_exercise" && e && !e.logged.length) {
      const ex = index.byId.get(c.toExerciseId);
      if (!ex) continue;
      const slot = { ...e.slot, name: ex.name, exerciseId: ex.id, repRange: ex.defaultRepRange, unilateral: ex.unilateral, programWeight: null };
      s.exercises[c.exerciseIndex] = { ...replan(e, slot), logged: [], switchedFrom: e.ex?.name ?? e.name };
    } else if (c.type === "set_count" && e) {
      const n = Math.max(c.sets, e.logged.length);
      if (!e.ex) { e.sets = n; continue; }
      const fresh = replan(e, { ...e.slot, sets: n });
      s.exercises[c.exerciseIndex] = { ...fresh, logged: e.logged, sets: Math.max(n, e.logged.length) };
    } else if (c.type === "skip_exercise" && e) {
      if (e.logged.length) e.sets = e.logged.length;
      else s.exercises.splice(c.exerciseIndex, 1);
    }
  }
  for (const c of changes.filter((x) => x.type === "move_exercise")) {
    const [moved] = s.exercises.splice(c.exerciseIndex, 1);
    if (moved) s.exercises.splice(Math.max(0, Math.min(c.toPosition, s.exercises.length)), 0, moved);
  }
  s.exercises = s.exercises.map((e, i) => ({ ...e, i }));
  const firstOpen = s.exercises.findIndex((e) => !isDone(e));
  s.cur = firstOpen >= 0 ? firstOpen : 0;
  return s;
}
