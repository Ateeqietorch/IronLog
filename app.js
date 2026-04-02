// ── Config ────────────────────────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby0T2uJrsedxU5d7sLRtKnX1FtbDpgWUQHbmuguKOTASZYpCUS_a3oQz8tG9WY0cQkb/exec";
const LOWER_DAYS = ["Day 3 — Legs", "Day 5 — Lower"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ── Exercise Repository ───────────────────────────────────────────────────────
const EXERCISE_REPO = [
  // Chest
  { name: "Barbell Bench Press",       group: "Chest",     repMin: 6,  repMax: 8,  unilateral: false, weight: 160 },
  { name: "Incline Barbell Press",     group: "Chest",     repMin: 8,  repMax: 10, unilateral: false, weight: 135 },
  { name: "Incline Dumbbell Press",    group: "Chest",     repMin: 8,  repMax: 10, unilateral: false, weight: 62  },
  { name: "Dumbbell Bench Press",      group: "Chest",     repMin: 8,  repMax: 12, unilateral: false, weight: 70  },
  { name: "Pec Deck / Cable Fly",      group: "Chest",     repMin: 12, repMax: 15, unilateral: false, weight: 121 },
  { name: "Cable Crossover",           group: "Chest",     repMin: 12, repMax: 15, unilateral: false, weight: 40  },
  { name: "Dumbbell Fly",              group: "Chest",     repMin: 12, repMax: 15, unilateral: false, weight: 35  },
  { name: "Push-Up",                   group: "Chest",     repMin: 12, repMax: 20, unilateral: false, weight: null },
  // Shoulders
  { name: "Barbell Overhead Press",    group: "Shoulders", repMin: 6,  repMax: 10, unilateral: false, weight: 110 },
  { name: "Dumbbell Shoulder Press",   group: "Shoulders", repMin: 8,  repMax: 12, unilateral: false, weight: 53  },
  { name: "Cable Lateral Raise",       group: "Shoulders", repMin: 12, repMax: 15, unilateral: true,  weight: 17  },
  { name: "Dumbbell Lateral Raise",    group: "Shoulders", repMin: 15, repMax: 20, unilateral: false, weight: 26  },
  { name: "Rear Delt Fly",             group: "Shoulders", repMin: 15, repMax: 20, unilateral: false, weight: 44  },
  { name: "Face Pull",                 group: "Shoulders", repMin: 15, repMax: 20, unilateral: false, weight: 44  },
  { name: "Upright Row",               group: "Shoulders", repMin: 10, repMax: 12, unilateral: false, weight: 65  },
  // Triceps
  { name: "Tricep Rope Pushdown",      group: "Triceps",   repMin: 12, repMax: 15, unilateral: false, weight: 55  },
  { name: "V-Bar Pushdown",            group: "Triceps",   repMin: 12, repMax: 15, unilateral: false, weight: 60  },
  { name: "Overhead Tricep Extension", group: "Triceps",   repMin: 10, repMax: 12, unilateral: false, weight: 55  },
  { name: "Tricep Dip",                group: "Triceps",   repMin: 8,  repMax: 12, unilateral: false, weight: null },
  { name: "Skull Crusher",             group: "Triceps",   repMin: 10, repMax: 12, unilateral: false, weight: 65  },
  { name: "Single Arm Pushdown",       group: "Triceps",   repMin: 12, repMax: 15, unilateral: true,  weight: 25  },
  // Back
  { name: "Weighted Pull-Up",          group: "Back",      repMin: 6,  repMax: 8,  unilateral: false, weight: null },
  { name: "Lat Pulldown",              group: "Back",      repMin: 8,  repMax: 12, unilateral: false, weight: 155 },
  { name: "Barbell Pendlay Row",       group: "Back",      repMin: 6,  repMax: 8,  unilateral: false, weight: 155 },
  { name: "Seated Cable Row",          group: "Back",      repMin: 10, repMax: 12, unilateral: false, weight: 143 },
  { name: "Chest-Supported DB Row",    group: "Back",      repMin: 10, repMax: 12, unilateral: false, weight: 66  },
  { name: "Chest-Supported T-Bar Row", group: "Back",      repMin: 8,  repMax: 10, unilateral: false, weight: 110 },
  { name: "Single-Arm Cable Row",      group: "Back",      repMin: 12, repMax: 15, unilateral: true,  weight: 66  },
  { name: "Single-Arm DB Row",         group: "Back",      repMin: 10, repMax: 12, unilateral: true,  weight: 80  },
  { name: "Straight Arm Pulldown",     group: "Back",      repMin: 12, repMax: 15, unilateral: false, weight: 50  },
  // Biceps
  { name: "EZ Bar Curl",               group: "Biceps",    repMin: 10, repMax: 12, unilateral: false, weight: 77  },
  { name: "Barbell Curl",              group: "Biceps",    repMin: 8,  repMax: 12, unilateral: false, weight: 65  },
  { name: "Incline Dumbbell Curl",     group: "Biceps",    repMin: 12, repMax: 15, unilateral: false, weight: 31  },
  { name: "Hammer Curl",               group: "Biceps",    repMin: 12, repMax: 15, unilateral: false, weight: 40  },
  { name: "Cable Curl",                group: "Biceps",    repMin: 12, repMax: 15, unilateral: true,  weight: 30  },
  { name: "Concentration Curl",        group: "Biceps",    repMin: 12, repMax: 15, unilateral: true,  weight: 25  },
  // Quads
  { name: "Hack Squat",                group: "Quads",     repMin: 8,  repMax: 10, unilateral: false, weight: 220 },
  { name: "Leg Press",                 group: "Quads",     repMin: 10, repMax: 12, unilateral: false, weight: 265 },
  { name: "Single Leg Leg Press",      group: "Quads",     repMin: 10, repMax: 12, unilateral: true,  weight: 110 },
  { name: "Leg Extension",             group: "Quads",     repMin: 12, repMax: 15, unilateral: false, weight: 110 },
  { name: "Single Leg Extension",      group: "Quads",     repMin: 12, repMax: 15, unilateral: true,  weight: 55  },
  { name: "Bulgarian Split Squat",     group: "Quads",     repMin: 8,  repMax: 12, unilateral: true,  weight: 50  },
  { name: "Walking Lunges (DB)",       group: "Quads",     repMin: 10, repMax: 12, unilateral: false, weight: 48  },
  // Hamstrings / Glutes
  { name: "Romanian Deadlift",         group: "Hamstrings",repMin: 8,  repMax: 10, unilateral: false, weight: 176 },
  { name: "Stiff-Leg Deadlift (DB)",   group: "Hamstrings",repMin: 10, repMax: 12, unilateral: false, weight: 70  },
  { name: "Leg Curl",                  group: "Hamstrings",repMin: 10, repMax: 12, unilateral: false, weight: 99  },
  { name: "Leg Curl (seated)",         group: "Hamstrings",repMin: 12, repMax: 15, unilateral: false, weight: 88  },
  { name: "Single Leg Curl",           group: "Hamstrings",repMin: 10, repMax: 12, unilateral: true,  weight: 50  },
  { name: "Hip Thrust",                group: "Glutes",    repMin: 10, repMax: 12, unilateral: false, weight: 198 },
  { name: "Single Leg Hip Thrust",     group: "Glutes",    repMin: 10, repMax: 15, unilateral: true,  weight: 90  },
  { name: "Cable Kickback",            group: "Glutes",    repMin: 15, repMax: 20, unilateral: true,  weight: 30  },
  // Calves
  { name: "Standing Calf Raise",       group: "Calves",    repMin: 12, repMax: 15, unilateral: false, weight: 176 },
  { name: "Seated Calf Raise",         group: "Calves",    repMin: 15, repMax: 20, unilateral: false, weight: 110 },
  { name: "Single Leg Calf Raise",     group: "Calves",    repMin: 12, repMax: 15, unilateral: true,  weight: 90  },
];

const MUSCLE_GROUPS = [...new Set(EXERCISE_REPO.map(e => e.group))];

// ── Default Program ───────────────────────────────────────────────────────────
const DEFAULTS = {
  "Day 1 — Push": [
    { name: "Barbell Bench Press",       sets: 4, reps: "6–8",    repMin: 6,  repMax: 8,  weight: 160, unilateral: false },
    { name: "Incline Dumbbell Press",    sets: 3, reps: "8–10",   repMin: 8,  repMax: 10, weight: 62,  unilateral: false },
    { name: "Barbell Overhead Press",    sets: 3, reps: "8–10",   repMin: 8,  repMax: 10, weight: 110, unilateral: false },
    { name: "Cable Lateral Raise",       sets: 4, reps: "12–15",  repMin: 12, repMax: 15, weight: 17,  unilateral: true  },
    { name: "Dumbbell Lateral Raise",    sets: 3, reps: "15–20",  repMin: 15, repMax: 20, weight: 26,  unilateral: false },
    { name: "Tricep Rope Pushdown",      sets: 3, reps: "12–15",  repMin: 12, repMax: 15, weight: 55,  unilateral: false },
    { name: "Overhead Tricep Extension", sets: 3, reps: "10–12",  repMin: 10, repMax: 12, weight: 55,  unilateral: false },
  ],
  "Day 2 — Pull": [
    { name: "Weighted Pull-Up / Lat Pulldown", sets: 4, reps: "6–8",   repMin: 6,  repMax: 8,  weight: 155, unilateral: false },
    { name: "Barbell Pendlay Row",             sets: 4, reps: "6–8",   repMin: 6,  repMax: 8,  weight: 155, unilateral: false },
    { name: "Seated Cable Row",                sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 143, unilateral: false },
    { name: "Chest-Supported DB Row",          sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 66,  unilateral: false },
    { name: "Face Pull",                       sets: 4, reps: "15–20", repMin: 15, repMax: 20, weight: 44,  unilateral: false },
    { name: "EZ Bar Curl",                     sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 77,  unilateral: false },
    { name: "Incline Dumbbell Curl",           sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 31,  unilateral: false },
  ],
  "Day 3 — Legs": [
    { name: "Hack Squat",           sets: 4, reps: "8–10",    repMin: 8,  repMax: 10, weight: 220, unilateral: false },
    { name: "Single Leg Leg Press", sets: 3, reps: "10–12",   repMin: 10, repMax: 12, weight: 110, unilateral: true  },
    { name: "Romanian Deadlift",    sets: 4, reps: "8–10",    repMin: 8,  repMax: 10, weight: 176, unilateral: false },
    { name: "Leg Curl",             sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 99,  unilateral: false },
    { name: "Leg Extension",        sets: 3, reps: "12–15",   repMin: 12, repMax: 15, weight: 110, unilateral: false },
    { name: "Standing Calf Raise",  sets: 4, reps: "12–15",   repMin: 12, repMax: 15, weight: 176, unilateral: false },
    { name: "Seated Calf Raise",    sets: 3, reps: "15–20",   repMin: 15, repMax: 20, weight: 110, unilateral: false },
  ],
  "Day 4 — Upper": [
    { name: "Incline Barbell Bench Press", sets: 4, reps: "8–10",  repMin: 8,  repMax: 10, weight: 143, unilateral: false },
    { name: "Chest-Supported T-Bar Row",  sets: 4, reps: "8–10",  repMin: 8,  repMax: 10, weight: 110, unilateral: false },
    { name: "Dumbbell Shoulder Press",    sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 53,  unilateral: false },
    { name: "Single-Arm Cable Row",       sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 66,  unilateral: true  },
    { name: "Pec Deck / Cable Fly",       sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 121, unilateral: false },
    { name: "Rear Delt Fly",              sets: 3, reps: "15–20", repMin: 15, repMax: 20, weight: 44,  unilateral: false },
    { name: "Hammer Curl",                sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 40,  unilateral: false },
    { name: "Tricep Dip",                 sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: null,unilateral: false },
  ],
  "Day 5 — Lower": [
    { name: "Leg Press",               sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 265, unilateral: false },
    { name: "Walking Lunges (DB)",     sets: 3, reps: "12 each",  repMin: 12, repMax: 12, weight: 48,  unilateral: false },
    { name: "Stiff-Leg Deadlift (DB)", sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 70,  unilateral: false },
    { name: "Leg Curl (seated)",       sets: 3, reps: "12–15",   repMin: 12, repMax: 15, weight: 88,  unilateral: false },
    { name: "Leg Extension",           sets: 3, reps: "15–20",   repMin: 15, repMax: 20, weight: 99,  unilateral: false },
    { name: "Hip Thrust",              sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 198, unilateral: false },
    { name: "Seated Calf Raise",       sets: 4, reps: "15–20",   repMin: 15, repMax: 20, weight: 110, unilateral: false },
  ],
};
const DAYS = Object.keys(DEFAULTS);

// ── State ─────────────────────────────────────────────────────────────────────
let exercises  = JSON.parse(JSON.stringify(DEFAULTS));
let sessions   = {};
let progHist   = [];
let bwData     = []; // [{date, weight}]
let activeDay  = DAYS[0];
let sessDate   = todayStr();
let liveLog    = {}; // { exIdx: { sets: [{weight,reps,weightL,repsL,weightR,repsR}] } }
let liveNote   = {};
let calYear    = new Date().getFullYear();
let calMonth   = new Date().getMonth();
let selDate    = null;
let swapIdx    = null;
let repoCallback = null; // fn(exercise) called when user picks from library
let bwChart    = null;

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
function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ── Google Sheets API ─────────────────────────────────────────────────────────
async function sheetsCall(params) {
  const url = new URL(SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v)));
  url.searchParams.set("t", Date.now());
  const r = await fetch(url.toString());
  const text = await r.text();
  const d = JSON.parse(text);
  if (!d.ok) throw new Error(d.msg || "Script error");
  return d;
}

