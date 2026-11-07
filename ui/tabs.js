// History, Progress, Coach, and Settings (DESIGN-SPEC.md §4, §5.8, §5.9).
import { state, setSettings, newBlock, deloadNow, updateSessionNotes, liveDirectives, removeDirective, addDirective, directives as resolved, planFor, suggestNext, today } from "./store.js";
import { describeDirective, niceMuscleName } from "../engine/directives.js";
import { GROWN } from "../engine/volume.js";
import { rirFor } from "../engine/block.js";
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

let showAllLifts = false;
// Plan tab: the block, your schedule, every muscle's volume against its
// target, and the standing directives the coach plans with.
export function renderProgress(root) {
  const plan = state.plan ?? (() => { try { return planFor(suggestNext(today()).day.key).plan; } catch { return null; } })();
  const dir = resolved();
  const b = plan?.block;
  const rir = b ? rirFor(b, { kClass: "isolation" }) : null;
  const blockCard = b ? `<section class="card plan-card">
      <div class="label" style="margin-top:0"><i class="ti ti-stairs-up" aria-hidden="true"></i> Training block ${b.number ?? 1}</div>
      <div class="ex-name">${b.deload ? "Deload week" : b.reentry ? "Re-entry week" : `Week ${b.week} of ${b.of}`}</div>
      <p class="review-txt">${b.deload ? "Same exercises, half the sets, about 4 reps short of failure. Then a new block starts." : `Sets end about ${rir} rep${rir === 1 ? "" : "s"} short of failure this week (compounds never closer than 1). Started ${esc(fmtDate(b.start))}${b.paused ? `, paused ${b.paused} days for breaks` : ""}. Deload after week ${b.of}.`}</p>
      <div class="prop-acts">
        <button class="secondary" id="pl-deload" style="height:44px">Deload now</button>
        <button class="secondary" id="pl-block" style="height:44px">New block</button>
      </div>
    </section>` : "";

  const sched = `<div class="group-title">Schedule</div><div class="rows">
      <button class="list-btn" id="pl-days"><span>Days a week</span><span class="mut">${dir.schedule.daysPerWeek ?? `about ${plan?.daysPerWeek ?? "—"} (from your log)`} <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>
      <button class="list-btn" id="pl-mins"><span>Minutes per workout</span><span class="mut">${dir.schedule.minutes ?? `${plan?.budget ?? 75} (default)`} <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>
    </div>`;

  const muscles = plan ? Object.entries(plan.muscles).filter(([m]) => GROWN.includes(m) || plan.muscles[m].level !== "indirect") : [];
  const bar = (x) => {
    const max = Math.max(x.max, x.done7, x.weeklyTarget, 1);
    const pct = (v) => Math.min(100, Math.round((v / max) * 100));
    return `<div class="vbar" aria-hidden="true"><i class="done ${x.status}" style="width:${pct(x.done7)}%"></i><b style="left:${pct(x.floor)}%"></b><b class="tgt" style="left:${pct(x.weeklyTarget)}%"></b></div>`;
  };
  const live = state.session && !state.session.saved;
  const muscleRows = muscles.map(([m, x]) => `<button class="row mrow" data-muscle="${esc(m)}"><span>${esc(cap(niceMuscleName(m)))}${x.level === "specialize" ? ` <span class="pill lever up">Priority</span>` : x.level === "maintain" ? ` <span class="pill">Maintain</span>` : ""}<br><span class="mut" style="font-size:12px">~${Math.round(x.perSession)} sets a session · ${x.freq < 1 ? "less than once a week" : `${Math.round(x.freq * 10) / 10}× a week`}${live && x.today >= 1 ? ` · ${Math.round(x.today)} today` : ""}</span>${bar(x)}</span><span class="r"><span class="num" style="font-size:22px;color:var(--silver)">${Math.round(x.done7)}</span><br>of ~${Math.round(x.weeklyTarget)}/wk</span></button>`).join("");
  const volume = plan ? `<div class="group-title">Sets per muscle, last 7 days</div>
    <div class="mut" style="font-size:13px;margin:-4px 0 8px">Bar: done. Line: minimum to grow. Red tick: this week's target, which moves with your feedback after each workout.</div>
    <div class="rows">${muscleRows}</div>` : "";

  const dirsLive = liveDirectives();
  const dirRows = dirsLive.map((d) => `<div class="rule-row"><span>${esc(describeDirective(d, state.index))}<br><span class="mut">${d.source === "coach" ? "Set by your coach" : "Set by you"}${d.at ? ` · ${esc(fmtDate(d.at))}` : ""}${d.note ? ` · ${esc(d.note)}` : ""}</span></span><button class="icon-btn" data-rmdir="${esc(d.id)}" aria-label="Remove"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join("");
  const dirs = `<div class="group-title">Coaching rules</div>
    <div class="mut" style="font-size:13px;margin:-4px 0 8px">The engine plans every workout with these. Ask the coach to add one ("no sets under 8 reps", "prioritize side delts"), or use the buttons.</div>
    <div class="rows">${dirRows || `<div class="row mut">None yet.</div>`}</div>
    <div class="prop-acts" style="margin-top:10px">
      <button class="secondary" id="pl-prio" style="height:44px">Prioritize a muscle</button>
      <button class="secondary" id="pl-floor" style="height:44px">Minimum reps</button>
    </div>`;

  const entries = Object.entries(state.models)
    .filter(([, m]) => m.logE1rm != null)
    .map(([key, m]) => {
      const [id, side] = key.split("|");
      return { id, side, m, e: e1rm(m), last: m.lastExposure, n: m.exposures };
    })
    .sort((a, b) => String(b.last).localeCompare(String(a.last)));
  const lifts = entries.slice(0, showAllLifts ? entries.length : 10).map((x) => `<div class="row"><span>${esc(nameOf(x.id))}${x.side !== "both" ? ` (${x.side})` : ""}<br><span class="mut" style="font-size:13px">${x.n} sessions · last ${x.last ? esc(fmtDate(x.last)) : "—"}</span></span><span class="r"><span class="num" style="font-size:22px;color:var(--silver)">${Math.round(x.e)}</span><br>est. 1-rep max</span></div>`).join("");

  root.innerHTML = `<header class="p-head"><h1>Plan</h1>${gear}</header>
    ${blockCard}
    ${plan?.deloadSignal && !b?.deload ? `<div class="notice warn">${esc(plan.deloadSignal.reason)} Consider a deload.</div>` : ""}
    ${sched}
    ${volume}
    ${dirs}
    <div class="group-title">Strength by exercise, most recent first</div><div class="rows">${lifts || `<div class="row">Log a workout to see your strength estimates.</div>`}</div>
    ${entries.length > 10 && !showAllLifts ? `<button class="link" id="pl-all" style="margin:8px 16px">Show all ${entries.length}</button>` : ""}<div style="height:16px"></div>`;
  root.querySelector("#settings-btn").onclick = settingsSheet;
  root.querySelector("#pl-all")?.addEventListener("click", () => { showAllLifts = true; renderProgress(root); });
  root.querySelector("#pl-deload")?.addEventListener("click", () => { if (confirm("Start a deload week today? Same exercises, half the sets, easy effort.")) { deloadNow(); toast("Deload week started"); } });
  root.querySelector("#pl-block")?.addEventListener("click", () => { if (confirm("Start a new block today? Week 1 begins with 3 reps in the tank.")) { newBlock(); toast("New block started"); } });
  root.querySelector("#pl-days")?.addEventListener("click", () => numberSheet("Days a week you can train", dir.schedule.daysPerWeek ?? plan?.daysPerWeek ?? 4, 1, 7, (v) => addDirective({ kind: "schedule", daysPerWeek: v, minutes: dir.schedule.minutes ?? undefined }), "Used to spread each muscle's weekly sets over the days you actually train."));
  root.querySelector("#pl-mins")?.addEventListener("click", () => numberSheet("Minutes per workout", dir.schedule.minutes ?? plan?.budget ?? 75, 20, 150, (v) => addDirective({ kind: "schedule", minutes: v, daysPerWeek: dir.schedule.daysPerWeek ?? undefined }), "Over this, isolation work becomes supersets first, then sets come off muscles that are already ahead.", 5));
  root.querySelector("#pl-prio")?.addEventListener("click", prioritySheet);
  root.querySelector("#pl-floor")?.addEventListener("click", () => numberSheet("No sets under this many reps", dir.minReps.all ?? 8, 3, 15, (v) => addDirective({ kind: "rep_floor", minReps: v, scope: "all" }), "Every rep range starts at least here. Sets that would fall under it get a lighter back-off weight."));
  root.querySelectorAll("[data-rmdir]").forEach((x) => x.addEventListener("click", () => { if (confirm("Remove this rule?")) { removeDirective(x.dataset.rmdir); toast("Removed"); } }));
  root.querySelectorAll(".mrow").forEach((x) => x.addEventListener("click", () => muscleSheet(x.dataset.muscle, plan)));
}

const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);

function numberSheet(title, value, min, max, onSave, sub = "", step = 1) {
  const el = sheet(`<h2>${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
    <div class="stepper"><span class="lbl">${esc(title)}</span><div class="ctl"><button data-d="-1" aria-label="Less"><i class="ti ti-minus" aria-hidden="true"></i></button><input id="ns-v" inputmode="numeric" value="${value}" /><button data-d="1" aria-label="More"><i class="ti ti-plus" aria-hidden="true"></i></button></div></div>
    <button class="primary" id="ns-save"><i class="ti ti-check" aria-hidden="true"></i>Save</button>`);
  const input = el.querySelector("#ns-v");
  el.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => { input.value = Math.max(min, Math.min(max, (Number(input.value) || value) + Number(b.dataset.d) * step)); }));
  el.querySelector("#ns-save").addEventListener("click", () => {
    const v = Math.round(Number(input.value));
    if (!(v >= min && v <= max)) return toast(`Pick ${min}–${max}`);
    closeSheet(); onSave(v); toast("Saved. Today's plan is updated");
  });
}

function prioritySheet() {
  const dir = resolved();
  const rows = GROWN.map((m) => {
    const lvl = dir.priorities[m] ?? "grow";
    const seg = (v, label) => `<button data-m="${esc(m)}" data-l="${v}" aria-pressed="${lvl === v}">${label}</button>`;
    return `<div class="note-label">${esc(cap(niceMuscleName(m)))}</div><div class="seg">${seg("maintain", "Maintain")}${seg("grow", "Grow")}${seg("specialize", "Priority")}</div>`;
  }).join("");
  const el = sheet(`<h2>Muscle priorities</h2><div class="sub">Priority starts a muscle higher and trains it earlier in the workout. Maintain keeps it at the minimum so other muscles can recover and grow.</div>${rows}`);
  el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
    addDirective({ kind: "muscle_priority", muscle: b.dataset.m, level: b.dataset.l });
    el.querySelectorAll(`[data-m="${b.dataset.m}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    toast("Saved");
  }));
}

