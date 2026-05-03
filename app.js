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
const MEV_SETS            = 10;   // minimum effective volume per muscle/week
const MRV_SETS            = 20;   // maximum recoverable volume per muscle/week

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

// ── Science Functions ─────────────────────────────────────────────────────────

// Epley formula: e1RM = weight × (1 + reps/30)
function calcE1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  return Math.round(parseFloat(weight) * (1 + parseFloat(reps) / 30) * 10) / 10;
}

// Volume load: sets × reps × weight
function calcVolumeLoad(sets) {
  return sets.reduce((sum, s) => {
    const w = parseFloat(s.weight) || 0;
    const r = parseFloat(s.reps) || 0;
    return sum + (w * r);
  }, 0);
}

// Given target reps + current weight, compute smart target for next set
// Returns { weight, reps, reason }
function computeTarget(ex, setIndex, history) {
  // history = array of past sessions, each { sets: [{weight, reps}] }
  // Find last logged value for this set index
  let lastWeight = ex.weight || 0;
  let lastReps   = ex.repMax;

  for (const sess of history) {
    const s = sess.sets && sess.sets[setIndex];
    if (s && s.weight && s.reps) {
      lastWeight = parseFloat(s.weight);
      lastReps   = parseFloat(s.reps);
      break;
    }
  }

  const lastE1RM = calcE1RM(lastWeight, lastReps);

  // If last session hit top of range, suggest weight bump
  const bump = LOWER_DAYS.some(d => d === ex._day) ? 10 : 5;
  if (lastReps >= ex.repMax) {
    return { weight: lastWeight + bump, reps: ex.repMin, e1rm: calcE1RM(lastWeight + bump, ex.repMin), reason: "progress" };
  }
  // Otherwise target same weight, aim for one more rep
  const targetReps = Math.min(lastReps + 1, ex.repMax);
  return { weight: lastWeight, reps: targetReps, e1rm: calcE1RM(lastWeight, targetReps), reason: "maintain" };
}

// Analyse set history for stagnation and decline per set index
// Returns { status: 'stagnant'|'declining'|'progressing'|'new', streak }
function analyseSetHistory(setHistory) {
  // setHistory = [{weight, reps}] newest first
  if (setHistory.length < 2) return { status: "new", streak: 0 };

  const e1rms = setHistory.map(s => calcE1RM(parseFloat(s.weight)||0, parseFloat(s.reps)||0));

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
    const [rawDate,day,exercise,set,weight,reps,notes,sessionKey] = rows[i];
    if (!sessionKey || !rawDate) continue;
    const date = cleanDate(rawDate);
    if (!result[sessionKey]) result[sessionKey] = { date, day, exercises:{} };
    if (!result[sessionKey].exercises[exercise]) result[sessionKey].exercises[exercise] = [];
    result[sessionKey].exercises[exercise].push({ set, weight, reps, notes });
  }
  return result;
}

