// The training program. v2 kept it in this browser's localStorage
// ("il:exercises"); v3 reads the same data so nothing is lost, and falls back
// to the PPL+UL template from HYPERTROPHY-RESEARCH.md §5 on a fresh device.
import { resolveExercise } from "../engine/catalog.js";

export const TEMPLATE = {
  "Push": [
    ["incline-dumbbell-press", 3, 8, 12], ["machine-chest-press", 2, 8, 12], ["cable-lateral-raise", 3, 12, 20],
    ["overhead-cable-triceps-extension", 3, 10, 15], ["pec-deck", 2, 12, 15],
  ],
  "Pull": [
    ["lat-pulldown", 3, 8, 12], ["chest-supported-t-bar-row", 3, 8, 12], ["reverse-pec-deck", 2, 12, 20],
    ["incline-dumbbell-curl", 3, 10, 15], ["hammer-curl", 2, 10, 15],
  ],
  "Legs": [
    ["hack-squat", 3, 6, 10], ["romanian-deadlift", 3, 6, 10], ["seated-leg-curl", 3, 10, 15],
    ["leg-extension", 2, 10, 15], ["standing-calf-raise", 3, 10, 15],
  ],
  "Upper": [
    ["dumbbell-bench-press", 3, 8, 12], ["lat-pulldown", 3, 6, 12], ["seated-cable-row", 2, 10, 12],
    ["dumbbell-lateral-raise", 3, 12, 20], ["triceps-pushdown", 2, 10, 15],
  ],
  "Lower": [
    ["leg-press", 3, 8, 12], ["lying-leg-curl", 2, 10, 15], ["hip-thrust", 3, 8, 12],
    ["leg-extension", 2, 12, 15], ["seated-calf-raise", 2, 12, 20],
  ],
};

function readLocal(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

// Returns { days: [{ key, label, exercises: [slot] }], source }.
// slot: { name, exerciseId, sets, repRange, unilateral, programWeight }
export function loadProgram(index, storage = { exercises: readLocal("il:exercises", null), dayLabels: readLocal("il:dayLabels", {}) }) {
  const ex = storage.exercises;
  if (ex && typeof ex === "object" && Object.keys(ex).length) {
    const days = Object.entries(ex).filter(([, list]) => Array.isArray(list) && list.length).map(([key, list]) => ({
      key,
      label: storage.dayLabels?.[key] || key.split("—")[1]?.trim() || key,
      exercises: list.map((e) => {
        const r = resolveExercise(e.name, index);
        const cat = r.match;
        const lo = Number(e.repMin) || cat?.defaultRepRange?.[0] || 8;
        const hi = Math.max(lo, Number(e.repMax) || cat?.defaultRepRange?.[1] || 12);
        return {
          name: e.name, exerciseId: cat?.id ?? null, sets: Math.max(1, Number(e.sets) || 3), repRange: [lo, hi],
          unilateral: cat ? cat.unilateral : !!e.unilateral, programWeight: Number(e.weight) || null,
        };
      }),
    }));
    if (days.length) return { days, source: "v2" };
  }
  return {
    source: "template",
    days: Object.entries(TEMPLATE).map(([key, list]) => ({
      key, label: key,
      exercises: list.map(([id, sets, lo, hi]) => {
        const cat = index.byId.get(id);
        return { name: cat?.name ?? id, exerciseId: id, sets, repRange: [lo, hi], unilateral: !!cat?.unilateral, programWeight: null };
      }),
    })),
  };
}

// Next day in rotation after the most recently logged one.
export function nextDay(program, rows) {
  const keys = program.days.map((d) => d.key);
  const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date)).find((r) => keys.includes(String(r.day).replace(/ \(Override\)$/, "")));
  if (!recent) return program.days[0];
  const i = keys.indexOf(String(recent.day).replace(/ \(Override\)$/, ""));
  return program.days[(i + 1) % keys.length];
}
