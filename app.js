// ── Config ────────────────────────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzIeypeOjfnkypcsj7AdMHiO_e23bx3VzSIVy_9A2A8oF03zTTVH0G1BJ7XMV1QS6JJ/exec";
const LOWER_DAYS = ["Day 3 — Legs","Day 5 — Lower"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// Science-based constants
const STRUGGLE_THRESHOLD  = 0.15; // 15% below target reps on set 1
const WEIGHT_DROP_PCT     = 0.12; // 12% weight reduction when struggling
const STAGNATION_SESSIONS = 3;    // consecutive sessions same e1RM = stagnant
const PERF_LOSS_SESSIONS  = 2;    // consecutive drops in e1RM = declining
const MEV_SETS            = 10;   // fallback minimum effective volume per muscle/week
const MRV_SETS            = 20;   // fallback maximum recoverable volume per muscle/week
const HARD_SET_RPE        = 7;    // sets at/above this RPE count as "hard" (growth-driving)

// Mesocycle / deload constants. Evidence: ~4-8wk blocks for trained lifters,
// ~30-50% volume/intensity cut for ~1wk deloads. We default to a 6-week
// cycle per user preference, but evaluate on every load rather than just
// counting down — sustained near-failure RPE (or an AI review's judgment)
// can pull a deload forward before the scheduled week arrives.
const MESOCYCLE_WEEKS    = 6;
const DELOAD_DAYS        = 7;
const DELOAD_RPE_CAP     = 8;    // target RPE never exceeds this during a deload
const DELOAD_WEIGHT_PCT  = 0.85; // working weight cut during a deload
const DELOAD_SET_PCT     = 0.5;  // set count cut during a deload
const DELOAD_TRIGGER_RPE = 9.3;  // avg RPE at/above this over the recent window = early trigger

// Per-muscle weekly volume landmarks (hard sets). Based on typical hypertrophy
// ranges — smaller muscles recover faster and tolerate/need less; back & delts
// tolerate more. These are DEFAULTS; user can override per muscle (saved locally).
const MUSCLE_LANDMARKS = {
  "Chest":     { mev:10, mrv:20 },
  "Shoulders": { mev:8,  mrv:24 },  // side delts tolerate high volume
  "Triceps":   { mev:8,  mrv:16 },
  "Back":      { mev:10, mrv:24 },
  "Biceps":    { mev:8,  mrv:18 },
  "Quads":     { mev:8,  mrv:18 },
  "Hamstrings":{ mev:6,  mrv:14 },  // recover slower
  "Glutes":    { mev:6,  mrv:16 },
  "Calves":    { mev:8,  mrv:20 },
  "Other":     { mev:0,  mrv:99 },
};
function getLandmarks(group){
  const custom = lsGet("il:landmarks", {});
  const base = MUSCLE_LANDMARKS[group] || { mev:MEV_SETS, mrv:MRV_SETS };
  return { mev: (custom[group]?.mev ?? base.mev), mrv: (custom[group]?.mrv ?? base.mrv) };
}
function setLandmark(group, mev, mrv){
  const custom = lsGet("il:landmarks", {});
  custom[group] = { mev, mrv };
  lsSet("il:landmarks", custom);
}

// Muscle group mapping for volume tracking
const MUSCLE_GROUPS_MAP = {
  "Chest": ["Barbell Bench Press","Incline Barbell Press","Incline Dumbbell Press","Dumbbell Bench Press","Pec Deck / Cable Fly","Cable Crossover","Dumbbell Fly","Push-Up","Incline Barbell Bench Press"],
  "Shoulders": ["Barbell Overhead Press","Dumbbell Shoulder Press","Cable Lateral Raise","Dumbbell Lateral Raise","Rear Delt Fly","Face Pull","Upright Row"],
  "Triceps": ["Tricep Rope Pushdown","V-Bar Pushdown","Overhead Tricep Extension","Tricep Dip","Skull Crusher","Single Arm Pushdown"],
  "Back": ["Weighted Pull-Up","Lat Pulldown","Barbell Pendlay Row","Seated Cable Row","Chest-Supported DB Row","Chest-Supported T-Bar Row","Single-Arm Cable Row","Single-Arm DB Row","Straight Arm Pulldown","Weighted Pull-Up / Lat Pulldown"],
  "Biceps": ["EZ Bar Curl","Barbell Curl","Incline Dumbbell Curl","Hammer Curl","Cable Curl","Concentration Curl"],
  "Quads": ["Hack Squat","Leg Press","Single Leg Leg Press","Leg Extension","Single Leg Extension","Bulgarian Split Squat","Walking Lunges (DB)"],
  "Hamstrings": ["Romanian Deadlift","Stiff-Leg Deadlift (DB)","Leg Curl","Leg Curl (seated)","Single Leg Curl"],
  "Glutes": ["Hip Thrust","Single Leg Hip Thrust","Cable Kickback"],
  "Calves": ["Standing Calf Raise","Seated Calf Raise","Single Leg Calf Raise"],
};

function getMuscleGroup(exName) {
  for (const [group, exercises] of Object.entries(MUSCLE_GROUPS_MAP)) {
    if (exercises.some(e => exName.toLowerCase().includes(e.toLowerCase()) || e.toLowerCase().includes(exName.toLowerCase()))) return group;
  }
  return "Other";
}

// ── Exercise Repository ───────────────────────────────────────────────────────
const EXERCISE_REPO = [
  { name:"Barbell Bench Press",       group:"Chest",      repMin:6,  repMax:8,  unilateral:false, weight:160 },
  { name:"Incline Barbell Press",     group:"Chest",      repMin:8,  repMax:10, unilateral:false, weight:135 },
  { name:"Incline Dumbbell Press",    group:"Chest",      repMin:8,  repMax:10, unilateral:false, weight:62  },
  { name:"Dumbbell Bench Press",      group:"Chest",      repMin:8,  repMax:12, unilateral:false, weight:70  },
  { name:"Pec Deck / Cable Fly",      group:"Chest",      repMin:12, repMax:15, unilateral:false, weight:121 },
  { name:"Cable Crossover",           group:"Chest",      repMin:12, repMax:15, unilateral:false, weight:40  },
  { name:"Dumbbell Fly",              group:"Chest",      repMin:12, repMax:15, unilateral:false, weight:35  },
  { name:"Push-Up",                   group:"Chest",      repMin:12, repMax:20, unilateral:false, weight:null},
  { name:"Barbell Overhead Press",    group:"Shoulders",  repMin:6,  repMax:10, unilateral:false, weight:110 },
  { name:"Dumbbell Shoulder Press",   group:"Shoulders",  repMin:8,  repMax:12, unilateral:false, weight:53  },
  { name:"Cable Lateral Raise",       group:"Shoulders",  repMin:12, repMax:15, unilateral:true,  weight:17  },
  { name:"Dumbbell Lateral Raise",    group:"Shoulders",  repMin:15, repMax:20, unilateral:false, weight:26  },
  { name:"Rear Delt Fly",             group:"Shoulders",  repMin:15, repMax:20, unilateral:false, weight:44  },
  { name:"Face Pull",                 group:"Shoulders",  repMin:15, repMax:20, unilateral:false, weight:44  },
  { name:"Upright Row",               group:"Shoulders",  repMin:10, repMax:12, unilateral:false, weight:65  },
  { name:"Tricep Rope Pushdown",      group:"Triceps",    repMin:12, repMax:15, unilateral:false, weight:55  },
  { name:"V-Bar Pushdown",            group:"Triceps",    repMin:12, repMax:15, unilateral:false, weight:60  },
  { name:"Overhead Tricep Extension", group:"Triceps",    repMin:10, repMax:12, unilateral:false, weight:55  },
  { name:"Tricep Dip",                group:"Triceps",    repMin:8,  repMax:12, unilateral:false, weight:null},
  { name:"Skull Crusher",             group:"Triceps",    repMin:10, repMax:12, unilateral:false, weight:65  },
  { name:"Single Arm Pushdown",       group:"Triceps",    repMin:12, repMax:15, unilateral:true,  weight:25  },
  { name:"Weighted Pull-Up",          group:"Back",       repMin:6,  repMax:8,  unilateral:false, weight:null},
  { name:"Lat Pulldown",              group:"Back",       repMin:8,  repMax:12, unilateral:false, weight:155 },
  { name:"Barbell Pendlay Row",       group:"Back",       repMin:6,  repMax:8,  unilateral:false, weight:155 },
  { name:"Seated Cable Row",          group:"Back",       repMin:10, repMax:12, unilateral:false, weight:143 },
  { name:"Chest-Supported DB Row",    group:"Back",       repMin:10, repMax:12, unilateral:false, weight:66  },
  { name:"Chest-Supported T-Bar Row", group:"Back",       repMin:8,  repMax:10, unilateral:false, weight:110 },
  { name:"Single-Arm Cable Row",      group:"Back",       repMin:12, repMax:15, unilateral:true,  weight:66  },
  { name:"Single-Arm DB Row",         group:"Back",       repMin:10, repMax:12, unilateral:true,  weight:80  },
  { name:"Straight Arm Pulldown",     group:"Back",       repMin:12, repMax:15, unilateral:false, weight:50  },
  { name:"EZ Bar Curl",               group:"Biceps",     repMin:10, repMax:12, unilateral:false, weight:77  },
  { name:"Barbell Curl",              group:"Biceps",     repMin:8,  repMax:12, unilateral:false, weight:65  },
  { name:"Incline Dumbbell Curl",     group:"Biceps",     repMin:12, repMax:15, unilateral:false, weight:31  },
  { name:"Hammer Curl",               group:"Biceps",     repMin:12, repMax:15, unilateral:false, weight:40  },
  { name:"Cable Curl",                group:"Biceps",     repMin:12, repMax:15, unilateral:true,  weight:30  },
  { name:"Concentration Curl",        group:"Biceps",     repMin:12, repMax:15, unilateral:true,  weight:25  },
  { name:"Hack Squat",                group:"Quads",      repMin:8,  repMax:10, unilateral:false, weight:220 },
  { name:"Leg Press",                 group:"Quads",      repMin:10, repMax:12, unilateral:false, weight:265 },
  { name:"Single Leg Leg Press",      group:"Quads",      repMin:10, repMax:12, unilateral:true,  weight:110 },
  { name:"Leg Extension",             group:"Quads",      repMin:12, repMax:15, unilateral:false, weight:110 },
  { name:"Single Leg Extension",      group:"Quads",      repMin:12, repMax:15, unilateral:true,  weight:55  },
  { name:"Bulgarian Split Squat",     group:"Quads",      repMin:8,  repMax:12, unilateral:true,  weight:50  },
  { name:"Walking Lunges (DB)",       group:"Quads",      repMin:10, repMax:12, unilateral:false, weight:48  },
  { name:"Romanian Deadlift",         group:"Hamstrings", repMin:8,  repMax:10, unilateral:false, weight:176 },
  { name:"Stiff-Leg Deadlift (DB)",   group:"Hamstrings", repMin:10, repMax:12, unilateral:false, weight:70  },
  { name:"Leg Curl",                  group:"Hamstrings", repMin:10, repMax:12, unilateral:false, weight:99  },
  { name:"Leg Curl (seated)",         group:"Hamstrings", repMin:12, repMax:15, unilateral:false, weight:88  },
  { name:"Single Leg Curl",           group:"Hamstrings", repMin:10, repMax:12, unilateral:true,  weight:50  },
  { name:"Hip Thrust",                group:"Glutes",     repMin:10, repMax:12, unilateral:false, weight:198 },
  { name:"Single Leg Hip Thrust",     group:"Glutes",     repMin:10, repMax:15, unilateral:true,  weight:90  },
  { name:"Cable Kickback",            group:"Glutes",     repMin:15, repMax:20, unilateral:true,  weight:30  },
  { name:"Standing Calf Raise",       group:"Calves",     repMin:12, repMax:15, unilateral:false, weight:176 },
  { name:"Seated Calf Raise",         group:"Calves",     repMin:15, repMax:20, unilateral:false, weight:110 },
  { name:"Single Leg Calf Raise",     group:"Calves",     repMin:12, repMax:15, unilateral:true,  weight:90  },
];
const MUSCLE_GROUPS = [...new Set(EXERCISE_REPO.map(e => e.group))];

// ── Default Program ───────────────────────────────────────────────────────────
const DEFAULTS = {
  "Day 1 — Push": [
    { name:"Barbell Bench Press",       sets:4, reps:"6–8",   repMin:6,  repMax:8,  weight:160, unilateral:false },
    { name:"Incline Dumbbell Press",    sets:3, reps:"8–10",  repMin:8,  repMax:10, weight:62,  unilateral:false },
    { name:"Barbell Overhead Press",    sets:3, reps:"8–10",  repMin:8,  repMax:10, weight:110, unilateral:false },
    { name:"Cable Lateral Raise",       sets:4, reps:"12–15", repMin:12, repMax:15, weight:17,  unilateral:true  },
    { name:"Dumbbell Lateral Raise",    sets:3, reps:"15–20", repMin:15, repMax:20, weight:26,  unilateral:false },
    { name:"Tricep Rope Pushdown",      sets:3, reps:"12–15", repMin:12, repMax:15, weight:55,  unilateral:false },
    { name:"Overhead Tricep Extension", sets:3, reps:"10–12", repMin:10, repMax:12, weight:55,  unilateral:false },
  ],
  "Day 2 — Pull": [
    { name:"Weighted Pull-Up / Lat Pulldown", sets:4, reps:"6–8",   repMin:6,  repMax:8,  weight:155, unilateral:false },
    { name:"Barbell Pendlay Row",             sets:4, reps:"6–8",   repMin:6,  repMax:8,  weight:155, unilateral:false },
    { name:"Seated Cable Row",                sets:3, reps:"10–12", repMin:10, repMax:12, weight:143, unilateral:false },
    { name:"Chest-Supported DB Row",          sets:3, reps:"10–12", repMin:10, repMax:12, weight:66,  unilateral:false },
    { name:"Face Pull",                       sets:4, reps:"15–20", repMin:15, repMax:20, weight:44,  unilateral:false },
    { name:"EZ Bar Curl",                     sets:3, reps:"10–12", repMin:10, repMax:12, weight:77,  unilateral:false },
    { name:"Incline Dumbbell Curl",           sets:3, reps:"12–15", repMin:12, repMax:15, weight:31,  unilateral:false },
  ],
  "Day 3 — Legs": [
    { name:"Hack Squat",           sets:4, reps:"8–10",   repMin:8,  repMax:10, weight:220, unilateral:false },
    { name:"Single Leg Leg Press", sets:3, reps:"10–12",  repMin:10, repMax:12, weight:110, unilateral:true  },
    { name:"Romanian Deadlift",    sets:4, reps:"8–10",   repMin:8,  repMax:10, weight:176, unilateral:false },
    { name:"Leg Curl",             sets:4, reps:"10–12",  repMin:10, repMax:12, weight:99,  unilateral:false },
    { name:"Leg Extension",        sets:3, reps:"12–15",  repMin:12, repMax:15, weight:110, unilateral:false },
    { name:"Standing Calf Raise",  sets:4, reps:"12–15",  repMin:12, repMax:15, weight:176, unilateral:false },
    { name:"Seated Calf Raise",    sets:3, reps:"15–20",  repMin:15, repMax:20, weight:110, unilateral:false },
  ],
  "Day 4 — Upper": [
    { name:"Incline Barbell Bench Press", sets:4, reps:"8–10",  repMin:8,  repMax:10, weight:143, unilateral:false },
    { name:"Chest-Supported T-Bar Row",  sets:4, reps:"8–10",  repMin:8,  repMax:10, weight:110, unilateral:false },
    { name:"Dumbbell Shoulder Press",    sets:3, reps:"10–12", repMin:10, repMax:12, weight:53,  unilateral:false },
    { name:"Single-Arm Cable Row",       sets:3, reps:"12–15", repMin:12, repMax:15, weight:66,  unilateral:true  },
    { name:"Pec Deck / Cable Fly",       sets:3, reps:"12–15", repMin:12, repMax:15, weight:121, unilateral:false },
    { name:"Rear Delt Fly",              sets:3, reps:"15–20", repMin:15, repMax:20, weight:44,  unilateral:false },
    { name:"Hammer Curl",                sets:3, reps:"12–15", repMin:12, repMax:15, weight:40,  unilateral:false },
    { name:"Tricep Dip",                 sets:3, reps:"10–12", repMin:10, repMax:12, weight:null, unilateral:false},
  ],
  "Day 5 — Lower": [
    { name:"Leg Press",               sets:4, reps:"10–12",  repMin:10, repMax:12, weight:265, unilateral:false },
    { name:"Walking Lunges (DB)",     sets:3, reps:"12 each",repMin:12, repMax:12, weight:48,  unilateral:false },
    { name:"Stiff-Leg Deadlift (DB)", sets:4, reps:"10–12",  repMin:10, repMax:12, weight:70,  unilateral:false },
    { name:"Leg Curl (seated)",       sets:3, reps:"12–15",  repMin:12, repMax:15, weight:88,  unilateral:false },
    { name:"Leg Extension",           sets:3, reps:"15–20",  repMin:15, repMax:20, weight:99,  unilateral:false },
    { name:"Hip Thrust",              sets:4, reps:"10–12",  repMin:10, repMax:12, weight:198, unilateral:false },
    { name:"Seated Calf Raise",       sets:4, reps:"15–20",  repMin:15, repMax:20, weight:110, unilateral:false },
  ],
};
const DAYS = Object.keys(DEFAULTS);
const FREEBALL_DAY = "One-off — Freeball";
// User-added permanent days (e.g. saved from an override session), beyond the 5 defaults.
let customDays = lsGet("il:customDays", []);
// All program days = template days + any custom days the user has saved permanently.
function allProgramDays(){ return [...DAYS, ...customDays]; }
// All selectable days = program days + the freeball day (freeball never lives in DEFAULTS)
function allDays(){ return [...allProgramDays(), FREEBALL_DAY]; }

// ── Science Functions ─────────────────────────────────────────────────────────

// Epley formula: e1RM = weight × (1 + reps/30)
function calcE1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  return Math.round(parseFloat(weight) * (1 + parseFloat(reps) / 30) * 10) / 10;
}

