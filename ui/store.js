// App state, persistence, and loading. The Train/History/Progress views read
// from here; nothing here touches the DOM.
import { indexCatalog, mergeCatalogs, validateExercise } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { replayHistory } from "../engine/replay.js";
import { mesoWeek } from "../engine/meso.js";
import { tables } from "../data/sheets.js";
import { readLog, readBodyweight, writeSession } from "../data/log.js";
import { loadProgram, nextDay } from "../data/program.js";
import { buildSession, toRows } from "./session.js";

const K = { session: "il3:session", log: "il3:logCache", meso: "il3:meso", settings: "il3:settings", pending: "il3:pending", bw: "il3:bodyweight" };

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
  sync: "idle", offline: false, listeners: new Set(),
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
  let own = [];
  if (!fixture) {
    try { own = (await tables.list("Exercises")).map((r) => r.value).filter((e) => e && !validateExercise(e).length); } catch { /* offline or not deployed yet */ }
  }
  state.index = indexCatalog(mergeCatalogs(own, CURATED));

  if (fixture) {
    state.rows = fixture.rows; state.bodyweight = fixture.bodyweight ?? null;
  } else {
    try {
      const [rows, bw] = await Promise.all([readLog(), readBodyweight()]);
      state.rows = rows; state.bodyweight = bw;
      ls.set(K.log, rows); if (bw) ls.set(K.bw, bw);
    } catch (err) {
      state.offline = true;
      state.rows = ls.get(K.log, []);
      state.bodyweight = ls.get(K.bw, null);
    }
  }
  // Sets saved on this phone but not yet in the sheet still count.
  const pending = ls.get(K.pending, null);
  if (pending?.rows?.length) state.rows = [...state.rows.filter((r) => r.sessionKey !== pending.sessionKey), ...pending.rowsObj];

  state.program = loadProgram(state.index, fixture?.program ?? undefined);
  rebuildModels();

  const draft = ls.get(K.session, null);
  const draftHasSets = draft?.exercises?.some((e) => e.logged?.length);
  if (draft && !draft.saved && draftHasSets && draft.date >= shiftDate(today(), -1)) state.session = draft;
  else startDay(nextDay(state.program, state.rows).key, { persist: false });
  emit();
  if (pending?.rows?.length && !fixture) retryPending();
}

function shiftDate(d, n) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

export function weekInfo(date = today()) {
  return mesoWeek(state.meso ?? { start: date }, date);
}

export function startDay(dayKey, { persist = true } = {}) {
  const day = state.program.days.find((d) => d.key === dayKey) ?? state.program.days[0];
  const date = today();
  state.session = buildSession({
    day, index: state.index, models: state.models, date, weekInfo: weekInfo(date),
    bodyweight: state.bodyweight, policy: state.settings.policy,
  });
  if (persist) saveDraft(); else ls.del(K.session);
}

export function setSession(s) {
  state.session = s;
  if (!state.meso && s.startedAt) { state.meso = { start: s.date }; ls.set(K.meso, state.meso); }
  saveDraft();
  emit();
}

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
// next time the app opens or comes back online.
export async function finishSession({ fixture = false } = {}) {
  const s = state.session;
  const rows = toRows(s);
  if (!rows.length) return { ok: false, msg: "Nothing logged yet" };
  const rowsObj = rows.map((r) => ({ date: r[0], day: r[1], exercise: r[2], set: r[3], weight: r[4], reps: r[5], notes: r[6], sessionKey: r[7], rpe: r[8], completed: r[9], exerciseId: r[10] }));
  state.rows = [...state.rows.filter((r) => r.sessionKey !== s.sessionKey), ...rowsObj];
  rebuildModels();
  state.sync = "saving"; emit();
  try {
    if (!fixture) await writeSession(s.sessionKey, rows);
    ls.del(K.pending);
    ls.set(K.log, state.rows);
    state.sync = "saved";
  } catch {
    ls.set(K.pending, { sessionKey: s.sessionKey, rows, rowsObj });
    state.sync = "pending";
  }
  state.session = { ...s, saved: true };
  ls.del(K.session);
  emit();
  return { ok: true, pending: state.sync === "pending" };
}

export async function retryPending() {
  const p = ls.get(K.pending, null);
  if (!p?.rows?.length) return;
  try {
    await writeSession(p.sessionKey, p.rows);
    ls.del(K.pending);
    state.sync = "saved";
  } catch { state.sync = "pending"; }
  emit();
}

export const hasPending = () => !!ls.get(K.pending, null);
