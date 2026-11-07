// The coach agent (COACH-BRAIN.md §6): Claude with tools that run here, in
// the app, against the same engine that writes every number.
//
// The backend only relays one model call at a time (`coach_step`); the loop
// and every tool run on the phone. So when the coach looks something up it
// reads the engine's actual state, and when it changes something it changes
// the engine's inputs (directives, today's session, the program, feedback)
// and gets the recomputed plan back in the same turn. The coach never
// invents a load or rep count the engine didn't produce, except a starting
// point for an exercise with no history, or numbers the lifter asked for.
import {
  state, today, directives, liveDirectives, addDirective, removeDirective, applyProposal, addFeedback, planFor,
  addConstraint, removeConstraint, snapshotState, restoreState, brainSnapshot, ls,
  nutritionView, setNutrition, logWeight, logIntake, addMeal,
} from "./store.js";
import { GOALS, ACTIVITY } from "../engine/nutrition.js";
import { groceryPlan, SNACK_SWAPS, food } from "../engine/foods.js";
import { normalizeMeal } from "./meals.js";
import { active, describe as describeRule } from "../data/constraints.js";
import { describeDirective, KINDS, TECHNIQUES, niceMuscleName } from "../engine/directives.js";
import { MUSCLES, PATTERNS } from "../engine/catalog.js";
import { exerciseHistory } from "../engine/progress.js";
import { e1rm } from "../engine/model.js";
import { isDone, describeChange, validateChange } from "./session.js";
import { isAvoided } from "../engine/validate.js";
import { post, tables } from "../data/sheets.js";
import { searchExercises } from "../engine/alternatives.js";

const MAX_STEPS = 8;

