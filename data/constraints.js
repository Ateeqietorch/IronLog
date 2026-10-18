// The lifter's standing rules (avoid list, joint flags, preferred exercises).
// Saved on the phone and in the sheet's "Constraints" tab; the generator and
// validator read them every time a session is built, and the coach writes to
// them when it says it has "noted" something.
import { DEFAULT_CONSTRAINTS } from "../engine/validate.js";

export const TYPES = ["avoid_exercise", "avoid_keyword", "joint_flag", "prefer_exercise"];

export function cleanConstraint(c) {
  if (!c || !TYPES.includes(c.type) || !String(c.target ?? "").trim()) return null;
  return {
    id: c.id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: c.type, target: String(c.target).trim(), reason: String(c.reason ?? "").slice(0, 120),
    addedAt: c.addedAt ?? new Date().toISOString().slice(0, 10), source: c.source ?? "manual",
    ...(c.removed ? { removed: true } : {}),
  };
}

// Merge lists by id; later lists win. Removed entries are kept as tombstones
// so a deleted default doesn't come back.
export function mergeConstraints(...lists) {
  const byId = new Map();
  for (const list of lists) for (const c of list ?? []) { const x = cleanConstraint(c); if (x) byId.set(x.id, x); }
  return [...byId.values()];
}

export const active = (list) => list.filter((c) => !c.removed);

export function withDefaults(stored) {
  return mergeConstraints(DEFAULT_CONSTRAINTS, stored);
}

export function describe(c, index) {
  const name = index?.byId.get(c.target)?.name ?? c.target;
  switch (c.type) {
    case "avoid_exercise": return `Never program ${name}`;
    case "avoid_keyword": return `Never program anything called "${c.target}"`;
    case "joint_flag": return `Protect the ${c.target.replace(/-/g, " ")}`;
    case "prefer_exercise": return `Prefer ${name}`;
    default: return c.target;
  }
}