// ── Parse sessions ────────────────────────────────────────────────────────────
function parseSessionRows(rows) {
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const [rawDate, day, exercise, set, weight, reps, notes, sessionKey] = rows[i];
    if (!sessionKey || !rawDate) continue;
    const date = cleanDate(rawDate);
    if (!result[sessionKey]) result[sessionKey] = { date, day, exercises: {} };
    if (!result[sessionKey].exercises[exercise]) result[sessionKey].exercises[exercise] = [];
    result[sessionKey].exercises[exercise].push({ set, weight, reps, notes });
  }
  return result;
}

function parseDraftRows(rows) {
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const [rawDate, day, exercise, set, weight, reps, notes, draftKey] = rows[i];
    if (!draftKey || !rawDate) continue;
    const date = cleanDate(rawDate);
    if (!result[draftKey]) result[draftKey] = { date, day, sets: [] };
    result[draftKey].sets.push({ exercise, set, weight, reps, notes });
  }
  return result;
}

function formatSession(sess) {
  return Object.entries(sess.exercises).map(([name, sets]) =>
    `${name}:\n` + sets.map(s => {
      const wt = String(s.weight || "");
      const rp = String(s.reps || "");
      // Detect L/R format stored as "L:165/R:165"
      if (wt.includes("L:") || rp.includes("L:")) {
        return `  S${s.set}: ${wt} × ${rp}${s.notes ? "  ["+s.notes+"]" : ""}`;
      }
      return `  S${s.set}: ${wt}lb × ${rp} reps${s.notes ? "  ["+s.notes+"]" : ""}`;
    }).join("\n")
  ).join("\n\n");
}

