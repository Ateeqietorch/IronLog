// History, Progress, Coach, and Settings (DESIGN-SPEC.md §4, §5.8, §5.9).
import { state, setSettings, newBlock } from "./store.js";
import { e1rm } from "../engine/model.js";
import { esc, sheet, fmtDate, setHaptics, toast } from "./dom.js";

const gear = `<button class="icon-btn" id="settings-btn" aria-label="Settings"><i class="ti ti-settings" aria-hidden="true"></i></button>`;

function nameOf(id) { return state.index.byId.get(id)?.name ?? id; }

export function renderHistory(root) {
  const bySession = new Map();
  for (const r of state.rows) {
    const k = r.sessionKey || `${r.date}_${r.day}`;
    if (!bySession.has(k)) bySession.set(k, { date: r.date, day: String(r.day).replace(/ \(Override\)$/, ""), ex: new Map() });
    const s = bySession.get(k);
    if (!s.ex.has(r.exercise)) s.ex.set(r.exercise, []);
    s.ex.get(r.exercise).push(r);
  }
  const label = (day) => state.program.days.find((d) => d.key === day)?.label ?? day.split("—")[1]?.trim() ?? day;
  const sessions = [...bySession.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  const blocks = sessions.map((s) => {
    const items = [...s.ex].map(([name, sets]) => {
      const working = sets.filter((x) => Number(String(x.weight).replace(/[^\d.]/g, "")) > 0 || String(x.weight).includes("L:"));
      const best = working.sort((a, b) => (parseFloat(String(b.weight).replace(/^L:/, "")) || 0) - (parseFloat(String(a.weight).replace(/^L:/, "")) || 0))[0];
      return `<div class="row"><span>${esc(name)}</span><span class="r">${working.length} sets${best ? ` · ${esc(best.weight)} × ${esc(best.reps)}` : ""}</span></div>`;
    }).join("");
    return `<div class="group-title">${esc(fmtDate(s.date))} · ${esc(label(s.day))}</div><div class="rows">${items}</div>`;
  }).join("");
  root.innerHTML = `<header class="p-head"><h1>History</h1>${gear}</header>${blocks || `<div class="empty">Your logged workouts show up here.</div>`}<div style="height:16px"></div>`;
  root.querySelector("#settings-btn").onclick = settingsSheet;
}

export function renderProgress(root) {
  const entries = Object.entries(state.models)
    .filter(([, m]) => m.logE1rm != null)
    .map(([key, m]) => {
      const [id, side] = key.split("|");
      const first = m.obs.find((o) => o.rirKnown) ?? m.obs[0];
      return { id, side, m, e: e1rm(m), last: m.lastExposure, n: m.exposures, first };
    })
    .sort((a, b) => String(b.last).localeCompare(String(a.last)));
  const st = state.stats;
  const acc = st?.maeSettled != null ? `<div class="notice">How well the coach predicts your reps: within about <b>±${st.maeSettled}</b> reps once it has 3 sessions on an exercise. It gets sharper as you log reps-in-reserve on every set.</div>` : "";
  const rows = entries.map((x) => `<div class="row"><span>${esc(nameOf(x.id))}${x.side !== "both" ? ` (${x.side})` : ""}<br><span class="mut" style="font-size:13px">${x.n} sessions · last ${x.last ? esc(fmtDate(x.last)) : "—"}</span></span><span class="r"><span class="num" style="font-size:22px;color:var(--silver)">${Math.round(x.e)}</span><br>est. 1-rep max</span></div>`).join("");
  root.innerHTML = `<header class="p-head"><h1>Progress</h1>${gear}</header>${acc}<div class="group-title">Strength by exercise, most recent first</div><div class="rows">${rows || `<div class="row">Log a workout to see your strength estimates.</div>`}</div><div style="height:16px"></div>`;
  root.querySelector("#settings-btn").onclick = settingsSheet;
}

export function settingsSheet() {
  const s = state.settings;
  const seg = (v, label) => `<button data-policy="${v}" aria-pressed="${s.policy === v}">${label}</button>`;
  const el = sheet(`<h2>Settings</h2>
    <div class="label" style="margin-top:12px">When you get stronger, progress by</div>
    <div class="seg">${seg("reps-first", "More reps")}${seg("balanced", "Balanced")}${seg("load-first", "More weight")}</div>
    <div class="toggle-row"><span>Vibrate on set and rest end</span><input type="checkbox" id="set-haptics" ${s.haptics ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--red-fill)" /></div>
    <button class="list-btn" id="new-block"><span>Start a new training block</span><span class="mut">${state.meso?.start ? `current started ${esc(fmtDate(state.meso.start))}` : ""}</span></button>
    <a class="list-btn" href="v2.html" style="color:inherit;text-decoration:none"><span>Open classic IronLog</span><i class="ti ti-external-link" aria-hidden="true"></i></a>`);
  el.querySelectorAll("[data-policy]").forEach((b) => b.addEventListener("click", () => {
    setSettings({ policy: b.dataset.policy });
    el.querySelectorAll("[data-policy]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.policy === b.dataset.policy)));
    toast("Applies from your next workout");
  }));
  el.querySelector("#set-haptics").addEventListener("change", (ev) => { setSettings({ haptics: ev.target.checked }); setHaptics(ev.target.checked); });
  el.querySelector("#new-block").addEventListener("click", () => { if (confirm("Start a new 5-week block from today? Week 1 begins with 3 reps in the tank.")) { newBlock(); toast("New block started"); } });
}