// A row only counts as a real working set if it has positive weight AND reps.
// Abandoned/mis-logged rows (0 reps, blank/0 weight) must be ignored everywhere —
// otherwise they poison e1RM, hard-set counts, and progression targets.
function isWorkingSet(w, r) {
  const wt = parseFloat(w), rp = parseFloat(r);
  return !isNaN(wt) && !isNaN(rp) && wt > 0 && rp > 0;
}

// RPE-adjusted e1RM: estimates reps-in-reserve from RPE, projects to true 1RM.
// RPE 10 = 0 RIR (took it to failure). Each point below 10 ≈ 1 more rep in reserve.
// True reps-to-failure ≈ reps + (10 - RPE). Then Epley on that.
function calcE1RM_RPE(weight, reps, rpe) {
  if (!weight || !reps || reps <= 0) return 0;
  const w = parseFloat(weight), r = parseFloat(reps);
  if (rpe == null || rpe === "" || isNaN(parseFloat(rpe))) return calcE1RM(w, r);
  const rir = Math.max(0, 10 - parseFloat(rpe));
  const repsToFailure = r + rir;
  return Math.round(w * (1 + repsToFailure / 30) * 10) / 10;
}

// Exercise transfer coefficients — what fraction of a barbell-equivalent e1RM
// typically carries over to a substitute movement. Used by the swap estimator
// to suggest a starting weight when you swap exercises. Conservative by design;
// you can always adjust the suggested number.
const TRANSFER_COEFF = {
  // pattern key -> { variants: [names...], coeff (relative to the pattern's "anchor") }
  // We estimate: targetWeight ≈ (sourceE1RM × targetCoeff / sourceCoeff) de-rated to a working rep target.
  "Bench Press": 1.00, "Barbell Bench Press": 1.00,
  "Incline Bench Press": 0.80, "Incline Barbell Press": 0.80,
  "Dumbbell Bench Press": 0.42, "Incline Dumbbell Press": 0.36, // per-hand
  "Pec Deck": 0.55, "Chest Fly": 0.45, "Cable Fly": 0.40,
  "Machine Chest Press": 0.85, "Push-Up": 0.65,
  "Overhead Press": 0.62, "Barbell Overhead Press": 0.62, "Shoulder Press": 0.62,
  "Dumbbell Shoulder Press": 0.28, "Machine Shoulder Press": 0.58, "Lateral Raise": 0.12,
  "Squat": 1.00, "Barbell Squat": 1.00, "Back Squat": 1.00,
  "Front Squat": 0.82, "Hack Squat": 1.15, "Leg Press": 2.30,
  "Goblet Squat": 0.45, "Bulgarian Split Squat": 0.30, "Leg Extension": 0.55,
  "Deadlift": 1.00, "Barbell Deadlift": 1.00, "Conventional Deadlift": 1.00,
  "Romanian Deadlift": 0.78, "RDL": 0.78, "Stiff Leg Deadlift": 0.72,
  "Trap Bar Deadlift": 1.05, "Hip Thrust": 1.10, "Leg Curl": 0.40, "Good Morning": 0.55,
  "Barbell Row": 0.75, "Bent Over Row": 0.75, "Pendlay Row": 0.72,
  "Dumbbell Row": 0.34, "Seated Cable Row": 0.85, "Lat Pulldown": 0.80,
  "Pull-Up": 0.95, "Chin-Up": 0.95, "T-Bar Row": 0.78, "Machine Row": 0.82,
  "Barbell Curl": 0.30, "Dumbbell Curl": 0.14, "Hammer Curl": 0.15,
  "Preacher Curl": 0.26, "Cable Curl": 0.28,
  "Tricep Pushdown": 0.30, "Skull Crusher": 0.32, "Overhead Tricep Extension": 0.28,
  "Close Grip Bench": 0.82, "Dips": 0.70
};

// Estimate a working weight for a target exercise given a source exercise's
// recent best e1RM. Returns { weight, reps, confidence } or null if unknown.
function estimateSwapWeight(sourceName, targetName, sourceE1RM, targetRepMin, targetRepMax) {
  const sc = TRANSFER_COEFF[sourceName];
  const tc = TRANSFER_COEFF[targetName];
  if (!sc || !tc || !sourceE1RM) return null;
  // target 1RM-equivalent
  const targetE1RM = sourceE1RM * (tc / sc);
  // de-rate from 1RM to a working set at the middle of the rep range (Epley inverse)
  const reps = Math.round((targetRepMin + targetRepMax) / 2) || 8;
  const working = targetE1RM / (1 + reps / 30);
  // round to nearest 5 lb
  const weight = Math.max(5, Math.round(working / 5) * 5);
  const confidence = (TRANSFER_COEFF[sourceName] && TRANSFER_COEFF[targetName]) ? "estimated" : "rough";
  return { weight, reps, confidence };
}

