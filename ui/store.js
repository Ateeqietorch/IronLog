// App state, persistence, and loading. The Train/History/Progress views read
// from here; nothing here touches the DOM.
import { indexCatalog, mergeCatalogs, validateExercise } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { replayHistory } from "../engine/replay.js";
import { mesoWeek } from "../engine/meso.js";
import { tables } from "../data/sheets.js";
import { readLog, readBodyweight, writeSession, dedupeLog } from "../data/log.js";
import { loadProgram, replaceSlot, saveProgramStorage, readProgramStorage } from "../data/program.js";
import { newTrial, applyTrials, recordSession, resolveTrial } from "../data/trials.js";
import { buildSession, toRows, applyChanges } from "./session.js";
import { validateDay } from "../engine/validate.js";
import { muscleState, recovered, chooseNextDay } from "../engine/recovery.js";
import { assessSession } from "../engine/assess.js";
import { withDefaults, mergeConstraints, active, cleanConstraint } from "../data/constraints.js";

const K = { session: "il3:session", log: "il3:logCache", meso: "il3:meso", settings: "il3:settings", pending: "il3:pending", bw: "il3:bodyweight", trials: "il3:trials", own: "il3:ownExercises", constraints: "il3:constraints" };

export const ls = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const state = {
  index: null, rows: [], models: {}, stats: null, program: null, bodyweight: null,
  session: null, settings: { policy: "balanced", haptics: true }, meso: null,
  trials: [], constraints: [], sync: "idle", offline: false, listeners: new Set(),
};

export function emit() { for (const f of state.listeners) f(state); }
export function subscribe(f) { state.listeners.add(f); return () => state.listeners.delete(f); }

function rebuildModels() {
  const r = replayHistory(state.rows, state.index);
  state.models = r.models;
  state.stats = r.stats;
}

export async function boot({ fixture = null } = {}) {
  state.settings = { ...state.settings, ...ls.get(K.settings, {}) };
  state.meso = ls.get(K.meso, null);
  state.trials = ls.get(K.trials, []);
  state.constraints = withDefaults(ls.get(K.constraints, []));
  let own = ls.get(K.own, []);
  if (!fixture) {
    try {
      const remote = (await tables.list("Exercises")).map((r) => r.value).filter((e) => e && !validateExercise(e).length);
      own = mergeCatalogs(own, remote);
      ls.set(K.own, own);
    } catch { /* offline or not deployed yet */ }
    tables.list("Trials").then((recs) => {
      // The sheet copy wins for trials this phone doesn't know about.
      const mine = new Set(state.trials.map((t) => t.id));
      const extra = recs.map((r) => r.value).filter((t) => t?.id && !mine.has(t.id));
      if (extra.length) { state.trials = [...state.trials, ...extra]; ls.set(K.trials, state.trials); emit(); }
    }).catch(() => {});
    tables.list("Constraints").then((recs) => {
      const remote = recs.map((r) => r.value).filter(Boolean);
      if (!remote.length) return;
      state.constraints = mergeConstraints(state.constraints, remote);
      ls.set(K.constraints, state.constraints);
      // Rebuild today's workout if it hasn't started, so new rules apply now.
      if (state.session && !state.session.saved && !anyLoggedIn(state.session)) startDay(state.session.dayKey, { persist: false, selection: state.session.selection });
      emit();
    }).catch(() => {});
  }
  state.index = indexCatalog(mergeCatalogs(own, CURATED));

  if (fixture) {
    state.rows = fixture.rows; state.bodyweight = fixture.bodyweight ?? null;
  } else {
    try {
      const [rows, bw] = await Promise.all([readLog(), readBodyweight()]);
      state.rows = rows; state.bodyweight = bw;
      ls.set(K.log, rows); if (bw) ls.set(K.bw, bw);
      // Earlier versions could save a workout more than once; clean the sheet.
      if (rows.duplicates > 0) dedupeLog().catch(() => {});
    } catch (err) {
      state.offline = true;
      state.rows = ls.get(K.log, []);
      state.bodyweight = ls.get(K.bw, null);
    }
  }
  // Sets saved on this phone but not yet in the sheet still count.
  const pending = pendingList();
  for (const p of pending) state.rows = [...state.rows.filter((r) => r.sessionKey !== p.sessionKey), ...p.rowsObj];

  state.program = loadProgram(state.index, fixture?.program ?? undefined);
  rebuildModels();

  const draft = ls.get(K.session, null);
  const draftHasSets = draft?.exercises?.some((e) => e.logged?.length);
  if (draft && !draft.saved && draftHasSets && draft.date >= shiftDate(today(), -1)) state.session = draft;
  else {
    const pick = suggestNext(today());
    startDay(pick.day.key, { persist: false, selection: pick.reason });
  }
  emit();
  if (pending.length && !fixture) retryPending();
}

