// Session validator and auto-fixer (IRONLOG_GENERATOR_SPEC.md §2–§3).
// Pure. Takes a program day, the catalog index, the lifter's constraints and
// (optionally) recovery state, and returns a fixed day plus a list of plain-
// language notes saying what changed and why.
//
// Fixes are applied in priority order:
//   1. lifter constraints (avoid list, joint flags)  — never violated
//   2. recovery (spine-loading work when the lower back is still recovering)
//   3. redundancy (duplicate or near-identical exercises, pattern caps)
//   4. per-session volume per muscle (indirect credit counts)
import { normalizeName, primaryMuscles } from "./catalog.js";
import { niceMuscle } from "./recovery.js";

export const PATTERN_SET_CAP = 6;
export const MAX_PER_PATTERN = 2;
// Fractional sets per muscle in one session before extra sets stop paying.
export const MUSCLE_SESSION_CAP = 10;
const MIN_SETS = 2;

// The lifter's standing rules. Shipped defaults mirror what they've told the
// coach; the app also stores whatever they add later.
export const DEFAULT_CONSTRAINTS = Object.freeze([
  { id: "c-pendlay", type: "avoid_exercise", target: "barbell-pendlay-row", reason: "Lower back", source: "default" },
  { id: "c-bent-row", type: "avoid_keyword", target: "bent over row", reason: "Lower back: unsupported row", source: "default" },
  { id: "c-back-squat", type: "avoid_keyword", target: "back squat", reason: "Lower back", source: "default" },
  { id: "c-deadlift", type: "avoid_keyword", target: "barbell deadlift", reason: "Lower back", source: "default" },
  { id: "c-conv-deadlift", type: "avoid_keyword", target: "conventional deadlift", reason: "Lower back", source: "default" },
  { id: "c-lower-back", type: "joint_flag", target: "lower-back", reason: "Protect the lower back", source: "default" },
  { id: "c-tbar", type: "prefer_exercise", target: "chest-supported-t-bar-row", reason: "Preferred row", source: "default" },
]);

// none | low | moderate | high. An explicit `spinalLoad` on the record wins.
export function spinalLoad(ex) {
  if (!ex) return "none";
  if (ex.spinalLoad) return ex.spinalLoad;
  const lb = ex.contributions?.["lower-back"] ?? 0;
  const free = ex.equipment === "barbell" || ex.equipment === "dumbbell";
  if (ex.pattern === "squat-free" && ex.equipment === "barbell") return "high";
  if (lb >= 0.5 && free && ex.pattern !== "hip-extension") return "high";
  if (lb > 0) return "moderate";
  if (ex.pattern === "squat-free") return "low";
  return "none";
}
const SPINE_RANK = { none: 0, low: 1, moderate: 2, high: 3 };

const profileBucket = (ex) => (ex.lengthenedBias > 0.65 ? "long" : ex.lengthenedBias < 0.4 ? "short" : "mid");
// Two exercises are near-identical when they share a pattern, the same prime
// movers and the same resistance profile (chest-supported T-bar row vs
// chest-supported dumbbell row).
export function sameStimulus(a, b) {
  if (!a || !b || a.pattern !== b.pattern) return false;
  const pa = primaryMuscles(a).sort().join(","), pb = primaryMuscles(b).sort().join(",");
  return pa === pb && profileBucket(a) === profileBucket(b);
}

export function isAvoided(ex, constraints) {
  if (!ex) return null;
  const name = normalizeName(ex.name);
  const aliases = (ex.aliases ?? []).map(normalizeName);
  for (const c of constraints ?? []) {
    if (c.type === "avoid_exercise" && (c.target === ex.id || normalizeName(c.target) === name || aliases.includes(normalizeName(c.target)))) return c;
    if (c.type === "avoid_keyword") {
      const k = normalizeName(c.target);
      if (k && (` ${name} `.includes(` ${k} `) || aliases.some((a) => ` ${a} `.includes(` ${k} `)))) return c;
    }
  }
  return null;
}

const flagged = (constraints, joint) => (constraints ?? []).some((c) => c.type === "joint_flag" && c.target === joint);