// Volume load: sets × reps × weight
function calcVolumeLoad(sets) {
  return sets.reduce((sum, s) => {
    const w = parseFloat(s.weight) || 0;
    const r = parseFloat(s.reps) || 0;
    return sum + (w * r);
  }, 0);
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── Mesocycle / Deload engine ────────────────────────────────────────────────
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

// Scans the most recent handful of session dates across the WHOLE program for
// sustained near-failure effort — an early/fatigue-triggered deload signal,
// independent of the scheduled cadence.
function evaluateDeloadSignal() {
  const recentDates = [...new Set(Object.values(sessions).map(s => s.date))].sort().slice(-6);
  if (recentDates.length < 3) return null;
  let rpeSum = 0, rpeCount = 0;
  Object.values(sessions).forEach(sess => {
    if (!recentDates.includes(sess.date)) return;
    Object.values(sess.exercises).forEach(sets => sets.forEach(s => {
      const rpe = parseFloat(s.rpe);
      if (isNaN(rpe)) return;
      const wt = String(s.weight || ""), rp = String(s.reps || "");
      if (wt.includes("L:") || rp.includes("L:")) return; // skip unilateral rows, format differs
      if (!isWorkingSet(wt, rp)) return;
      rpeSum += rpe; rpeCount++;
    }));
  });
  if (rpeCount < 6) return null;
  const avgRpe = rpeSum / rpeCount;
  if (avgRpe >= DELOAD_TRIGGER_RPE) {
    return `Average RPE across your last ${recentDates.length} sessions is ${avgRpe.toFixed(1)} — sustained near-failure training, time to back off.`;
  }
  return null;
}

// Returns { weekNum, inDeload, reason }. Persists cycle/deload start dates in
// localStorage but RE-EVALUATES every call rather than just counting down, so
// evaluateDeloadSignal() (or an AI review via triggerAiDeload()) can pull a
// deload forward before the scheduled MESOCYCLE_WEEKS are up.
function getMesocycleState() {
  const today = todayStr();
  let meso = lsGet("il:mesocycle", null);
  if (!meso) {
    const dates = Object.values(sessions).map(s => s.date).filter(Boolean).sort();
    meso = { cycleStart: dates[0] || today, deloadStart: null, deloadReason: null };
    lsSet("il:mesocycle", meso);
  }

  if (meso.deloadStart) {
    if (daysBetween(meso.deloadStart, today) >= DELOAD_DAYS) {
      meso = { cycleStart: today, deloadStart: null, deloadReason: null };
      lsSet("il:mesocycle", meso);
    } else {
      return { weekNum: MESOCYCLE_WEEKS, inDeload: true, reason: meso.deloadReason || "Scheduled deload week." };
    }
  }

  const weekNum = Math.floor(daysBetween(meso.cycleStart, today) / 7) + 1;
  if (weekNum > MESOCYCLE_WEEKS) {
    meso.deloadStart = today;
    meso.deloadReason = `${MESOCYCLE_WEEKS} weeks into this training block — scheduled deload.`;
    lsSet("il:mesocycle", meso);
    return { weekNum: MESOCYCLE_WEEKS, inDeload: true, reason: meso.deloadReason };
  }

  const fatigueReason = evaluateDeloadSignal();
  if (fatigueReason) {
    meso.deloadStart = today;
    meso.deloadReason = fatigueReason;
    lsSet("il:mesocycle", meso);
    return { weekNum, inDeload: true, reason: fatigueReason };
  }

  return { weekNum, inDeload: false, reason: null };
}

// Called when the AI Session Review recommends an early deload — same
// mechanism as the automatic triggers above, just AI-initiated.
function triggerAiDeload(reason) {
  const meso = lsGet("il:mesocycle", { cycleStart: todayStr(), deloadStart: null, deloadReason: null });
  meso.deloadStart = todayStr();
  meso.deloadReason = reason || "AI-recommended deload based on your recent session review.";
  lsSet("il:mesocycle", meso);
}

// Descending target RPE across an exercise's sets — more reserve on early
// sets, tightening toward failure on the last one (Schoenfeld's within-
// session RIR structure), rather than the same effort on every set.
function targetRPEForSet(si, totalSets, inDeload) {
  if (inDeload) return DELOAD_RPE_CAP;
  if (totalSets <= 1) return 9;
  const frac = si / (totalSets - 1);
  return Math.round((7.5 + frac * 2) * 2) / 2; // 7.5 -> 9.5 in 0.5 steps
}

// AI Session Review can auto-apply a light "hold volume, don't progress yet"
// flag per exercise — read back into computeTarget below.
function getAiAdjustment(exName) {
  const store = lsGet("il:aiAdjustments", {});
  return store[exName] || null;
}
function setAiAdjustment(exName, adj) {
  const store = lsGet("il:aiAdjustments", {});
  if (adj) store[exName] = adj; else delete store[exName];
  lsSet("il:aiAdjustments", store);
}
function clearAiAdjustment(exName) { setAiAdjustment(exName, null); }

// Ramps each muscle group's total weekly hard-set count from MEV toward MRV
// across the mesocycle (research: add ~1-2 sets/muscle/week toward MRV, then
// deload). Applied once per week/deload TRANSITION rather than every render,
// so it doesn't fight with a manual +/- adjustment mid-week. Mutates the
// PERMANENT program across every day (a muscle group can span multiple
// training days) and persists like any other program edit.
function applyVolumeRamp(meso) {
  const rampState = lsGet("il:volumeRamp", {});
  const key = meso.inDeload ? "deload" : "w" + meso.weekNum;
  if (rampState.lastKey === key) return; // already ramped for this state
  const wasInDeload = rampState.lastKey === "deload";
  let changed = false;

  MUSCLE_GROUPS.forEach(group => {
    const { mev, mrv } = getLandmarks(group);
    if (mrv <= 0) return;

    const entries = [];
    allProgramDays().forEach(day => {
      (exercises[day] || []).forEach(ex => { if (getMuscleGroup(ex.name) === group) entries.push(ex); });
    });
    if (!entries.length) return;

    if (meso.inDeload) {
      if (wasInDeload) return; // already cut for this deload
      entries.forEach(ex => {
        if (ex._preDeloadSets == null) ex._preDeloadSets = ex.sets;
        ex.sets = Math.max(1, Math.round(ex._preDeloadSets * DELOAD_SET_PCT));
      });
      changed = true;
      return;
    }

    // Coming out of a deload — restore pre-deload counts before ramping further.
    if (wasInDeload) {
      entries.forEach(ex => {
        if (ex._preDeloadSets != null) { ex.sets = ex._preDeloadSets; delete ex._preDeloadSets; }
      });
      changed = true;
    }

    const weeklyTarget = Math.round(mev + (mrv - mev) * Math.min(meso.weekNum, MESOCYCLE_WEEKS) / MESOCYCLE_WEEKS);
    let currentTotal = entries.reduce((sum, ex) => sum + ex.sets, 0);
    let guard = 0;
    while (currentTotal < weeklyTarget && guard < 20) {
      const candidate = entries
        .filter(ex => ex.sets < (ex._rampBase ?? ex.sets) + 3) // cap how far any one exercise can balloon
        .sort((a, b) => a.sets - b.sets)[0];
      if (!candidate) break;
      if (candidate._rampBase == null) candidate._rampBase = candidate.sets;
      candidate.sets++;
      currentTotal++;
      changed = true;
      guard++;
    }
  });

  if (changed) lsSet("il:exercises", exercises);
  lsSet("il:volumeRamp", { lastKey: key });
}

// Session-tab banner explaining the current mesocycle week or an active deload.
function renderMesoBanner(meso) {
  const el = document.getElementById("meso-banner");
  if (!el) return;
  if (meso.inDeload) {
    el.className = "meso-banner deload";
    el.textContent = `🔻 Deload week — ${meso.reason || "reduced volume and intensity this week."}`;
  } else {
    el.className = "meso-banner";
    el.textContent = `Week ${meso.weekNum} of ${MESOCYCLE_WEEKS} — volume ramping toward MRV, deload after week ${MESOCYCLE_WEEKS}.`;
  }
  el.classList.remove("hidden");
}

// Double-progression target for a standard (bilateral) exercise: one working
// weight shared across all sets. Uses the MEDIAN weight from the most recent
// session with data for this exercise (excluding 0-rep/failed sets), and only
// bumps weight once ≥75% of that session's valid sets hit repMax. A 0-rep set
// in the last session (weight logged, reps=0) surfaces a back-off suggestion
// but is otherwise excluded from the target math.
// Returns { weight, reps, e1rm, reason, backoff }
// `meso` is the result of getMesocycleState() — pass it explicitly so callers
// share one evaluation per render/save rather than each recomputing it.
function computeTarget(ex, history, meso) {
  meso = meso || { inDeload: false };
  const programWeight = ex.weight || 0;
  const adjustment = getAiAdjustment(ex.name);

  let lastRows = null;
  for (const sess of history) {
    const rows = (sess.rows || [])
      .filter(r => r.exercise === ex.name)
      .sort((a, b) => a.set - b.set);
    if (rows.length) { lastRows = rows; break; }
  }

  if (!lastRows) {
    const w = meso.inDeload ? roundToNearest(programWeight * DELOAD_WEIGHT_PCT, 2.5) : programWeight;
    return { weight: w, reps: ex.repMin, e1rm: calcE1RM(w, ex.repMin), reason: meso.inDeload ? "deload" : "new", backoff: null };
  }

  const valid  = lastRows.filter(r => isWorkingSet(r.weight, r.reps));
  // A "failed" set has a logged weight but 0 reps — abandoned mid-set.
  const failed = lastRows.filter(r => !isWorkingSet(r.weight, r.reps) && parseFloat(r.weight) > 0 && parseFloat(r.reps) === 0);

  if (!valid.length) {
    const dropped = roundToNearest(programWeight * (1 - WEIGHT_DROP_PCT), 2.5);
    const backoff = failed.length ? { weight: dropped, reps: ex.repMin } : null;
    return { weight: dropped, reps: ex.repMin, e1rm: calcE1RM(dropped, ex.repMin), reason: "backoff", backoff };
  }

  const medWeight = median(valid.map(r => parseFloat(r.weight)));
  const medReps   = Math.round(median(valid.map(r => parseFloat(r.reps))));
  const rpeVals   = valid.map(r => parseFloat(r.rpe)).filter(v => !isNaN(v));
  const medRPE    = rpeVals.length ? median(rpeVals) : null;
  const hitRatio  = valid.filter(r => parseFloat(r.reps) >= ex.repMax).length / valid.length;
  const bump      = LOWER_DAYS.some(d => d === ex._day) ? 10 : 5;
  const backoff   = failed.length ? { weight: roundToNearest(medWeight * (1 - WEIGHT_DROP_PCT), 2.5), reps: ex.repMin } : null;

  // Deload overrides everything else — always ease off regardless of how
  // last session went.
  if (meso.inDeload) {
    const weight = roundToNearest(medWeight * DELOAD_WEIGHT_PCT, 2.5);
    return { weight, reps: ex.repMin, e1rm: calcE1RM(weight, ex.repMin), reason: "deload", backoff: null };
  }

  // Autoregulated double progression: last session's actual RPE undershot
  // the descending target by a full point+ (it felt clearly easier than it
  // was supposed to) and reps were already near the top of the range —
  // progress now rather than waiting to grind out one more rep at a time.
  const midTargetRPE = targetRPEForSet(Math.floor((ex.sets - 1) / 2), ex.sets, false);
  const undershotEffort = medRPE !== null && medRPE <= midTargetRPE - 1 && medReps >= ex.repMax - 1;

  // An AI-applied "hold" adjustment caps progression at maintain, even if
  // the numbers alone would say to bump — used when the review flagged this
  // exercise as needing a session to stabilize before pushing further.
  const holding = adjustment && adjustment.holdVolume;

  if (!holding && (hitRatio >= 0.75 || undershotEffort)) {
    const weight = medWeight + bump;
    return { weight, reps: ex.repMin, e1rm: calcE1RM(weight, ex.repMin), reason: "progress", backoff };
  }

  // Overshot effort: already grinding at/above target RPE despite not
  // reaching the top of the rep range — hold rather than push reps further
  // into fatigue that wasn't part of the plan.
  if (medRPE !== null && medRPE >= 9.5) {
    return { weight: medWeight, reps: medReps, e1rm: calcE1RM(medWeight, medReps), reason: "hold", backoff };
  }

  const targetReps = holding ? medReps : Math.min(medReps + 1, ex.repMax);
  return { weight: medWeight, reps: targetReps, e1rm: calcE1RM(medWeight, targetReps), reason: holding ? "hold" : "maintain", backoff };
}

// Legacy per-set-index target logic, kept ONLY for unilateral exercises. Their
// weight/reps are stored as "L:x/R:y" strings which isWorkingSet can't parse,
// so the median/75% rule above can't apply to them without also teaching every
// consumer to parse per-side values — out of scope for the progression fix.
function computeTargetPerSet(ex, setIndex, history) {
  const programWeight = ex.weight || 0;
  let lastWeight = programWeight;
  let lastReps   = ex.repMax;

  for (const sess of history) {
    const s = sess.sets && sess.sets[setIndex];
    if (s && isWorkingSet(s.weight, s.reps)) {
      lastWeight = Math.max(parseFloat(s.weight), programWeight);
      lastReps   = parseFloat(s.reps);
      break;
    }
  }

  const bump = LOWER_DAYS.some(d => d === ex._day) ? 10 : 5;
  if (lastReps >= ex.repMax) {
    return { weight: lastWeight + bump, reps: ex.repMin, e1rm: calcE1RM(lastWeight + bump, ex.repMin), reason: "progress" };
  }
  const targetReps = Math.min(lastReps + 1, ex.repMax);
  return { weight: lastWeight, reps: targetReps, e1rm: calcE1RM(lastWeight, targetReps), reason: "maintain" };
}

// Analyse set history for stagnation and decline per set index
// Returns { status: 'stagnant'|'declining'|'progressing'|'new', streak }
function analyseSetHistory(setHistory) {
  // setHistory = [{weight, reps}] newest first — ignore junk rows entirely
  const clean = setHistory.filter(s => isWorkingSet(s.weight, s.reps));
  if (clean.length < 2) return { status: "new", streak: 0 };

  const e1rms = clean.map(s => calcE1RM(parseFloat(s.weight)||0, parseFloat(s.reps)||0));

  // Check for consecutive decline
  let declineStreak = 0;
  for (let i = 0; i < e1rms.length - 1; i++) {
    if (e1rms[i] < e1rms[i+1]) declineStreak++;
    else break;
  }
  if (declineStreak >= PERF_LOSS_SESSIONS) return { status: "declining", streak: declineStreak };

  // Check for stagnation
  let stagnantStreak = 0;
  for (let i = 0; i < e1rms.length - 1; i++) {
    if (Math.abs(e1rms[i] - e1rms[i+1]) < 0.5) stagnantStreak++;
    else break;
  }
  if (stagnantStreak >= STAGNATION_SESSIONS - 1) return { status: "stagnant", streak: stagnantStreak + 1 };

  // Check for PR
  if (e1rms[0] > Math.max(...e1rms.slice(1))) return { status: "pr", streak: 0 };

  return { status: "progressing", streak: 0 };
}

// ── State ─────────────────────────────────────────────────────────────────────
let exercises   = JSON.parse(JSON.stringify(DEFAULTS));
if(!exercises[FREEBALL_DAY]) exercises[FREEBALL_DAY] = [];
let sessions    = {};
let progHist    = [];
let bwData      = [];
let dayHistory  = {}; // cache: { dayKey: [sessions newest first] }
let activeDay   = DAYS[0];
let sessDate    = todayStr();
let liveLog     = {}; // { exIdx: { sets: [{weight,reps,weightL,repsL,weightR,repsR,hit}] } }
let liveNote    = {};
let calYear     = new Date().getFullYear();
let calMonth    = new Date().getMonth();
let selDate     = null;
let swapIdx     = null;
let repoCallback= null;
let bwChart     = null;
let e1rmChart   = null;
let volChart    = null;
let volWeekOffset = 0;
let selectedE1RMEx = null;
let repoFilter  = "";
let repoSearch  = "";
let renderedTargets = {}; // { exIdx: { setIdx: {weight, reps} } } — set at render time
let overrideMode = false;      // "Override Today" — edits apply to overrideExercises only
let overrideExercises = null;  // temp copy of the day's exercise list, used only while overrideMode is on
let pendingLogDesc = null;     // { date, day, exercises } — parsed "log by description" result awaiting Load
let pendingDeclinePrompt = null; // { idx, exName, streak, key } — set during renderExercises, consumed right after

// ── Utilities ─────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dKey(y,m,d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function cleanDate(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("T")) return s.split("T")[0];
  if (s.length >= 10) return s.slice(0, 10);
  return s.trim();
}
function lsGet(k,fb) { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } }
function lsSet(k,v) { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} }
function roundToNearest(val, nearest) { return Math.round(val / nearest) * nearest; }

// ── Session override mode ────────────────────────────────────────────────────
// Returns the exercise list currently being edited: the permanent program for
// activeDay, or a throwaway copy of it while "Override Today" is on. Overrides
// never touch the PERMANENT `exercises`/"il:exercises" — only saveSession's
// progression update (matched by exercise name) is allowed to feed back into
// the permanent program. The override list itself is persisted separately
// (under "il:overrideState") purely so an in-progress override session isn't
// silently lost if the app is closed and reopened before saving — restored in
// init() and cleared once the mode turns off or the session is saved.
function activeExArray() {
  if (overrideMode) return overrideExercises;
  if (!exercises[activeDay]) exercises[activeDay] = [];
  return exercises[activeDay];
}
function persistExercises() {
  if (overrideMode) lsSet("il:overrideState", { mode:true, day:activeDay, exercises:overrideExercises });
  else lsSet("il:exercises", exercises);
}
function clearPersistedOverrideState() { lsSet("il:overrideState", null); }

// ── Google Sheets ─────────────────────────────────────────────────────────────
async function sheetsCall(params) {
  const url = new URL(SCRIPT_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v)));
  url.searchParams.set("t", Date.now());
  const r = await fetch(url.toString());
  const d = JSON.parse(await r.text());
  if (!d.ok) throw new Error(d.msg || "Script error");
  return d;
}

// ── Parse sessions ────────────────────────────────────────────────────────────
function parseSessionRows(rows) {
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const [rawDate,day,exercise,set,weight,reps,notes,sessionKey,rpe,completed] = rows[i];
    if (!sessionKey || !rawDate) continue;
    const date = cleanDate(rawDate);
    if (!result[sessionKey]) result[sessionKey] = { date, day, exercises:{} };
    if (!result[sessionKey].exercises[exercise]) result[sessionKey].exercises[exercise] = [];
    result[sessionKey].exercises[exercise].push({ set, weight, reps, notes, rpe, completed });
  }
  return result;
}

function parseDraftRows(rows) {
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const [rawDate,day,exercise,set,weight,reps,notes,draftKey,rpe,completed] = rows[i];
    if (!draftKey || !rawDate) continue;
    const date = cleanDate(rawDate);
    if (!result[draftKey]) result[draftKey] = { date, day, sets:[] };
    result[draftKey].sets.push({ exercise, set:parseInt(set), weight, reps, notes, rpe, completed });
  }
  return result;
}

function formatSession(sess) {
  return Object.entries(sess.exercises).map(([name,sets]) =>
    `${name}:\n` + sets.map(s => {
      const wt = String(s.weight||""), rp = String(s.reps||"");
      if (wt.includes("L:") || rp.includes("L:")) return `  S${s.set}: ${wt} × ${rp}${s.notes?"  ["+s.notes+"]":""}`;
      const e1rm = calcE1RM(parseFloat(wt), parseFloat(rp));
      return `  S${s.set}: ${wt}lb × ${rp} reps${e1rm?" (e1RM:"+e1rm+"lb)":""}${s.notes?"  ["+s.notes+"]":""}`;
    }).join("\n")
  ).join("\n\n");
}

// Flatten a parsed session's { exercises: { name: [{set,weight,reps,rpe}] } }
// shape into a flat rows array, for the history helpers below.
function sessionToRows(sess) {
  const rows = [];
  Object.entries(sess.exercises).forEach(([exercise, sets]) => {
    sets.forEach(s => rows.push({ exercise, set: parseInt(s.set), weight: s.weight, reps: s.reps, rpe: s.rpe, completed: s.completed }));
  });
  return rows;
}

