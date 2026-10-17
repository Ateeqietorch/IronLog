// Exercise trials (COACH-ENGINE-SPEC.md §6.1b): a switch that holds for the
// next few sessions of that day, then asks you to keep it or go back.
// Pure functions; the store persists the list.
import { observedE1rm } from "../engine/model.js";

export const TRIAL_MIN = 2, TRIAL_MAX = 6, TRIAL_DEFAULT = 3;

export function newTrial({ dayKey, slotIndex, from, to, sessions = TRIAL_DEFAULT, date }) {
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    dayKey, slotIndex, fromId: from.id ?? null, fromName: from.name, toId: to.id, toName: to.name,
    sessions: Math.max(TRIAL_MIN, Math.min(TRIAL_MAX, sessions)), done: [], startedAt: date, status: "active",
  };
}

const live = (t) => t.status === "active" || t.status === "review";

// Swap trial exercises into a program day before the session is built.
// A trial whose slot no longer holds the original exercise is ignored.
export function applyTrials(day, trials, index) {
  const active = trials.filter((t) => t.status === "active" && t.dayKey === day.key);
  if (!active.length) return day;
  const exercises = day.exercises.map((slot, i) => {
    const t = active.find((x) => x.slotIndex === i && (x.fromId ?? null) === (slot.exerciseId ?? null));
    const to = t && index.byId.get(t.toId);
    if (!to) return slot;
    return {
      ...slot, name: to.name, exerciseId: to.id, repRange: to.defaultRepRange, unilateral: !!to.unilateral, programWeight: null,
      trial: { id: t.id, n: Math.min(t.done.length + 1, t.sessions), of: t.sessions, fromName: t.fromName },
    };
  });
  return { ...day, exercises };
}

// After a workout: count it for every trial exercise you actually did.
export function recordSession(trials, session) {
  const hit = new Set(session.exercises.filter((e) => e.slot?.trial && e.logged?.length && e.ex?.id).map((e) => e.slot.trial.id));
  return trials.map((t) => {
    if (!hit.has(t.id) || t.status !== "active" || t.done.includes(session.sessionKey)) return t;
    const done = [...t.done, session.sessionKey];
    return { ...t, done, status: done.length >= t.sessions ? "review" : "active" };
  });
}

export const inReview = (trials) => trials.filter((t) => t.status === "review");
export const activeFor = (trials, dayKey, slotIndex) => trials.find((t) => live(t) && t.dayKey === dayKey && t.slotIndex === slotIndex);

// What the review screen shows: the trial exercise's per-session strength
// estimate (from the first set of each session) and the change across it.
export function trialSummary(trial, models) {
  const ms = ["both", "L", "R"].map((s) => models[`${trial.toId}|${s}`]).filter(Boolean);
  const dates = new Set(trial.done.map((k) => k.slice(0, 10)));
  const per = [];
  for (const m of ms.slice(0, 1)) {
    const byDate = new Map();
    for (const o of m.obs ?? []) if (dates.has(o.date) && !byDate.has(o.date)) byDate.set(o.date, o);
    for (const [date, o] of [...byDate].sort((a, b) => a[0].localeCompare(b[0]))) {
      per.push({ date, top: `${o.load} × ${o.reps}`, e1rm: Math.round(observedE1rm(m, o)) });
    }
  }
  const first = per[0]?.e1rm, last = per.at(-1)?.e1rm;
  const changePct = first && last && per.length > 1 ? Math.round(((last - first) / first) * 1000) / 10 : null;
  return { sessions: trial.done.length, per, changePct };
}

// Resolve a review: keep (becomes permanent), revert, or extend.
export function resolveTrial(trials, id, decision, extra = 2) {
  return trials.map((t) => {
    if (t.id !== id) return t;
    if (decision === "extend") return { ...t, sessions: Math.min(t.sessions + extra, t.done.length + TRIAL_MAX), status: "active" };
    return { ...t, status: decision === "keep" ? "kept" : "reverted", resolvedAt: new Date().toISOString().slice(0, 10) };
  });
}