function shiftDate(d, n) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

export function weekInfo(date = today()) {
  return mesoWeek(state.meso ?? { start: date }, date);
}

// Which day to train next, by recovery rather than list order.
export function suggestNext(date = today()) {
  const constraints = active(state.constraints);
  const prepare = (d) => validateDay(applyTrials(d, state.trials, state.index), { index: state.index, constraints }).day;
  return chooseNextDay(state.program, state.rows, state.index, date, { prepare }) ?? { day: state.program.days[0], reason: "" };
}

export function startDay(dayKey, { persist = true, selection = null } = {}) {
  const base = state.program.days.find((d) => d.key === dayKey) ?? state.program.days[0];
  const date = today();
  // Every session passes the validator before you see it: avoid list,
  // spine load, redundant exercises, pattern caps, per-muscle volume.
  const st = muscleState(state.rows, state.index, date);
  const checked = validateDay(applyTrials(base, state.trials, state.index), {
    index: state.index, constraints: active(state.constraints), recovery: st,
    recoveredFn: (m) => recovered(st, m, date), date,
  });
  state.session = buildSession({
    day: checked.day, index: state.index, models: state.models, date, weekInfo: weekInfo(date),
    bodyweight: state.bodyweight, policy: state.settings.policy,
  });
  state.session.adjustments = checked.notes;
  state.session.selection = selection;
  if (persist) saveDraft(); else ls.del(K.session);
}

// ── Standing rules ─────────────────────────────────────────────────────────
export function setConstraints(list) {
  state.constraints = list;
  ls.set(K.constraints, list);
  tables.upsert("Constraints", list.map((c) => ({ key: c.id, value: c }))).catch(() => {});
  if (state.session && !state.session.saved && !anyLoggedIn(state.session)) startDay(state.session.dayKey, { persist: false, selection: state.session.selection });
  emit();
}
export function addConstraint(c) {
  const x = cleanConstraint(c);
  if (!x) return null;
  const dup = state.constraints.find((y) => !y.removed && y.type === x.type && y.target.toLowerCase() === x.target.toLowerCase());
  if (dup) return dup;
  setConstraints([...state.constraints, x]);
  return x;
}
export function removeConstraint(id) {
  setConstraints(state.constraints.map((c) => (c.id === id ? { ...c, removed: true } : c)));
}

let undoSnapshot = null;
export function setSession(s, { undoable = false } = {}) {
  undoSnapshot = undoable ? state.session : null;
  state.session = s;
  if (!state.meso && s.startedAt) { state.meso = { start: s.date }; ls.set(K.meso, state.meso); }
  saveDraft();
  emit();
}

export function undo() {
  if (!undoSnapshot) return false;
  state.session = undoSnapshot;
  undoSnapshot = null;
  saveDraft(); emit();
  return true;
}
export const canUndo = () => !!undoSnapshot;

export function saveDraft() { ls.set(K.session, state.session); }

export function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  ls.set(K.settings, state.settings);
  emit();
}