// ── Load day history ──────────────────────────────────────────────────────────
// Built from the already-loaded `sessions` state rather than a network call, so
// it also picks up "{day} (Override)" sessions — exercise history is tracked by
// exercise name regardless of whether it was logged in an override session.
async function loadDayHistory(day) {
  if (dayHistory[day]) return dayHistory[day];
  const overrideLabel = `${day} (Override)`;
  const rows = Object.values(sessions)
    .filter(s => s.day === day || s.day === overrideLabel)
    .sort((a,b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map(s => ({ date: s.date, rows: sessionToRows(s) }));
  dayHistory[day] = rows;
  return rows;
}

// Get per-set history for an exercise across past sessions
function getSetHistory(history, exName, setIndex) {
  const result = [];
  for (const sess of history) {
    const setRows = sess.rows ? sess.rows.filter(r => r.exercise === exName && r.set === setIndex + 1) : [];
    if (setRows.length > 0) {
      result.push({ weight: setRows[0].weight, reps: setRows[0].reps, date: sess.date });
    }
  }
  return result; // newest first (history is sorted desc)
}

// Best e1RM for an exercise across recent sessions (any set), for swap estimation.
function bestRecentE1RM(history, exName) {
  let best = 0;
  for (const sess of (history||[])) {
    const rows = sess.rows ? sess.rows.filter(r => r.exercise === exName) : [];
    rows.forEach(r => {
      if (!isWorkingSet(r.weight, r.reps)) return;
      const e = calcE1RM_RPE(parseFloat(r.weight)||0, parseFloat(r.reps)||0, r.rpe);
      if (e > best) best = e;
    });
  }
  return best;
}

// ── Sync status ───────────────────────────────────────────────────────────────
function setSyncStatus(state, msg) {
  const el = document.getElementById("sync-status");
  el.className = "sync-status "+state;
  el.title = msg||"";
  el.textContent = {loading:"● LOADING",saving:"● SAVING",synced:"● SYNCED",error:"● ERROR"}[state]||"●";
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ── Draft ─────────────────────────────────────────────────────────────────────
async function saveDraft() {
  const curEx = activeExArray()||[];
  const dk = `DRAFT_${sessDate}_${activeDay}`;
  const rows = [];
  curEx.forEach((ex,i) => {
    (liveLog[i]?.sets||[]).forEach((st,si) => {
      if (!st) return;
      rows.push([sessDate,activeDay,ex.name,si+1,
        ex.unilateral ? `L:${st.weightL||""}` : (st.weight||""),
        ex.unilateral ? `L:${st.repsL||""}/R:${st.repsR||""}` : (st.reps||""),
        liveNote[i]||"", dk, st.rpe||"", st.hit?"1":"0"
      ]);
    });
  });
  if (!rows.length) return;
  try {
    await sheetsCall({ action:"clear_draft", draftKey:dk });
    await sheetsCall({ action:"write_draft", rows:JSON.stringify(rows) });
    lsSet("il:draftKey", dk);
  } catch {}
}

async function checkForDraft() {
  const savedKey = lsGet("il:draftKey", null);
  if (!savedKey) return;
  try {
    const d = await sheetsCall({ action:"read_draft" });
    const drafts = parseDraftRows(d.rows);
    if (drafts[savedKey]) showDraftBanner(drafts[savedKey], savedKey);
  } catch {}
}

// Loads a draft's sets into liveLog. Any exercise name not found in the
// currently active list (permanent or override) gets ADDED rather than
// silently dropped, so a mismatch — override state that didn't survive, an
// exercise since removed from the program, whatever — never loses data.
// Merges a list of { name, sets:[{weight,reps,rpe}, ...], notes } entries into
// liveLog, against whichever exercise list is currently active (permanent or
// override — activeExArray() already resolves that). Any exercise not already
// present gets ADDED rather than dropping its sets, so a name that doesn't
// match anything programmed — an AI substitution, a description of an
// off-program exercise, whatever — never silently loses data. `sets` is a
// positional array (index 0 = set 1); a hole at an index is skipped.
function mergeSetsIntoLiveLog(entries) {
  const curArr = activeExArray();
  liveLog = {}; liveNote = {};
  entries.forEach(entry => {
    let exIdx = curArr.findIndex(e => e.name === entry.name);
    if (exIdx === -1) {
      curArr.push({ name:entry.name, sets:Math.max(1, entry.sets.length), reps:"", repMin:1, repMax:20, weight:null, unilateral:false });
      exIdx = curArr.length - 1;
    }
    if (curArr[exIdx].sets < entry.sets.length) curArr[exIdx].sets = entry.sets.length;
    if (!liveLog[exIdx]) liveLog[exIdx] = { sets:[] };
    entry.sets.forEach((s, si) => {
      if (!s) return;
      liveLog[exIdx].sets[si] = { weight:String(s.weight), reps:String(s.reps), rpe:s.rpe?String(s.rpe):"" };
    });
    if (entry.notes) liveNote[exIdx] = entry.notes;
  });
  persistExercises();
}

function applyDraftToLiveLog(draft) {
  const byExercise = {};
  draft.sets.forEach(s => {
    if (!byExercise[s.exercise]) byExercise[s.exercise] = { name:s.exercise, sets:[], notes:"" };
    byExercise[s.exercise].sets[s.set-1] = { weight:s.weight, reps:s.reps, rpe:s.rpe };
    if (s.notes) byExercise[s.exercise].notes = s.notes;
  });
  mergeSetsIntoLiveLog(Object.values(byExercise));
}

function showDraftBanner(draft, key) {
  const banner = document.getElementById("draft-banner");
  document.getElementById("draft-banner-text").textContent =
    `Unfinished ${draft.day.split("—")[1]?.trim()} from ${draft.date} — continue?`;
  banner.classList.remove("hidden");
  document.getElementById("draft-continue").onclick = () => {
    activeDay = draft.day; sessDate = draft.date;
    document.getElementById("session-date").value = draft.date;
    applyDraftToLiveLog(draft);
    renderDayButtons(); renderExercises(); renderLastSession();
    banner.classList.add("hidden"); toast("Draft restored");
  };
  document.getElementById("draft-discard").onclick = async () => {
    try { await sheetsCall({ action:"clear_draft", draftKey:key }); } catch {}
    lsSet("il:draftKey", null);
    banner.classList.add("hidden");
  };
}

// ── Recover a draft manually ─────────────────────────────────────────────────
// For when the localStorage draftKey pointer itself is gone or stale (e.g. an
// older draft from before override-state persistence existed) — searches the
// Drafts sheet directly for whatever day/date is currently selected.
async function recoverDraft() {
  const dateStr = sessDate.slice(0,10);
  const dayLabel = activeDay===FREEBALL_DAY ? "Freeball" : (activeDay.split("—")[1]?.trim() || activeDay);
  toast("Checking for a saved draft...");
  try {
    const d = await sheetsCall({ action:"read_draft" });
    const drafts = parseDraftRows(d.rows);
    const match = Object.values(drafts).find(draft => draft.date === dateStr && draft.day === activeDay);
    if (!match) { toast(`No saved draft found for ${dayLabel} on ${dateStr}`); return; }
    applyDraftToLiveLog(match);
    renderDayButtons(); renderExercises(); renderLastSession();
    toast(`Recovered draft from ${dateStr}`);
  } catch(e) {
    toast("Couldn't check drafts: " + e.message);
  }
}
document.getElementById("recover-draft-btn").addEventListener("click", recoverDraft);

// ── Render exercises ──────────────────────────────────────────────────────────
async function renderExercises() {
  const curEx = activeExArray()||[];
  document.getElementById("active-day-label").textContent = activeDay;
  const container = document.getElementById("exercises-list");
  container.innerHTML = '<div style="font-size:10px;color:#444;padding:8px 0">Loading history...</div>';

  // Load history for this day
  const history = await loadDayHistory(activeDay);

  container.innerHTML = "";
  if (!curEx.length) {
    const isFree = activeDay===FREEBALL_DAY;
    container.innerHTML = `<div style="font-size:12px;color:#999;padding:16px 0 12px">${isFree?"Freeball session — build it on the fly. Pull any exercise from the library.":"No exercises. Swap or add from library."}</div>`;
    appendAddExerciseBtn(container);
    return;
  }

  // Reset rendered targets cache for this render pass
  renderedTargets = {};

  const meso = getMesocycleState();
  applyVolumeRamp(meso);
  renderMesoBanner(meso);

  // Check if first exercise is compound and struggling
  let workoutAlertShown = false;

  curEx.forEach((ex, i) => {
    ex._day = activeDay;
    const card = document.createElement("div");
    card.className = "exercise-card";
    card.dataset.idx = i;

    const isCompound = ex.repMax <= 10;
    const isFirstCompound = i === 0 && isCompound;

    // In-session fatigue context: preceding same-muscle-group exercises add
    // up (compound=3pts, isolation=1pt). Above 4 points, shift the rep target
    // toward the upper half of the rep range instead of the usual bottom-up climb.
    const exGroup = getMuscleGroup(ex.name);
    const fatigueScore = curEx.slice(0, i).reduce((score, other) => {
      if (getMuscleGroup(other.name) !== exGroup) return score;
      return score + (other.repMax <= 10 ? 3 : 1);
    }, 0);
    const highFatigue = fatigueScore > 4;
    const upperHalfReps = Math.ceil((ex.repMin + ex.repMax) / 2);

    // Bilateral exercises share one target across all sets (double progression).
    // Unilateral exercises keep the legacy per-set-index target.
    const exTarget = ex.unilateral ? null : computeTarget({ ...ex, _day: activeDay }, history, meso);
    const aiAdj = getAiAdjustment(ex.name);

    // Build per-set targets and analysis
    const setTargets = [];
    const setStatuses = [];
    renderedTargets[i] = {};
    for (let si = 0; si < ex.sets; si++) {
      const setHist = getSetHistory(history, ex.name, si);
      let target = ex.unilateral
        ? computeTargetPerSet({ ...ex, _day: activeDay }, si, history.map(h => ({
            sets: (h.rows||[]).filter(r => r.exercise === ex.name).map(r => ({ weight:r.weight, reps:r.reps }))
          })))
        : exTarget;
      if (highFatigue && target.reps < upperHalfReps) {
        target = { ...target, reps: upperHalfReps, e1rm: calcE1RM(target.weight, upperHalfReps) };
      }
      target = { ...target, targetRPE: targetRPEForSet(si, ex.sets, meso.inDeload) };
      const analysis = analyseSetHistory(setHist);
      setTargets.push(target);
      renderedTargets[i][si] = { weight: target.weight, reps: target.reps };
      setStatuses.push(analysis);
    }

    // Overall exercise status (worst set status)
    const statusPriority = { declining:4, stagnant:3, pr:2, progressing:1, new:0 };
    const worstStatus = setStatuses.reduce((w,s) => statusPriority[s.status] > statusPriority[w.status] ? s : w, setStatuses[0]||{status:"new"});

    if (worstStatus.status === "stagnant") card.classList.add("stagnant");
    if (worstStatus.status === "declining") card.classList.add("declining");

    // Proactively surface a reconsider prompt the FIRST time a decline streak
    // crosses the threshold — guarded so it doesn't re-nag on every render of
    // the same streak. Only one queued per render pass; opened after the card
    // list finishes building.
    if (worstStatus.status === "declining" && worstStatus.streak >= PERF_LOSS_SESSIONS && !pendingDeclinePrompt) {
      const promptKey = ex.name + "_" + worstStatus.streak;
      const prompted = lsGet("il:promptedDeclines", {});
      if (!prompted[promptKey]) pendingDeclinePrompt = { idx: i, exName: ex.name, streak: worstStatus.streak, key: promptKey };
    }

    const statusLabel = {
      stagnant: `⚠ Stagnant ${worstStatus.streak} sessions — consider technique focus or rep range shift`,
      declining: `↓ Declining ${worstStatus.streak} sessions — consider deload on this movement`,
      pr: "↑ New personal record!",
      progressing: "",
      new: ""
    }[worstStatus.status] || "";

    // Build set rows
    let setsHTML = "";
    for (let si = 0; si < ex.sets; si++) {
      const target = setTargets[si];
      const cur = liveLog[i]?.sets?.[si];
      const hitVal = cur?.hit || false;

      if (ex.unilateral) {
        setsHTML += `<div class="set-row">
          <div class="set-num">S${si+1}</div>
          <div class="set-target">Target: <span class="target-val">${target.weight}lb × ${target.reps}</span> <span class="target-rpe">@RPE${target.targetRPE}</span></div>
        </div>
        <div class="set-row unilateral" style="margin-top:3px;margin-bottom:6px">
          <span class="side-label">L</span>
          <input type="number" class="set-wL narrow" data-ex="${i}" data-set="${si}" placeholder="lb" value="${cur?.weightL||""}" />
          <input type="number" class="set-rL narrow" data-ex="${i}" data-set="${si}" placeholder="reps" value="${cur?.repsL||""}" />
          <span class="side-label" style="margin-left:6px">R</span>
          <input type="number" class="set-wR narrow" data-ex="${i}" data-set="${si}" placeholder="lb" value="${cur?.weightR||""}" />
          <input type="number" class="set-rR narrow" data-ex="${i}" data-set="${si}" placeholder="reps" value="${cur?.repsR||""}" />
        </div>`;
      } else {
        const curW = cur?.weight || "";
        const curR = cur?.reps || "";
        const curRpe = cur?.rpe || "";
        const e1rmNow = curW && curR ? calcE1RM_RPE(parseFloat(curW), parseFloat(curR), curRpe) : 0;
        setsHTML += `<div class="set-row" style="margin-bottom:6px">
          <div class="set-num">S${si+1}</div>
          <div class="set-target">→ <span class="target-val">${target.weight}lb × ${target.reps}</span> <span class="target-rpe">@RPE${target.targetRPE}</span></div>
          <input type="number" class="set-w" data-ex="${i}" data-set="${si}" placeholder="lb" value="${curW}" />
          <input type="number" class="set-r" data-ex="${i}" data-set="${si}" placeholder="reps" value="${curR}" />
          <input type="number" class="set-rpe" data-ex="${i}" data-set="${si}" placeholder="RPE" min="1" max="10" step="0.5" value="${curRpe}" title="Rate of Perceived Exertion 1–10" />
          <button class="btn-check ${hitVal?'hit':''}" data-ex="${i}" data-set="${si}" title="Mark as hit">✓</button>
          ${e1rmNow ? `<span class="e1rm-display">e1RM:<span class="e1rm-val">${e1rmNow}</span></span>` : ""}
        </div>`;
      }
    }

    card.innerHTML = `
      <div class="ex-header">
        <div>
          <div class="ex-name">${ex.name}${ex.unilateral?'<span class="badge-uni">UNI</span>':""}</div>
          <div class="ex-meta">${ex.sets}×${ex.reps} · <span class="weight">${ex.weight?ex.weight+"lb":"BW"}</span></div>
          ${statusLabel ? `<div class="ex-status ${worstStatus.status}">${statusLabel}</div>` : ""}
        </div>
        <div class="ex-actions">
          <button class="btn-icon btn-up" data-idx="${i}">↑</button>
          <button class="btn-icon btn-dn" data-idx="${i}">↓</button>
          <button class="btn-icon btn-reconsider" data-idx="${i}" title="Ask AI to reconsider this exercise">🤔</button>
          <button class="btn-icon btn-swap" data-idx="${i}">⇄</button>
          <button class="btn-icon btn-del" data-idx="${i}">✕</button>
        </div>
      </div>
      <div class="set-controls">
        <button class="btn-set-rm" data-idx="${i}">−</button>
        <span class="set-count-label">${ex.sets} sets</span>
        <button class="btn-set-add" data-idx="${i}">+</button>
      </div>
      ${exTarget && exTarget.backoff ? `<div class="ex-alert backoff">⚠ Set failed (0 reps) last session — suggested back-off: ${exTarget.backoff.weight}lb × ${exTarget.backoff.reps} reps next time</div>` : ""}
      ${highFatigue ? `<div class="ex-alert fatigue">⚡ High ${exGroup.toLowerCase()} fatigue — targeting higher reps</div>` : ""}
      ${meso.inDeload ? `<div class="ex-alert deload">🔻 Deload week — eased target</div>` : ""}
      ${!meso.inDeload && aiAdj ? `<div class="ex-alert hold">⏸ AI: holding progression — ${aiAdj.note || "stabilize before pushing further"}</div>` : ""}
      <div class="sets-container">${setsHTML}</div>
      <div class="notes-row">
        <div class="notes-label">Notes</div>
        <input type="text" class="notes-input" data-ex="${i}" placeholder="form cues, how it felt..." value="${liveNote[i]||""}" />
      </div>
    `;
    container.appendChild(card);
  });

  bindExerciseInputs(container, curEx);
  appendAddExerciseBtn(container);

  if (pendingDeclinePrompt) {
    const prompted = lsGet("il:promptedDeclines", {});
    prompted[pendingDeclinePrompt.key] = true;
    lsSet("il:promptedDeclines", prompted);
    const p = pendingDeclinePrompt;
    pendingDeclinePrompt = null;
    openReconsiderModal(p.idx, `Consistently declining e1RM for ${p.streak} sessions in a row — worth reconsidering?`);
  }
}

// Add-exercise-from-library button (used on Freeball + any day)
function appendAddExerciseBtn(container){
  const btn=document.createElement("button");
  btn.className="btn-add-exercise";
  btn.textContent="＋ Add exercise from library";
  btn.addEventListener("click",addExerciseToActiveDay);
  container.appendChild(btn);
}
function addExerciseToActiveDay(){
  openRepoModal(chosen=>{
    activeExArray().push({
      name:chosen.name, sets:3, reps:`${chosen.repMin}–${chosen.repMax}`,
      repMin:chosen.repMin, repMax:chosen.repMax,
      weight:chosen.weight||null, unilateral:!!chosen.unilateral
    });
    persistExercises();
    renderExercises();
    toast(chosen.name+" added");
  });
}

function checkFirstSetStruggle(exIdx, setIdx) {
  if (setIdx !== 0) return;
  const ex = (activeExArray()||[])[exIdx];
  if (!ex || ex.unilateral) return;
  const st = liveLog[exIdx]?.sets?.[0];
  const card = document.querySelector(`.exercise-card[data-idx="${exIdx}"]`);

  if (!st?.reps) {
    if (card) card.querySelector(".ex-alert.struggle")?.remove();
    return;
  }

  const repsStr = String(st.reps);
  const actual = parseFloat(repsStr);

  // Don't evaluate until user has finished typing — wait for 2+ digits
  // or a value that makes sense (>= repMin - 5 means they're likely done typing)
  const targetReps = renderedTargets[exIdx]?.[0]?.reps || ex.repMin;
  const likelyDoneTyping = repsStr.length >= 2 || actual >= (targetReps - 5);
  if (!likelyDoneTyping) {
    if (card) card.querySelector(".ex-alert.struggle")?.remove();
    return;
  }

  const threshold = targetReps * (1 - STRUGGLE_THRESHOLD);

  if (actual >= threshold) {
    if (card) card.querySelector(".ex-alert.struggle")?.remove();
    if (exIdx === 0) document.getElementById("workout-alert").classList.add("hidden");
    return;
  }

  // Struggling on set 1
  const suggestedWeight = roundToNearest(ex.weight * (1 - WEIGHT_DROP_PCT), 2.5);
  const isFirstCompound = exIdx === 0 && ex.repMax <= 10;

  if (card) {
    let alertEl = card.querySelector(".ex-alert.struggle");
    if (!alertEl) {
      alertEl = document.createElement("div");
      alertEl.className = "ex-alert struggle";
      card.querySelector(".sets-container").before(alertEl);
    }
    alertEl.textContent = `⚠ Set 1 below threshold — drop to ${suggestedWeight}lb for remaining sets, adding 1 set at ${suggestedWeight}lb`;

    // Auto-add a set if repMax <= 10 (compound) and not already added
    if (ex.repMax <= 10 && ex.sets < 6) {
      activeExArray()[exIdx].sets++;
      persistExercises();
      const si = activeExArray()[exIdx].sets - 1;
      if (!liveLog[exIdx]) liveLog[exIdx] = { sets:[] };
      liveLog[exIdx].sets[si] = { weight: String(suggestedWeight), reps:"" };
      renderExercises();
    }
  }

  if (isFirstCompound) {
    const alertEl = document.getElementById("workout-alert");
    alertEl.className = "workout-alert warning";
    alertEl.textContent = `⚠ First compound set significantly below target — consider reducing all working weights 12–15% today and treating this as a recovery session.`;
    alertEl.classList.remove("hidden");
  }
}

function bindExerciseInputs(container, curEx) {
  // Standard inputs
  container.querySelectorAll(".set-w,.set-r,.set-rpe").forEach(inp => {
    inp.addEventListener("input", e => {
      const i=parseInt(e.target.dataset.ex), si=parseInt(e.target.dataset.set);
      const field=e.target.classList.contains("set-w")?"weight":e.target.classList.contains("set-r")?"reps":"rpe";
      if (!liveLog[i]) liveLog[i]={sets:[]};
      if (!liveLog[i].sets[si]) liveLog[i].sets[si]={};
      liveLog[i].sets[si][field]=e.target.value;
      // Update e1RM display (RPE-adjusted when RPE present)
      const row = e.target.closest(".set-row");
      const st = liveLog[i].sets[si];
      if (st.weight && st.reps) {
        const e1rm = calcE1RM_RPE(parseFloat(st.weight), parseFloat(st.reps), st.rpe);
        let e1rmEl = row.querySelector(".e1rm-display");
        if (!e1rmEl) { e1rmEl=document.createElement("span"); e1rmEl.className="e1rm-display"; row.appendChild(e1rmEl); }
        e1rmEl.innerHTML = `e1RM:<span class="e1rm-val">${e1rm}</span>`;
      }
      if (field!=="rpe") checkFirstSetStruggle(i, si);
      saveDraft();
    });
  });

  // Unilateral
  ["set-wL","set-rL","set-wR","set-rR"].forEach(cls => {
    container.querySelectorAll("."+cls).forEach(inp => {
      inp.addEventListener("input", e => {
        const i=parseInt(e.target.dataset.ex), si=parseInt(e.target.dataset.set);
        const fm={"set-wL":"weightL","set-rL":"repsL","set-wR":"weightR","set-rR":"repsR"};
        if (!liveLog[i]) liveLog[i]={sets:[]};
        if (!liveLog[i].sets[si]) liveLog[i].sets[si]={};
        liveLog[i].sets[si][fm[cls]]=e.target.value;
        saveDraft();
      });
    });
  });

  // Checkmark buttons
  container.querySelectorAll(".btn-check").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.ex), si=parseInt(e.target.dataset.set);
      // Read exactly what was shown in the UI — no recomputation
      const target = renderedTargets[i]?.[si];
      if (!target) return;
      if (!liveLog[i]) liveLog[i]={sets:[]};
      if (!liveLog[i].sets[si]) liveLog[i].sets[si]={};
      const already = liveLog[i].sets[si].hit;
      if (!already) {
        // Pre-fill with target values
        liveLog[i].sets[si].weight = String(target.weight);
        liveLog[i].sets[si].reps   = String(target.reps);
        liveLog[i].sets[si].hit    = true;
        btn.classList.add("hit");
        // Update inputs
        const row = btn.closest(".set-row");
        const wInp = row.querySelector(".set-w");
        const rInp = row.querySelector(".set-r");
        if (wInp) wInp.value = target.weight;
        if (rInp) rInp.value = target.reps;
        const e1rm = calcE1RM(target.weight, target.reps);
        let e1rmEl = row.querySelector(".e1rm-display");
        if (!e1rmEl) { e1rmEl=document.createElement("span"); e1rmEl.className="e1rm-display"; row.appendChild(e1rmEl); }
        e1rmEl.innerHTML = `e1RM:<span class="e1rm-val">${e1rm}</span>`;
      } else {
        liveLog[i].sets[si].hit = false;
        btn.classList.remove("hit");
      }
      saveDraft();
    });
  });

  // Notes
  container.querySelectorAll(".notes-input").forEach(inp => {
    inp.addEventListener("input", e => {
      liveNote[parseInt(e.target.dataset.ex)]=e.target.value; saveDraft();
    });
  });

  // Set add/remove
  container.querySelectorAll(".btn-set-add").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx);
      activeExArray()[i].sets++;
      persistExercises(); renderExercises();
    });
  });
  container.querySelectorAll(".btn-set-rm").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx);
      if (activeExArray()[i].sets<=1) return;
      activeExArray()[i].sets--;
      persistExercises(); renderExercises();
    });
  });

  // Reorder
  container.querySelectorAll(".btn-up").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx); if(i===0)return;
      const arr=activeExArray(); [arr[i-1],arr[i]]=[arr[i],arr[i-1]];
      const ll=liveLog[i],lp=liveLog[i-1]; liveLog[i-1]=ll; liveLog[i]=lp;
      persistExercises(); renderExercises();
    });
  });
  container.querySelectorAll(".btn-dn").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx); const arr=activeExArray();
      if(i>=arr.length-1)return; [arr[i+1],arr[i]]=[arr[i],arr[i+1]];
      const ll=liveLog[i],lp=liveLog[i+1]; liveLog[i+1]=ll; liveLog[i]=lp;
      persistExercises(); renderExercises();
    });
  });

  // Swap/delete
  container.querySelectorAll(".btn-swap").forEach(btn => btn.addEventListener("click",e=>openSwapModal(parseInt(e.target.dataset.idx))));
  container.querySelectorAll(".btn-reconsider").forEach(btn => btn.addEventListener("click",e=>openReconsiderModal(parseInt(e.target.dataset.idx))));
  container.querySelectorAll(".btn-del").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx);
      const filtered = activeExArray().filter((_,j)=>j!==i);
      if (overrideMode) overrideExercises = filtered; else exercises[activeDay] = filtered;
      delete liveLog[i]; delete liveNote[i];
      persistExercises(); renderExercises();
    });
  });
}