// ── Progression ───────────────────────────────────────────────────────────────
function getHint(ex, sets, dayKey) {
  if (!ex.weight || !sets) return null;
  const filled = sets.filter(s => s.reps && s.weight);
  if (!filled.length) return null;
  const bump = LOWER_DAYS.includes(dayKey) ? 10 : 5;
  if (filled.every(s => parseInt(s.reps) >= ex.repMax))
    return { text: `↑ Hit ${ex.repMax}+ reps — add ${bump}lb next session`, dir: "up" };
  if (filled.some(s => parseInt(s.reps) < ex.repMin))
    return { text: `↓ Fell below ${ex.repMin} reps — consider −${bump}lb`, dir: "down" };
  return null;
}

function applyProgression(exList, dayKey, log) {
  const bump = LOWER_DAYS.includes(dayKey) ? 10 : 5;
  const changes = [];
  const updated = exList.map((ex, i) => {
    if (!ex.weight) return ex;
    const sets = (log[i]?.sets || []).filter(s => s.reps && s.weight);
    if (!sets.length) return ex;
    if (sets.every(s => parseInt(s.reps) >= ex.repMax)) {
      const nw = ex.weight + bump;
      changes.push({ name: ex.name, from: ex.weight, to: nw, dir: "up" });
      return { ...ex, weight: nw };
    }
    if (sets.some(s => parseInt(s.reps) < ex.repMin)) {
      const nw = Math.max(ex.weight - bump, bump);
      if (nw !== ex.weight) {
        changes.push({ name: ex.name, from: ex.weight, to: nw, dir: "down" });
        return { ...ex, weight: nw };
      }
    }
    return ex;
  });
  return { updated, changes };
}

