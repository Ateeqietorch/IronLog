// Warm-up sets before the first working set. Display and tick-off only:
// they're never logged to the sheet, never count as hard sets, and never
// feed the strength model.
//
// How many depends on how heavy the work is and whether the muscles are
// already warm from an earlier exercise today:
//   compound, muscles cold   → up to 3 ramp sets (≈50% × 8, 70% × 5, 85% × 2)
//   compound, muscles warm   → 1 feeler set (≈70% × 3)
//   isolation, muscles cold  → 1 set (≈50% × 10)
//   isolation, muscles warm  → none
// Loads snap to weights you can actually make, and steps that would round
// to the same weight (or to the working weight) are dropped.
import { ladderFor, toEffective } from "./prescribe.js";
import { primaryMuscles } from "./catalog.js";

const RAMPS = {
  "compound-cold": [[0.5, 8], [0.7, 5], [0.85, 2]],
  "compound-warm": [[0.7, 3]],
  "isolation-cold": [[0.5, 10]],
  "isolation-warm": [],
};

const isCompound = (ex) => (ex.kClass ?? "isolation") !== "isolation";

// Muscles that got working sets (or at least a warm-up) earlier today.
export function warmMuscles(exercisesBefore) {
  const out = new Set();
  for (const e of exercisesBefore) {
    if (!e.ex || !(e.logged?.length || e.warmupsDone?.length)) continue;
    for (const m of primaryMuscles(e.ex)) out.add(m);
  }
  return out;
}

export function warmupSets({ exercise, workLoad, bodyweight = null, gymProfile = null, warm = new Set(), deload = false }) {
  if (!exercise || !(Number(workLoad) >= 0) || workLoad === null) return [];
  const prim = primaryMuscles(exercise);
  const alreadyWarm = prim.length > 0 && prim.every((m) => warm.has(m));
  let ramp = RAMPS[`${isCompound(exercise) ? "compound" : "isolation"}-${alreadyWarm ? "warm" : "cold"}`];
  // Deload work is light enough that one ramp set covers it.
  if (deload && ramp.length > 1) ramp = [ramp[1]];

  const bw = bodyweight ?? 0;
  const workEff = toEffective(exercise, Number(workLoad), bw);
  if (!(workEff > 0)) return [];
  const ladder = ladderFor(exercise, gymProfile);
  const bwPlus = exercise.loadType === "bodyweight-plus";
  // Bodyweight-based lifts: 0 added load is a real option (just your body).
  const options = bwPlus ? [0, ...ladder] : ladder;

  // Weighted dips, pull-ups and the like: if your body is most of the work,
  // a single bodyweight set is the whole warm-up.
  if (bwPlus && ramp.length && toEffective(exercise, 0, bw) >= workEff * 0.8) {
    return Number(workLoad) > 0 ? [{ load: 0, reps: 5, bodyweight: true }] : [];
  }

  const out = [];
  for (const [pct, reps] of ramp) {
    const ideal = workEff * pct;
    let best = null;
    for (const logged of options) {
      const eff = toEffective(exercise, logged, bw);
      if (!(eff > 0)) continue;
      if (eff >= workEff * 0.95) continue; // must actually be lighter than the work
      const d = Math.abs(eff - ideal);
      if (!best || d < best.d) best = { logged, eff, d };
    }
    if (!best) continue;
    // Too far off the target to mean anything (e.g. bar is already 80%).
    if (Math.abs(best.eff - ideal) > workEff * 0.2) continue;
    const prev = out[out.length - 1];
    if (prev && prev.load === best.logged) continue;
    if (prev && best.eff <= toEffective(exercise, prev.load, bw)) continue;
    out.push({ load: best.logged, reps, ...(bwPlus && best.logged === 0 ? { bodyweight: true } : {}) });
  }
  return out;
}