// ── Last session ──────────────────────────────────────────────────────────────
function renderLastSession() {
  const overrideLabel = `${activeDay} (Override)`;
  const prev = Object.values(sessions)
    .filter(s=>(s.day===activeDay||s.day===overrideLabel)&&s.date!==sessDate)
    .sort((a,b)=>b.date.localeCompare(a.date))[0];
  const box=document.getElementById("last-session-box"), none=document.getElementById("no-last-session");
  if (prev) {
    box.classList.remove("hidden"); none.classList.add("hidden");
    const lbl = activeDay===FREEBALL_DAY ? "FREEBALL" : activeDay.split("—")[1]?.trim().toUpperCase();
    document.getElementById("last-session-title").textContent =
      `LAST ${lbl} — ${prev.date}`;
    document.getElementById("last-session-body").textContent = formatSession(prev);
  } else {
    box.classList.add("hidden"); none.classList.remove("hidden");
    const lbl = activeDay===FREEBALL_DAY ? "freeball" : activeDay.split("—")[1]?.trim();
    none.textContent = `No previous ${lbl} session on record.`;
  }
}

// ── Day buttons ───────────────────────────────────────────────────────────────
function renderDayButtons() {
  const container = document.getElementById("day-buttons");
  container.innerHTML = "";
  allDays().forEach(d => {
    const btn=document.createElement("button");
    const isFree = d===FREEBALL_DAY;
    btn.className="day-btn"+(d===activeDay?" active":"")+(isFree?" freeball":"");
    btn.textContent= isFree ? "＋ Freeball" : (d.split("—")[1]?.trim() || d);
    btn.addEventListener("click",()=>{
      activeDay=d; liveLog={}; liveNote={};
      overrideMode=false; overrideExercises=null;
      clearPersistedOverrideState();
      const toggle=document.getElementById("override-toggle"); if(toggle) toggle.checked=false;
      document.querySelector(".override-toggle")?.classList.remove("active");
      document.getElementById("override-hint")?.classList.add("hidden");
      document.getElementById("workout-alert").classList.add("hidden");
      document.getElementById("session-review-box").classList.add("hidden");
      renderDayButtons(); renderExercises(); renderLastSession();
    });
    container.appendChild(btn);
  });
  const overrideRow = document.getElementById("override-row");
  if (overrideRow) overrideRow.classList.toggle("hidden", activeDay===FREEBALL_DAY);
}

// ── Save session ──────────────────────────────────────────────────────────────
async function saveSession() {
  const curEx=activeExArray()||[];
  const cleanSessDate=sessDate.slice(0,10);
  // Override sessions are tagged in the Day column so they're distinguishable in
  // the sheet/calendar, but exercise history is still tracked by exercise name —
  // loadDayHistory() matches both the plain and "(Override)" day label.
  const dayLabel = overrideMode ? `${activeDay} (Override)` : activeDay;
  const sessionKey=`${cleanSessDate}_${dayLabel}`;
  const rows=[]; let hasData=false;

  curEx.forEach((ex,i)=>{
    const sets=liveLog[i]?.sets||[];
    sets.forEach((st,si)=>{
      if (!st) return;
      if (ex.unilateral) {
        if (!st.weightL&&!st.weightR&&!st.repsL&&!st.repsR) return;
        hasData=true;
        rows.push([cleanSessDate,dayLabel,ex.name,si+1,`L:${st.weightL||"0"}/R:${st.weightR||"0"}`,`L:${st.repsL||"0"}/R:${st.repsR||"0"}`,liveNote[i]||"",sessionKey,st.rpe||"",st.hit?"1":"0"]);
      } else {
        if (!st.weight&&!st.reps) return;
        hasData=true;
        rows.push([cleanSessDate,dayLabel,ex.name,si+1,st.weight||"",st.reps||"",liveNote[i]||"",sessionKey,st.rpe||"",st.hit?"1":"0"]);
      }
    });
  });

  if (!hasData) { toast("Nothing logged yet"); return; }

  const btn=document.getElementById("save-btn");
  btn.disabled=true; btn.textContent="Saving..."; setSyncStatus("saving");
  document.getElementById("session-review-box").classList.add("hidden");

  try {
    await sheetsCall({ action:"clear", sessionKey });
    await sheetsCall({ action:"write", rows:JSON.stringify(rows) });

    // Progression: compare the double-progression target computed from history
    // before vs. after this session, and feed the result back into the exercise
    // by NAME in the permanent program — even when logged via an override.
    const priorHistory = dayHistory[activeDay] || [];
    const savedMeso = getMesocycleState();
    const changes=[];
    curEx.forEach((ex,i)=>{
      if (ex.unilateral) return;
      const sets=liveLog[i]?.sets||[];
      const rowsForEx = sets
        .map((st,si)=> (st && st.weight && st.reps) ? { exercise:ex.name, set:si+1, weight:st.weight, reps:st.reps, rpe:st.rpe } : null)
        .filter(Boolean);
      if (!rowsForEx.length) return;

      const beforeTarget = computeTarget({ ...ex, _day:activeDay }, priorHistory, savedMeso);
      const afterHistory = [{ date:cleanSessDate, rows:rowsForEx }, ...priorHistory];
      const afterTarget  = computeTarget({ ...ex, _day:activeDay }, afterHistory, savedMeso);

      if (afterTarget.e1rm !== beforeTarget.e1rm) {
        changes.push({ name:ex.name, from:beforeTarget.e1rm, to:afterTarget.e1rm, dir: afterTarget.e1rm > beforeTarget.e1rm ? "up" : "dn", metric:"e1RM" });
      }

      const permanentList = exercises[activeDay];
      if (permanentList) {
        const permIdx = permanentList.findIndex(e => e.name === ex.name);
        if (permIdx !== -1) permanentList[permIdx].weight = afterTarget.weight;
      }

      // An AI "hold" only applies to the ONE session it was issued for —
      // now that it's been honored, clear it so next time progresses normally
      // (unless the next review decides to hold it again).
      if (getAiAdjustment(ex.name)) clearAiAdjustment(ex.name);
    });

    if (changes.length) {
      progHist.unshift({ date:cleanSessDate, day:dayLabel, changes });
      lsSet("il:progHist",progHist);
    }
    // Freeball is a one-off: clear its exercises after saving so it starts empty next time.
    // History still lives in the sheet keyed by exercise name, so progression carries over.
    if (activeDay===FREEBALL_DAY) exercises[FREEBALL_DAY]=[];
    lsSet("il:exercises",exercises);

    // Clear draft
    const dk=`DRAFT_${cleanSessDate}_${activeDay}`;
    await sheetsCall({ action:"clear_draft", draftKey:dk }).catch(()=>{});
    lsSet("il:draftKey",null);

    // Invalidate day history cache so next load is fresh
    delete dayHistory[activeDay];

    sessions=parseSessionRows((await sheetsCall({action:"read"})).rows);
    setSyncStatus("synced");
    liveLog={}; liveNote={};
    document.getElementById("workout-alert").classList.add("hidden");

    // Override session: offer to promote it to a permanent day before resetting.
    let extraMsg = "";
    if (overrideMode) {
      const savedOverrideEx = overrideExercises;
      overrideMode=false; overrideExercises=null;
      clearPersistedOverrideState();
      const toggle=document.getElementById("override-toggle"); if(toggle) toggle.checked=false;
      document.querySelector(".override-toggle")?.classList.remove("active");
      document.getElementById("override-hint")?.classList.add("hidden");
      if (confirm("Save this as a new permanent training day?")) {
        let name = (prompt('Name for this new day (e.g. "Day 6 — Arms"):', "") || "").trim();
        if (name) {
          if (exercises[name] || DAYS.includes(name) || customDays.includes(name)) {
            extraMsg = " — a day with that name already exists";
          } else {
            exercises[name] = JSON.parse(JSON.stringify(savedOverrideEx));
            customDays.push(name);
            lsSet("il:customDays", customDays);
            lsSet("il:exercises", exercises);
            extraMsg = ` — "${name}" added as a permanent day`;
          }
        }
      }
    }

    renderDayButtons(); renderExercises(); renderLastSession();
    toast(`Saved${changes.length?" — "+changes.filter(c=>c.dir==="up").length+" set(s) progressed":""}${extraMsg}`);

    // Fire-and-forget: doesn't block the save flow or re-enable of the button below.
    requestSessionReview(sessionKey, dayLabel, cleanSessDate);
  } catch(e) {
    setSyncStatus("error",e.message);
    toast("Save failed: "+e.message);
  }
  btn.disabled=false; btn.textContent="Save Session →";
}