// ── Sync status ───────────────────────────────────────────────────────────────
function setSyncStatus(state, msg) {
  const el = document.getElementById("sync-status");
  el.className = "sync-status " + state;
  el.title = msg || "";
  el.textContent = { loading:"● LOADING", saving:"● SAVING", synced:"● SYNCED", error:"● ERROR" }[state] || "●";
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ── Draft logic ───────────────────────────────────────────────────────────────
let draftKey = null;

async function saveDraft() {
  const curEx = exercises[activeDay] || [];
  const dk = `DRAFT_${sessDate}_${activeDay}`;
  const rows = [];
  curEx.forEach((ex, i) => {
    const sets = liveLog[i]?.sets || [];
    sets.forEach((st, si) => {
      if (!st) return;
      rows.push([sessDate, activeDay, ex.name, si + 1,
        ex.unilateral ? `L:${st.weightL||""}` : (st.weight || ""),
        ex.unilateral ? `L:${st.repsL||""}/R:${st.repsR||""}` : (st.reps || ""),
        liveNote[i] || "", dk
      ]);
    });
  });
  if (!rows.length) return;
  try {
    await sheetsCall({ action: "clear_draft", draftKey: dk });
    await sheetsCall({ action: "write_draft", rows: JSON.stringify(rows) });
    draftKey = dk;
    lsSet("il:draftKey", dk);
  } catch {}
}

async function checkForDraft() {
  const savedKey = lsGet("il:draftKey", null);
  if (!savedKey) return;
  try {
    const d = await sheetsCall({ action: "read_draft" });
    const drafts = parseDraftRows(d.rows);
    if (drafts[savedKey]) {
      const draft = drafts[savedKey];
      showDraftBanner(draft, savedKey);
    }
  } catch {}
}

function showDraftBanner(draft, key) {
  const banner = document.getElementById("draft-banner");
  const text   = document.getElementById("draft-banner-text");
  text.textContent = `Unfinished ${draft.day.split("—")[1]?.trim()} from ${draft.date} — continue?`;
  banner.classList.remove("hidden");

  document.getElementById("draft-continue").onclick = () => {
    // Switch to that day and restore
    activeDay = draft.day;
    sessDate  = draft.date;
    document.getElementById("session-date").value = draft.date;
    // Restore live log from draft sets
    liveLog = {}; liveNote = {};
    draft.sets.forEach(s => {
      const exIdx = (exercises[activeDay] || []).findIndex(e => e.name === s.exercise);
      if (exIdx === -1) return;
      if (!liveLog[exIdx]) liveLog[exIdx] = { sets: [] };
      const si = parseInt(s.set) - 1;
      liveLog[exIdx].sets[si] = { weight: s.weight, reps: s.reps };
    });
    renderDayButtons();
    renderExercises();
    renderLastSession();
    banner.classList.add("hidden");
    toast("Draft restored");
  };

  document.getElementById("draft-discard").onclick = async () => {
    try { await sheetsCall({ action: "clear_draft", draftKey: key }); } catch {}
    lsSet("il:draftKey", null);
    banner.classList.add("hidden");
  };
}

// ── Render exercises ──────────────────────────────────────────────────────────
function renderExercises() {
  const curEx = exercises[activeDay] || [];
  const bump  = LOWER_DAYS.includes(activeDay) ? 10 : 5;
  document.getElementById("active-day-label").textContent = activeDay;
  document.getElementById("progression-hint-global").textContent =
    `Auto-progression: +${bump}lb when all sets hit top of rep range`;

  const container = document.getElementById("exercises-list");
  container.innerHTML = "";
  if (!curEx.length) {
    container.innerHTML = '<div style="font-size:12px;color:#333;padding:16px 0">No exercises. Add from library or swap.</div>';
    return;
  }

  curEx.forEach((ex, i) => {
    const sets = liveLog[i]?.sets || [];
    const hint = ex.unilateral ? null : getHint(ex, sets, activeDay);
    const card = document.createElement("div");
    card.className = "exercise-card";
    card.dataset.idx = i;

    // Build set rows HTML
    let setsHTML = "";
    for (let si = 0; si < ex.sets; si++) {
      if (ex.unilateral) {
        setsHTML += `<div class="set-row unilateral">
          <div class="set-num">S${si+1}</div>
          <span class="side-label">L</span>
          <input type="number" class="set-wL narrow" data-ex="${i}" data-set="${si}" placeholder="lb" value="${sets[si]?.weightL||""}" />
          <input type="number" class="set-rL narrow" data-ex="${i}" data-set="${si}" placeholder="reps" value="${sets[si]?.repsL||""}" />
          <span class="side-label" style="margin-left:4px">R</span>
          <input type="number" class="set-wR narrow" data-ex="${i}" data-set="${si}" placeholder="lb" value="${sets[si]?.weightR||""}" />
          <input type="number" class="set-rR narrow" data-ex="${i}" data-set="${si}" placeholder="reps" value="${sets[si]?.repsR||""}" />
        </div>`;
      } else {
        setsHTML += `<div class="set-row">
          <div class="set-num">S${si+1}</div>
          <input type="number" class="set-w" data-ex="${i}" data-set="${si}" placeholder="lb" value="${sets[si]?.weight||""}" />
          <input type="number" class="set-r" data-ex="${i}" data-set="${si}" placeholder="reps" value="${sets[si]?.reps||""}" />
        </div>`;
      }
    }

    card.innerHTML = `
      <div class="ex-header">
        <div>
          <div class="ex-name">${ex.name}${ex.unilateral ? '<span class="badge-uni">UNI</span>' : ""}</div>
          <div class="ex-meta">${ex.sets}×${ex.reps} · <span class="weight">${ex.weight ? ex.weight+"lb" : "BW"}</span></div>
        </div>
        <div class="ex-actions">
          <button class="btn-icon btn-up" data-idx="${i}" title="Move up">↑</button>
          <button class="btn-icon btn-dn" data-idx="${i}" title="Move down">↓</button>
          <button class="btn-icon btn-swap" data-idx="${i}" title="Swap">⇄</button>
          <button class="btn-icon btn-del" data-idx="${i}" title="Remove">✕</button>
        </div>
      </div>
      <div class="set-controls">
        <button class="btn-set-rm" data-idx="${i}">−</button>
        <span class="set-count-label">${ex.sets} sets</span>
        <button class="btn-set-add" data-idx="${i}">+</button>
      </div>
      <div class="sets-grid">${setsHTML}</div>
      ${hint ? `<div class="hint ${hint.dir}">${hint.text}</div>` : ""}
      <div class="notes-row">
        <div class="notes-label">Notes</div>
        <input type="text" class="notes-input" data-ex="${i}" placeholder="form cues, how it felt..." value="${liveNote[i]||""}" />
      </div>
    `;
    container.appendChild(card);
  });

  bindExerciseInputs(container);
}

function bindExerciseInputs(container) {
  // Standard weight/reps
  container.querySelectorAll(".set-w, .set-r").forEach(inp => {
    inp.addEventListener("input", e => {
      const i = parseInt(e.target.dataset.ex), si = parseInt(e.target.dataset.set);
      const field = e.target.classList.contains("set-w") ? "weight" : "reps";
      if (!liveLog[i]) liveLog[i] = { sets: [] };
      if (!liveLog[i].sets[si]) liveLog[i].sets[si] = {};
      liveLog[i].sets[si][field] = e.target.value;
      updateHint(container, i);
      saveDraft();
    });
  });

  // Unilateral L/R
  ["set-wL","set-rL","set-wR","set-rR"].forEach(cls => {
    container.querySelectorAll("." + cls).forEach(inp => {
      inp.addEventListener("input", e => {
        const i = parseInt(e.target.dataset.ex), si = parseInt(e.target.dataset.set);
        const fieldMap = { "set-wL":"weightL", "set-rL":"repsL", "set-wR":"weightR", "set-rR":"repsR" };
        const field = fieldMap[cls];
        if (!liveLog[i]) liveLog[i] = { sets: [] };
        if (!liveLog[i].sets[si]) liveLog[i].sets[si] = {};
        liveLog[i].sets[si][field] = e.target.value;
        saveDraft();
      });
    });
  });

  // Notes
  container.querySelectorAll(".notes-input").forEach(inp => {
    inp.addEventListener("input", e => {
      liveNote[parseInt(e.target.dataset.ex)] = e.target.value;
      saveDraft();
    });
  });

  // Add / remove sets
  container.querySelectorAll(".btn-set-add").forEach(btn => {
    btn.addEventListener("click", e => {
      const i = parseInt(e.target.dataset.idx);
      exercises[activeDay][i].sets++;
      exercises[activeDay][i].reps = `${exercises[activeDay][i].repMin}–${exercises[activeDay][i].repMax}`;
      lsSet("il:exercises", exercises);
      renderExercises();
    });
  });
  container.querySelectorAll(".btn-set-rm").forEach(btn => {
    btn.addEventListener("click", e => {
      const i = parseInt(e.target.dataset.idx);
      if (exercises[activeDay][i].sets <= 1) return;
      exercises[activeDay][i].sets--;
      lsSet("il:exercises", exercises);
      renderExercises();
    });
  });

  // Reorder
  container.querySelectorAll(".btn-up").forEach(btn => {
    btn.addEventListener("click", e => {
      const i = parseInt(e.target.dataset.idx);
      if (i === 0) return;
      const arr = exercises[activeDay];
      [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
      const ll = liveLog[i], lp = liveLog[i-1];
      liveLog[i-1] = ll; liveLog[i] = lp;
      lsSet("il:exercises", exercises);
      renderExercises();
    });
  });
  container.querySelectorAll(".btn-dn").forEach(btn => {
    btn.addEventListener("click", e => {
      const i = parseInt(e.target.dataset.idx);
      const arr = exercises[activeDay];
      if (i >= arr.length - 1) return;
      [arr[i+1], arr[i]] = [arr[i], arr[i+1]];
      const ll = liveLog[i], lp = liveLog[i+1];
      liveLog[i+1] = ll; liveLog[i] = lp;
      lsSet("il:exercises", exercises);
      renderExercises();
    });
  });

  // Swap
  container.querySelectorAll(".btn-swap").forEach(btn => {
    btn.addEventListener("click", e => openSwapModal(parseInt(e.target.dataset.idx)));
  });

  // Delete
  container.querySelectorAll(".btn-del").forEach(btn => {
    btn.addEventListener("click", e => {
      const i = parseInt(e.target.dataset.idx);
      exercises[activeDay] = exercises[activeDay].filter((_,j) => j !== i);
      delete liveLog[i]; delete liveNote[i];
      lsSet("il:exercises", exercises);
      renderExercises();
    });
  });
}

function updateHint(container, i) {
  const ex = exercises[activeDay][i];
  if (ex.unilateral) return;
  const hint = getHint(ex, liveLog[i]?.sets, activeDay);
  const card = container.querySelector(`.exercise-card[data-idx="${i}"]`);
  if (!card) return;
  let hintEl = card.querySelector(".hint");
  const notesRow = card.querySelector(".notes-row");
  if (hint) {
    if (!hintEl) { hintEl = document.createElement("div"); card.insertBefore(hintEl, notesRow); }
    hintEl.className = "hint " + hint.dir;
    hintEl.textContent = hint.text;
  } else if (hintEl) { hintEl.remove(); }
}

// ── Last session ──────────────────────────────────────────────────────────────
function renderLastSession() {
  const prev = Object.values(sessions)
    .filter(s => s.day === activeDay && s.date !== sessDate)
    .sort((a,b) => b.date.localeCompare(a.date))[0];
  const box  = document.getElementById("last-session-box");
  const none = document.getElementById("no-last-session");
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
    const btn = document.createElement("button");
    btn.className = "day-btn" + (d === activeDay ? " active" : "");
    btn.textContent = d.split("—")[1]?.trim();
    btn.addEventListener("click", () => {
      activeDay = d; liveLog = {}; liveNote = {};
      renderDayButtons(); renderExercises(); renderLastSession();
    });
    container.appendChild(btn);
  });
}