function muscleSheet(m, plan) {
  const x = plan?.muscles?.[m];
  if (!x) return;
  const hist = (plan.muscles && state.feedback.filter((f) => f.muscle === m).slice(-6).reverse()) || [];
  const fb = hist.map((f) => `<div class="row"><span>${esc(fmtDate(f.date))}</span><span class="r">${[f.soreness != null ? ["never sore", "healed early", "just healed", "still sore"][f.soreness] : null, f.pump != null ? `pump ${["low", "good", "great"][f.pump]}` : null, f.workload != null ? `workload ${["easy", "about right", "a lot"][f.workload]}` : null].filter(Boolean).join(" · ")}</span></div>`).join("");
  sheet(`<h2>${esc(cap(niceMuscleName(m)))}</h2><div class="sub">${x.done7} sets in the last 7 days · target about ${x.weeklyTarget} a week</div>
    <p style="font-size:15px;line-height:1.5">${x.perSession} sets per session (started this block at ${x.start}), trained about ${x.freq}× a week. The minimum to keep growing is ${x.floor} a week; above ${x.max} most people stop recovering.${x.lastChange?.d ? ` Last change: ${x.lastChange.d > 0 ? "+" : ""}${x.lastChange.d} set${Math.abs(x.lastChange.d) === 1 ? "" : "s"} because ${esc(x.lastChange.why)}.` : ""}</p>
    <div class="label">Your feedback</div><div class="rows">${fb || `<div class="row mut">No taps yet. Rate soreness before, and pump and workload after, and sets will follow.</div>`}</div>`);
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