// ── AI: end-of-session review ────────────────────────────────────────────────
async function requestSessionReview(sessionKey, day, date) {
  const box     = document.getElementById("session-review-box");
  const body    = document.getElementById("session-review-body");
  const applied = document.getElementById("session-review-applied");
  box.classList.remove("hidden");
  body.classList.add("loading");
  body.textContent = "Reviewing your session...";
  applied.classList.add("hidden");
  applied.innerHTML = "";
  try {
    const d = await sheetsCall({ action:"ai_review", sessionKey, day, date });
    body.classList.remove("loading");
    if (!d.ok || !d.summary) { box.classList.add("hidden"); return; }
    body.textContent = d.summary;

    // Auto-apply what the review recommends, but always show exactly what
    // changed — "auto-apply, notify me", never a silent change.
    const appliedLines = [];
    (d.adjustments || []).forEach(a => {
      if (!a || !a.exercise) return;
      setAiAdjustment(a.exercise, { holdVolume: true, note: a.note || "" });
      appliedLines.push(`⏸ Holding ${a.exercise} — ${a.note || "stabilize before progressing"}`);
    });
    if (d.deloadRecommended) {
      triggerAiDeload(d.deloadReason || "AI-recommended deload based on this session review.");
      appliedLines.push(`🔻 Deload triggered — ${d.deloadReason || "recommended by session review"}`);
    }
    if (appliedLines.length) {
      applied.innerHTML = appliedLines.map(l => `<span class="sra-item">${l}</span>`).join("");
      applied.classList.remove("hidden");
      // The exercise list was already rendered (pre-review) with the OLD
      // meso/adjustment state — refresh so the banner and targets reflect
      // what was just auto-applied, without waiting for the next navigation.
      if (day === activeDay) renderExercises();
    }
  } catch(e) {
    box.classList.add("hidden");
  }
}

// ── Exercise Repository ───────────────────────────────────────────────────────
function openRepoModal(callback) {
  repoCallback=callback; repoFilter=""; repoSearch="";
  document.getElementById("repo-search").value="";
  renderRepoFilters(); renderRepoList();
  document.getElementById("repo-modal").classList.remove("hidden");
  document.getElementById("repo-search").focus();
}
function renderRepoFilters() {
  const container=document.getElementById("repo-filters"); container.innerHTML="";
  ["All",...MUSCLE_GROUPS].forEach(g=>{
    const btn=document.createElement("button");
    btn.className="repo-filter"+((g==="All"&&!repoFilter)||g===repoFilter?" active":"");
    btn.textContent=g;
    btn.addEventListener("click",()=>{ repoFilter=g==="All"?"":g; renderRepoFilters(); renderRepoList(); });
    container.appendChild(btn);
  });
}
function renderRepoList() {
  const list=document.getElementById("repo-list"); list.innerHTML="";
  const q=repoSearch.toLowerCase();
  const filtered=EXERCISE_REPO.filter(e=>(!repoFilter||e.group===repoFilter)&&(!q||e.name.toLowerCase().includes(q)));
  if (!filtered.length) { list.innerHTML='<div style="font-size:11px;color:#333;padding:12px 0">No exercises found.</div>'; return; }
  filtered.forEach(ex=>{
    const item=document.createElement("div"); item.className="repo-item";
    item.innerHTML=`<div><div class="repo-item-name">${ex.name}${ex.unilateral?'<span class="repo-item-badge">UNI</span>':""}</div><div class="repo-item-meta">${ex.group} · ${ex.repMin}–${ex.repMax} reps${ex.weight?" · "+ex.weight+"lb":" · BW"}</div></div><div class="repo-item-add">+</div>`;
    item.addEventListener("click",()=>{ if(repoCallback)repoCallback(ex); document.getElementById("repo-modal").classList.add("hidden"); });
    list.appendChild(item);
  });
}

// ── Library Tab (browse full repo, add to current day) ────────────────────────
let libFilter="", libSearch="";
function renderLibraryTab(){
  renderLibFilters(); renderLibList();
  const search=document.getElementById("lib-search");
  if(search && !search._bound){ search._bound=true; search.addEventListener("input",e=>{ libSearch=e.target.value; renderLibList(); }); }
}
function renderLibFilters(){
  const c=document.getElementById("lib-filters"); if(!c)return; c.innerHTML="";
  ["All",...MUSCLE_GROUPS].forEach(g=>{
    const btn=document.createElement("button");
    btn.className="repo-filter"+(((g==="All"&&!libFilter)||g===libFilter)?" active":"");
    btn.textContent=g;
    btn.addEventListener("click",()=>{ libFilter=g==="All"?"":g; renderLibFilters(); renderLibList(); });
    c.appendChild(btn);
  });
}
function renderLibList(){
  const list=document.getElementById("lib-list"); if(!list)return; list.innerHTML="";
  const q=libSearch.toLowerCase();
  const filtered=EXERCISE_REPO.filter(e=>(!libFilter||e.group===libFilter)&&(!q||e.name.toLowerCase().includes(q)));
  if(!filtered.length){ list.innerHTML='<div style="font-size:11px;color:#666;padding:12px 0">No exercises found.</div>'; return; }
  filtered.forEach(ex=>{
    const item=document.createElement("div"); item.className="repo-item";
    item.innerHTML=`<div><div class="repo-item-name">${ex.name}${ex.unilateral?'<span class="repo-item-badge">UNI</span>':""}</div><div class="repo-item-meta">${ex.group} · ${ex.repMin}–${ex.repMax} reps${ex.weight?" · "+ex.weight+"lb":" · BW"}</div></div><div class="repo-item-add" title="Add to ${activeDay===FREEBALL_DAY?'Freeball':'current'} session">+</div>`;
    item.addEventListener("click",()=>{
      activeExArray().push({ name:ex.name, sets:3, reps:`${ex.repMin}–${ex.repMax}`, repMin:ex.repMin, repMax:ex.repMax, weight:ex.weight||null, unilateral:!!ex.unilateral });
      persistExercises();
      toast(`${ex.name} added to ${activeDay===FREEBALL_DAY?"Freeball":activeDay.split("—")[1]?.trim()||activeDay}${overrideMode?" (override)":""}`);
    });
    list.appendChild(item);
  });
}

// ── Swap Modal ────────────────────────────────────────────────────────────────
function openSwapModal(idx) {
  swapIdx=idx;
  const ex=activeExArray()[idx];
  document.getElementById("swap-replacing").textContent="Replacing: "+ex.name;
  document.getElementById("swap-manual-form").classList.add("hidden");
  document.getElementById("swap-modal").classList.remove("hidden");
  // source e1RM for estimation
  const srcE1RM = bestRecentE1RM(dayHistory[activeDay]||[], ex.name);
  document.getElementById("swap-from-library").onclick=()=>{
    document.getElementById("swap-modal").classList.add("hidden");
    openRepoModal(chosen=>{
      const est = estimateSwapWeight(ex.name, chosen.name, srcE1RM, chosen.repMin, chosen.repMax);
      const newWeight = chosen.weight || (est ? est.weight : activeExArray()[swapIdx].weight);
      activeExArray()[swapIdx]={...activeExArray()[swapIdx],name:chosen.name,weight:newWeight,repMin:chosen.repMin,repMax:chosen.repMax,reps:`${chosen.repMin}–${chosen.repMax}`,unilateral:chosen.unilateral};
      delete liveLog[swapIdx]; persistExercises(); renderExercises();
      toast(est && !chosen.weight ? `Swapped — est. ${est.weight}lb from your ${ex.name} e1RM` : "Exercise swapped");
    });
  };
  document.getElementById("swap-manual").onclick=()=>{
    document.getElementById("swap-name").value=ex.name;
    document.getElementById("swap-weight").value=ex.weight||"";
    document.getElementById("swap-manual-form").classList.remove("hidden");
    // live estimate as you type a known exercise name
    const nameInput=document.getElementById("swap-name");
    const weightInput=document.getElementById("swap-weight");
    let hintEl=document.getElementById("swap-est-hint");
    if(!hintEl){ hintEl=document.createElement("div"); hintEl.id="swap-est-hint"; hintEl.style.cssText="font-size:11px;color:#0a7d3c;font-weight:600;margin-top:4px"; weightInput.parentElement.appendChild(hintEl); }
    const updateHint=()=>{
      const tgt=nameInput.value.trim();
      const est=estimateSwapWeight(ex.name, tgt, srcE1RM, ex.repMin||8, ex.repMax||12);
      if(est && srcE1RM){ hintEl.textContent=`💡 Est. ${est.weight}lb (from ${ex.name} e1RM ${srcE1RM})`; hintEl.dataset.w=est.weight; }
      else { hintEl.textContent=""; delete hintEl.dataset.w; }
    };
    nameInput.oninput=updateHint; updateHint();
    hintEl.onclick=()=>{ if(hintEl.dataset.w) weightInput.value=hintEl.dataset.w; };
    hintEl.style.cursor="pointer"; hintEl.title="Tap to use this estimate";
  };
  document.getElementById("swap-confirm").onclick=()=>{
    const name=document.getElementById("swap-name").value.trim(); if(!name)return;
    const wt=parseFloat(document.getElementById("swap-weight").value);
    activeExArray()[swapIdx]={...activeExArray()[swapIdx],name,weight:isNaN(wt)?activeExArray()[swapIdx].weight:wt};
    delete liveLog[swapIdx]; persistExercises();
    document.getElementById("swap-modal").classList.add("hidden");
    renderExercises(); toast("Exercise swapped");
  };
}
document.getElementById("swap-cancel-main").addEventListener("click",()=>document.getElementById("swap-modal").classList.add("hidden"));
document.getElementById("swap-cancel").addEventListener("click",()=>document.getElementById("swap-modal").classList.add("hidden"));

// ── Reconsider Modal (AI) ────────────────────────────────────────────────────
function openReconsiderModal(idx, presetReason) {
  const ex = activeExArray()[idx];
  document.getElementById("reconsider-exname").textContent = "Reconsidering: " + ex.name;
  document.getElementById("reconsider-reason").value = presetReason || "";
  document.getElementById("reconsider-form").classList.remove("hidden");
  document.getElementById("reconsider-loading").classList.add("hidden");
  document.getElementById("reconsider-result").classList.add("hidden");
  document.getElementById("reconsider-error").classList.add("hidden");
  document.getElementById("reconsider-modal").classList.remove("hidden");

  document.getElementById("reconsider-submit").onclick = async () => {
    const reason = document.getElementById("reconsider-reason").value.trim();
    if (!reason) { toast("Say why you want to reconsider it"); return; }
    document.getElementById("reconsider-form").classList.add("hidden");
    document.getElementById("reconsider-error").classList.add("hidden");
    document.getElementById("reconsider-loading").classList.remove("hidden");
    try {
      const d = await sheetsCall({
        action: "ai_reconsider",
        exercise: ex.name, day: activeDay, group: getMuscleGroup(ex.name),
        sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax, weight: ex.weight || 0,
        reason
      });
      document.getElementById("reconsider-loading").classList.add("hidden");
      if (!d.ok || !d.suggestion) throw new Error(d.msg || "No suggestion returned");
      const s = d.suggestion;
      document.getElementById("reconsider-suggestion-name").textContent = s.substitute_exercise;
      document.getElementById("reconsider-suggestion-meta").textContent =
        `${s.sets} sets × ${s.repMin}–${s.repMax} reps @ ${s.weight}lb`;
      document.getElementById("reconsider-suggestion-rationale").textContent = s.rationale || "";
      document.getElementById("reconsider-result").classList.remove("hidden");

      document.getElementById("reconsider-accept").onclick = () => {
        const originalName = ex.name;
        activeExArray()[idx] = {
          ...activeExArray()[idx],
          name: s.substitute_exercise, sets: s.sets, repMin: s.repMin, repMax: s.repMax,
          reps: `${s.repMin}–${s.repMax}`, weight: s.weight
        };
        delete liveLog[idx];
        persistExercises();
        sheetsCall({
          action: "log_swap", date: sessDate, day: activeDay,
          exerciseOriginal: originalName, exerciseSubstituted: s.substitute_exercise,
          reason, weight: s.weight, sets: s.sets, reps: `${s.repMin}-${s.repMax}`
        }).catch(()=>{});
        document.getElementById("reconsider-modal").classList.add("hidden");
        renderExercises();
        toast(`Swapped to ${s.substitute_exercise} (AI suggestion)`);
      };
      document.getElementById("reconsider-dismiss").onclick = () => {
        document.getElementById("reconsider-modal").classList.add("hidden");
      };
    } catch(e) {
      document.getElementById("reconsider-loading").classList.add("hidden");
      document.getElementById("reconsider-error").textContent = "Couldn't get a suggestion: " + e.message;
      document.getElementById("reconsider-error").classList.remove("hidden");
      document.getElementById("reconsider-form").classList.remove("hidden");
    }
  };
}
document.getElementById("reconsider-cancel").addEventListener("click",()=>document.getElementById("reconsider-modal").classList.add("hidden"));

