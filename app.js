// ── Config ────────────────────────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxsv-ZDZCGRzSOOx5pjBTm33BtxfxeRl_gzYE0hYnDQcJZiWCpY0XdmlNNKIvMgnkU/exec";

const LOWER_DAYS = ["Day 3 — Legs", "Day 5 — Lower"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const DEFAULTS = {
  "Day 1 — Push": [
    { name: "Barbell Bench Press",       sets: 4, reps: "6–8",    repMin: 6,  repMax: 8,  weight: 160 },
    { name: "Incline Dumbbell Press",    sets: 3, reps: "8–10",   repMin: 8,  repMax: 10, weight: 62  },
    { name: "Barbell Overhead Press",    sets: 3, reps: "8–10",   repMin: 8,  repMax: 10, weight: 110 },
    { name: "Cable Lateral Raise",       sets: 4, reps: "12–15",  repMin: 12, repMax: 15, weight: 17  },
    { name: "Dumbbell Lateral Raise",    sets: 3, reps: "15–20",  repMin: 15, repMax: 20, weight: 26  },
    { name: "Tricep Rope Pushdown",      sets: 3, reps: "12–15",  repMin: 12, repMax: 15, weight: 55  },
    { name: "Overhead Tricep Extension", sets: 3, reps: "10–12",  repMin: 10, repMax: 12, weight: 55  },
  ],
  "Day 2 — Pull": [
    { name: "Weighted Pull-Up / Lat Pulldown", sets: 4, reps: "6–8",   repMin: 6,  repMax: 8,  weight: 155 },
    { name: "Barbell Pendlay Row",             sets: 4, reps: "6–8",   repMin: 6,  repMax: 8,  weight: 155 },
    { name: "Seated Cable Row",                sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 143 },
    { name: "Chest-Supported DB Row",          sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 66  },
    { name: "Face Pull",                       sets: 4, reps: "15–20", repMin: 15, repMax: 20, weight: 44  },
    { name: "EZ Bar Curl",                     sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 77  },
    { name: "Incline Dumbbell Curl",           sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 31  },
  ],
  "Day 3 — Legs": [
    { name: "Hack Squat",            sets: 4, reps: "8–10",    repMin: 8,  repMax: 10, weight: 220 },
    { name: "Single Leg Leg Press",  sets: 3, reps: "10–12",   repMin: 10, repMax: 12, weight: 110 },
    { name: "Romanian Deadlift",     sets: 4, reps: "8–10",    repMin: 8,  repMax: 10, weight: 176 },
    { name: "Leg Curl",              sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 99  },
    { name: "Leg Extension",         sets: 3, reps: "12–15",   repMin: 12, repMax: 15, weight: 110 },
    { name: "Standing Calf Raise",   sets: 4, reps: "12–15",   repMin: 12, repMax: 15, weight: 176 },
    { name: "Seated Calf Raise",     sets: 3, reps: "15–20",   repMin: 15, repMax: 20, weight: 110 },
  ],
  "Day 4 — Upper": [
    { name: "Incline Barbell Bench Press", sets: 4, reps: "8–10",  repMin: 8,  repMax: 10, weight: 143 },
    { name: "Chest-Supported T-Bar Row",  sets: 4, reps: "8–10",  repMin: 8,  repMax: 10, weight: 110 },
    { name: "Dumbbell Shoulder Press",    sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: 53  },
    { name: "Single-Arm Cable Row",       sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 66  },
    { name: "Pec Deck / Cable Fly",       sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 121 },
    { name: "Rear Delt Fly",              sets: 3, reps: "15–20", repMin: 15, repMax: 20, weight: 44  },
    { name: "Hammer Curl",                sets: 3, reps: "12–15", repMin: 12, repMax: 15, weight: 40  },
    { name: "Tricep Dip",                 sets: 3, reps: "10–12", repMin: 10, repMax: 12, weight: null },
  ],
  "Day 5 — Lower": [
    { name: "Leg Press",               sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 265 },
    { name: "Walking Lunges (DB)",     sets: 3, reps: "12 each",  repMin: 12, repMax: 12, weight: 48  },
    { name: "Stiff-Leg Deadlift (DB)", sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 70  },
    { name: "Leg Curl (seated)",       sets: 3, reps: "12–15",   repMin: 12, repMax: 15, weight: 88  },
    { name: "Leg Extension",           sets: 3, reps: "15–20",   repMin: 15, repMax: 20, weight: 99  },
    { name: "Hip Thrust",              sets: 4, reps: "10–12",   repMin: 10, repMax: 12, weight: 198 },
    { name: "Seated Calf Raise",       sets: 4, reps: "15–20",   repMin: 15, repMax: 20, weight: 110 },
  ],
};
const DAYS = Object.keys(DEFAULTS);

// ── State ─────────────────────────────────────────────────────────────────────
let exercises   = JSON.parse(JSON.stringify(DEFAULTS));
let sessions    = {};   // sessionKey -> { date, day, exercises: { name -> [{set,weight,reps,notes}] } }
let progHist    = [];
let activeDay   = DAYS[0];
let sessDate    = todayStr();
let liveLog     = {};   // { exIdx: { sets: [{weight,reps}] } }
let liveNote    = {};   // { exIdx: string }
let calYear     = new Date().getFullYear();
let calMonth    = new Date().getMonth();
let selDate     = null;
let swapIdx     = null;

// ── Utilities ─────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function lsGet(k, fb) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

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

async function loadSessions() {
  const d = await sheetsCall({ action: "read" });
  return parseRows(d.rows);
}

async function writeSessions(rows) {
  await sheetsCall({ action: "write", rows: JSON.stringify(rows) });
}

async function clearSession(sessionKey) {
  await sheetsCall({ action: "clear", sessionKey });
}

// ── Parse sheet rows ──────────────────────────────────────────────────────────
function parseRows(rows) {
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const [date, day, exercise, set, weight, reps, notes, sessionKey] = rows[i];
    if (!sessionKey || !date) continue;
    if (!result[sessionKey]) result[sessionKey] = { date, day, exercises: {} };
    if (!result[sessionKey].exercises[exercise]) result[sessionKey].exercises[exercise] = [];
    result[sessionKey].exercises[exercise].push({ set, weight, reps, notes });
  }
  return result;
}

