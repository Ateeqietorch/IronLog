// History, Progress, Coach, and Settings (DESIGN-SPEC.md §4, §5.8, §5.9).
import { state, setSettings, newBlock, updateSessionNotes } from "./store.js";
import { e1rm } from "../engine/model.js";
import { esc, sheet, closeSheet, fmtDate, setHaptics, toast } from "./dom.js";
import { isIOS, notifySupported, requestNotify, testAlert, runIosTimer } from "./rest.js";

const gear = `<button class="icon-btn" id="settings-btn" aria-label="Settings"><i class="ti ti-settings" aria-hidden="true"></i></button>`;

function nameOf(id) { return state.index.byId.get(id)?.name ?? id; }

export function renderHistory(root) {
  const bySession = new Map();
  for (const r of state.rows) {
    const k = r.sessionKey || `${r.date}_${r.day}`;
    if (!bySession.has(k)) bySession.set(k, { key: k, keyed: !!r.sessionKey, date: r.date, day: String(r.day).replace(/ \(Override\)$/, ""), ex: new Map(), note: "" });
    const s = bySession.get(k);
    if (r.sessionNote && !s.note) s.note = String(r.sessionNote);
    if (!s.ex.has(r.exercise)) s.ex.set(r.exercise, []);
    s.ex.get(r.exercise).push(r);
  }
  const label = (day) => state.program.days.find((d) => d.key === day)?.label ?? day.split("—")[1]?.trim() ?? day;
  const sessions = [...bySession.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  const blocks = sessions.map((s) => {
    const items = [...s.ex].map(([name, sets]) => {
      const working = sets.filter((x) => Number(String(x.weight).replace(/[^\d.]/g, "")) > 0 || String(x.weight).includes("L:"));
      const best = working.sort((a, b) => (parseFloat(String(b.weight).replace(/^L:/, "")) || 0) - (parseFloat(String(a.weight).replace(/^L:/, "")) || 0))[0];
      const note = sets.map((x) => String(x.notes ?? "").trim()).find(Boolean);
      return `<div class="row"><span>${esc(name)}${note ? `<br><span class="h-note"><i class="ti ti-note" aria-hidden="true"></i> ${esc(note)}</span>` : ""}</span><span class="r">${working.length} sets${best ? ` · ${esc(best.weight)} × ${esc(best.reps)}` : ""}</span></div>`;
    }).join("");
    const head = `${esc(fmtDate(s.date))} · ${esc(label(s.day))}`;
    return `<div class="group-title" style="display:flex;justify-content:space-between;align-items:center">${head}${s.keyed ? `<button class="link" style="margin:0;min-height:32px;padding:4px 6px" data-notes="${esc(s.key)}"><i class="ti ti-note" aria-hidden="true"></i> ${s.note || [...s.ex.values()].some((x) => x.some((y) => y.notes)) ? "Edit notes" : "Add notes"}</button>` : ""}</div>
      <div class="rows">${s.note ? `<div class="h-note" style="padding:10px 0;border-bottom:1px solid var(--seam)"><i class="ti ti-note" aria-hidden="true"></i> ${esc(s.note)}</div>` : ""}${items}</div>`;
  }).join("");
  root.innerHTML = `<header class="p-head"><h1>History</h1>${gear}</header>${blocks || `<div class="empty">Your logged workouts show up here.</div>`}<div style="height:16px"></div>`;
  root.querySelector("#settings-btn").onclick = settingsSheet;
  root.querySelectorAll("[data-notes]").forEach((b) => b.addEventListener("click", () => {
    const s = sessions.find((x) => x.key === b.dataset.notes);
    if (s) historyNotesSheet(s, label(s.day));
  }));
}

// Notes on a workout that's already saved: one per exercise plus one for
// the whole workout. Re-saves that workout's sets with the new notes.
function historyNotesSheet(s, dayLabel) {
  const names = [...s.ex.keys()];
  const noteOf = (name) => s.ex.get(name).map((x) => String(x.notes ?? "").trim()).find(Boolean) ?? "";
  const fields = names.map((name, i) => `<div class="note-label">${esc(name)} <span class="mut">· ${s.ex.get(name).length} sets</span></div>
    <textarea class="note-input" data-ex="${i}" maxlength="300" style="min-height:56px" placeholder="e.g. stopped after 2 sets, left adductor">${esc(noteOf(name))}</textarea>`).join("");
  const el = sheet(`<h2>Notes</h2><div class="sub">${esc(fmtDate(s.date))} · ${esc(dayLabel)}. Your coach sees these.</div>
    <div class="note-label" style="margin-top:0">Whole workout</div>
    <textarea class="note-input" id="h-wnote" maxlength="300" style="min-height:56px" placeholder="e.g. finished the rest of this the next day">${esc(s.note)}</textarea>
    ${fields}
    <button class="primary" id="h-save"><i class="ti ti-check" aria-hidden="true"></i>Save notes</button>`);
  el.querySelector("#h-save").addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    const exerciseNotes = {};
    el.querySelectorAll("[data-ex]").forEach((t) => { exerciseNotes[names[Number(t.dataset.ex)]] = t.value; });
    const r = await updateSessionNotes(s.key, { exerciseNotes, sessionNote: el.querySelector("#h-wnote").value });
    closeSheet();
    toast(!r.ok ? r.msg : r.pending ? "Saved on this phone, will sync" : "Notes saved");
  });
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
    <button class="list-btn" id="rest-alerts"><span>Rest timer alerts</span><span class="mut">${esc(alertSummary(s))} <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>
    <button class="list-btn" id="new-block"><span>Start a new training block</span><span class="mut">${state.meso?.start ? `current started ${esc(fmtDate(state.meso.start))}` : ""}</span></button>
    <a class="list-btn" href="v2.html" style="color:inherit;text-decoration:none"><span>Open classic IronLog</span><i class="ti ti-external-link" aria-hidden="true"></i></a>`);
  el.querySelectorAll("[data-policy]").forEach((b) => b.addEventListener("click", () => {
    setSettings({ policy: b.dataset.policy });
    el.querySelectorAll("[data-policy]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.policy === b.dataset.policy)));
    toast("Applies from your next workout");
  }));
  el.querySelector("#rest-alerts").addEventListener("click", restAlertsSheet);
  el.querySelector("#set-haptics").addEventListener("change", (ev) => { setSettings({ haptics: ev.target.checked }); setHaptics(ev.target.checked); });
  el.querySelector("#new-block").addEventListener("click", () => { if (confirm("Start a new 5-week block from today? Week 1 begins with 3 reps in the tank.")) { newBlock(); toast("New block started"); } });
}

// ── Rest timer alerts ──────────────────────────────────────────────────────
function alertSummary(s) {
  const on = [];
  if (s.restBeep ?? true) on.push("beep");
  if (s.restNotify && notifySupported() && Notification.permission === "granted") on.push("notification");
  if (isIOS() && s.iosTimer) on.push("iPhone timer");
  return on.length ? on.join(" + ") : "off";
}

function restAlertsSheet() {
  const s = state.settings;
  const ios = isIOS();
  const perm = notifySupported() ? Notification.permission : "unsupported";
  const toggle = (id, label, on, sub = "") => `<div class="toggle-row" style="align-items:flex-start;padding:10px 0"><span>${label}${sub ? `<br><span class="mut" style="font-size:13px;line-height:1.4">${sub}</span>` : ""}</span><input type="checkbox" id="${id}" ${on ? "checked" : ""} style="width:22px;height:22px;flex:none;margin-left:12px;accent-color:var(--red-fill)" /></div>`;
  const iosBlock = ios ? `
    <div class="label" style="margin-top:16px">iPhone lock screen</div>
    ${toggle("al-ios", "Start the iPhone timer each rest", s.iosTimer, "iPhone doesn't let web apps vibrate or run while locked. This hands each rest to the Clock app's timer, which counts down on your lock screen and rings at 0. Your phone jumps to Shortcuts for a second each set; +30s and Skip here don't change that timer.")}
    <div id="al-ios-setup" class="${s.iosTimer ? "" : "hidden"}">
      <ol class="check-list" style="margin:6px 0 8px;padding-left:20px;font-size:14px;line-height:1.5">
        <li>Open <b>Shortcuts</b>, tap <b>+</b>, name it <b>${esc(s.iosShortcut || "IronLog Rest")}</b>.</li>
        <li>Add the action <b>Start Timer</b>.</li>
        <li>Tap its duration, switch the unit to <b>seconds</b>, and set the number to the <b>Shortcut Input</b> variable.</li>
        <li>Tap <b>Test</b> below. The first time, iPhone asks to allow it; tap <b>Always Allow</b>.</li>
      </ol>
      <div class="note-label">Shortcut name</div>
      <input class="note-input" id="al-ios-name" style="min-height:0;height:44px" value="${esc(s.iosShortcut || "IronLog Rest")}" />
      <button class="secondary" id="al-ios-test" style="margin-top:8px">Test with a 10 s timer</button>
    </div>` : "";
  const notifySub = perm === "unsupported"
    ? "Not available in this browser. Add IronLog to your home screen and open it from there."
    : perm === "denied"
      ? "Notifications are blocked for IronLog. Turn them on in your phone's settings for this app, then come back."
      : ios
        ? "Only fires if IronLog is still running in the background; once the phone locks, iPhone pauses it. Use the iPhone timer below for the lock screen."
        : "When the phone is locked or you're in another app: a notification that vibrates at 0. Locking mid-rest also shows when rest ends.";
  const el = sheet(`<h2>Rest timer alerts</h2><div class="sub">What happens when a rest hits 0</div>
    ${toggle("al-beep", "Beep in the app", s.restBeep ?? true, ios ? "Plays over your music. The silent switch mutes it." : "Plays over your music.")}
    ${toggle("al-notify", "Notify when the phone is locked", !!s.restNotify && perm === "granted", notifySub)}
    ${iosBlock}
    <button class="primary" id="al-test" style="margin-top:14px"><i class="ti ti-bell-ringing" aria-hidden="true"></i>Test the alert</button>`);

  el.querySelector("#al-beep").addEventListener("change", (ev) => setSettings({ restBeep: ev.target.checked }));
  const notifyBox = el.querySelector("#al-notify");
  if (perm === "unsupported" || perm === "denied") notifyBox.disabled = true;
  notifyBox.addEventListener("change", async (ev) => {
    if (!ev.target.checked) return setSettings({ restNotify: false });
    const r = await requestNotify();
    if (r === "granted") { setSettings({ restNotify: true }); toast("Rest notifications on"); }
    else { ev.target.checked = false; setSettings({ restNotify: false }); toast(r === "denied" ? "Notifications were blocked" : "Notifications aren't available here"); }
  });
  el.querySelector("#al-test").addEventListener("click", () => { testAlert(); });
  if (ios) {
    el.querySelector("#al-ios").addEventListener("change", (ev) => {
      setSettings({ iosTimer: ev.target.checked });
      el.querySelector("#al-ios-setup").classList.toggle("hidden", !ev.target.checked);
    });
    el.querySelector("#al-ios-name").addEventListener("change", (ev) => setSettings({ iosShortcut: ev.target.value.trim() || "IronLog Rest" }));
    el.querySelector("#al-ios-test").addEventListener("click", () => {
      setSettings({ iosShortcut: el.querySelector("#al-ios-name").value.trim() || "IronLog Rest" });
      runIosTimer(10);
    });
  }
}