// ── Save session ──────────────────────────────────────────────────────────────
async function saveSession() {
  const curEx = exercises[activeDay] || [];
  const cleanSessDate = sessDate.slice(0, 10);
  const sessionKey = `${cleanSessDate}_${activeDay}`;
  const rows = [];
  let hasData = false;

  curEx.forEach((ex, i) => {
    const sets = liveLog[i]?.sets || [];
    sets.forEach((st, si) => {
      if (!st) return;
      if (ex.unilateral) {
        if (!st.weightL && !st.weightR && !st.repsL && !st.repsR) return;
        hasData = true;
        rows.push([cleanSessDate, activeDay, ex.name, si+1,
          `L:${st.weightL||"0"}/R:${st.weightR||"0"}`,
          `L:${st.repsL||"0"}/R:${st.repsR||"0"}`,
          liveNote[i]||"", sessionKey
        ]);
      } else {
        if (!st.weight && !st.reps) return;
        hasData = true;
        rows.push([cleanSessDate, activeDay, ex.name, si+1, st.weight||"", st.reps||"", liveNote[i]||"", sessionKey]);
      }
    });
  });

  if (!hasData) { toast("Nothing logged yet"); return; }

  const btn = document.getElementById("save-btn");
  btn.disabled = true; btn.textContent = "Saving...";
  setSyncStatus("saving");

  try {
    await sheetsCall({ action: "clear", sessionKey });
    await sheetsCall({ action: "write", rows: JSON.stringify(rows) });

    const { updated, changes } = applyProgression(curEx, activeDay, liveLog);
    if (changes.length) {
      exercises[activeDay] = updated;
      progHist.unshift({ date: cleanSessDate, day: activeDay, changes });
      lsSet("il:exercises", exercises);
      lsSet("il:progHist", progHist);
    }

    // Clear draft
    const dk = `DRAFT_${cleanSessDate}_${activeDay}`;
    await sheetsCall({ action: "clear_draft", draftKey: dk }).catch(() => {});
    lsSet("il:draftKey", null);

    sessions = parseSessionRows((await sheetsCall({ action: "read" })).rows);
    setSyncStatus("synced");
    liveLog = {}; liveNote = {};
    renderExercises(); renderLastSession();
    toast(`Saved${changes.filter(c=>c.dir==="up").length ? " — weights updated ↑" : ""}`);
  } catch (e) {
    setSyncStatus("error", e.message);
    toast("Save failed: " + e.message);
  }

  btn.disabled = false; btn.textContent = "Save Session →";
}