// ── Feeling Check Modal (AI pre-session sanity check) ────────────────────────
function openFeelingModal() {
  const curEx = activeExArray() || [];
  if (!curEx.length) { toast("No exercises to check — add some first"); return; }
  document.getElementById("feeling-note").value = "";
  document.getElementById("feeling-form").classList.remove("hidden");
  document.getElementById("feeling-loading").classList.add("hidden");
  document.getElementById("feeling-result").classList.add("hidden");
  document.getElementById("feeling-error").classList.add("hidden");
  document.getElementById("feeling-modal").classList.remove("hidden");
}
document.getElementById("feeling-check-btn").addEventListener("click", openFeelingModal);
document.getElementById("feeling-cancel").addEventListener("click",()=>document.getElementById("feeling-modal").classList.add("hidden"));
document.getElementById("feeling-dismiss").addEventListener("click",()=>document.getElementById("feeling-modal").classList.add("hidden"));

document.getElementById("feeling-submit").addEventListener("click", async () => {
  const feeling = document.getElementById("feeling-note").value.trim();
  if (!feeling) { toast("Say a bit about how you're feeling"); return; }
  const curEx = activeExArray() || [];
  document.getElementById("feeling-form").classList.add("hidden");
  document.getElementById("feeling-error").classList.add("hidden");
  document.getElementById("feeling-loading").classList.remove("hidden");
  try {
    const exercisesPayload = curEx.map(ex => ({
      name: ex.name, sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax,
      weight: ex.weight || 0, group: getMuscleGroup(ex.name)
    }));
    const d = await sheetsCall({
      action: "ai_presession_check", day: activeDay, date: sessDate,
      feeling, exercises: JSON.stringify(exercisesPayload)
    });
    document.getElementById("feeling-loading").classList.add("hidden");
    if (!d.ok || !Array.isArray(d.exercises)) throw new Error(d.msg || "No response");

    document.getElementById("feeling-note-text").textContent = d.note || (d.adjusted ? "Session adjusted." : "No changes needed.");
    const changesBox = document.getElementById("feeling-changes");
    const acceptBtn  = document.getElementById("feeling-accept");

    if (d.adjusted) {
      changesBox.innerHTML = d.exercises.map(ex => `
        <div class="feeling-change-row">
          <span class="fc-name">${ex.name}</span> — ${ex.sets} sets × ${ex.repMin}–${ex.repMax} @ ${ex.weight}lb
          ${ex.substituted_from ? `<span class="fc-sub">swapped from ${ex.substituted_from}</span>` : ""}
        </div>`).join("");
      acceptBtn.classList.remove("hidden");
      acceptBtn.onclick = () => {
        // A "today only" adjustment — route it through override mode so the
        // permanent program is never touched.
        if (!overrideMode) {
          overrideMode = true;
          const toggle = document.getElementById("override-toggle"); if (toggle) toggle.checked = true;
          document.querySelector(".override-toggle")?.classList.add("active");
          document.getElementById("override-hint")?.classList.remove("hidden");
        }
        overrideExercises = d.exercises.map(ex => {
          const original = curEx.find(o => o.name === (ex.substituted_from || ex.name)) || {};
          return {
            ...original, name: ex.name, sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax,
            reps: `${ex.repMin}–${ex.repMax}`, weight: ex.weight, unilateral: original.unilateral || false
          };
        });
        persistExercises();
        liveLog = {}; liveNote = {};
        document.getElementById("feeling-modal").classList.add("hidden");
        renderDayButtons(); renderExercises(); renderLastSession();
        toast("Session adjusted for today");
      };
    } else {
      changesBox.innerHTML = "";
      acceptBtn.classList.add("hidden");
    }
    document.getElementById("feeling-result").classList.remove("hidden");
  } catch(e) {
    document.getElementById("feeling-loading").classList.add("hidden");
    document.getElementById("feeling-error").textContent = "Couldn't check the session: " + e.message;
    document.getElementById("feeling-error").classList.remove("hidden");
    document.getElementById("feeling-form").classList.remove("hidden");
  }
});

// ── Log By Description Modal (AI) ────────────────────────────────────────────
// Parses a free-text description of a workout ALREADY DONE — any date, any
// day — into actual per-set weight/reps, then loads it into the normal
// editable session view (via mergeSetsIntoLiveLog) for review before Save.
// Never writes to the sheet directly.
function openLogDescModal() {
  document.getElementById("logdesc-date").value = sessDate;
  const daySel = document.getElementById("logdesc-day");
  daySel.innerHTML = allDays().map(d => `<option value="${d}">${d}</option>`).join("");
  daySel.value = activeDay;
  document.getElementById("logdesc-text").value = "";
  document.getElementById("logdesc-form").classList.remove("hidden");
  document.getElementById("logdesc-loading").classList.add("hidden");
  document.getElementById("logdesc-result").classList.add("hidden");
  document.getElementById("logdesc-error").classList.add("hidden");
  pendingLogDesc = null;
  document.getElementById("logdesc-modal").classList.remove("hidden");
}
document.getElementById("logdesc-open-btn").addEventListener("click", openLogDescModal);
document.getElementById("logdesc-cancel").addEventListener("click",()=>document.getElementById("logdesc-modal").classList.add("hidden"));
document.getElementById("logdesc-dismiss").addEventListener("click",()=>document.getElementById("logdesc-modal").classList.add("hidden"));

document.getElementById("logdesc-submit").addEventListener("click", async () => {
  const date = document.getElementById("logdesc-date").value;
  const day  = document.getElementById("logdesc-day").value;
  const description = document.getElementById("logdesc-text").value.trim();
  if (!date || !day || !description) { toast("Fill in date, day, and a description"); return; }
  document.getElementById("logdesc-form").classList.add("hidden");
  document.getElementById("logdesc-error").classList.add("hidden");
  document.getElementById("logdesc-loading").classList.remove("hidden");
  try {
    const dayExercises = (exercises[day]||[]).map(ex => ({ name:ex.name, repMin:ex.repMin, repMax:ex.repMax, weight:ex.weight||0 }));
    const d = await sheetsCall({
      action: "ai_log_description", day, date, description,
      exercises: JSON.stringify(dayExercises)
    });
    document.getElementById("logdesc-loading").classList.add("hidden");
    if (!d.ok || !Array.isArray(d.exercises)) throw new Error(d.msg || "Could not parse");

    pendingLogDesc = { date, day, exercises: d.exercises };
    document.getElementById("logdesc-preview").innerHTML = d.exercises.map(ex => `
      <div class="feeling-change-row">
        <span class="fc-name">${ex.name}</span> — ${ex.sets.map(s=>`${s.weight}×${s.reps}`).join(", ")}
        ${ex.note ? `<span class="fc-sub">${ex.note}</span>` : ""}
      </div>`).join("") || `<div class="feeling-change-row">Nothing extracted — try rephrasing.</div>`;

    const clarEl = document.getElementById("logdesc-clarifications");
    if (d.clarifications && d.clarifications.length) {
      clarEl.textContent = "⚠ " + d.clarifications.join(" ");
      clarEl.classList.remove("hidden");
    } else {
      clarEl.classList.add("hidden");
    }
    document.getElementById("logdesc-result").classList.remove("hidden");
  } catch(e) {
    document.getElementById("logdesc-loading").classList.add("hidden");
    document.getElementById("logdesc-error").textContent = "Couldn't parse: " + e.message;
    document.getElementById("logdesc-error").classList.remove("hidden");
    document.getElementById("logdesc-form").classList.remove("hidden");
  }
});

document.getElementById("logdesc-load").addEventListener("click", () => {
  if (!pendingLogDesc || !pendingLogDesc.exercises.length) { toast("Nothing to load"); return; }
  sessDate = pendingLogDesc.date;
  document.getElementById("session-date").value = pendingLogDesc.date;
  activeDay = pendingLogDesc.day;
  overrideMode = false; overrideExercises = null;
  clearPersistedOverrideState();
  const toggle=document.getElementById("override-toggle"); if(toggle) toggle.checked=false;
  document.querySelector(".override-toggle")?.classList.remove("active");
  document.getElementById("override-hint")?.classList.add("hidden");

  mergeSetsIntoLiveLog(pendingLogDesc.exercises.map(ex => ({ name:ex.name, sets:ex.sets, notes:ex.note })));

  document.getElementById("logdesc-modal").classList.add("hidden");
  renderDayButtons(); renderExercises(); renderLastSession();
  toast(`Loaded ${pendingLogDesc.date} — review and Save Session when ready`);
  pendingLogDesc = null;
});

// ── Calendar ──────────────────────────────────────────────────────────────────
function renderCalendar() {
  const tk=todayStr();
  document.getElementById("cal-month-label").textContent=`${MONTHS[calMonth]} ${calYear}`;
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const firstDow=new Date(calYear,calMonth,1).getDay();
  const sessionDates=new Set(Object.values(sessions).map(s=>s.date));
  const grid=document.getElementById("cal-grid"); grid.innerHTML="";
  for(let i=0;i<firstDow;i++)grid.appendChild(document.createElement("div"));
  for(let d=1;d<=daysInMonth;d++){
    const dk=dKey(calYear,calMonth,d);
    const cell=document.createElement("div"); cell.className="cal-cell";
    if(dk===tk)cell.classList.add("today");
    if(sessionDates.has(dk))cell.classList.add("has-session");
    if(dk===selDate)cell.classList.add("selected");
    cell.textContent=d;
    if(sessionDates.has(dk)&&dk!==selDate){const dot=document.createElement("div");dot.className="cal-dot";cell.appendChild(dot);}
    cell.addEventListener("click",()=>{selDate=selDate===dk?null:dk;renderCalendar();renderCalDetail();});
    grid.appendChild(cell);
  }
}
function renderCalDetail() {
  const detail=document.getElementById("cal-detail");
  if(!selDate){detail.classList.add("hidden");return;}
  const ds=Object.entries(sessions).filter(([,s])=>s.date===selDate);
  detail.classList.remove("hidden");
  detail.innerHTML=`<div class="cal-detail-date">${selDate}</div>`;
  if(!ds.length){detail.innerHTML+='<div class="cal-empty">No session logged.</div>';return;}
  ds.forEach(([key,sess])=>{
    const div=document.createElement("div"); div.className="cal-session";
    div.innerHTML=`<div class="cal-session-day">${sess.day}</div><pre class="cal-session-body">${formatSession(sess)}</pre><button class="btn-ghost btn-delete-session" data-key="${key}">Delete</button>`;
    detail.appendChild(div);
  });
  detail.querySelectorAll(".btn-delete-session").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      setSyncStatus("saving");
      try {
        await sheetsCall({action:"clear",sessionKey:btn.dataset.key});
        sessions=parseSessionRows((await sheetsCall({action:"read"})).rows);
        setSyncStatus("synced"); selDate=null; renderCalendar(); renderCalDetail(); toast("Session deleted");
      } catch(e){setSyncStatus("error",e.message);}
    });
  });
}

// ── Progress Tab ──────────────────────────────────────────────────────────────
function renderProgress() {
  // Exercise picker for e1RM chart
  const allExNames=[...new Set(allProgramDays().flatMap(d=>(exercises[d]||[]).map(e=>e.name)))];
  if(!selectedE1RMEx&&allExNames.length) selectedE1RMEx=allExNames[0];

  const picker=document.getElementById("e1rm-exercise-picker"); picker.innerHTML="";
  allExNames.slice(0,12).forEach(name=>{
    const btn=document.createElement("button");
    btn.className="e1rm-ex-btn"+(name===selectedE1RMEx?" active":"");
    btn.textContent=name.split(" ").slice(0,2).join(" ");
    btn.title=name;
    btn.addEventListener("click",()=>{ selectedE1RMEx=name; renderProgress(); });
    picker.appendChild(btn);
  });

  // Build e1RM chart for selected exercise
  const e1rmData=[];
  Object.values(sessions).sort((a,b)=>a.date.localeCompare(b.date)).forEach(sess=>{
    const exSets=sess.exercises[selectedE1RMEx];
    if(!exSets) return;
    const maxE1RM=Math.max(...exSets.map(s=>calcE1RM(parseFloat(s.weight)||0,parseFloat(s.reps)||0)));
    if(maxE1RM>0) e1rmData.push({date:sess.date,e1rm:maxE1RM});
  });

  const canvas=document.getElementById("e1rm-chart");
  if(e1rmChart){e1rmChart.destroy();e1rmChart=null;}
  if(e1rmData.length>0){
    e1rmChart=new Chart(canvas,{
      type:"line",
      data:{ labels:e1rmData.map(d=>d.date), datasets:[{data:e1rmData.map(d=>d.e1rm),borderColor:"#c8a96e",backgroundColor:"rgba(200,169,110,.08)",borderWidth:2,pointRadius:4,pointBackgroundColor:"#c8a96e",tension:.3,fill:true}]},
      options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{ x:{ticks:{color:"#555",font:{family:"DM Mono",size:9},maxTicksLimit:8},grid:{color:"#1a1a1a"}}, y:{ticks:{color:"#555",font:{family:"DM Mono",size:9}},grid:{color:"#1a1a1a"},title:{display:true,text:"e1RM (lb)",color:"#555",font:{family:"DM Mono",size:9}}} } }
    });
  }

  // Progression history
  const histEl=document.getElementById("prog-history");
  histEl.innerHTML=!progHist.length
    ? '<div class="prog-empty">No changes yet.</div>'
    : progHist.map(entry=>`
      <div class="prog-entry">
        <div class="prog-entry-header"><span class="prog-date">${entry.date}</span><span class="prog-day">${entry.day}</span></div>
        ${entry.changes.map(c=>`<div class="prog-change"><span class="prog-arrow ${c.dir}">${c.dir==="up"?"↑":"↓"}</span><span class="prog-exname">${c.name}</span><span class="prog-weights"><span class="prog-from">${typeof c.from==="number"?c.from.toFixed(1):c.from}</span><span class="prog-sep">→</span><span class="${c.dir==="up"?"prog-to-up":"prog-to-dn"}">${typeof c.to==="number"?c.to.toFixed(1):c.to}${c.metric==="e1RM"?" e1RM":""}</span></span></div>`).join("")}
      </div>`).join("");

  // Current weights
  document.getElementById("current-weights").innerHTML=allProgramDays().map(dk=>`
    <div class="weights-day">
      <div class="weights-day-title">${dk}</div>
      ${(exercises[dk]||[]).map(ex=>`<div class="weights-row"><span>${ex.name}</span><span>${ex.weight?ex.weight+"lb":"BW"}</span></div>`).join("")}
    </div>`).join("");
}

