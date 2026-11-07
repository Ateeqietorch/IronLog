// App state, persistence, and loading. The Train/History/Progress views read
// from here; nothing here touches the DOM.
import { indexCatalog, mergeCatalogs, validateExercise, exerciseFromSpec } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { replayHistory, normalizeRows } from "../engine/replay.js";
import { planDay, coachSnapshot } from "../engine/brain.js";
import { blockFor } from "../engine/block.js";
import { resolveDirectives, cleanDirective, mergeDirectives, activeDirectives } from "../engine/directives.js";
import { mesoWeek } from "../engine/meso.js";
import { tables } from "../data/sheets.js";
import { readLog, readBodyweightHistory, writeBodyweight, writeSession, dedupeLog, rowToObject, objectToRow } from "../data/log.js";
import { checkIn, checkInDue, cleanWeights, summary as nutritionSummary } from "../engine/nutrition.js";
import { loadProgram, replaceSlot, updateSlot, insertSlot, saveProgramStorage, readProgramStorage } from "../data/program.js";
import { newTrial, applyTrials, recordSession, resolveTrial } from "../data/trials.js";
import { buildSession, toRows, applyChanges, planOne } from "./session.js";
import { planExercise as brainPlanExercise } from "../engine/brain.js";
import { validateDay } from "../engine/validate.js";
import { muscleState, recovered, chooseNextDay } from "../engine/recovery.js";
import { assessSession } from "../engine/assess.js";
import { withDefaults, mergeConstraints, active, cleanConstraint } from "../data/constraints.js";

const K = { session: "il3:session", log: "il3:logCache", meso: "il3:meso", settings: "il3:settings", pending: "il3:pending", bw: "il3:bodyweight", trials: "il3:trials", own: "il3:ownExercises", constraints: "il3:constraints", feedback: "il4:feedback", directives: "il4:directives", nutrition: "il4:nutrition", weights: "il4:weights", weightsPending: "il4:weightsPending" };

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
  // Coach brain inputs (engine/brain.js): normalized sets, per-muscle
  // feedback, and standing directives from you or the coach.
  normSets: [], feedback: [], directives: [], plan: null,
  // Nutrition (engine/nutrition.js): profile + goal, weekly check-ins,
  // optional daily intake, and every weigh-in.
  nutrition: { profile: null, goal: null, proteinPerLb: null, checkins: [], intake: [] }, weights: [],
};

export function emit() { for (const f of state.listeners) f(state); }
export function subscribe(f) { state.listeners.add(f); return () => state.listeners.delete(f); }

function rebuildModels() {
  const r = replayHistory(state.rows, state.index);
  state.models = r.models;
  state.stats = r.stats;
  state.normSets = normalizeRows(state.rows, state.index).sets;
}

// ── Directives and feedback (the coach brain's inputs) ─────────────────────
export const directives = () => resolveDirectives(state.directives, { defaults: { minutes: state.settings.minutes ?? null, progression: state.settings.policy ?? "balanced" } });
export const brainCtx = () => {
  const dir = directives();
  let block = state.session?.block ?? state.plan?.block ?? null;
  if (!block) {
    const dates = [...new Set(state.normSets.map((x) => x.date))].filter((d) => d < today());
    block = blockFor(dates, today(), { weeks: dir.blockWeeks, deloadFrom: dir.deloadFrom, newBlockFrom: dir.newBlockFrom });
  }
  return { sets: state.normSets, block, directives: dir };
};
const joints = () => state.feedback.filter((f) => f.exerciseId && f.joints != null);