// ── Exercise Repository Modal ─────────────────────────────────────────────────
let repoFilter = "";
let repoSearch = "";

function openRepoModal(callback) {
  repoCallback = callback;
  repoFilter = "";
  repoSearch = "";
  document.getElementById("repo-search").value = "";
  renderRepoFilters();
  renderRepoList();
  document.getElementById("repo-modal").classList.remove("hidden");
  document.getElementById("repo-search").focus();
}

function renderRepoFilters() {
  const container = document.getElementById("repo-filters");
  container.innerHTML = "";
  ["All", ...MUSCLE_GROUPS].forEach(g => {
    const btn = document.createElement("button");
    btn.className = "repo-filter" + ((g === "All" && !repoFilter) || g === repoFilter ? " active" : "");
    btn.textContent = g;
    btn.addEventListener("click", () => {
      repoFilter = g === "All" ? "" : g;
      renderRepoFilters();
      renderRepoList();
    });
    container.appendChild(btn);
  });
}

function renderRepoList() {
  const list = document.getElementById("repo-list");
  list.innerHTML = "";
  const q = repoSearch.toLowerCase();
  const filtered = EXERCISE_REPO.filter(e =>
    (!repoFilter || e.group === repoFilter) &&
    (!q || e.name.toLowerCase().includes(q))
  );
  if (!filtered.length) {
    list.innerHTML = '<div style="font-size:11px;color:#333;padding:12px 0">No exercises found.</div>';
    return;
  }
  filtered.forEach(ex => {
    const item = document.createElement("div");
    item.className = "repo-item";
    item.innerHTML = `
      <div>
        <div class="repo-item-name">${ex.name}${ex.unilateral ? '<span class="repo-item-badge">UNI</span>' : ""}</div>
        <div class="repo-item-meta">${ex.group} · ${ex.repMin}–${ex.repMax} reps${ex.weight ? " · "+ex.weight+"lb" : " · BW"}</div>
      </div>
      <div class="repo-item-add">+</div>
    `;
    item.addEventListener("click", () => {
      if (repoCallback) repoCallback(ex);
      document.getElementById("repo-modal").classList.add("hidden");
    });
    list.appendChild(item);
  });
}

