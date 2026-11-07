// Coaching directives (COACH-BRAIN.md §5). Pure.
//
// A directive is a standing instruction the engine applies when it plans:
// "no sets under 8 reps", "prioritize side delts", "I have 45 minutes",
// "deload this week". You set them in the Plan tab or by telling the coach;
// the coach can't change a number any other way, so its changes and the
// engine's numbers can never disagree. Stored as a list with tombstones
// (`removed: true`) so a sync never brings a deleted one back.
import { MUSCLES, PATTERNS } from "./catalog.js";
import { PRIORITIES } from "./volume.js";

export const KINDS = Object.freeze([
  "schedule", "rep_floor", "rep_range", "muscle_priority", "volume", "effort",
  "technique", "progression", "block_length", "deload", "new_block", "seed",
]);
// Optional tools the planner may use. "add-ons" = a short extra exercise for
// a lagging small muscle on a day that doesn't otherwise train it.
export const TECHNIQUES = Object.freeze(["myo-reps", "lengthened-partials", "supersets", "add-ons"]);

const SCOPES_KIND = ["all", "compound", "isolation"];
const isScope = (s) => SCOPES_KIND.includes(s) || PATTERNS.includes(s) || /^[a-z0-9][a-z0-9-]*$/.test(s ?? "");
const int = (x, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));

// Normalize one directive; returns null if it's not valid.
export function cleanDirective(d, { now = null, idFn = null } = {}) {
  if (!d || !KINDS.includes(d.kind)) return null;
  const base = { id: d.id ?? (idFn ? idFn() : `d${Math.random().toString(36).slice(2, 10)}`), kind: d.kind, source: d.source === "user" ? "user" : d.source === "coach" ? "coach" : "user", at: isDate(d.at) ? d.at : now, ...(d.note ? { note: String(d.note).slice(0, 160) } : {}), ...(d.removed ? { removed: true } : {}) };
  switch (d.kind) {
    case "schedule": {
      const days = int(d.daysPerWeek, 1, 7), minutes = int(d.minutes, 15, 180);
      if (days == null && minutes == null) return null;
      return { ...base, ...(days != null ? { daysPerWeek: days } : {}), ...(minutes != null ? { minutes } : {}) };
    }
    case "rep_floor": {
      const minReps = int(d.minReps, 1, 30);
      const scope = d.scope ?? "all";
      return minReps != null && isScope(scope) ? { ...base, minReps, scope } : null;
    }
    case "rep_range": {
      const r = Array.isArray(d.range) ? d.range.map(Number) : null;
      const scope = d.scope;
      if (!r || !(r[0] >= 1 && r[1] >= r[0] && r[1] <= 40) || !isScope(scope)) return null;
      return { ...base, range: [Math.round(r[0]), Math.round(r[1])], scope };
    }
    case "muscle_priority":
      return MUSCLES.includes(d.muscle) && [...PRIORITIES, "indirect"].includes(d.level) ? { ...base, muscle: d.muscle, level: d.level } : null;
    case "volume": {
      const change = int(d.change, -6, 6);
      return MUSCLES.includes(d.muscle) && change ? { ...base, muscle: d.muscle, change } : null;
    }
    case "effort": {
      const offset = int(d.offset, -2, 2);
      return offset != null ? { ...base, offset } : null;
    }
    case "technique": {
      const allow = (d.allow ?? []).filter((t) => TECHNIQUES.includes(t));
      const block = (d.block ?? []).filter((t) => TECHNIQUES.includes(t));
      return allow.length || block.length ? { ...base, allow, block } : null;
    }
    case "progression":
      return ["balanced", "reps-first", "load-first"].includes(d.style) ? { ...base, style: d.style } : null;
    case "block_length": {
      const weeks = int(d.weeks, 4, 6);
      return weeks != null ? { ...base, weeks } : null;
    }
    case "deload":
    case "new_block":
      return isDate(d.from) ? { ...base, from: d.from } : null;
    case "seed": {
      const load = Number(d.load), reps = int(d.reps, 1, 50);
      return d.exerciseId && load > 0 && reps != null ? { ...base, exerciseId: String(d.exerciseId), load, reps, rir: int(d.rir ?? 2, 0, 6) ?? 2 } : null;
    }
    default: return null;
  }
}

// Later directives override earlier ones of the same kind and scope.
const slotKey = (d) => {
  switch (d.kind) {
    case "rep_floor": case "rep_range": return `${d.kind}|${d.scope}`;
    case "muscle_priority": return `${d.kind}|${d.muscle}`;
    case "seed": return `${d.kind}|${d.exerciseId}`;
    case "volume": case "deload": case "new_block": return `${d.kind}|${d.id}`;
    default: return d.kind;
  }
};