// ── Tool definitions (sent to the model) ───────────────────────────────────
const CHANGE_TYPES = ["switch_exercise", "add_exercise", "skip_exercise", "set_count", "rep_range", "set_numbers", "move_exercise", "change_day"];
export const TOOLS = [
  {
    name: "get_plan",
    description: "The engine's plan for today's workout (or another program day): every exercise with sets, loads, reps, reps-in-reserve target, the progression lever and its reason, supersets, add-ons, time estimate, and what the validator changed. Also the block week and each muscle's weekly volume vs target.",
    input_schema: { type: "object", properties: { day: { type: "string", description: "A program day key from context.program. Omit for today's workout." } } },
  },
  {
    name: "get_exercise",
    description: "One exercise in depth: its last sessions (sets, loads, reps, effort), the strength estimate and trend, today's lever, joint feedback, and the lifter's notes on it.",
    input_schema: { type: "object", properties: { exercise: { type: "string", description: "Catalog id or name." } }, required: ["exercise"] },
  },
  {
    name: "get_muscle",
    description: "One muscle in depth: sets per week for the last 6 weeks, this block's per-session target and every change to it with the reason, and the lifter's feedback (soreness, pump, workload).",
    input_schema: { type: "object", properties: { muscle: { type: "string", enum: [...MUSCLES] } }, required: ["muscle"] },
  },
  {
    name: "search_exercises",
    description: "Find catalog exercises by name, muscle, or movement pattern. Use before switching or adding when you're not sure of the id.",
    input_schema: { type: "object", properties: { query: { type: "string" }, muscle: { type: "string", enum: [...MUSCLES] }, pattern: { type: "string", enum: [...PATTERNS] } } },
  },
  {
    name: "set_directive",
    description: "Change how the engine plans from now on. This is how you change numbers: the engine recomputes today's workout and every future one from these. Kinds: schedule {daysPerWeek, minutes}; rep_floor {minReps, scope}; rep_range {range:[lo,hi], scope}; muscle_priority {muscle, level: specialize|grow|maintain|indirect}; volume {muscle, change: ±sets per session}; effort {offset: +1 easier / −1 harder}; technique {allow:[], block:[]} (myo-reps, lengthened-partials, supersets, add-ons); progression {style: reps-first|balanced|load-first}; block_length {weeks: 4–6}; deload {from: date}; new_block {from: date}; seed {exerciseId, load, reps, rir} (a starting estimate for an exercise with no history). scope = all | compound | isolation | a movement pattern | an exercise id. Returns today's recomputed plan.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...KINDS] },
        mode: { type: "string", enum: ["apply", "propose"], description: "apply when the lifter asked for this; propose when it's your own suggestion (they get Apply / Not now)." },
        note: { type: "string", description: "A few words on why, shown with the rule." },
        daysPerWeek: { type: "integer" }, minutes: { type: "integer" }, minReps: { type: "integer" }, range: { type: "array", items: { type: "integer" } },
        scope: { type: "string" }, muscle: { type: "string", enum: [...MUSCLES] }, level: { type: "string", enum: ["specialize", "grow", "maintain", "indirect"] },
        change: { type: "integer" }, offset: { type: "integer" }, allow: { type: "array", items: { type: "string", enum: [...TECHNIQUES] } },
        block: { type: "array", items: { type: "string", enum: [...TECHNIQUES] } }, style: { type: "string", enum: ["reps-first", "balanced", "load-first"] },
        weeks: { type: "integer" }, from: { type: "string", description: "YYYY-MM-DD; default today." },
        exerciseId: { type: "string" }, load: { type: "number" }, reps: { type: "integer" }, rir: { type: "integer" },
      },
      required: ["kind", "mode"],
    },
  },
  {
    name: "remove_directive",
    description: "Remove a standing directive by id (ids are in context.directives).",
    input_schema: { type: "object", properties: { id: { type: "string" }, mode: { type: "string", enum: ["apply", "propose"] } }, required: ["id", "mode"] },
  },
  {
    name: "change_workout",
    description: "Change today's workout or the program: switch_exercise, add_exercise, skip_exercise, set_count, rep_range, set_numbers, move_exercise, change_day. Scope today | trial | permanent (permanent rewrites the program day; trial tries it for a few sessions then asks). The engine sets the numbers for any exercise it has history on; use set_numbers (or numbers on a switch/add) only when the lifter asks for specific numbers or the exercise has no history. Returns today's recomputed plan.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["apply", "propose"] },
        summary: { type: "string", description: "One short sentence describing the change." },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: CHANGE_TYPES },
              exerciseIndex: { type: "integer", description: "Index in today's exercise list (0-based), from get_plan or context.today." },
              scope: { type: "string", enum: ["today", "trial", "permanent"] },
              trialSessions: { type: "integer", minimum: 2, maximum: 6 },
              toExerciseId: { type: "string" },
              newExercise: {
                type: "object",
                description: "For an exercise that isn't in the catalog: describe the real exercise the lifter named.",
                properties: {
                  name: { type: "string" }, pattern: { type: "string", enum: [...PATTERNS] },
                  equipment: { type: "string", enum: ["barbell", "dumbbell", "cable", "machine-stack", "machine-plate", "smith", "bodyweight", "assisted", "band"] },
                  contributions: { type: "object", description: "muscle → 1 (prime mover) or 0.5 (real synergist)" },
                  unilateral: { type: "boolean" }, lengthenedBias: { type: "number" }, repRange: { type: "array", items: { type: "integer" } },
                },
                required: ["name", "pattern", "equipment", "contributions"],
              },
              numbers: { type: "array", items: { type: "object", properties: { load: { type: "number" }, reps: { type: "integer" }, rir: { type: "integer" } }, required: ["load", "reps"] } },
              sets: { type: "integer", minimum: 1, maximum: 8 }, repRange: { type: "array", items: { type: "integer" } },
              toPosition: { type: "integer" }, dayKey: { type: "string" }, note: { type: "string" },
            },
            required: ["type"],
          },
        },
      },
      required: ["mode", "changes"],
    },
  },
  {
    name: "log_feedback",
    description: "Record feedback the lifter tells you in words, so the volume model uses it: soreness 0 never sore · 1 healed early · 2 just healed · 3 still sore (before training a muscle); pump 0 low · 1 good · 2 great and workload 0 easy · 1 about right · 2 a lot (after); joints 0 fine · 1 achy · 2 painful (per exercise).",
    input_schema: { type: "object", properties: { muscle: { type: "string", enum: [...MUSCLES] }, exerciseId: { type: "string" }, soreness: { type: "integer" }, pump: { type: "integer" }, workload: { type: "integer" }, joints: { type: "integer" }, date: { type: "string" } } },
  },
  {
    name: "add_rule",
    description: "A standing safety/preference rule the validator enforces on every workout: avoid_exercise / prefer_exercise (target = catalog id), avoid_keyword (a phrase), joint_flag (target e.g. lower-back, shoulder, knee, elbow). Use when the lifter says they don't want an exercise or something hurts.",
    input_schema: { type: "object", properties: { type: { type: "string", enum: ["avoid_exercise", "avoid_keyword", "joint_flag", "prefer_exercise"] }, target: { type: "string" }, reason: { type: "string" } }, required: ["type", "target"] },
  },
  { name: "remove_rule", description: "Remove a standing rule by id (from context.rules).", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  {
    name: "get_nutrition",
    description: "The lifter's nutrition: today's calorie/protein/carb/fat targets, trend weight, current vs goal rate (lb/week), today's logged food, the last check-ins with their reasons, and their profile and goal.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_nutrition",
    description: "Change the nutrition goal or settings. The app recomputes the targets (you never set calories directly): goal type cut | recomp | maintain | gain with ratePct (% bodyweight per week: cut 0.25–1, recomp 0.25, gain 0.1–0.5); proteinPerLb (0.7–1.2, or null for the goal default); activity (low | moderate | high | very). Returns the new targets.",
    input_schema: { type: "object", properties: {
      mode: { type: "string", enum: ["apply", "propose"] }, summary: { type: "string" },
      goal: { type: "string", enum: Object.keys(GOALS) }, ratePct: { type: "number" }, proteinPerLb: { type: "number", description: "0 = the goal default" }, activity: { type: "string", enum: Object.keys(ACTIVITY) },
    }, required: ["mode"] },
  },
  {
    name: "log_body",
    description: "Log a weigh-in (lb) and/or what they ate today (calories, protein g) when they tell you in words.",
    input_schema: { type: "object", properties: { weight: { type: "number" }, kcal: { type: "number" }, protein: { type: "number" }, date: { type: "string" } } },
  },
  {
    name: "log_meal",
    description: "Log a meal they describe in words (homemade, restaurant, no label). You estimate it: break it into items with realistic portions (count oil, butter, sauces, drinks), calories and macros per item. The app adds it to today's food. Use mode apply when they ask you to log it; propose when you're unsure of the portions and want them to confirm.",
    input_schema: { type: "object", properties: {
      mode: { type: "string", enum: ["apply", "propose"] }, name: { type: "string" }, date: { type: "string" },
      items: { type: "array", items: { type: "object", properties: { food: { type: "string" }, amount: { type: "string" }, kcal: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" } }, required: ["food", "amount", "kcal", "protein", "carbs", "fat"] } },
      assumptions: { type: "string" },
    }, required: ["mode", "name", "items"] },
  },
  {
    name: "get_groceries",
    description: "This week's grocery list and a sample day of macro-friendly staples sized to their current targets (what the Macros tab's grocery list shows).",
    input_schema: { type: "object", properties: {} },
  },
  { name: "remember", description: "Save a durable fact about the lifter that isn't a rule or directive (equipment, schedule constraints, injuries history). One short sentence.", input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } },
  { name: "forget", description: "Delete a remembered note by id.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];
TOOLS[TOOLS.length - 1].cache_control = { type: "ephemeral" };

// ── System prompt ──────────────────────────────────────────────────────────
const RULES = [
  "You are the coach inside IronLog, a hypertrophy app: a coach in the lifter's pocket. They're on their phone, often between sets, so answer in a few short sentences. No headings. Plain, direct, friendly. Pounds.",
  "Do exactly what the lifter asks, literally. \"Incline machine curl\" is not a preacher curl; \"three sets\" means three. If an exercise they name isn't in the catalog, create it (newExercise) instead of substituting a lookalike. Push back only when something would hurt them (sharp or joint pain) or contradicts itself: say why in one line and still do the closest thing.",
  "How the engine works (explain it truthfully; never contradict it):",
  "- Every number comes from the engine. Per exercise it picks one lever from what the lifter did last time: add-reps (same weight, +1 rep per set; +2 if it was easy), add-load (top of the rep range reached: smallest sensible step up, reps reset), coarse (next weight too big a jump: extra reps first), hold (last time was a grind, under the range, or 17–28 days away), back-off (two sessions under the range: lighter), recalibrate (4+ weeks away: ~1% lighter per week off past two, set 1 checks it), intensify (no progress for 2+ sessions: myo-reps or long-length partials on the last set), deload. Sets that would fall under the range drop to a lighter back-off weight. After each logged set the rest of today's sets adjust.",
  "- Sets are decided per muscle, not per exercise: each muscle has a sets-per-session target that starts from what the lifter has been doing, then moves with their feedback (soreness before; pump and workload after) and performance: +2 when pump is low, workload easy and they recovered early; +1 when there's room; hold when they only just recovered or the workload is already high; −1 when still sore or performance drops twice. Floors keep every muscle at a growth minimum per week (chest/back/quads/biceps/side delts ~8, triceps/hamstrings ~6, rear delts 6); ceilings stop it past what most people recover from. A muscle under its minimum gets extra sets that day, and a lagging small muscle can get a short add-on exercise on a day that doesn't train it.",
  "- Blocks: weeks of rising effort (reps in reserve 3→2→2→1→1 for a 5-week block; compounds never closer than 1), then a deload week. Breaks of 14+ days start a new block; shorter breaks pause it. A deload is offered early when performance drops on two muscles twice in a row or two exercises hurt.",
  "- Time: over the minutes budget, isolation work becomes supersets, then sets come off muscles already ahead. Lagging muscles' exercises move earlier so they don't get cut.",
  "How you change things: set_directive changes the engine's inputs (minimum reps, rep ranges, muscle priorities, sets per session, effort, schedule and minutes, techniques, progression style, block length, deload / new block, a starting seed for a new exercise); change_workout changes today's exercises or the program; log_feedback records what they tell you. Each returns the recomputed plan: tell them the result in one line (e.g. 'Done: bench is now 175 × 9, 9, 8'). Use set_numbers only when they ask for specific numbers or the exercise has no history.",
  "mode: apply when the lifter asked for the change (they can undo it). propose when it's your own idea (they get Apply / Not now). Never claim something changed unless a tool applied it.",
  "Look before you explain: if they ask why a number is what it is, read get_plan or get_exercise and explain the lever and the last session it came from. Be proactive about real problems you see in context (a muscle far under its minimum, pain notes, a stalled lift, sessions over time) and propose the fix.",
  "Evidence you can rely on: ~10+ hard sets per muscle per week, most sets 0–3 reps from failure, 5–30 reps all build muscle when close to failure, rest 90 s+, stretched-position exercises have a small edge, deloads every 4–6 weeks or when performance drops. Never tell them to train through sharp or joint pain; suggest a pain-free alternative and a professional if it persists. Breaks happen; muscle comes back faster the second time, so the best program is the one they can keep doing.",
  "Nutrition: the app sets daily calories and macros from a resting-burn estimate, then a weekly check-in compares intake (logged, or targets assumed eaten) with the weight trend to find real expenditure, and moves calories ≤250 at a time toward the goal rate (cut 0.5–1%/wk keeps muscle, lean gain 0.25–0.5%/wk). Protein 1 g/lb cutting, 0.9 maintaining, 0.8 gaining; fat ~25% (floor 0.3 g/lb); carbs the rest; never below resting burn. Change goals with set_nutrition; never invent calorie numbers, read get_nutrition. Training and diet interact: in a hard cut, expect strength to hold rather than climb, and suggest a slower rate if performance drops on several muscles. Meals without a label (homemade, restaurant): estimate them yourself and log with log_meal, item by item, counting cooking oil and drinks; say what portion you assumed. Food ideas and shopping: get_groceries gives a week's list sized to their targets; suggest swaps within the same group (Greek yogurt, Oikos Pro, cottage cheese; whey, Core Power, Premier Protein; Goldfish 100-cal pouches, Rice Krispies Treats for pre-workout carbs; chicken, turkey, white fish, shrimp, lean beef; rice, potatoes, oats). No extreme diets; if they mention restricting, bingeing or purging, be supportive and don't give numbers.",
  "Use add_rule when they don't want an exercise or something hurts; remember for other durable facts. Don't name your tools to the lifter.",
].join("\n");

function compactRecent() {
  const by = new Map();
  for (const r of state.rows) {
    const k = r.sessionKey || `${r.date}_${r.day}`;
    if (!by.has(k)) by.set(k, { date: r.date, day: r.day, sets: [], notes: {}, note: "" });
    const b = by.get(k);
    b.sets.push(`${r.exercise} ${r.weight}x${r.reps}${r.rpe ? "@RIR" + Math.max(0, 10 - Number(r.rpe)) : ""}`);
    if (String(r.notes ?? "").trim()) b.notes[r.exercise] = String(r.notes).trim();
    if (String(r.sessionNote ?? "").trim() && !b.note) b.note = String(r.sessionNote).trim();
  }
  return [...by.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    .map((x) => ({ date: x.date, day: x.day, sets: x.sets.slice(0, 28), ...(Object.keys(x.notes).length ? { exerciseNotes: x.notes } : {}), ...(x.note ? { note: x.note } : {}) }));
}

function todayContext() {
  const s = state.session;
  if (!s || s.saved) return null;
  return {
    date: s.date, day: s.dayLabel, dayKey: s.dayKey, current: s.cur,
    exercises: s.exercises.map((e, i) => ({
      index: i, name: e.ex?.name ?? e.name, id: e.ex?.id ?? null, sets: e.sets, lever: e.lever ?? null, range: e.slot?.repRange,
      plan: e.plan?.sets?.map((x) => `${x.load}x${x.reps}@${x.rir}`).join(" "), done: isDone(e),
      logged: e.logged.map((l) => `${l.load}x${typeof l.reps === "object" ? `L${l.reps.L}/R${l.reps.R}` : l.reps}@${l.rir}`).join(" "),
      ...(e.superset ? { superset: e.superset } : {}), ...(e.addOn ? { addOnFor: e.addOn } : {}), ...(e.userNote ? { note: e.userNote } : {}),
      ...(e.stopped ? { stopped: `ended after ${e.logged.length} of ${e.stopped.of}` } : {}), ...(e.switchedFrom ? { switchedFrom: e.switchedFrom } : {}),
    })),
    ...(s.workoutNote ? { note: s.workoutNote } : {}),
    checks: (s.adjustments ?? []).map((n) => n.text), selection: s.selection ?? null,
  };
}

let memoryCache = null;
export async function loadMemory() {
  try { memoryCache = (await tables.list("CoachMemory")).map((r) => ({ id: r.key, note: r.value?.note })).filter((m) => m.note); }
  catch { memoryCache = memoryCache ?? []; }
  return memoryCache;
}

export function contextBlock() {
  const brain = brainSnapshot();
  return {
    localDate: today(),
    today: todayContext(),
    engine: brain ? { block: brain.block, schedule: brain.schedule, muscles: brain.muscles, deloadSuggested: brain.deloadSuggested } : null,
    directives: liveDirectives().map((d) => ({ id: d.id, text: describeDirective(d, state.index), by: d.source })),
    rules: active(state.constraints).map((c) => ({ id: c.id, text: describeRule(c, state.index) })),
    program: state.program.days.map((d) => ({ key: d.key, label: d.label, exercises: d.exercises.map((e) => `${e.name} ${e.sets}x${e.repRange?.[0]}-${e.repRange?.[1]}`) })),
    recent: compactRecent(),
    lastAssessment: ls.get("il3:lastAssessment", null),
    nutrition: nutritionBrief(),
    bodyweight: state.bodyweight,
    memory: memoryCache ?? [],
  };
}

export function systemBlocks() {
  return [
    { type: "text", text: RULES, cache_control: { type: "ephemeral" } },
    { type: "text", text: "Context (JSON):\n" + JSON.stringify(contextBlock()) },
  ];
}

function nutritionBrief() {
  const n = state.nutrition;
  if (!n.profile) return "not set up";
  const v = nutritionView();
  return { goal: n.goal, target: v.target ? `${v.target.kcal} kcal, P${v.target.protein} C${v.target.carbs} F${v.target.fat}` : null, trendWeight: v.trendWeight, rateLbPerWeek: v.rate, goalRateLbPerWeek: v.goalRate, todayEaten: v.today, nextCheckIn: v.nextCheckIn };
}

function getNutrition() {
  const n = state.nutrition;
  if (!n.profile) return { setUp: false, note: "Not set up yet: they set sex, age, height, weight, activity and goal in the Macros tab (or tell you and you can't set the profile; ask them to open Macros)." };
  const v = nutritionView();
  return { ...v, checkins: n.checkins.slice(-4).map((c) => ({ date: c.date, kcal: c.kcal, tdee: c.tdee, rate: c.rate, why: c.why })), recentWeights: state.weights.slice(-14), recentFood: n.intake.slice(-7) };
}

function applyNutrition(input) {
  const n = state.nutrition;
  if (!n.profile) return { error: "Nutrition isn't set up yet. Ask them to open the Macros tab once." };
  const goal = input.goal ? { type: input.goal, ratePct: input.ratePct ?? GOALS[input.goal].default } : input.ratePct != null ? { ...n.goal, ratePct: input.ratePct } : undefined;
  const c = setNutrition({ ...(goal ? { goal } : {}), ...(input.activity ? { profile: { activity: input.activity } } : {}), ...(input.proteinPerLb !== undefined ? { proteinPerLb: input.proteinPerLb > 0 ? input.proteinPerLb : null } : {}) });
  const t = nutritionView().target;
  return { applied: true, targets: t ? `${t.kcal} kcal, protein ${t.protein} g, carbs ${t.carbs} g, fat ${t.fat} g` : null, why: c?.why ?? null };
}

// ── Tool execution ─────────────────────────────────────────────────────────
const findEx = (q) => {
  const v = String(q ?? "").trim();
  if (state.index.byId.has(v)) return state.index.byId.get(v);
  const low = v.toLowerCase();
  return state.index.list.find((x) => x.name.toLowerCase() === low || (x.aliases ?? []).some((a) => a.toLowerCase() === low))
    ?? searchExercises(v, [state.index.list], { models: state.models, limit: 1 })[0]?.ex ?? null;
};

function todayPlanText() {
  const s = state.session;
  if (!s || s.saved) return null;
  return s.exercises.map((e, i) => `${i}. ${e.ex?.name ?? e.name}: ${e.plan?.sets?.map((x) => `${x.load}x${x.reps}`).join(", ") ?? `${e.sets} sets`}${e.label ? ` [${e.label}]` : ""}${e.superset ? ` (superset ${e.superset})` : ""}${isDone(e) ? " (done)" : ""}`);
}

function planSummary(plan) {
  return {
    block: `${plan.block.deload ? "deload" : `week ${plan.block.week} of ${plan.block.of}`}`,
    minutes: plan.minutes, budget: plan.budget,
    exercises: plan.exercises.map((it) => ({ name: it.ex?.name ?? it.slot.name, sets: it.sets, rir: it.rir, range: it.repRange, lever: it.decision?.lever, plan: it.decision?.sets?.map((x) => `${x.load}x${x.reps}`).join(", "), why: it.decision?.text, ...(it.addOn ? { addOnFor: it.addOn } : {}), ...(it.supersetWith != null ? { superset: true } : {}) })),
    checks: plan.notes.map((n) => n.text),
  };
}

function getPlan({ day } = {}) {
  if (day && day !== state.session?.dayKey) {
    if (!state.program.days.some((d) => d.key === day)) return { error: `No program day "${day}". Days: ${state.program.days.map((d) => d.key).join(", ")}` };
    return planSummary(planFor(day).plan);
  }
  const snap = brainSnapshot();
  return { today: todayPlanText(), engine: snap };
}

function getExercise({ exercise }) {
  const ex = findEx(exercise);
  if (!ex) return { error: `No exercise matching "${exercise}". Try search_exercises.` };
  const h = exerciseHistory(state.normSets, ex.id).slice(-6).map((x) => ({ date: x.date, sets: x.sets.map((s) => `${s.load}x${s.reps}${s.rir != null ? "@" + s.rir : ""}`).join(", ") }));
  const m = state.models[`${ex.id}|both`] ?? state.models[`${ex.id}|L`];
  const inToday = state.session?.exercises?.find((e) => e.ex?.id === ex.id);
  const joints = state.feedback.filter((f) => f.exerciseId === ex.id).slice(-5).map((f) => `${f.date}: ${["fine", "achy", "painful"][f.joints] ?? "?"}`);
  const notes = state.rows.filter((r) => (r.exerciseId === ex.id || r.exercise === ex.name) && String(r.notes ?? "").trim()).slice(-4).map((r) => `${r.date}: ${r.notes}`);
  return {
    id: ex.id, name: ex.name, pattern: ex.pattern, muscles: ex.contributions, equipment: ex.equipment, defaultRange: ex.defaultRepRange,
    history: h, strength: m?.logE1rm != null ? { e1rm: Math.round(e1rm(m)), sessions: m.exposures, last: m.lastExposure } : null,
    today: inToday ? { lever: inToday.lever, plan: inToday.plan?.sets?.map((x) => `${x.load}x${x.reps}@${x.rir}`).join(", "), why: inToday.plan?.text } : null,
    ...(joints.length ? { joints } : {}), ...(notes.length ? { notes: [...new Set(notes)] } : {}),
  };
}

function getMuscle({ muscle }) {
  if (!MUSCLES.includes(muscle)) return { error: "Unknown muscle" };
  const plan = state.plan;
  const weeks = [];
  const byWeek = new Map();
  for (const s of state.normSets) {
    if (s.side === "R" || (s.rir != null && s.rir > 4)) continue;
    const c = state.index.byId.get(s.id)?.contributions?.[muscle] ?? 0;
    if (!c) continue;
    const wk = weekStart(s.date);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + c);
  }
  for (const [w, v] of [...byWeek].sort().slice(-6)) weeks.push(`${w}: ${Math.round(v * 10) / 10}`);
  const fb = state.feedback.filter((f) => f.muscle === muscle).slice(-8).map((f) => ({ date: f.date, ...(f.soreness != null ? { soreness: f.soreness } : {}), ...(f.pump != null ? { pump: f.pump } : {}), ...(f.workload != null ? { workload: f.workload } : {}) }));
  return { muscle, weeklyHardSets: weeks, now: plan?.muscles?.[muscle] ?? null, feedback: fb };
}

function weekStart(d) {
  const t = Date.parse(d + "T00:00:00Z");
  const day = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - day * 864e5).toISOString().slice(0, 10);
}

function search({ query, muscle, pattern }) {
  let list = state.index.list.filter((x) => x.source !== "free-exercise-db");
  if (muscle) list = list.filter((x) => (x.contributions?.[muscle] ?? 0) >= 1);
  if (pattern) list = list.filter((x) => x.pattern === pattern);
  if (query) list = searchExercises(query, [list], { models: state.models, limit: 15 }).map((r) => r.ex);
  return list.slice(0, 15).map((x) => ({ id: x.id, name: x.name, pattern: x.pattern, muscles: Object.keys(x.contributions).join(","), equipment: x.equipment, history: !!(state.models[`${x.id}|both`] ?? state.models[`${x.id}|L`]) }));
}

// Writes. Each returns what changed so the model can tell the lifter.
function applyDirective(input) {
  const { mode, ...d } = input;
  const raw = { ...d, from: d.from ?? (["deload", "new_block"].includes(d.kind) ? today() : undefined) };
  const stored = addDirective(raw, { source: "coach" });
  if (!stored) return { error: `That ${input.kind} directive isn't valid. Check the fields for that kind.` };
  return { applied: describeDirective(stored, state.index), id: stored.id, today: todayPlanText() };
}

function applyWorkout({ changes = [] }) {
  const s = state.session;
  const problems = changes.map((c) => validateChange(s, c, state.index, state.program)
    ?? ((c.type === "switch_exercise" || c.type === "add_exercise") && c.toExerciseId && isAvoided(state.index.byId.get(c.toExerciseId), active(state.constraints)) ? "That exercise is on the lifter's avoid list." : null)).filter(Boolean);
  if (problems.length) return { error: problems[0] };
  const failed = applyProposal(changes);
  if (failed.length) return { error: failed[0] };
  return { applied: changes.map((c) => describeChange(state.session, c, state.index)), today: todayPlanText() };
}

async function remember({ note }) {
  const id = `m${Date.now().toString(36)}`;
  await tables.upsert("CoachMemory", [{ key: id, value: { note: String(note).slice(0, 300) } }]);
  memoryCache = [...(memoryCache ?? []), { id, note }];
  return { saved: true, id };
}
async function forget({ id }) {
  await tables.remove("CoachMemory", [id]);
  memoryCache = (memoryCache ?? []).filter((m) => m.id !== id);
  return { deleted: true };
}

const WRITES = {
  set_directive: { run: applyDirective, label: (i) => describeDirective({ ...i, at: today() }, state.index) },
  remove_directive: { run: ({ id }) => { const d = liveDirectives().find((x) => x.id === id); if (!d) return { error: "No directive with that id." }; removeDirective(id); return { removed: describeDirective(d, state.index), today: todayPlanText() }; }, label: (i) => `Remove: ${describeDirective(liveDirectives().find((x) => x.id === i.id) ?? { kind: "?" }, state.index)}` },
  set_nutrition: { run: applyNutrition, label: (i) => i.summary || [i.goal ? `Goal: ${GOALS[i.goal]?.label}${i.ratePct ? ` at ${i.ratePct}%/week` : ""}` : i.ratePct != null ? `Rate: ${i.ratePct}%/week` : null, i.proteinPerLb ? `Protein ${i.proteinPerLb} g/lb` : null, i.activity ? `Activity: ${ACTIVITY[i.activity]?.label}` : null].filter(Boolean).join(", ") },
  log_meal: { run: (i) => { const m = normalizeMeal(i); if (!m.items.length) return { error: "Need at least one item." }; addMeal({ ...m, source: "coach" }, i.date ?? today()); const v = nutritionView(); return { logged: `${m.name}: ${m.kcal} kcal, P${m.protein} C${m.carbs} F${m.fat}`, todayEaten: v.today ? { kcal: v.today.kcal, protein: v.today.protein } : null, target: v.target ? `${v.target.kcal} kcal, P${v.target.protein}` : null }; }, label: (i) => { const m = normalizeMeal(i); return `Log ${m.name} (${m.kcal} kcal, P${m.protein})`; } },
  change_workout: { run: applyWorkout, label: (i) => i.summary || (i.changes ?? []).map((c) => (state.session ? describeChange(state.session, c, state.index) : c.type)).join("; ") },
};

export async function runTool(name, input, sink) {
  switch (name) {
    case "get_plan": return getPlan(input);
    case "get_exercise": return getExercise(input);
    case "get_muscle": return getMuscle(input);
    case "search_exercises": return search(input);
    case "log_feedback": {
      const rec = { date: input.date ?? today(), ...(input.muscle ? { muscle: input.muscle } : {}), ...(input.exerciseId ? { exerciseId: input.exerciseId } : {}) };
      for (const k of ["soreness", "pump", "workload", "joints"]) if (input[k] != null) rec[k] = Number(input[k]);
      if (!rec.muscle && !rec.exerciseId) return { error: "Need a muscle or an exerciseId." };
      addFeedback(rec);
      return { saved: true, today: todayPlanText() };
    }
    case "get_nutrition": return getNutrition();
    case "get_groceries": {
      const t = nutritionView().target;
      if (!t) return { error: "No targets yet: they need to set up the Macros tab and log a weight." };
      const g = groceryPlan(t);
      return { target: t, sampleDay: g.day.map((x) => `${x.meal}: ${x.n} × ${x.serving} ${x.name}`), dayTotals: g.totals, snackSwaps: SNACK_SWAPS.map(([id, instead]) => `${food(id).name} (${food(id).kcal} kcal, P${food(id).p}) instead of ${instead}`), week: g.week.map((x) => `${x.name}: ${x.amount != null ? `${x.amount}${/^\d/.test(x.unit) ? " ×" : ""} ${x.unit}` : `${x.servings} servings`}`) };
    }
    case "log_body": {
      const out = {};
      if (input.weight != null) out.weight = logWeight(input.weight, input.date ?? today()) ? "saved" : "looks wrong";
      if (input.kcal != null || input.protein != null) { logIntake({ kcal: input.kcal ?? null, protein: input.protein ?? null, date: input.date ?? today() }); out.food = "saved"; }
      const t = nutritionView().target;
      return { ...out, targets: t ? `${t.kcal} kcal, P${t.protein}` : null };
    }
    case "add_rule": {
      const r = addConstraint({ type: input.type, target: input.target, reason: input.reason, source: "coach" });
      return r ? { saved: describeRule(r, state.index), id: r.id } : { error: "Not a valid rule." };
    }
    case "remove_rule": removeConstraint(input.id); return { removed: true };
    case "remember": return remember(input);
    case "forget": return forget(input);
    default: break;
  }
  const w = WRITES[name];
  if (!w) return { error: `Unknown tool ${name}` };
  const label = w.label(input);
  if (input.mode === "propose") {
    sink.proposals.push({ tool: name, input, label, status: null });
    return { shown: "The lifter sees this as a card with Apply / Not now. Don't repeat it; one short line is enough." };
  }
  const snap = snapshotState();
  const out = await w.run(input);
  if (!out?.error) sink.actions.push({ label, snap, undone: false });
  return out;
}

// Apply a proposal the lifter tapped Apply on. Returns an error string or null.
export async function applyProposalCard(p) {
  const w = WRITES[p.tool];
  if (!w) return "Unknown change";
  const snap = snapshotState();
  const out = await w.run({ ...p.input, mode: "apply" });
  if (out?.error) return out.error;
  p.snap = snap;
  return null;
}
export const undoAction = (a) => { restoreState(a.snap); a.undone = true; };

// ── The loop ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(payload) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    return await post("coach_step", { ...payload, requestId });
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    // Phones drop long requests; the backend parks the answer.
    for (let i = 0; i < 18; i++) {
      await sleep(5000);
      try { const d = await post("coach_result", { requestId: `step:${requestId}` }); if (!d.pending) return d; } catch { /* keep waiting */ }
    }
    throw new Error("The coach took too long to answer");
  }
}

const STATUS = {
  get_plan: "Reading today's plan", get_exercise: "Looking at your history", get_muscle: "Checking your volume", search_exercises: "Searching exercises",
  set_directive: "Updating your plan", remove_directive: "Updating your plan", change_workout: "Changing the workout", log_feedback: "Noting that",
  add_rule: "Saving a rule", remember: "Remembering that", get_nutrition: "Checking your nutrition", log_meal: "Logging that meal", get_groceries: "Building your grocery list", set_nutrition: "Updating your targets", log_body: "Logging that",
};

// history: earlier turns as [{ role, content: text }]. Returns
// { reply, actions, proposals }.
export async function runAgent(history, { onStatus = () => {} } = {}) {
  if (memoryCache == null) await loadMemory();
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const sink = { actions: [], proposals: [] };
  let reply = "";
  for (let i = 0; i < MAX_STEPS; i++) {
    const res = await step({ system: systemBlocks(), tools: TOOLS, messages, max_tokens: 1500 });
    const content = res.content ?? [];
    const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const uses = content.filter((b) => b.type === "tool_use");
    if (text) reply = text;
    if (res.stop_reason !== "tool_use" || !uses.length) break;
    messages.push({ role: "assistant", content });
    const results = [];
    for (const u of uses) {
      onStatus(STATUS[u.name] ?? "Working");
      let out;
      try { out = await runTool(u.name, u.input ?? {}, sink); } catch (e) { out = { error: String(e?.message ?? e) }; }
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 12000), ...(out?.error ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  if (!reply) reply = sink.actions.length ? "Done." : sink.proposals.length ? "Here's what I'd change:" : "Sorry, I didn't get an answer back. Try again.";
  return { reply, ...sink };
}

export { niceMuscleName };