function parseDraftRows(rows) {
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const [rawDate,day,exercise,set,weight,reps,notes,draftKey] = rows[i];
    if (!draftKey || !rawDate) continue;
    const date = cleanDate(rawDate);
    if (!result[draftKey]) result[draftKey] = { date, day, sets:[] };
    result[draftKey].sets.push({ exercise, set:parseInt(set), weight, reps, notes });
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

// ── Load day history ──────────────────────────────────────────────────────────
async function loadDayHistory(day) {
  if (dayHistory[day]) return dayHistory[day];
  try {
    const d = await sheetsCall({ action:"read_day_history", day, limit:"10" });
    dayHistory[day] = d.sessions || [];
    return dayHistory[day];
  } catch { return []; }
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
  const curEx = exercises[activeDay]||[];
  const dk = `DRAFT_${sessDate}_${activeDay}`;
  const rows = [];
  curEx.forEach((ex,i) => {
    (liveLog[i]?.sets||[]).forEach((st,si) => {
      if (!st) return;
      rows.push([sessDate,activeDay,ex.name,si+1,
        ex.unilateral ? `L:${st.weightL||""}` : (st.weight||""),
        ex.unilateral ? `L:${st.repsL||""}/R:${st.repsR||""}` : (st.reps||""),
        liveNote[i]||"", dk
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

function showDraftBanner(draft, key) {
  const banner = document.getElementById("draft-banner");
  document.getElementById("draft-banner-text").textContent =
    `Unfinished ${draft.day.split("—")[1]?.trim()} from ${draft.date} — continue?`;
  banner.classList.remove("hidden");
  document.getElementById("draft-continue").onclick = () => {
    activeDay = draft.day; sessDate = draft.date;
    document.getElementById("session-date").value = draft.date;
    liveLog = {}; liveNote = {};
    draft.sets.forEach(s => {
      const exIdx = (exercises[activeDay]||[]).findIndex(e => e.name === s.exercise);
      if (exIdx === -1) return;
      if (!liveLog[exIdx]) liveLog[exIdx] = { sets:[] };
      const si = s.set - 1;
      liveLog[exIdx].sets[si] = { weight:s.weight, reps:s.reps };
    });
    renderDayButtons(); renderExercises(); renderLastSession();
    banner.classList.add("hidden"); toast("Draft restored");
  };
  document.getElementById("draft-discard").onclick = async () => {
    try { await sheetsCall({ action:"clear_draft", draftKey:key }); } catch {}
    lsSet("il:draftKey", null);
    banner.classList.add("hidden");
  };
}

// ── Render exercises ──────────────────────────────────────────────────────────
async function renderExercises() {
  const curEx = exercises[activeDay]||[];
  document.getElementById("active-day-label").textContent = activeDay;
  const container = document.getElementById("exercises-list");
  container.innerHTML = '<div style="font-size:10px;color:#444;padding:8px 0">Loading history...</div>';

  // Load history for this day
  const history = await loadDayHistory(activeDay);

  container.innerHTML = "";
  if (!curEx.length) {
    container.innerHTML = '<div style="font-size:12px;color:#333;padding:16px 0">No exercises. Swap or add from library.</div>';
    return;
  }

  // Check if first exercise is compound and struggling
  let workoutAlertShown = false;

  curEx.forEach((ex, i) => {
    ex._day = activeDay;
    const card = document.createElement("div");
    card.className = "exercise-card";
    card.dataset.idx = i;

    const isCompound = ex.repMax <= 10;
    const isFirstCompound = i === 0 && isCompound;

    // Build per-set targets and analysis
    const setTargets = [];
    const setStatuses = [];
    for (let si = 0; si < ex.sets; si++) {
      const setHist = getSetHistory(history, ex.name, si);
      const target = computeTarget({ ...ex, _day: activeDay }, si, history.map(h => ({
        sets: (h.rows||[]).filter(r => r.exercise === ex.name).map(r => ({ weight:r.weight, reps:r.reps }))
      })));
      const analysis = analyseSetHistory(setHist);
      setTargets.push(target);
      setStatuses.push(analysis);
    }

    // Overall exercise status (worst set status)
    const statusPriority = { declining:4, stagnant:3, pr:2, progressing:1, new:0 };
    const worstStatus = setStatuses.reduce((w,s) => statusPriority[s.status] > statusPriority[w.status] ? s : w, setStatuses[0]||{status:"new"});

    if (worstStatus.status === "stagnant") card.classList.add("stagnant");
    if (worstStatus.status === "declining") card.classList.add("declining");

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
          <div class="set-target">Target: <span class="target-val">${target.weight}lb × ${target.reps}</span></div>
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
        const e1rmNow = curW && curR ? calcE1RM(parseFloat(curW), parseFloat(curR)) : 0;
        setsHTML += `<div class="set-row" style="margin-bottom:6px">
          <div class="set-num">S${si+1}</div>
          <div class="set-target">→ <span class="target-val">${target.weight}lb × ${target.reps}</span></div>
          <input type="number" class="set-w" data-ex="${i}" data-set="${si}" placeholder="lb" value="${curW}" />
          <input type="number" class="set-r" data-ex="${i}" data-set="${si}" placeholder="reps" value="${curR}" />
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
          <button class="btn-icon btn-swap" data-idx="${i}">⇄</button>
          <button class="btn-icon btn-del" data-idx="${i}">✕</button>
        </div>
      </div>
      <div class="set-controls">
        <button class="btn-set-rm" data-idx="${i}">−</button>
        <span class="set-count-label">${ex.sets} sets</span>
        <button class="btn-set-add" data-idx="${i}">+</button>
      </div>
      <div class="sets-container">${setsHTML}</div>
      <div class="notes-row">
        <div class="notes-label">Notes</div>
        <input type="text" class="notes-input" data-ex="${i}" placeholder="form cues, how it felt..." value="${liveNote[i]||""}" />
      </div>
    `;
    container.appendChild(card);
  });

  bindExerciseInputs(container, curEx);
}

function checkFirstSetStruggle(exIdx, setIdx) {
  if (setIdx !== 0) return;
  const ex = (exercises[activeDay]||[])[exIdx];
  if (!ex || ex.unilateral) return;
  const st = liveLog[exIdx]?.sets?.[0];
  if (!st?.reps) return;

  const actual = parseFloat(st.reps);
  const threshold = ex.repMin * (1 - STRUGGLE_THRESHOLD);
  if (actual > threshold) return;

  // Struggling on set 1
  const suggestedWeight = roundToNearest(ex.weight * (1 - WEIGHT_DROP_PCT), 2.5);
  const isFirstCompound = exIdx === 0 && ex.repMax <= 10;

  // Show exercise-level alert
  const card = document.querySelector(`.exercise-card[data-idx="${exIdx}"]`);
  if (card) {
    let alertEl = card.querySelector(".ex-alert.struggle");
    if (!alertEl) {
      alertEl = document.createElement("div");
      alertEl.className = "ex-alert struggle";
      card.querySelector(".sets-container").before(alertEl);
    }
    alertEl.textContent = `⚠ Set 1 below threshold — drop to ${suggestedWeight}lb for remaining sets, adding 1 set at ${suggestedWeight}lb`;

    // Auto-add a set if repMax <= 10 (compound)
    if (ex.repMax <= 10 && ex.sets < 6) {
      exercises[activeDay][exIdx].sets++;
      lsSet("il:exercises", exercises);
      // Pre-fill new set with reduced weight
      const si = exercises[activeDay][exIdx].sets - 1;
      if (!liveLog[exIdx]) liveLog[exIdx] = { sets:[] };
      liveLog[exIdx].sets[si] = { weight: String(suggestedWeight), reps:"" };
      renderExercises();
    }
  }

  // Full workout flag on first compound
  if (isFirstCompound) {
    const alertEl = document.getElementById("workout-alert");
    alertEl.className = "workout-alert warning";
    alertEl.textContent = `⚠ First compound set significantly below target — consider reducing all working weights 12–15% today and treating this as a recovery session.`;
    alertEl.classList.remove("hidden");
  }
}

function bindExerciseInputs(container, curEx) {
  // Standard inputs
  container.querySelectorAll(".set-w,.set-r").forEach(inp => {
    inp.addEventListener("input", e => {
      const i=parseInt(e.target.dataset.ex), si=parseInt(e.target.dataset.set);
      const field=e.target.classList.contains("set-w")?"weight":"reps";
      if (!liveLog[i]) liveLog[i]={sets:[]};
      if (!liveLog[i].sets[si]) liveLog[i].sets[si]={};
      liveLog[i].sets[si][field]=e.target.value;
      // Update e1RM display
      const row = e.target.closest(".set-row");
      const st = liveLog[i].sets[si];
      if (st.weight && st.reps) {
        const e1rm = calcE1RM(parseFloat(st.weight), parseFloat(st.reps));
        let e1rmEl = row.querySelector(".e1rm-display");
        if (!e1rmEl) { e1rmEl=document.createElement("span"); e1rmEl.className="e1rm-display"; row.appendChild(e1rmEl); }
        e1rmEl.innerHTML = `e1RM:<span class="e1rm-val">${e1rm}</span>`;
      }
      checkFirstSetStruggle(i, si);
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
      const target = computeTarget({...curEx[i],_day:activeDay}, si, []);
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
      exercises[activeDay][i].sets++;
      lsSet("il:exercises",exercises); renderExercises();
    });
  });
  container.querySelectorAll(".btn-set-rm").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx);
      if (exercises[activeDay][i].sets<=1) return;
      exercises[activeDay][i].sets--;
      lsSet("il:exercises",exercises); renderExercises();
    });
  });

  // Reorder
  container.querySelectorAll(".btn-up").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx); if(i===0)return;
      const arr=exercises[activeDay]; [arr[i-1],arr[i]]=[arr[i],arr[i-1]];
      const ll=liveLog[i],lp=liveLog[i-1]; liveLog[i-1]=ll; liveLog[i]=lp;
      lsSet("il:exercises",exercises); renderExercises();
    });
  });
  container.querySelectorAll(".btn-dn").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx); const arr=exercises[activeDay];
      if(i>=arr.length-1)return; [arr[i+1],arr[i]]=[arr[i],arr[i+1]];
      const ll=liveLog[i],lp=liveLog[i+1]; liveLog[i+1]=ll; liveLog[i]=lp;
      lsSet("il:exercises",exercises); renderExercises();
    });
  });

  // Swap/delete
  container.querySelectorAll(".btn-swap").forEach(btn => btn.addEventListener("click",e=>openSwapModal(parseInt(e.target.dataset.idx))));
  container.querySelectorAll(".btn-del").forEach(btn => {
    btn.addEventListener("click", e => {
      const i=parseInt(e.target.dataset.idx);
      exercises[activeDay]=exercises[activeDay].filter((_,j)=>j!==i);
      delete liveLog[i]; delete liveNote[i];
      lsSet("il:exercises",exercises); renderExercises();
    });
  });
}