export function activeDirectives(list = []) {
  const live = list.filter((d) => d && !d.removed);
  const byKey = new Map();
  for (const d of [...live].sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")))) byKey.set(slotKey(d), d);
  return [...byKey.values()];
}

// Everything the planner needs, resolved.
export function resolveDirectives(list = [], { defaults = {} } = {}) {
  const act = activeDirectives(list);
  const out = {
    schedule: { daysPerWeek: defaults.daysPerWeek ?? null, minutes: defaults.minutes ?? null },
    minReps: {}, repRanges: {}, priorities: {}, nudges: [], effortOffset: 0,
    techniques: { "myo-reps": true, "lengthened-partials": true, supersets: true, "add-ons": true },
    progression: defaults.progression ?? "balanced", blockWeeks: 5, deloadFrom: null, newBlockFrom: null, seeds: {},
  };
  for (const d of act) {
    switch (d.kind) {
      case "schedule": if (d.daysPerWeek) out.schedule.daysPerWeek = d.daysPerWeek; if (d.minutes) out.schedule.minutes = d.minutes; break;
      case "rep_floor": out.minReps[d.scope] = d.minReps; break;
      case "rep_range": out.repRanges[d.scope] = d.range; break;
      case "muscle_priority": out.priorities[d.muscle] = d.level; break;
      case "volume": out.nudges.push({ muscle: d.muscle, change: d.change, at: d.at ?? "0000-00-00" }); break;
      case "effort": out.effortOffset = d.offset; break;
      case "technique": for (const t of d.allow ?? []) out.techniques[t] = true; for (const t of d.block ?? []) out.techniques[t] = false; break;
      case "progression": out.progression = d.style; break;
      case "block_length": out.blockWeeks = d.weeks; break;
      case "deload": if (!out.deloadFrom || d.from > out.deloadFrom) out.deloadFrom = d.from; break;
      case "new_block": if (!out.newBlockFrom || d.from > out.newBlockFrom) out.newBlockFrom = d.from; break;
      case "seed": out.seeds[d.exerciseId] = { load: d.load, reps: d.reps, rir: d.rir }; break;
      default: break;
    }
  }
  return out;
}

const NICE = { "upper-back": "upper back", "lower-back": "lower back", "front-delts": "front delts", "side-delts": "side delts", "rear-delts": "rear delts" };
const nice = (m) => NICE[m] ?? m;

export function describeDirective(d, index = null) {
  const exName = (id) => index?.byId?.get(id)?.name ?? id;
  const scopeText = (s) => (s === "all" ? "every exercise" : s === "compound" ? "compound lifts" : s === "isolation" ? "isolation exercises" : PATTERNS.includes(s) ? `${s.replace(/-/g, " ")} exercises` : exName(s));
  switch (d.kind) {
    case "schedule": return [d.daysPerWeek ? `${d.daysPerWeek} days a week` : null, d.minutes ? `${d.minutes} minutes a session` : null].filter(Boolean).join(", ");
    case "rep_floor": return `No sets under ${d.minReps} reps on ${scopeText(d.scope)}`;
    case "rep_range": return `${d.range[0]}–${d.range[1]} reps on ${scopeText(d.scope)}`;
    case "muscle_priority": return d.level === "specialize" ? `Prioritize ${nice(d.muscle)}` : d.level === "maintain" ? `Maintain ${nice(d.muscle)} (minimum volume)` : d.level === "indirect" ? `No direct work for ${nice(d.muscle)}` : `Grow ${nice(d.muscle)}`;
    case "volume": return `${d.change > 0 ? "+" : ""}${d.change} ${Math.abs(d.change) === 1 ? "set" : "sets"} per session for ${nice(d.muscle)}`;
    case "effort": return d.offset > 0 ? `Train ${d.offset} rep${d.offset > 1 ? "s" : ""} further from failure` : d.offset < 0 ? `Train ${-d.offset} rep${d.offset < -1 ? "s" : ""} closer to failure` : "Normal effort";
    case "technique": return [d.allow?.length ? `Use ${d.allow.join(", ")}` : null, d.block?.length ? `No ${d.block.join(", ")}` : null].filter(Boolean).join("; ");
    case "progression": return d.style === "reps-first" ? "Progress reps before weight" : d.style === "load-first" ? "Progress weight before reps" : "Balanced progression";
    case "block_length": return `${d.weeks}-week blocks before each deload`;
    case "deload": return `Deload from ${d.from}`;
    case "new_block": return `New block from ${d.from}`;
    case "seed": return `Start ${exName(d.exerciseId)} at ${d.load} × ${d.reps}`;
    default: return d.kind;
  }
}

export function mergeDirectives(...lists) {
  const byId = new Map();
  for (const list of lists) for (const d of list ?? []) {
    const prev = byId.get(d.id);
    byId.set(d.id, prev ? { ...prev, ...d, removed: prev.removed || d.removed } : d);
  }
  return [...byId.values()];
}

export const niceMuscleName = nice;