// ── Swap Modal ────────────────────────────────────────────────────────────────
function openSwapModal(idx) {
  swapIdx = idx;
  const ex = exercises[activeDay][idx];
  document.getElementById("swap-replacing").textContent = "Replacing: " + ex.name;
  document.getElementById("swap-manual-form").classList.add("hidden");
  document.getElementById("swap-modal").classList.remove("hidden");

  document.getElementById("swap-from-library").onclick = () => {
    document.getElementById("swap-modal").classList.add("hidden");
    openRepoModal(chosen => {
      exercises[activeDay][swapIdx] = {
        ...exercises[activeDay][swapIdx],
        name: chosen.name,
        weight: chosen.weight || exercises[activeDay][swapIdx].weight,
        repMin: chosen.repMin,
        repMax: chosen.repMax,
        reps: `${chosen.repMin}–${chosen.repMax}`,
        unilateral: chosen.unilateral,
      };
      delete liveLog[swapIdx];
      lsSet("il:exercises", exercises);
      renderExercises();
      toast("Exercise swapped");
    });
  };

  document.getElementById("swap-manual").onclick = () => {
    document.getElementById("swap-name").value = ex.name;
    document.getElementById("swap-weight").value = ex.weight || "";
    document.getElementById("swap-manual-form").classList.remove("hidden");
  };

  document.getElementById("swap-confirm").onclick = () => {
    const name = document.getElementById("swap-name").value.trim();
    if (!name) return;
    const wt = parseFloat(document.getElementById("swap-weight").value);
    exercises[activeDay][swapIdx] = {
      ...exercises[activeDay][swapIdx],
      name,
      weight: isNaN(wt) ? exercises[activeDay][swapIdx].weight : wt
    };
    delete liveLog[swapIdx];
    lsSet("il:exercises", exercises);
    document.getElementById("swap-modal").classList.add("hidden");
    renderExercises();
    toast("Exercise swapped");
  };
}

document.getElementById("swap-cancel-main").addEventListener("click", () => {
  document.getElementById("swap-modal").classList.add("hidden");
});
document.getElementById("swap-cancel").addEventListener("click", () => {
  document.getElementById("swap-modal").classList.add("hidden");
});

// ── Calendar ──────────────────────────────────────────────────────────────────
function renderCalendar() {
  const tk = todayStr();
  document.getElementById("cal-month-label").textContent = `${MONTHS[calMonth]} ${calYear}`;
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const sessionDates = new Set(Object.values(sessions).map(s => s.date));
  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  for (let i = 0; i < firstDow; i++) grid.appendChild(document.createElement("div"));
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = dKey(calYear, calMonth, d);
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (dk === tk) cell.classList.add("today");
    if (sessionDates.has(dk)) cell.classList.add("has-session");
    if (dk === selDate) cell.classList.add("selected");
    cell.textContent = d;
    if (sessionDates.has(dk) && dk !== selDate) {
      const dot = document.createElement("div"); dot.className = "cal-dot"; cell.appendChild(dot);
    }
    cell.addEventListener("click", () => { selDate = selDate === dk ? null : dk; renderCalendar(); renderCalDetail(); });
    grid.appendChild(cell);
  }
}

function renderCalDetail() {
  const detail = document.getElementById("cal-detail");
  if (!selDate) { detail.classList.add("hidden"); return; }
  const daySessions = Object.entries(sessions).filter(([,s]) => s.date === selDate);
  detail.classList.remove("hidden");
  detail.innerHTML = `<div class="cal-detail-date">${selDate}</div>`;
  if (!daySessions.length) { detail.innerHTML += `<div class="cal-empty">No session logged.</div>`; return; }
  daySessions.forEach(([key, sess]) => {
    const div = document.createElement("div");
    div.className = "cal-session";
    div.innerHTML = `
      <div class="cal-session-day">${sess.day}</div>
      <pre class="cal-session-body">${formatSession(sess)}</pre>
      <button class="btn-ghost btn-delete-session" data-key="${key}">Delete</button>
    `;
    detail.appendChild(div);
  });
  detail.querySelectorAll(".btn-delete-session").forEach(btn => {
    btn.addEventListener("click", async () => {
      setSyncStatus("saving");
      try {
        await sheetsCall({ action: "clear", sessionKey: btn.dataset.key });
        sessions = parseSessionRows((await sheetsCall({ action: "read" })).rows);
        setSyncStatus("synced"); selDate = null;
        renderCalendar(); renderCalDetail(); toast("Session deleted");
      } catch (e) { setSyncStatus("error", e.message); }
    });
  });
}

// ── Progress ──────────────────────────────────────────────────────────────────
function renderProgress() {
  const histEl = document.getElementById("prog-history");
  const wtEl   = document.getElementById("current-weights");
  histEl.innerHTML = !progHist.length
    ? '<div class="prog-empty">No changes yet.</div>'
    : progHist.map(entry => `
      <div class="prog-entry">
        <div class="prog-entry-header"><span class="prog-date">${entry.date}</span><span class="prog-day">${entry.day}</span></div>
        ${entry.changes.map(c => `
          <div class="prog-change">
            <span class="prog-arrow ${c.dir}">${c.dir==="up"?"↑":"↓"}</span>
            <span class="prog-exname">${c.name}</span>
            <span class="prog-weights"><span class="prog-from">${c.from}lb</span><span class="prog-sep">→</span><span class="${c.dir==="up"?"prog-to-up":"prog-to-dn"}">${c.to}lb</span></span>
          </div>`).join("")}
      </div>`).join("");
  wtEl.innerHTML = DAYS.map(dk => `
    <div class="weights-day">
      <div class="weights-day-title">${dk}</div>
      ${(exercises[dk]||[]).map(ex => `
        <div class="weights-row"><span>${ex.name}</span><span>${ex.weight?ex.weight+"lb":"BW"}</span></div>`).join("")}
    </div>`).join("");
}