// ── Last session ──────────────────────────────────────────────────────────────
function renderLastSession() {
  const prev = Object.values(sessions)
    .filter(s=>s.day===activeDay&&s.date!==sessDate)
    .sort((a,b)=>b.date.localeCompare(a.date))[0];
  const box=document.getElementById("last-session-box"), none=document.getElementById("no-last-session");
  if (prev) {
    box.classList.remove("hidden"); none.classList.add("hidden");
    document.getElementById("last-session-title").textContent =
      `LAST ${activeDay.split("—")[1]?.trim().toUpperCase()} — ${prev.date}`;
    document.getElementById("last-session-body").textContent = formatSession(prev);
  } else {
    box.classList.add("hidden"); none.classList.remove("hidden");
    none.textContent = `No previous ${activeDay.split("—")[1]?.trim()} session on record.`;
  }
}

// ── Day buttons ───────────────────────────────────────────────────────────────
function renderDayButtons() {
  const container = document.getElementById("day-buttons");
  container.innerHTML = "";
  DAYS.forEach(d => {
    const btn=document.createElement("button"); btn.className="day-btn"+(d===activeDay?" active":"");
    btn.textContent=d.split("—")[1]?.trim();
    btn.addEventListener("click",()=>{ activeDay=d; liveLog={}; liveNote={}; document.getElementById("workout-alert").classList.add("hidden"); renderDayButtons(); renderExercises(); renderLastSession(); });
    container.appendChild(btn);
  });
}