function formatSession(sess) {
  return Object.entries(sess.exercises).map(([name, sets]) =>
    `${name}:\n` + sets.map(s =>
      `  S${s.set}: ${s.weight}lb × ${s.reps} reps${s.notes ? "  ["+s.notes+"]" : ""}`
    ).join("\n")
  ).join("\n\n");
}

// ── Progression ───────────────────────────────────────────────────────────────
function getHint(ex, setLogs, dayKey) {
  if (!ex.weight || !setLogs) return null;
  const filled = setLogs.filter(s => s.reps && s.weight);
  if (!filled.length) return null;
  const bump = LOWER_DAYS.includes(dayKey) ? 10 : 5;
  if (filled.every(s => parseInt(s.reps) >= ex.repMax))
    return { text: `↑ Hit ${ex.repMax}+ reps on all sets — add ${bump}lb next session`, dir: "up" };
  if (filled.some(s => parseInt(s.reps) < ex.repMin))
    return { text: `↓ Fell below ${ex.repMin} reps — consider −${bump}lb`, dir: "down" };
  return null;
}

function applyProgression(exList, dayKey, log) {
  const bump = LOWER_DAYS.includes(dayKey) ? 10 : 5;
  const changes = [];
  const updated = exList.map((ex, i) => {
    if (!ex.weight) return ex;
    const filled = (log[i]?.sets || []).filter(s => s.reps && s.weight);
    if (!filled.length) return ex;
    if (filled.every(s => parseInt(s.reps) >= ex.repMax)) {
      const nw = ex.weight + bump;
      changes.push({ name: ex.name, from: ex.weight, to: nw, dir: "up" });
      return { ...ex, weight: nw };
    }
    if (filled.some(s => parseInt(s.reps) < ex.repMin)) {
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

// ── Sync status UI ────────────────────────────────────────────────────────────
function setSyncStatus(state, msg) {
  const el = document.getElementById("sync-status");
  el.className = "sync-status " + state;
  el.title = msg || "";
  const labels = { loading: "● LOADING", saving: "● SAVING", synced: "● SYNCED", error: "● ERROR" };
  el.textContent = labels[state] || "● " + state.toUpperCase();
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

// ── Render exercises ──────────────────────────────────────────────────────────
function renderExercises() {
  const curEx = exercises[activeDay] || [];
  const bump = LOWER_DAYS.includes(activeDay) ? 10 : 5;
  document.getElementById("active-day-label").textContent = activeDay;
  document.getElementById("progression-hint-global").textContent =
    `Auto-progression: +${bump}lb when all sets hit top of rep range`;

  const container = document.getElementById("exercises-list");
  container.innerHTML = "";

  if (!curEx.length) {
    container.innerHTML = '<div style="font-size:12px;color:#333;padding:16px 0">No exercises for this day.</div>';
    return;
  }

  curEx.forEach((ex, i) => {
    const card = document.createElement("div");
    card.className = "exercise-card";

    const hint = getHint(ex, liveLog[i]?.sets, activeDay);

    card.innerHTML = `
      <div class="ex-header">
        <div>
          <div class="ex-name">${ex.name}</div>
          <div class="ex-meta">${ex.sets}×${ex.reps} · <span class="weight">${ex.weight ? ex.weight + "lb" : "BW"}</span></div>
        </div>
        <div class="ex-actions">
          <button class="btn-icon btn-swap" data-idx="${i}" title="Swap exercise">⇄</button>
          <button class="btn-icon btn-del" data-idx="${i}" title="Remove">✕</button>
        </div>
      </div>
      <div class="sets-grid">
        ${Array.from({length: ex.sets}).map((_, si) => `
          <div class="set-row">
            <div class="set-num">S${si+1}</div>
            <input type="number" class="set-weight" data-ex="${i}" data-set="${si}" placeholder="lb" value="${liveLog[i]?.sets?.[si]?.weight || ""}" />
            <input type="number" class="set-reps" data-ex="${i}" data-set="${si}" placeholder="reps" value="${liveLog[i]?.sets?.[si]?.reps || ""}" />
          </div>
        `).join("")}
      </div>
      ${hint ? `<div class="hint ${hint.dir}">${hint.text}</div>` : ""}
      <div class="notes-row">
        <div class="notes-label">Notes</div>
        <input type="text" class="notes-input" data-ex="${i}" placeholder="form cues, how it felt..." value="${liveNote[i] || ""}" />
      </div>
    `;

    container.appendChild(card);
  });

  // Bind inputs
  container.querySelectorAll(".set-weight, .set-reps").forEach(inp => {
    inp.addEventListener("input", e => {
      const ex = parseInt(e.target.dataset.ex);
      const si = parseInt(e.target.dataset.set);
      const field = e.target.classList.contains("set-weight") ? "weight" : "reps";
      if (!liveLog[ex]) liveLog[ex] = { sets: [] };
      if (!liveLog[ex].sets[si]) liveLog[ex].sets[si] = {};
      liveLog[ex].sets[si][field] = e.target.value;
      // Update hint live
      const hintEl = e.target.closest(".exercise-card").querySelector(".hint");
      const newHint = getHint(exercises[activeDay][ex], liveLog[ex]?.sets, activeDay);
      if (hintEl) {
        hintEl.textContent = newHint ? newHint.text : "";
        hintEl.className = "hint " + (newHint?.dir || "");
      } else if (newHint) {
        const notesRow = e.target.closest(".exercise-card").querySelector(".notes-row");
        const hDiv = document.createElement("div");
        hDiv.className = "hint " + newHint.dir;
        hDiv.textContent = newHint.text;
        e.target.closest(".exercise-card").insertBefore(hDiv, notesRow);
      }
    });
  });

  container.querySelectorAll(".notes-input").forEach(inp => {
    inp.addEventListener("input", e => {
      liveNote[parseInt(e.target.dataset.ex)] = e.target.value;
    });
  });

  container.querySelectorAll(".btn-swap").forEach(btn => {
    btn.addEventListener("click", e => openSwap(parseInt(e.target.dataset.idx)));
  });

  container.querySelectorAll(".btn-del").forEach(btn => {
    btn.addEventListener("click", e => {
      const idx = parseInt(e.target.dataset.idx);
      exercises[activeDay] = exercises[activeDay].filter((_, i) => i !== idx);
      lsSet("il:exercises", exercises);
      renderExercises();
    });
  });
}

// ── Render last session ───────────────────────────────────────────────────────
function renderLastSession() {
  const prev = Object.values(sessions)
    .filter(s => s.day === activeDay && s.date !== sessDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const box = document.getElementById("last-session-box");
  const none = document.getElementById("no-last-session");

  if (prev) {
    box.classList.remove("hidden");
    none.classList.add("hidden");
    document.getElementById("last-session-title").textContent =
      `LAST ${activeDay.split("—")[1]?.trim().toUpperCase()} — ${prev.date}`;
    document.getElementById("last-session-body").textContent = formatSession(prev);
  } else {
    box.classList.add("hidden");
    none.classList.remove("hidden");
    none.textContent = `No previous ${activeDay.split("—")[1]?.trim()} session on record.`;
  }
}

// ── Day selector ──────────────────────────────────────────────────────────────
function renderDayButtons() {
  const container = document.getElementById("day-buttons");
  container.innerHTML = "";
  DAYS.forEach(d => {
    const btn = document.createElement("button");
    btn.className = "day-btn" + (d === activeDay ? " active" : "");
    btn.textContent = d.split("—")[1]?.trim();
    btn.addEventListener("click", () => {
      activeDay = d;
      liveLog = {};
      liveNote = {};
      renderDayButtons();
      renderExercises();
      renderLastSession();
    });
    container.appendChild(btn);
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function renderCalendar() {
  const tk = todayStr();
  document.getElementById("cal-month-label").textContent = `${MONTHS[calMonth]} ${calYear}`;

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const sessionDates = new Set(Object.values(sessions).map(s => s.date));

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";

  for (let i = 0; i < firstDow; i++) {
    grid.appendChild(document.createElement("div"));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dk = dateKey(calYear, calMonth, d);
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (dk === tk) cell.classList.add("today");
    if (sessionDates.has(dk)) cell.classList.add("has-session");
    if (dk === selDate) cell.classList.add("selected");
    cell.textContent = d;

    if (sessionDates.has(dk) && dk !== selDate) {
      const dot = document.createElement("div");
      dot.className = "cal-dot";
      cell.appendChild(dot);
    }

    cell.addEventListener("click", () => {
      selDate = selDate === dk ? null : dk;
      renderCalendar();
      renderCalDetail();
    });
    grid.appendChild(cell);
  }
}

function renderCalDetail() {
  const detail = document.getElementById("cal-detail");
  if (!selDate) { detail.classList.add("hidden"); return; }

  const daySessions = Object.entries(sessions).filter(([, s]) => s.date === selDate);
  detail.classList.remove("hidden");
  detail.innerHTML = `<div class="cal-detail-date">${selDate}</div>`;

  if (!daySessions.length) {
    detail.innerHTML += `<div class="cal-empty">No session logged.</div>`;
    return;
  }

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
      const key = btn.dataset.key;
      setSyncStatus("saving");
      try {
        await clearSession(key);
        sessions = await loadSessions();
        setSyncStatus("synced");
        selDate = null;
        renderCalendar();
        renderCalDetail();
        toast("Session deleted");
      } catch (e) {
        setSyncStatus("error", e.message);
        toast("Delete failed: " + e.message);
      }
    });
  });
}

// ── Progress ──────────────────────────────────────────────────────────────────
function renderProgress() {
  const histEl = document.getElementById("prog-history");
  const wtEl   = document.getElementById("current-weights");

  if (!progHist.length) {
    histEl.innerHTML = '<div class="prog-empty">No changes yet. Hit the top of your rep range on all sets and save — weights auto-update and appear here.</div>';
  } else {
    histEl.innerHTML = progHist.map(entry => `
      <div class="prog-entry">
        <div class="prog-entry-header">
          <span class="prog-date">${entry.date}</span>
          <span class="prog-day">${entry.day}</span>
        </div>
        ${entry.changes.map(c => `
          <div class="prog-change">
            <span class="prog-arrow ${c.dir}">${c.dir === "up" ? "↑" : "↓"}</span>
            <span class="prog-exname">${c.name}</span>
            <span class="prog-weights">
              <span class="prog-from">${c.from}lb</span>
              <span class="prog-sep">→</span>
              <span class="${c.dir === "up" ? "prog-to-up" : "prog-to-dn"}">${c.to}lb</span>
            </span>
          </div>
        `).join("")}
      </div>
    `).join("");
  }

  wtEl.innerHTML = DAYS.map(dk => `
    <div class="weights-day">
      <div class="weights-day-title">${dk}</div>
      ${(exercises[dk] || []).map(ex => `
        <div class="weights-row">
          <span>${ex.name}</span>
          <span>${ex.weight ? ex.weight + "lb" : "BW"}</span>
        </div>
      `).join("")}
    </div>
  `).join("");
}

// ── Save session ──────────────────────────────────────────────────────────────
async function saveSession() {
  const curEx = exercises[activeDay] || [];
  const sessionKey = `${sessDate}_${activeDay}`;
  const rows = [];
  let hasData = false;

  curEx.forEach((ex, i) => {
    (liveLog[i]?.sets || []).forEach((st, si) => {
      if (!st.weight && !st.reps) return;
      hasData = true;
      rows.push([sessDate, activeDay, ex.name, si + 1, st.weight || "", st.reps || "", liveNote[i] || "", sessionKey]);
    });
  });

  if (!hasData) { toast("Nothing logged yet"); return; }

  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  setSyncStatus("saving");

  try {
    await clearSession(sessionKey);
    await writeSessions(rows);

    const { updated, changes } = applyProgression(curEx, activeDay, liveLog);
    if (changes.length) {
      exercises[activeDay] = updated;
      progHist.unshift({ date: sessDate, day: activeDay, changes });
      lsSet("il:exercises", exercises);
      lsSet("il:progHist",  progHist);
    }

    sessions = await loadSessions();
    setSyncStatus("synced");
    liveLog = {}; liveNote = {};
    renderExercises();
    renderLastSession();

    const upCount = changes.filter(c => c.dir === "up").length;
    toast(`Saved to Google Sheets${upCount ? ` — ${upCount} weight↑` : ""}`);
  } catch (e) {
    setSyncStatus("error", e.message);
    toast("Save failed: " + e.message);
  }

  btn.disabled = false;
  btn.textContent = "Save Session →";
}

// ── Swap modal ────────────────────────────────────────────────────────────────
function openSwap(idx) {
  swapIdx = idx;
  const ex = exercises[activeDay][idx];
  document.getElementById("swap-replacing").textContent = "Replacing: " + ex.name;
  document.getElementById("swap-name").value = ex.name;
  document.getElementById("swap-weight").value = ex.weight || "";
  document.getElementById("swap-modal").classList.remove("hidden");
  document.getElementById("swap-name").focus();
}

function closeSwap() {
  swapIdx = null;
  document.getElementById("swap-modal").classList.add("hidden");
}

function confirmSwap() {
  if (swapIdx === null) return;
  const name = document.getElementById("swap-name").value.trim();
  if (!name) return;
  const wt = parseFloat(document.getElementById("swap-weight").value);
  const orig = exercises[activeDay][swapIdx];
  exercises[activeDay][swapIdx] = { ...orig, name, weight: isNaN(wt) ? orig.weight : wt };
  lsSet("il:exercises", exercises);
  closeSwap();
  renderExercises();
  toast("Exercise swapped");
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + tab));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("hidden", c.id !== "tab-" + tab));
  if (tab === "calendar") { renderCalendar(); renderCalDetail(); }
  if (tab === "progress")  renderProgress();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Load saved exercises + prog history from localStorage (persists between visits)
  const savedEx = lsGet("il:exercises", null);
  if (savedEx) exercises = savedEx;
  const savedPh = lsGet("il:progHist", null);
  if (savedPh) progHist = savedPh;

  // Set today's date
  document.getElementById("session-date").value = sessDate;
  document.getElementById("session-date").addEventListener("change", e => {
    sessDate = e.target.value;
    renderLastSession();
  });

  // Tab buttons
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Calendar nav
  document.getElementById("cal-prev").addEventListener("click", () => {
    if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--;
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
    renderCalendar();
  });

  // Save button
  document.getElementById("save-btn").addEventListener("click", saveSession);

  // Swap modal
  document.getElementById("swap-confirm").addEventListener("click", confirmSwap);
  document.getElementById("swap-cancel").addEventListener("click", closeSwap);
  document.getElementById("swap-modal").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeSwap();
  });
  document.getElementById("swap-name").addEventListener("keydown", e => { if (e.key === "Enter") confirmSwap(); });
  document.getElementById("swap-weight").addEventListener("keydown", e => { if (e.key === "Enter") confirmSwap(); });

  // Load sessions from Google Sheets
  setSyncStatus("loading");
  try {
    sessions = await loadSessions();
    setSyncStatus("synced");
  } catch (e) {
    setSyncStatus("error", e.message);
    toast("Could not connect to Google Sheets: " + e.message);
  }

  // Render
  renderDayButtons();
  renderExercises();
  renderLastSession();

  // Show app
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

init();