export function newBlock() {
  state.meso = { start: today() };
  ls.set(K.meso, state.meso);
  emit();
}

// Save the session to the sheet. If that fails, keep it as pending and retry
// next time the app opens or comes back online. Only one save runs at a time:
// a second tap, the reconnect retry and the app-open retry all wait for (or
// reuse) the save already in flight.
let inFlight = null;

// Workouts finished on this phone but not yet confirmed in the sheet.
// (Older versions stored a single { sessionKey, rows, rowsObj }.)
function pendingList() {
  const p = ls.get(K.pending, null);
  if (!p) return [];
  return (Array.isArray(p) ? p : [p]).filter((x) => x?.rows?.length);
}
function addPending(entry) { ls.set(K.pending, [...pendingList().filter((x) => x.sessionKey !== entry.sessionKey), entry]); }
function dropPending(sessionKey, rows) {
  // Only drop it if it hasn't been re-saved with different sets meanwhile.
  const left = pendingList().filter((x) => !(x.sessionKey === sessionKey && JSON.stringify(x.rows) === JSON.stringify(rows)));
  if (left.length) ls.set(K.pending, left); else ls.del(K.pending);
}
export const isSaving = () => !!inFlight;

function save(sessionKey, rows) {
  if (inFlight) return inFlight.then(() => save(sessionKey, rows), () => save(sessionKey, rows));
  inFlight = writeSession(sessionKey, rows).finally(() => { inFlight = null; });
  return inFlight;
}

export async function finishSession({ fixture = false } = {}) {
  const s = state.session;
  if (!s || s.saved) return { ok: false, msg: "Already saved" };
  if (inFlight) return { ok: false, msg: "Saving…" };
  const rows = toRows(s);
  if (!rows.length) return { ok: false, msg: "Nothing logged yet" };
  const rowsObj = rows.map((r) => ({ date: r[0], day: r[1], exercise: r[2], set: r[3], weight: r[4], reps: r[5], notes: r[6], sessionKey: r[7], rpe: r[8], completed: r[9], exerciseId: r[10] }));
  state.rows = [...state.rows.filter((r) => r.sessionKey !== s.sessionKey), ...rowsObj];
  rebuildModels();
  // Mark it saved and keep a pending copy before the network call, so a
  // reload mid-save resumes the same save instead of starting a new one.
  addPending({ sessionKey: s.sessionKey, rows, rowsObj });
  let assessment = null;
  try { assessment = assessSession({ session: s, rows: state.rows, index: state.index, date: s.date }); } catch { /* never block a save */ }
  if (assessment) ls.set("il3:lastAssessment", { date: s.date, day: s.dayLabel, verdict: assessment.verdict, headline: assessment.headline, lines: assessment.lines });
  state.session = { ...s, saved: true, assessment };
  ls.del(K.session);
  state.sync = "saving"; emit();
  if (fixture) { dropPending(s.sessionKey, rows); state.sync = "saved"; onFinish.forEach((f) => f(s)); emit(); return { ok: true, pending: false }; }
  try {
    await save(s.sessionKey, rows);
    dropPending(s.sessionKey, rows);
    ls.set(K.log, state.rows);
    state.sync = "saved";
  } catch {
    state.sync = "pending";
  }
  onFinish.forEach((f) => { try { f(s); } catch { /* ignore */ } });
  emit();
  return { ok: true, pending: state.sync === "pending" };
}

// Hooks run after a workout is finished.
const onFinish = new Set([(s) => setTrials(recordSession(state.trials, s))]);
export const afterFinish = (f) => onFinish.add(f);

export async function retryPending() {
  if (inFlight) return;
  const list = pendingList();
  if (!list.length) return;
  state.sync = "saving"; emit();
  try {
    for (const p of list) { await save(p.sessionKey, p.rows); dropPending(p.sessionKey, p.rows); }
    ls.set(K.log, state.rows);
    state.sync = "saved";
  } catch { state.sync = "pending"; }
  emit();
}