// ── Save session ──────────────────────────────────────────────────────────────
async function saveSession() {
  const curEx=exercises[activeDay]||[];
  const cleanSessDate=sessDate.slice(0,10);
  const sessionKey=`${cleanSessDate}_${activeDay}`;
  const rows=[]; let hasData=false;

  curEx.forEach((ex,i)=>{
    const sets=liveLog[i]?.sets||[];
    sets.forEach((st,si)=>{
      if (!st) return;
      if (ex.unilateral) {
        if (!st.weightL&&!st.weightR&&!st.repsL&&!st.repsR) return;
        hasData=true;
        rows.push([cleanSessDate,activeDay,ex.name,si+1,`L:${st.weightL||"0"}/R:${st.weightR||"0"}`,`L:${st.repsL||"0"}/R:${st.repsR||"0"}`,liveNote[i]||"",sessionKey]);
      } else {
        if (!st.weight&&!st.reps) return;
        hasData=true;
        rows.push([cleanSessDate,activeDay,ex.name,si+1,st.weight||"",st.reps||"",liveNote[i]||"",sessionKey]);
      }
    });
  });

  if (!hasData) { toast("Nothing logged yet"); return; }

  const btn=document.getElementById("save-btn");
  btn.disabled=true; btn.textContent="Saving..."; setSyncStatus("saving");

  try {
    await sheetsCall({ action:"clear", sessionKey });
    await sheetsCall({ action:"write", rows:JSON.stringify(rows) });

    // Per-set progression: track changes
    const changes=[];
    curEx.forEach((ex,i)=>{
      if (!ex.weight||ex.unilateral) return;
      const sets=liveLog[i]?.sets||[];
      const bump=LOWER_DAYS.includes(activeDay)?10:5;
      sets.forEach((st,si)=>{
        if (!st?.weight||!st?.reps) return;
        const history=getSetHistory(dayHistory[activeDay]||[], ex.name, si);
        const prevE1RM = history.length ? calcE1RM(parseFloat(history[0].weight||0), parseFloat(history[0].reps||0)) : 0;
        const newE1RM  = calcE1RM(parseFloat(st.weight), parseFloat(st.reps));
        if (newE1RM > prevE1RM && prevE1RM > 0) {
          changes.push({ name:`${ex.name} S${si+1}`, from:prevE1RM, to:newE1RM, dir:"up", metric:"e1RM" });
        }
        // Update suggested weight if set hit top of range
        if (parseInt(st.reps)>=ex.repMax) {
          exercises[activeDay][i].weight = (parseFloat(st.weight)||ex.weight) + bump;
        }
      });
    });

    if (changes.length) {
      progHist.unshift({ date:cleanSessDate, day:activeDay, changes });
      lsSet("il:progHist",progHist);
    }
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
    renderExercises(); renderLastSession();
    toast(`Saved${changes.length?" — "+changes.filter(c=>c.dir==="up").length+" set(s) progressed":""}`);
  } catch(e) {
    setSyncStatus("error",e.message);
    toast("Save failed: "+e.message);
  }
  btn.disabled=false; btn.textContent="Save Session →";
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

// ── Swap Modal ────────────────────────────────────────────────────────────────
function openSwapModal(idx) {
  swapIdx=idx;
  const ex=exercises[activeDay][idx];
  document.getElementById("swap-replacing").textContent="Replacing: "+ex.name;
  document.getElementById("swap-manual-form").classList.add("hidden");
  document.getElementById("swap-modal").classList.remove("hidden");
  document.getElementById("swap-from-library").onclick=()=>{
    document.getElementById("swap-modal").classList.add("hidden");
    openRepoModal(chosen=>{
      exercises[activeDay][swapIdx]={...exercises[activeDay][swapIdx],name:chosen.name,weight:chosen.weight||exercises[activeDay][swapIdx].weight,repMin:chosen.repMin,repMax:chosen.repMax,reps:`${chosen.repMin}–${chosen.repMax}`,unilateral:chosen.unilateral};
      delete liveLog[swapIdx]; lsSet("il:exercises",exercises); renderExercises(); toast("Exercise swapped");
    });
  };
  document.getElementById("swap-manual").onclick=()=>{
    document.getElementById("swap-name").value=ex.name;
    document.getElementById("swap-weight").value=ex.weight||"";
    document.getElementById("swap-manual-form").classList.remove("hidden");
  };
  document.getElementById("swap-confirm").onclick=()=>{
    const name=document.getElementById("swap-name").value.trim(); if(!name)return;
    const wt=parseFloat(document.getElementById("swap-weight").value);
    exercises[activeDay][swapIdx]={...exercises[activeDay][swapIdx],name,weight:isNaN(wt)?exercises[activeDay][swapIdx].weight:wt};
    delete liveLog[swapIdx]; lsSet("il:exercises",exercises);
    document.getElementById("swap-modal").classList.add("hidden");
    renderExercises(); toast("Exercise swapped");
  };
}
document.getElementById("swap-cancel-main").addEventListener("click",()=>document.getElementById("swap-modal").classList.add("hidden"));
document.getElementById("swap-cancel").addEventListener("click",()=>document.getElementById("swap-modal").classList.add("hidden"));

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
  const allExNames=[...new Set(DAYS.flatMap(d=>(exercises[d]||[]).map(e=>e.name)))];
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
  document.getElementById("current-weights").innerHTML=DAYS.map(dk=>`
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

  // Count sets per muscle group
  const muscleSets={};
  Object.keys(MUSCLE_GROUPS_MAP).forEach(g=>muscleSets[g]=0);
  for(let i=1;i<weekRows.length;i++){
    const [,, exName]=weekRows[i];
    const group=getMuscleGroup(exName);
    if(muscleSets[group]!==undefined) muscleSets[group]++;
  }

  // Volume bars
  const barsEl=document.getElementById("volume-bars"); barsEl.innerHTML="";
  Object.entries(muscleSets).sort((a,b)=>b[1]-a[1]).forEach(([group,count])=>{
    const status=count<MEV_SETS?"under":count>MRV_SETS?"over":"ok";
    const pct=Math.min((count/MRV_SETS)*100,100);
    const div=document.createElement("div"); div.className="vol-bar-row";
    div.innerHTML=`<div class="vol-bar-label"><span class="vol-bar-name">${group}</span><span class="vol-bar-count ${status}">${count} sets</span></div><div class="vol-bar-track"><div class="vol-bar-fill ${status}" style="width:${pct}%"></div></div>`;
    barsEl.appendChild(div);
  });

  // Session volume load chart (all sessions)
  const volData=Object.values(sessions).sort((a,b)=>a.date.localeCompare(b.date)).map(sess=>{
    let total=0;
    Object.values(sess.exercises).forEach(sets=>{
      sets.forEach(s=>{
        const w=parseFloat(s.weight)||0, r=parseFloat(s.reps)||0;
        total+=w*r;
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

// ── Bodyweight Tab ────────────────────────────────────────────────────────────
function renderBodyweight() {
  const canvas=document.getElementById("bw-chart");
  if(bwChart){bwChart.destroy();bwChart=null;}
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
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const savedEx=lsGet("il:exercises",null); if(savedEx)exercises=savedEx;
  const savedPh=lsGet("il:progHist",null);  if(savedPh)progHist=savedPh;

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