// Best stand-in for `ex`: same pattern first, then same prime movers;
// never avoided, never already in the session, lower spinal load preferred.
export function substitute(ex, { index, constraints, exclude = new Set(), maxSpine = "high" }) {
  const prim = primaryMuscles(ex);
  const preferred = new Set((constraints ?? []).filter((c) => c.type === "prefer_exercise").map((c) => c.target));
  const cands = index.list.filter((c) => c.id !== ex.id && c.source !== "free-exercise-db" && !exclude.has(c.id)
    && !isAvoided(c, constraints) && SPINE_RANK[spinalLoad(c)] <= SPINE_RANK[maxSpine]
    && (c.pattern === ex.pattern || primaryMuscles(c).some((m) => prim.includes(m))));
  const score = (c) => {
    let s = 0;
    if (c.pattern === ex.pattern) s += 4;
    const pc = primaryMuscles(c);
    s += pc.filter((m) => prim.includes(m)).length * 2 - pc.filter((m) => !prim.includes(m)).length;
    s -= SPINE_RANK[spinalLoad(c)];
    if (c.stability === "high") s += 0.5;
    if (c.unilateral === ex.unilateral) s += 0.25;
    if (c.source === "seed") s += 0.25;
    if (preferred.has(c.id)) s += 3;
    return s;
  };
  return cands.sort((a, b) => score(b) - score(a))[0] ?? null;
}

// Validate and fix a day. `recovery` is muscleState() output for today (may be null).
// Returns { day, notes: [{ kind: "fix"|"note", text }], issues: [...] }.
export function validateDay(day, { index, constraints = DEFAULT_CONSTRAINTS, recovery = null, recoveredFn = null, date = null } = {}) {
  const notes = [];
  const exOf = (slot) => (slot.exerciseId ? index.byId.get(slot.exerciseId) : null);
  let slots = day.exercises.map((s, i) => ({ ...s, origIndex: s.origIndex ?? i }));
  const swap = (i, to, why) => {
    const from = slots[i];
    notes.push({ kind: "fix", rule: "swap", text: `Swapped ${from.name} for ${to.name} (${why}).` });
    slots[i] = { ...from, name: to.name, exerciseId: to.id, repRange: to.defaultRepRange, unilateral: !!to.unilateral, programWeight: null, swappedFrom: from.name };
  };
  const drop = (i, why) => {
    notes.push({ kind: "fix", rule: "drop", text: `Dropped ${slots[i].name} (${why}).` });
    slots[i] = null;
  };
  const inUse = () => new Set(slots.filter(Boolean).map((s) => s.exerciseId).filter(Boolean));

  // 1. Constraints: avoid list.
  for (let i = 0; i < slots.length; i++) {
    const ex = slots[i] && exOf(slots[i]);
    const hit = isAvoided(ex, constraints);
    if (!hit) continue;
    const to = substitute(ex, { index, constraints, exclude: inUse(), maxSpine: flagged(constraints, "lower-back") ? "moderate" : "high" });
    if (to) swap(i, to, String(hit.reason || "on your avoid list").toLowerCase());
    else drop(i, `on your avoid list, and no safe stand-in was found`);
  }

  // 1b + 2. Spinal load: with a lower-back flag, at most one high-load lift;
  // none while the lower back is still recovering.
  const spineFlag = flagged(constraints, "lower-back");
  const spineRecovering = recoveredFn ? !recoveredFn("lower-back").ok : false;
  if (spineFlag || spineRecovering) {
    let allowed = spineRecovering ? 0 : 1;
    for (let i = 0; i < slots.length; i++) {
      const ex = slots[i] && exOf(slots[i]);
      if (spinalLoad(ex) !== "high") continue;
      if (allowed > 0) { allowed--; continue; }
      const to = substitute(ex, { index, constraints, exclude: inUse(), maxSpine: "moderate" });
      const why = spineRecovering ? "your lower back is still recovering" : "one heavy lower-back lift per session";
      if (to) swap(i, to, why); else drop(i, why);
    }
  }

  // 3a. Exact duplicates.
  const seen = new Set();
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i]?.exerciseId;
    if (!id) continue;
    if (seen.has(id)) drop(i, "already in this session");
    else seen.add(id);
  }

  // 3b. Near-identical exercises: keep the first.
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i] && exOf(slots[i]);
    if (!a) continue;
    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j] && exOf(slots[j]);
      if (b && sameStimulus(a, b)) drop(j, `same movement and muscles as ${slots[i].name}`);
    }
  }

  // 3c. Too many exercises of one pattern.
  const byPattern = new Map();
  slots.forEach((s, i) => { const ex = s && exOf(s); if (ex) { if (!byPattern.has(ex.pattern)) byPattern.set(ex.pattern, []); byPattern.get(ex.pattern).push(i); } });
  for (const [pattern, idx] of byPattern) {
    for (const i of idx.slice(MAX_PER_PATTERN)) drop(i, `third ${patternName(pattern)} exercise in one session`);
  }

  // 3d. Set cap per pattern: trim the later exercise(s) first.
  for (const [pattern, idx] of byPattern) {
    const live = idx.filter((i) => slots[i]);
    let total = live.reduce((a, i) => a + slots[i].sets, 0);
    for (let k = live.length - 1; k >= 0 && total > PATTERN_SET_CAP; k--) {
      const i = live[k];
      const over = total - PATTERN_SET_CAP;
      const keep = slots[i].sets - over;
      if (keep >= MIN_SETS || k === 0) {
        const n = Math.max(k === 0 ? 1 : MIN_SETS, keep);
        notes.push({ kind: "fix", rule: "trim", text: `${slots[i].name}: ${slots[i].sets} → ${n} sets (${PATTERN_SET_CAP} ${patternName(pattern)} sets per session is plenty).` });
        total -= slots[i].sets - n; slots[i] = { ...slots[i], sets: n };
      } else {
        total -= slots[i].sets; drop(i, `${patternName(pattern)} volume already covered`);
      }
    }
  }

  // 4. Per-muscle session volume, counting indirect work. Trim isolation
  // work for that muscle, last exercise first.
  const muscleLoad = () => {
    const load = {};
    for (const s of slots) {
      const ex = s && exOf(s);
      if (!ex) continue;
      for (const [m, c] of Object.entries(ex.contributions ?? {})) load[m] = (load[m] ?? 0) + c * s.sets;
    }
    return load;
  };
  for (const [m, v] of Object.entries(muscleLoad())) {
    let over = v - MUSCLE_SESSION_CAP;
    for (let i = slots.length - 1; i >= 0 && over > 0; i--) {
      const ex = slots[i] && exOf(slots[i]);
      if (!ex || ex.kClass !== "isolation" || (ex.contributions?.[m] ?? 0) < 1) continue;
      const cut = Math.min(Math.ceil(over), slots[i].sets - MIN_SETS);
      if (cut <= 0) continue;
      notes.push({ kind: "fix", rule: "trim", text: `${slots[i].name}: ${slots[i].sets} → ${slots[i].sets - cut} sets (${niceMuscle(m)} already gets plenty of indirect work today).` });
      slots[i] = { ...slots[i], sets: slots[i].sets - cut };
      over -= cut;
    }
  }

  // Soft notes: weekly volume for today's main muscles.
  if (recovery) {
    const load = muscleLoad();
    for (const [m, v] of Object.entries(load)) {
      if (v < 3) continue;
      const wk = (recovery[m]?.weeklySets ?? 0) + v;
      if (wk > 22) notes.push({ kind: "note", rule: "weekly-high", text: `${cap(niceMuscle(m))} will be at about ${Math.round(wk)} sets this week, which is high. Keep an eye on recovery.` });
    }
  }

  const fixed = { ...day, exercises: slots.filter(Boolean) };
  return { day: fixed, notes, issues: checkDay(fixed, { index, constraints }) };
}