// ── Bodyweight ────────────────────────────────────────────────────────────────
async function loadBodyweight() {
  try {
    const d = await sheetsCall({ action: "read_bodyweight" });
    bwData = [];
    for (let i = 1; i < d.rows.length; i++) {
      const [rawDate, weight] = d.rows[i];
      if (!rawDate) continue;
      bwData.push({ date: cleanDate(rawDate), weight: parseFloat(weight) });
    }
    bwData.sort((a,b) => a.date.localeCompare(b.date));
  } catch {}
}

function renderBodyweight() {
  renderBwChart();
  renderBwHistory();
}

function renderBwChart() {
  const canvas = document.getElementById("bw-chart");
  if (bwChart) { bwChart.destroy(); bwChart = null; }
  if (!bwData.length) return;
  bwChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: bwData.map(d => d.date),
      datasets: [{
        data: bwData.map(d => d.weight),
        borderColor: "#c8a96e",
        backgroundColor: "rgba(200,169,110,0.08)",
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: "#c8a96e",
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#555", font: { family: "DM Mono", size: 9 }, maxTicksLimit: 8 }, grid: { color: "#1a1a1a" } },
        y: { ticks: { color: "#555", font: { family: "DM Mono", size: 9 } }, grid: { color: "#1a1a1a" } }
      }
    }
  });
}

function renderBwHistory() {
  const el = document.getElementById("bw-history");
  if (!bwData.length) { el.innerHTML = '<div class="bw-empty">No entries yet.</div>'; return; }
  el.innerHTML = [...bwData].reverse().map(e => `
    <div class="bw-row">
      <span class="bw-row-date">${e.date}</span>
      <span class="bw-row-weight">${e.weight} lb</span>
      <button class="bw-row-del" data-date="${e.date}">✕</button>
    </div>`).join("");
  el.querySelectorAll(".bw-row-del").forEach(btn => {
    btn.addEventListener("click", async () => {
      setSyncStatus("saving");
      try {
        await sheetsCall({ action: "delete_bodyweight", date: btn.dataset.date });
        await loadBodyweight();
        setSyncStatus("synced");
        renderBodyweight();
        toast("Entry deleted");
      } catch (e) { setSyncStatus("error", e.message); }
    });
  });
}

async function saveBw() {
  const date = document.getElementById("bw-date").value.slice(0, 10);
  const weight = parseFloat(document.getElementById("bw-weight").value);
  if (!date || isNaN(weight)) { toast("Enter a valid date and weight"); return; }
  setSyncStatus("saving");
  try {
    await sheetsCall({ action: "delete_bodyweight", date });
    await sheetsCall({ action: "write_bodyweight", date, weight: String(weight) });
    await loadBodyweight();
    setSyncStatus("synced");
    document.getElementById("bw-weight").value = "";
    renderBodyweight();
    toast("Weight logged");
  } catch (e) { setSyncStatus("error", e.message); toast("Save failed: " + e.message); }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".tab-content").forEach(c => {
    const active = c.id === "tab-" + tab;
    c.classList.toggle("active", active);
    c.classList.toggle("hidden", !active);
  });
  if (tab === "calendar") { renderCalendar(); renderCalDetail(); }
  if (tab === "progress")  renderProgress();
  if (tab === "bodyweight") renderBodyweight();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const savedEx = lsGet("il:exercises", null);
  if (savedEx) exercises = savedEx;
  const savedPh = lsGet("il:progHist", null);
  if (savedPh) progHist = savedPh;

  document.getElementById("session-date").value = sessDate;
  document.getElementById("bw-date").value = sessDate;

  document.getElementById("session-date").addEventListener("change", e => {
    sessDate = e.target.value; renderLastSession();
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("cal-prev").addEventListener("click", () => {
    if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--;
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
    renderCalendar();
  });

  document.getElementById("save-btn").addEventListener("click", saveSession);
  document.getElementById("bw-save").addEventListener("click", saveBw);

  document.getElementById("repo-close").addEventListener("click", () => {
    document.getElementById("repo-modal").classList.add("hidden");
  });
  document.getElementById("repo-search").addEventListener("input", e => {
    repoSearch = e.target.value; renderRepoList();
  });

  setSyncStatus("loading");
  try {
    const [sessResult, bwResult] = await Promise.all([
      sheetsCall({ action: "read" }),
      sheetsCall({ action: "read_bodyweight" }),
    ]);
    sessions = parseSessionRows(sessResult.rows);
    bwData = [];
    for (let i = 1; i < bwResult.rows.length; i++) {
      const [rawDate, weight] = bwResult.rows[i];
      if (!rawDate) continue;
      bwData.push({ date: cleanDate(rawDate), weight: parseFloat(weight) });
    }
    bwData.sort((a,b) => a.date.localeCompare(b.date));
    setSyncStatus("synced");
  } catch (e) {
    setSyncStatus("error", e.message);
    toast("Could not connect to Google Sheets");
  }

  await checkForDraft();

  renderDayButtons();
  renderExercises();
  renderLastSession();

  document.getElementById("loading").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

init();