export async function boot({ fixture = null } = {}) {
  state.settings = { ...state.settings, ...ls.get(K.settings, {}) };
  state.meso = ls.get(K.meso, null);
  state.trials = ls.get(K.trials, []);
  state.feedback = ls.get(K.feedback, []);
  state.directives = ls.get(K.directives, []);
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
    // Feedback and directives live on the phone first and back up to the
    // sheet (older backends don't have these tables; that's fine).
    syncNutrition().then(() => runCheckIn());
    tables.list("Directives").then((recs) => {
      const remote = recs.map((r) => r.value).filter((d) => d?.id);
      const merged = mergeDirectives(remote, state.directives);
      const missing = state.directives.filter((d) => !remote.some((r) => r.id === d.id));
      if (missing.length) tables.upsert("Directives", missing.map((d) => ({ key: d.id, value: d }))).catch(() => {});
      if (JSON.stringify(merged) !== JSON.stringify(state.directives)) { state.directives = merged; ls.set(K.directives, merged); refreshToday(); emit(); }
    }).catch(() => {});
    tables.list("Feedback").then((recs) => {
      const remote = recs.map((r) => r.value).filter((f) => f?.id);
      const mine = new Set(state.feedback.map((f) => f.id));
      const extra = remote.filter((f) => !mine.has(f.id));
      const missing = state.feedback.filter((f) => !remote.some((r) => r.id === f.id));
      if (missing.length) tables.upsert("Feedback", missing.map((f) => ({ key: f.id, value: f }))).catch(() => {});
      if (extra.length) { state.feedback = [...state.feedback, ...extra]; ls.set(K.feedback, state.feedback); refreshToday(); emit(); }
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

  state.nutrition = { ...state.nutrition, ...ls.get(K.nutrition, {}) };
  if (fixture) {
    state.rows = fixture.rows; state.bodyweight = fixture.bodyweight ?? null;
    state.weights = fixture.weights ?? (fixture.bodyweight ? [{ date: today(), weight: fixture.bodyweight }] : []);
  } else {
    try {
      const [rows, ws] = await Promise.all([readLog(), readBodyweightHistory().catch(() => null)]);
      state.rows = rows;
      state.weights = cleanWeights([...(ws ?? ls.get(K.weights, [])), ...ls.get(K.weightsPending, [])]);
      const bw = state.weights.length ? state.weights[state.weights.length - 1].weight : null;
      state.bodyweight = bw;
      ls.set(K.log, rows); if (bw) ls.set(K.bw, bw); ls.set(K.weights, state.weights);
      flushWeights();
      // Earlier versions could save a workout more than once; clean the sheet.
      if (rows.duplicates > 0) dedupeLog().catch(() => {});
    } catch (err) {
      state.offline = true;
      state.rows = ls.get(K.log, []);
      state.bodyweight = ls.get(K.bw, null);
      state.weights = cleanWeights([...ls.get(K.weights, []), ...ls.get(K.weightsPending, [])]);
    }
  }
  // Sets saved on this phone but not yet in the sheet still count.
  const pending = pendingList();
  for (const p of pending) state.rows = [...state.rows.filter((r) => r.sessionKey !== p.sessionKey), ...p.rowsObj];

  state.program = loadProgram(state.index, fixture?.program ?? undefined);
  rebuildModels();

  const draft = ls.get(K.session, null);
  const draftHasSets = draft?.exercises?.some((e) => e.logged?.length);
  if (draft && !draft.saved && draftHasSets && draft.date >= shiftDate(today(), -1)) {
    state.session = draft;
    // The coach and Plan tab read the brain's view of this day.
    try { state.plan = planFor(draft.dayKey, draft.date).plan; } catch { state.plan = null; }
  } else {
    const pick = suggestNext(today());
    startDay(pick.day.key, { persist: false, selection: pick.reason });
  }
  runCheckIn();
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

// The brain's plan for a program day (after trials and the validator).
export function planFor(dayKey, date = today()) {
  const base = state.program.days.find((d) => d.key === dayKey) ?? state.program.days[0];
  // Every session passes the validator before you see it: avoid list,
  // spine load, redundant exercises, pattern caps, per-muscle volume.
  const st = muscleState(state.rows, state.index, date);
  const checked = validateDay(applyTrials(base, state.trials, state.index), {
    index: state.index, constraints: active(state.constraints), recovery: st,
    recoveredFn: (m) => recovered(st, m, date), date,
  });
  const plan = planDay({
    day: checked.day, program: state.program, date, sets: state.normSets, index: state.index, models: state.models,
    feedback: state.feedback, directives: directives(), bodyweight: state.bodyweight, joints: joints(),
  });
  return { checked, plan };
}

export function startDay(dayKey, { persist = true, selection = null, todayChanges = [] } = {}) {
  try { startBrainDay(dayKey, { persist, selection, todayChanges }); }
  catch (err) {
    // Never leave you without a workout: if the planner fails on something
    // unexpected, fall back to the previous engine for today.
    console.error("planner failed, using the previous engine", err);
    const base = state.program.days.find((d) => d.key === dayKey) ?? state.program.days[0];
    const date = today();
    const st = muscleState(state.rows, state.index, date);
    const checked = validateDay(applyTrials(base, state.trials, state.index), { index: state.index, constraints: active(state.constraints), recovery: st, recoveredFn: (m) => recovered(st, m, date), date });
    state.plan = null;
    state.session = buildSession({ day: checked.day, index: state.index, models: state.models, date, weekInfo: weekInfo(date), bodyweight: state.bodyweight, policy: state.settings.policy });
    state.session.adjustments = checked.notes;
    state.session.selection = selection;
    if (persist) saveDraft(); else ls.del(K.session);
  }
}

function startBrainDay(dayKey, { persist = true, selection = null, todayChanges = [] } = {}) {
  const date = today();
  const { checked, plan } = planFor(dayKey, date);
  state.plan = plan;
  let s = buildSession({
    day: checked.day, index: state.index, models: state.models, date,
    bodyweight: state.bodyweight, policy: directives().progression ?? state.settings.policy, brain: plan, ctx: { ...brainCtx(), block: plan.block },
  });
  s.adjustments = [...checked.notes, ...plan.notes];
  s.selection = selection;
  s.deloadSignal = plan.deloadSignal;
  // Re-apply today-only changes (a switch, an added exercise) made before
  // the workout started, so rebuilding the plan never loses them.
  if (todayChanges.length) {
    const fixed = todayChanges.map((c) => ({ ...c, exerciseIndex: c.fromId ? s.exercises.findIndex((e) => e.ex?.id === c.fromId) : c.exerciseIndex }))
      .filter((c) => c.type === "add_exercise" || c.type === "change_day" || c.exerciseIndex >= 0);
    s = applyChanges(s, fixed, { index: state.index, models: state.models, ctx: { ...brainCtx(), block: plan.block } });
    s.todayChanges = todayChanges;
  }
  state.session = s;
  if (persist) saveDraft(); else ls.del(K.session);
}

// Rebuild today's workout after a directive or feedback change. Before the
// first set: the whole plan is rebuilt (today's switches re-applied). After
// that: only exercises you haven't started are re-planned, in place.
export function refreshToday() {
  const s = state.session;
  if (!s || s.saved || !state.index) return;
  if (s.engine !== "brain" && anyLoggedIn(s)) return; // a workout started on the previous engine finishes on it
  if (!anyLoggedIn(s)) { startDay(s.dayKey, { persist: !!s.startedAt, selection: s.selection, todayChanges: s.todayChanges ?? [] }); return; }
  const ctx = brainCtx();
  const next = structuredClone(s);
  next.exercises = next.exercises.map((e) => {
    if (e.logged.length || !e.ex || e.coachSet) return e;
    const sore = Object.entries(e.ex.contributions).some(([m, c]) => c >= 1 && soreToday(m, s.date));
    const p = planOneFresh(e, ctx, { extraRir: sore ? 1 : 0 });
    return p ?? e;
  });
  state.session = next;
  saveDraft();
}

function soreToday(muscle, date) {
  return state.feedback.some((f) => f.date === date && f.muscle === muscle && f.soreness === 3);
}

function planOneFresh(e, ctx, { extraRir = 0 } = {}) {
  try {
    const it = brainPlanExercise({ ex: e.ex, slot: e.slot, nSets: e.slot.sets, date: state.session.date, sets: ctx.sets, models: state.models, block: ctx.block ?? state.session.block, directives: ctx.directives, bodyweight: state.bodyweight, extraRir });
    const p = planOne({ slot: e.slot, ex: e.ex, models: state.models, date: state.session.date, weekInfo: state.session.weekInfo, bodyweight: state.bodyweight, ctx: { ...ctx, block: ctx.block ?? state.session.block }, decided: it });
    return { ...e, ...p, slot: { ...e.slot, sets: p.sets } };
  } catch { return null; }
}

export function setDirectives(list, { replan = true } = {}) {
  state.directives = list;
  ls.set(K.directives, list);
  tables.upsert("Directives", list.map((d) => ({ key: d.id, value: d }))).catch(() => {});
  if (replan) { if (state.session?.saved) refreshPreview(); else refreshToday(); }
  emit();
}

let dirSeq = 0;
// Add a directive (from the Plan tab or the coach). Returns the stored one,
// or null if it's not valid.
export function addDirective(raw, { source = "user" } = {}) {
  const d = cleanDirective({ ...raw, source: raw.source ?? source, at: raw.at ?? today() }, { idFn: () => `d${Date.now().toString(36)}${(dirSeq++).toString(36)}` });
  if (!d) return null;
  setDirectives([...state.directives, d]);
  return d;
}
export function removeDirective(id) {
  setDirectives(state.directives.map((d) => (d.id === id ? { ...d, removed: true } : d)));
}
export const liveDirectives = () => activeDirectives(state.directives);

let fbSeq = 0;
// Per-muscle feedback (soreness before, pump/workload after) and per-
// exercise joint feedback. One record per date+muscle / date+exercise;
// later taps update it.
export function addFeedback(rec) {
  const date = rec.date ?? today();
  const key = (f) => `${f.date}|${f.muscle ?? ""}|${f.exerciseId ?? ""}`;
  const existing = state.feedback.find((f) => key(f) === key({ ...rec, date }));
  const next = existing ? { ...existing, ...rec, date } : { id: `f${Date.now().toString(36)}${(fbSeq++).toString(36)}`, ...rec, date };
  state.feedback = [...state.feedback.filter((f) => f !== existing), next].slice(-600);
  ls.set(K.feedback, state.feedback);
  tables.upsert("Feedback", [{ key: next.id, value: next }]).catch(() => {});
  if (rec.soreness != null) refreshToday();
  else if (state.session?.saved) refreshPreview();
  emit();
  return next;
}

// After a workout is saved, the brain's view moves to the next session.
export function refreshPreview() {
  try {
    const tmr = shiftDate(today(), 1);
    state.plan = planFor(suggestNext(tmr).day.key, tmr).plan;
  } catch { /* keep the last plan */ }
}
export const feedbackFor = (date, { muscle = null, exerciseId = null } = {}) => state.feedback.find((f) => f.date === date && (muscle ? f.muscle === muscle : true) && (exerciseId ? f.exerciseId === exerciseId : !f.exerciseId));

// What the coach sees of the brain: today's plan and the muscle table.
export function brainSnapshot() {
  if (!state.plan) return null;
  return coachSnapshot(state.plan, { index: state.index });
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
  addDirective({ kind: "new_block", from: today() });
}
export function deloadNow() {
  addDirective({ kind: "deload", from: today() });
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
  const rowsObj = rows.map(rowToObject);
  state.rows = [...state.rows.filter((r) => r.sessionKey !== s.sessionKey), ...rowsObj];
  rebuildModels();
  // Mark it saved and keep a pending copy before the network call, so a
  // reload mid-save resumes the same save instead of starting a new one.
  addPending({ sessionKey: s.sessionKey, rows, rowsObj });
  let assessment = null;
  try { assessment = assessSession({ session: s, rows: state.rows, index: state.index, date: s.date }); } catch { /* never block a save */ }
  if (assessment) ls.set("il3:lastAssessment", { date: s.date, day: s.dayLabel, verdict: assessment.verdict, headline: assessment.headline, lines: assessment.lines });
  state.session = { ...s, saved: true, assessment };
  refreshPreview();
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

// Add or change notes on a workout that's already saved (History). Every set
// is re-written with its other columns intact, so only the notes change.
// exerciseNotes: { [exercise name]: text }, sessionNote: text.
export async function updateSessionNotes(sessionKey, { exerciseNotes = {}, sessionNote = "" } = {}) {
  const mine = state.rows.filter((r) => r.sessionKey === sessionKey);
  if (!mine.length) return { ok: false, msg: "That workout isn't in your log" };
  const updated = mine.map((r) => ({
    ...r,
    notes: Object.prototype.hasOwnProperty.call(exerciseNotes, r.exercise) ? String(exerciseNotes[r.exercise] ?? "").trim() : r.notes,
    sessionNote: String(sessionNote ?? "").trim(),
  }));
  const rows = updated.map(objectToRow);
  state.rows = [...state.rows.filter((r) => r.sessionKey !== sessionKey), ...updated];
  ls.set(K.log, state.rows);
  // Same safety net as finishing a workout: pending until the sheet confirms.
  addPending({ sessionKey, rows, rowsObj: updated });
  emit();
  try {
    await save(sessionKey, rows);
    dropPending(sessionKey, rows);
    return { ok: true, pending: false };
  } catch {
    state.sync = "pending"; emit();
    return { ok: true, pending: true };
  }
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

// Coach proposals. Exercises the coach describes that aren't in the catalog
// get added to it first; "trial" and "permanent" changes also update the
// program; then everything for today goes through applyChanges.
// Returns a list of problems (empty = applied).
export function applyProposal(changes) {
  const day = changes.find((c) => c.type === "change_day");
  if (day) { startDay(day.dayKey); setSession(state.session); return []; }
  const problems = [];
  const today = [];
  for (const raw of changes) {
    const c = { ...raw };
    if ((c.type === "switch_exercise" || c.type === "add_exercise") && c.newExercise && !state.index.byId.has(c.toExerciseId)) {
      const r = exerciseFromSpec(c.newExercise, state.index);
      if (!r.ex) { problems.push(`Couldn't add ${c.newExercise.name}: ${r.problems[0]}`); continue; }
      addExercise(r.ex);
      c.toExerciseId = r.ex.id;
    }
    if (c.type === "switch_exercise" && (c.scope === "trial" || c.scope === "permanent")) {
      const to = state.index.byId.get(c.toExerciseId);
      if (to) Object.assign(c, recordSwitch(c.exerciseIndex, to, c.scope, { sessions: c.trialSessions ?? 3 }));
    }
    if (c.type === "add_exercise" && c.scope === "permanent") {
      const ex = state.index.byId.get(c.toExerciseId);
      if (ex) Object.assign(c, addToProgram(ex, c));
    }
    if ((c.type === "set_count" || c.type === "rep_range") && c.scope === "permanent") {
      const s = state.session;
      const e = s.exercises[c.exerciseIndex];
      const next = e && updateSlot(state.program, readProgramStorage(), s.dayKey, e.slotIndex ?? c.exerciseIndex, c.type === "set_count" ? { sets: c.sets } : { repRange: c.repRange });
      if (next) { saveProgramStorage(next); state.program = loadProgram(state.index); }
    }
    today.push(c);
  }
  if (today.length) {
    const before = state.session;
    const next = applyChanges(before, today, { index: state.index, models: state.models, ctx: brainCtx() });
    if (!anyLoggedIn(before)) next.todayChanges = [...(before.todayChanges ?? []), ...today.filter((c) => !c.scope || c.scope === "today").map((c) => ({ ...c, fromId: before.exercises[c.exerciseIndex]?.ex?.id ?? null }))];
    setSession(next, { undoable: true });
  }
  return problems;
}

// Put a coach-added exercise into today's program day, at the spot matching
// where it goes in today's workout. Exercises after it (and their trials)
// move down one program slot. Returns { slotIndex } for the session entry.
function addToProgram(ex, c) {
  const s = state.session;
  if (!s) return {};
  const pos = c.toPosition != null ? Number(c.toPosition) : s.exercises.length;
  const after = s.exercises.slice(Math.max(0, pos)).find((e) => (e.slotIndex ?? -1) >= 0);
  const at = after ? after.slotIndex : Infinity;
  const n = Array.isArray(c.numbers) && c.numbers.length ? c.numbers.length : c.sets;
  const r = insertSlot(state.program, readProgramStorage(), s.dayKey, at, ex, { sets: n, repRange: c.repRange });
  if (!r) return {};
  saveProgramStorage(r.storage);
  state.program = loadProgram(state.index);
  for (const e of s.exercises) if ((e.slotIndex ?? -1) >= r.slotIndex) e.slotIndex += 1;
  const moved = state.trials.map((t) => (t.dayKey === s.dayKey && t.slotIndex >= r.slotIndex ? { ...t, slotIndex: t.slotIndex + 1 } : t));
  if (moved.some((t, i) => t !== state.trials[i])) setTrials(moved);
  return { slotIndex: r.slotIndex };
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

// Record a trial or permanent swap in the program (not today's session).
// Returns extra fields for the switch change (the trial badge).
function recordSwitch(exIdx, to, mode, { sessions = 3 } = {}) {
  const s = state.session;
  const e = s.exercises[exIdx];
  const out = {};
  if (!e) return out;
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
    out.trial = { id: t.id, n: 1, of: t.sessions, fromName: from.name };
  }
  if (mode === "permanent" && progSlot) {
    const next = replaceSlot(state.program, readProgramStorage(), s.dayKey, slotIndex, to);
    if (next) {
      saveProgramStorage(next);
      state.program = loadProgram(state.index);
      setTrials(state.trials.map((t) => (t.dayKey === s.dayKey && t.slotIndex === slotIndex && ["active", "review"].includes(t.status) ? { ...t, status: "replaced" } : t)));
    }
  }
  return out;
}

// mode: "today" | "trial" | "permanent"
export function switchExercise(exIdx, to, mode, { sessions = 3 } = {}) {
  addExercise(to);
  const change = { type: "switch_exercise", exerciseIndex: exIdx, toExerciseId: to.id, ...recordSwitch(exIdx, to, mode, { sessions }) };
  const before = state.session;
  const next = applyChanges(before, [change], { index: state.index, models: state.models, ctx: brainCtx() });
  if (mode === "today" && !anyLoggedIn(before)) next.todayChanges = [...(before.todayChanges ?? []), { ...change, fromId: before.exercises[exIdx]?.ex?.id ?? null }];
  setSession(next, { undoable: mode === "today" });
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

// ── Undo for coach actions ─────────────────────────────────────────────────
// Everything a coach change can touch, captured before it applies.
export function snapshotState() {
  return {
    directives: structuredClone(state.directives), constraints: structuredClone(state.constraints),
    trials: structuredClone(state.trials), session: structuredClone(state.session),
    program: structuredClone(readProgramStorage()), feedback: structuredClone(state.feedback), own: ls.get(K.own, []),
    nutrition: structuredClone(state.nutrition),
  };
}
export function restoreState(snap) {
  if (!snap) return;
  if (snap.program?.exercises) { saveProgramStorage(snap.program); state.program = loadProgram(state.index); }
  setTrials(snap.trials);
  state.constraints = snap.constraints; ls.set(K.constraints, snap.constraints);
  tables.upsert("Constraints", snap.constraints.map((c) => ({ key: c.id, value: c }))).catch(() => {});
  state.feedback = snap.feedback; ls.set(K.feedback, snap.feedback);
  if (snap.nutrition) { state.nutrition = snap.nutrition; saveNutrition(); }
  // Directives keep tombstones so a removal syncs: anything added since the
  // snapshot is marked removed rather than dropped.
  const before = new Set(snap.directives.map((d) => d.id));
  const added = state.directives.filter((d) => !before.has(d.id)).map((d) => ({ ...d, removed: true }));
  setDirectives([...snap.directives, ...added], { replan: false });
  state.session = snap.session;
  saveDraft();
  if (state.session && !state.session.saved && !anyLoggedIn(state.session)) refreshToday();
  emit();
}


// ── Nutrition ──────────────────────────────────────────────────────────────
function saveNutrition() {
  ls.set(K.nutrition, state.nutrition);
  const n = state.nutrition;
  tables.upsert("Nutrition", [
    { key: "settings", value: { profile: n.profile, goal: n.goal, proteinPerLb: n.proteinPerLb } },
    { key: "checkins", value: { list: n.checkins.slice(-60) } },
    { key: "intake", value: { list: n.intake.slice(-120) } },
  ]).catch(() => {});
}

// Pull the sheet copy when this phone has none (new phone, cleared browser).
export async function syncNutrition() {
  try {
    const recs = await tables.list("Nutrition");
    const by = Object.fromEntries(recs.map((r) => [r.key, r.value]));
    const n = state.nutrition;
    if (!n.profile && by.settings?.profile) {
      state.nutrition = { ...n, ...by.settings, checkins: by.checkins?.list ?? [], intake: by.intake?.list ?? [] };
      ls.set(K.nutrition, state.nutrition);
      emit();
    } else if (n.profile) saveNutrition();
  } catch { /* older backend: phone only */ }
}

export function nutritionView(date = today()) {
  const n = state.nutrition;
  return nutritionSummary({ profile: n.profile, goal: n.goal, weights: state.weights, intake: n.intake, checkins: n.checkins, date });
}

// Run the weekly check-in if it's due. Returns the new check-in or null.
export function runCheckIn({ force = false, goalChange = false } = {}) {
  const n = state.nutrition;
  if (!n.profile || !n.goal || !state.weights.length) return null;
  const date = today();
  if (!force && !goalChange && !checkInDue(n.checkins, date)) return null;
  const c = checkIn({ profile: n.profile, goal: n.goal, weights: state.weights, intake: n.intake, checkins: n.checkins.filter((x) => x.date < date), date, proteinPerLb: n.proteinPerLb, goalChange });
  if (!c) return null;
  state.nutrition = { ...n, checkins: [...n.checkins.filter((x) => x.date !== date), c] };
  saveNutrition();
  emit();
  return c;
}

// Profile/goal changes. A new goal re-targets today; profile edits only
// matter for the very first estimate.
export function setNutrition({ profile, goal, proteinPerLb } = {}) {
  const n = state.nutrition;
  const goalChanged = goal && JSON.stringify(goal) !== JSON.stringify(n.goal);
  state.nutrition = { ...n, ...(profile ? { profile: { ...n.profile, ...profile } } : {}), ...(goal ? { goal } : {}), ...(proteinPerLb !== undefined ? { proteinPerLb } : {}) };
  saveNutrition();
  const fresh = !n.checkins.length;
  const c = runCheckIn({ goalChange: !fresh && (goalChanged || proteinPerLb !== undefined), force: fresh });
  emit();
  return c;
}

export function logWeight(weight, date = today()) {
  const w = Number(weight);
  if (!(w > 50 && w < 700)) return false;
  state.weights = cleanWeights([...state.weights.filter((x) => x.date !== date), { date, weight: w }]);
  if (date === state.weights[state.weights.length - 1].date) state.bodyweight = w;
  ls.set(K.weights, state.weights); ls.set(K.bw, state.bodyweight);
  ls.set(K.weightsPending, [...ls.get(K.weightsPending, []).filter((x) => x.date !== date), { date, weight: w }]);
  flushWeights();
  runCheckIn();
  emit();
  return true;
}

// One flush at a time; a weigh-in logged mid-flush is picked up by a rerun,
// so two quick edits on the same day can't land in the wrong order.
let flushing = null, flushAgain = false;
export function flushWeights() {
  if (flushing) { flushAgain = true; return flushing; }
  flushing = (async () => {
    do {
      flushAgain = false;
      for (const p of ls.get(K.weightsPending, [])) {
        try {
          await writeBodyweight(p.date, p.weight);
          ls.set(K.weightsPending, ls.get(K.weightsPending, []).filter((x) => !(x.date === p.date && x.weight === p.weight)));
        } catch { flushAgain = false; break; }
      }
    } while (flushAgain);
  })().finally(() => { flushing = null; });
  return flushing;
}

export function logIntake({ kcal = null, protein = null, date = today() } = {}) {
  const n = state.nutrition;
  const prev = n.intake.find((x) => x.date === date) ?? { date };
  const rec = { ...prev, ...(kcal != null && kcal !== "" ? { kcal: Number(kcal) } : {}), ...(protein != null && protein !== "" ? { protein: Number(protein) } : {}) };
  state.nutrition = { ...n, intake: [...n.intake.filter((x) => x.date !== date), rec].sort((a, b) => a.date.localeCompare(b.date)).slice(-180) };
  saveNutrition();
  emit();
  return rec;
}

// Meals (AI-estimated or quick-added): stored with the day and added to its
// totals; removing one takes it back out.
let mealSeq = 0;
export function addMeal(meal, date = today()) {
  const n = state.nutrition;
  const prev = n.intake.find((x) => x.date === date) ?? { date };
  const m = { id: `m${Date.now().toString(36)}${(mealSeq++).toString(36)}`, name: meal.name, kcal: meal.kcal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, items: meal.items ?? [], source: meal.source ?? "ai", ...(meal.text ? { text: meal.text } : {}) };
  const add = (k) => (Number(prev[k]) || 0) + (Number(m[k]) || 0);
  const rec = { ...prev, kcal: add("kcal"), protein: add("protein"), carbs: add("carbs"), fat: add("fat"), meals: [...(prev.meals ?? []), m] };
  state.nutrition = { ...n, intake: [...n.intake.filter((x) => x.date !== date), rec].sort((a, b) => a.date.localeCompare(b.date)).slice(-180) };
  saveNutrition();
  emit();
  return m;
}
export function removeMeal(id, date = today()) {
  const n = state.nutrition;
  const prev = n.intake.find((x) => x.date === date);
  const m = prev?.meals?.find((x) => x.id === id);
  if (!m) return;
  const sub = (k) => Math.max(0, (Number(prev[k]) || 0) - (Number(m[k]) || 0));
  const rec = { ...prev, kcal: sub("kcal"), protein: sub("protein"), carbs: sub("carbs"), fat: sub("fat"), meals: prev.meals.filter((x) => x.id !== id) };
  state.nutrition = { ...n, intake: n.intake.map((x) => (x.date === date ? rec : x)) };
  saveNutrition();
  emit();
}