// ── Volume Tab ────────────────────────────────────────────────────────────────
async function renderVolumeTab() {
  const today=new Date();
  today.setDate(today.getDate()+(volWeekOffset*7));
  const weekStart=new Date(today); weekStart.setDate(today.getDate()-today.getDay());
  const weekEnd=new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const fromDate=fmt(weekStart), toDate=fmt(weekEnd);

  document.getElementById("vol-week-label").textContent=
    `${MONTHS[weekStart.getMonth()].slice(0,3)} ${weekStart.getDate()} – ${MONTHS[weekEnd.getMonth()].slice(0,3)} ${weekEnd.getDate()}`;

  setSyncStatus("saving");
  let weekRows=[];
  try {
    const d=await sheetsCall({action:"read_week",from:fromDate,to:toDate});
    weekRows=d.rows||[];
    setSyncStatus("synced");
  } catch(e) { setSyncStatus("error",e.message); }

  // Count sets per muscle group — split into HARD sets (RPE≥7 or unmarked working
  // sets) vs total. Hard sets are what drive hypertrophy; junk sets (RPE≤6) don't.
  const muscleHard={}, muscleTotal={};
  Object.keys(MUSCLE_GROUPS_MAP).forEach(g=>{muscleHard[g]=0;muscleTotal[g]=0;});
  // RPE distribution across all logged sets this week
  const rpeDist={ "≤6":0, "7":0, "7.5":0, "8":0, "8.5":0, "9":0, "9.5":0, "10":0 };
  let rpeLogged=0, rpeTotal=0;
  for(let i=1;i<weekRows.length;i++){
    const row=weekRows[i];
    const exName=row[2];
    const weight=row[4], reps=row[5];
    const rpe=row[8];               // 9th column
    // Skip junk rows — abandoned/mis-logged sets don't count as volume.
    if(!isWorkingSet(weight, reps)) continue;
    const group=getMuscleGroup(exName);
    if(muscleTotal[group]!==undefined){
      muscleTotal[group]++;
      const rpeVal=parseFloat(rpe);
      // A set counts as "hard" if RPE≥7, OR if no RPE was logged (assume it was a
      // real working set — you don't log warmups here).
      const isHard = isNaN(rpeVal) ? true : rpeVal>=HARD_SET_RPE;
      if(isHard) muscleHard[group]++;
      // distribution
      rpeTotal++;
      if(!isNaN(rpeVal)){
        rpeLogged++;
        if(rpeVal<=6) rpeDist["≤6"]++;
        else if(rpeVal<7.5) rpeDist["7"]++;
        else if(rpeVal<8) rpeDist["7.5"]++;
        else if(rpeVal<8.5) rpeDist["8"]++;
        else if(rpeVal<9) rpeDist["8.5"]++;
        else if(rpeVal<9.5) rpeDist["9"]++;
        else if(rpeVal<10) rpeDist["9.5"]++;
        else rpeDist["10"]++;
      }
    }
  }

  // Volume bars — hard sets vs per-muscle MEV/MRV landmarks
  const barsEl=document.getElementById("volume-bars"); barsEl.innerHTML="";
  Object.entries(muscleHard).sort((a,b)=>b[1]-a[1]).forEach(([group,hard])=>{
    if(group==="Other" && muscleTotal[group]===0) return;
    const {mev,mrv}=getLandmarks(group);
    const total=muscleTotal[group];
    const status=hard<mev?"under":hard>mrv?"over":"ok";
    const pct=Math.min((hard/mrv)*100,100);
    // MEV marker position on the track
    const mevPct=Math.min((mev/mrv)*100,100);
    const junkNote = total>hard ? ` <span style="color:#666">(${total-hard} junk)</span>` : "";
    const div=document.createElement("div"); div.className="vol-bar-row";
    div.innerHTML=`<div class="vol-bar-label"><span class="vol-bar-name">${group}</span><span class="vol-bar-count ${status}">${hard} hard${junkNote}</span></div><div class="vol-bar-track"><div class="vol-bar-mev" style="left:${mevPct}%" title="MEV ${mev}"></div><div class="vol-bar-fill ${status}" style="width:${pct}%"></div></div><div class="vol-bar-range">MEV ${mev} · MRV ${mrv}</div>`;
    div.querySelector(".vol-bar-name").style.cursor="pointer";
    div.querySelector(".vol-bar-name").addEventListener("click",()=>editLandmark(group));
    barsEl.appendChild(div);
  });

  // RPE distribution summary — how much of your volume lands in the 7–9 sweet spot
  renderRpeDistribution(rpeDist, rpeLogged, rpeTotal);

  // Session volume load chart (all sessions)
  const volData=Object.values(sessions).sort((a,b)=>a.date.localeCompare(b.date)).map(sess=>{
    let total=0;
    Object.values(sess.exercises).forEach(sets=>{
      sets.forEach(s=>{
        const w=parseFloat(s.weight)||0, r=parseFloat(s.reps)||0;
        if(w>0 && r>0) total+=w*r;
      });
    });
    return {date:sess.date, vol:total};
  });

  const vc=document.getElementById("vol-chart");
  if(volChart){volChart.destroy();volChart=null;}
  if(volData.length>0){
    volChart=new Chart(vc,{
      type:"bar",
      data:{ labels:volData.map(d=>d.date), datasets:[{data:volData.map(d=>d.vol),backgroundColor:"rgba(200,169,110,.4)",borderColor:"#c8a96e",borderWidth:1}]},
      options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{ x:{ticks:{color:"#555",font:{family:"DM Mono",size:9},maxTicksLimit:8},grid:{color:"#1a1a1a"}}, y:{ticks:{color:"#555",font:{family:"DM Mono",size:9}},grid:{color:"#1a1a1a"},title:{display:true,text:"Volume Load (lb)",color:"#555",font:{family:"DM Mono",size:9}}} } }
    });
  }
}

// ── Volume helpers ────────────────────────────────────────────────────────────
function editLandmark(group){
  const cur=getLandmarks(group);
  const mev=prompt(`${group} — weekly MEV (minimum hard sets):`, cur.mev);
  if(mev===null) return;
  const mrv=prompt(`${group} — weekly MRV (maximum hard sets):`, cur.mrv);
  if(mrv===null) return;
  const mevN=parseInt(mev), mrvN=parseInt(mrv);
  if(isNaN(mevN)||isNaN(mrvN)||mrvN<=mevN){ toast("MRV must be greater than MEV"); return; }
  setLandmark(group, mevN, mrvN);
  toast(`${group}: MEV ${mevN} · MRV ${mrvN}`);
  renderVolumeTab();
}

function renderRpeDistribution(dist, logged, total){
  const el=document.getElementById("rpe-distribution");
  if(!el) return;
  if(!logged){
    el.innerHTML=`<div class="rpe-dist-empty">No RPE logged this week. Log RPE per set to see effort distribution and hard-set accuracy.</div>`;
    return;
  }
  const sweet = (dist["7"]+dist["7.5"]+dist["8"]+dist["8.5"]+dist["9"]);
  const junk  = dist["≤6"];
  const grind = dist["9.5"]+dist["10"];
  const sweetPct=Math.round(sweet/logged*100);
  const max=Math.max(...Object.values(dist),1);
  const bars=Object.entries(dist).map(([k,v])=>{
    const h=Math.round(v/max*60)+2;
    const zone = k==="≤6"?"junk":(k==="9.5"||k==="10")?"grind":"sweet";
    return `<div class="rpe-col"><div class="rpe-bar ${zone}" style="height:${h}px" title="${v} sets @ RPE ${k}"></div><div class="rpe-x">${k}</div></div>`;
  }).join("");
  let verdict, vclass;
  if(sweetPct>=70){ verdict=`${sweetPct}% in the 7–9 sweet spot — dialed in.`; vclass="ok"; }
  else if(junk> sweet){ verdict=`Too many easy sets (${junk} at RPE≤6). Push closer to failure.`; vclass="under"; }
  else if(grind>=logged*0.4){ verdict=`Lots of RPE 9.5–10 (${grind} sets) — watch fatigue/recovery.`; vclass="over"; }
  else { verdict=`${sweetPct}% in the 7–9 sweet spot. Aim for ~70%+.`; vclass=""; }
  el.innerHTML=`
    <div class="rpe-dist-title">EFFORT DISTRIBUTION <span style="color:#555">· ${logged}/${total} sets rated</span></div>
    <div class="rpe-chart">${bars}</div>
    <div class="rpe-verdict ${vclass}">${verdict}</div>`;
}

// ── Bodyweight Tab ────────────────────────────────────────────────────────────
function renderBodyweight() {
  const canvas=document.getElementById("bw-chart");
  if(bwData.length>0){
    bwChart=new Chart(canvas,{
      type:"line",
      data:{ labels:bwData.map(d=>d.date), datasets:[{data:bwData.map(d=>d.weight),borderColor:"#c8a96e",backgroundColor:"rgba(200,169,110,.08)",borderWidth:2,pointRadius:3,pointBackgroundColor:"#c8a96e",tension:.3,fill:true}]},
      options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{ x:{ticks:{color:"#555",font:{family:"DM Mono",size:9},maxTicksLimit:8},grid:{color:"#1a1a1a"}}, y:{ticks:{color:"#555",font:{family:"DM Mono",size:9}},grid:{color:"#1a1a1a"}} } }
    });
  }
  const el=document.getElementById("bw-history");
  if(!bwData.length){el.innerHTML='<div class="bw-empty">No entries yet.</div>';return;}
  el.innerHTML=[...bwData].reverse().map(e=>`<div class="bw-row"><span class="bw-row-date">${e.date}</span><span class="bw-row-weight">${e.weight} lb</span><button class="bw-row-del" data-date="${e.date}">✕</button></div>`).join("");
  el.querySelectorAll(".bw-row-del").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      setSyncStatus("saving");
      try {
        await sheetsCall({action:"delete_bodyweight",date:btn.dataset.date});
        const d=await sheetsCall({action:"read_bodyweight"});
        bwData=[];
        for(let i=1;i<d.rows.length;i++){const[rd,w]=d.rows[i];if(!rd)continue;bwData.push({date:cleanDate(rd),weight:parseFloat(w)});}
        bwData.sort((a,b)=>a.date.localeCompare(b.date));
        setSyncStatus("synced"); renderBodyweight(); toast("Entry deleted");
      } catch(e){setSyncStatus("error",e.message);}
    });
  });
}

async function saveBw() {
  const date=document.getElementById("bw-date").value.slice(0,10);
  const weight=parseFloat(document.getElementById("bw-weight").value);
  if(!date||isNaN(weight)){toast("Enter a valid date and weight");return;}
  setSyncStatus("saving");
  try {
    await sheetsCall({action:"delete_bodyweight",date});
    await sheetsCall({action:"write_bodyweight",date,weight:String(weight)});
    const d=await sheetsCall({action:"read_bodyweight"});
    bwData=[];
    for(let i=1;i<d.rows.length;i++){const[rd,w]=d.rows[i];if(!rd)continue;bwData.push({date:cleanDate(rd),weight:parseFloat(w)});}
    bwData.sort((a,b)=>a.date.localeCompare(b.date));
    setSyncStatus("synced");
    document.getElementById("bw-weight").value="";
    renderBodyweight(); toast("Weight logged");
  } catch(e){setSyncStatus("error",e.message);toast("Save failed: "+e.message);}
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===tab));
  document.querySelectorAll(".tab-content").forEach(c=>{
    const a=c.id==="tab-"+tab; c.classList.toggle("active",a); c.classList.toggle("hidden",!a);
  });
  if(tab==="calendar"){renderCalendar();renderCalDetail();}
  if(tab==="progress") renderProgress();
  if(tab==="volume")   renderVolumeTab();
  if(tab==="bodyweight") renderBodyweight();
  if(tab==="library")    renderLibraryTab();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const savedEx=lsGet("il:exercises",null); if(savedEx)exercises=savedEx;
  if(!exercises[FREEBALL_DAY]) exercises[FREEBALL_DAY]=[];
  const savedPh=lsGet("il:progHist",null);  if(savedPh)progHist=savedPh;

  // Restore an in-progress override session (if the app was closed before
  // saving) so draft restoration below can resolve exercise names correctly —
  // otherwise it'd look them up in the permanent program and silently drop them.
  const savedOverride = lsGet("il:overrideState", null);
  if (savedOverride && savedOverride.mode) {
    activeDay = savedOverride.day || activeDay;
    overrideMode = true;
    overrideExercises = savedOverride.exercises || [];
    document.getElementById("override-toggle").checked = true;
    document.querySelector(".override-toggle")?.classList.add("active");
    document.getElementById("override-hint")?.classList.remove("hidden");
  }

  document.getElementById("session-date").value=sessDate;
  document.getElementById("bw-date").value=sessDate;
  document.getElementById("session-date").addEventListener("change",e=>{sessDate=e.target.value;renderLastSession();});

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.tab)));

  document.getElementById("cal-prev").addEventListener("click",()=>{if(calMonth===0){calMonth=11;calYear--;}else calMonth--;renderCalendar();});
  document.getElementById("cal-next").addEventListener("click",()=>{if(calMonth===11){calMonth=0;calYear++;}else calMonth++;renderCalendar();});
  document.getElementById("vol-prev").addEventListener("click",()=>{volWeekOffset--;renderVolumeTab();});
  document.getElementById("vol-next").addEventListener("click",()=>{volWeekOffset++;renderVolumeTab();});

  document.getElementById("save-btn").addEventListener("click",saveSession);
  document.getElementById("bw-save").addEventListener("click",saveBw);
  document.getElementById("override-toggle").addEventListener("change",e=>{
    overrideMode = e.target.checked;
    overrideExercises = overrideMode ? JSON.parse(JSON.stringify(exercises[activeDay]||[])) : null;
    document.querySelector(".override-toggle").classList.toggle("active", overrideMode);
    document.getElementById("override-hint").classList.toggle("hidden", !overrideMode);
    if (overrideMode) persistExercises(); else clearPersistedOverrideState();
    renderExercises();
  });
  document.getElementById("repo-close").addEventListener("click",()=>document.getElementById("repo-modal").classList.add("hidden"));
  document.getElementById("repo-search").addEventListener("input",e=>{repoSearch=e.target.value;renderRepoList();});

  setSyncStatus("loading");
  try {
    const [sessResult,bwResult]=await Promise.all([
      sheetsCall({action:"read"}),
      sheetsCall({action:"read_bodyweight"}),
    ]);
    sessions=parseSessionRows(sessResult.rows);
    bwData=[];
    for(let i=1;i<bwResult.rows.length;i++){const[rd,w]=bwResult.rows[i];if(!rd)continue;bwData.push({date:cleanDate(rd),weight:parseFloat(w)});}
    bwData.sort((a,b)=>a.date.localeCompare(b.date));
    setSyncStatus("synced");
  } catch(e) {
    setSyncStatus("error",e.message);
    toast("Could not connect to Google Sheets");
  }

  await checkForDraft();
  renderDayButtons();
  await renderExercises();
  renderLastSession();

  document.getElementById("loading").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

init();