// Hard-rule check only (used by tests and to grade coach proposals).
export function checkDay(day, { index, constraints = DEFAULT_CONSTRAINTS } = {}) {
  const issues = [];
  const exs = day.exercises.map((s) => ({ s, ex: s.exerciseId ? index.byId.get(s.exerciseId) : null }));
  for (const { s, ex } of exs) { const c = isAvoided(ex, constraints); if (c) issues.push({ rule: "avoid", text: `${s.name} is on your avoid list.` }); }
  const pat = {};
  for (const { s, ex } of exs) if (ex) { pat[ex.pattern] ??= { n: 0, sets: 0 }; pat[ex.pattern].n++; pat[ex.pattern].sets += s.sets; }
  for (const [p, v] of Object.entries(pat)) {
    if (v.n > MAX_PER_PATTERN) issues.push({ rule: "pattern-count", text: `${v.n} ${patternName(p)} exercises.` });
    if (v.sets > PATTERN_SET_CAP) issues.push({ rule: "pattern-sets", text: `${v.sets} ${patternName(p)} sets.` });
  }
  for (let i = 0; i < exs.length; i++) for (let j = i + 1; j < exs.length; j++) {
    if (exs[i].ex && exs[j].ex && (exs[i].ex.id === exs[j].ex.id || sameStimulus(exs[i].ex, exs[j].ex))) issues.push({ rule: "redundant", text: `${exs[j].s.name} repeats ${exs[i].s.name}.` });
  }
  if (flagged(constraints, "lower-back") && exs.filter(({ ex }) => spinalLoad(ex) === "high").length > 1) issues.push({ rule: "spine", text: "More than one heavy lower-back lift." });
  return issues;
}

const PATTERN_NAMES = {
  "horizontal-row": "row", "vertical-pull": "pulldown", "horizontal-press": "flat press", "incline-press": "incline press",
  "vertical-press": "overhead press", "elbow-flexion": "curl", "elbow-extension": "triceps", "lateral-raise": "lateral raise",
  "rear-delt": "rear delt", "hip-hinge": "hinge", "knee-flexion": "leg curl", "knee-extension": "leg extension",
  "squat-machine": "squat", "squat-free": "squat", "leg-press": "leg press", "calf-raise": "calf", fly: "fly",
};
export const patternName = (p) => PATTERN_NAMES[p] ?? p.replace(/-/g, " ");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