export const hasPending = () => pendingList().length > 0;

// Coach proposals: change_day restarts today on another day; everything else
// edits today's session through applyChanges (engine recomputes the numbers).
export function applyProposal(changes) {
  const day = changes.find((c) => c.type === "change_day");
  if (day) { startDay(day.dayKey); setSession(state.session); return; }
  setSession(applyChanges(state.session, changes, { index: state.index, models: state.models }), { undoable: true });
}

// ── Switching exercises (Today / Trial / Permanent) ────────────────────────
function setTrials(trials) {
  state.trials = trials;
  ls.set(K.trials, trials);
  tables.upsert("Trials", trials.map((t) => ({ key: t.id, value: t }))).catch(() => {});
}

// An exercise picked from the big database joins your own catalog so the
// program, history and coach all recognise it from now on.
export function addExercise(ex) {
  if (state.index.byId.has(ex.id)) return;
  const own = [...ls.get(K.own, []).filter((x) => x.id !== ex.id), ex];
  ls.set(K.own, own);
  state.index = indexCatalog(mergeCatalogs(own, CURATED));
  tables.upsert("Exercises", [{ key: ex.id, value: ex }]).catch(() => {});
}

// mode: "today" | "trial" | "permanent"
export function switchExercise(exIdx, to, mode, { sessions = 3 } = {}) {
  addExercise(to);
  const s = state.session;
  const e = s.exercises[exIdx];
  const change = { type: "switch_exercise", exerciseIndex: exIdx, toExerciseId: to.id };
  const slotIndex = e.slotIndex ?? exIdx;
  // The program's own exercise for this slot (not today's swap or trial).
  const progDay = state.program.days.find((d) => d.key === s.dayKey);
  const progSlot = progDay?.exercises[slotIndex];
  const from = progSlot ? (state.index.byId.get(progSlot.exerciseId) ?? { id: null, name: progSlot.name }) : (e.ex ?? { id: null, name: e.name });

  if (mode === "trial" && progSlot) {
    // A new trial replaces any open one on the same slot.
    const others = state.trials.map((t) => (t.dayKey === s.dayKey && t.slotIndex === slotIndex && ["active", "review"].includes(t.status) ? { ...t, status: "replaced" } : t));
    const t = newTrial({ dayKey: s.dayKey, slotIndex, from, to, sessions, date: s.date });
    setTrials([...others, t]);
    change.trial = { id: t.id, n: 1, of: t.sessions, fromName: from.name };
  }
  if (mode === "permanent" && progSlot) {
    const next = replaceSlot(state.program, readProgramStorage(), s.dayKey, slotIndex, to);
    if (next) {
      saveProgramStorage(next);
      state.program = loadProgram(state.index);
      setTrials(state.trials.map((t) => (t.dayKey === s.dayKey && t.slotIndex === slotIndex && ["active", "review"].includes(t.status) ? { ...t, status: "replaced" } : t)));
    }
  }
  setSession(applyChanges(s, [change], { index: state.index, models: state.models }), { undoable: mode === "today" });
}

// Trial review: keep it (becomes permanent), go back, or give it 2 more.
export function reviewTrial(id, decision) {
  const t = state.trials.find((x) => x.id === id);
  if (!t) return;
  if (decision === "keep") {
    const to = state.index.byId.get(t.toId);
    const next = to && replaceSlot(state.program, readProgramStorage(), t.dayKey, t.slotIndex, to);
    if (next) { saveProgramStorage(next); state.program = loadProgram(state.index); }
  }
  setTrials(resolveTrial(state.trials, id, decision));
  // If today's workout hasn't started, rebuild it so the decision shows now.
  if (state.session && !state.session.saved && !anyLoggedIn(state.session)) startDay(state.session.dayKey, { persist: false });
  emit();
}

const anyLoggedIn = (s) => s.exercises.some((e) => e.logged.length);
