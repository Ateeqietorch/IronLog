// Train screen (DESIGN-SPEC.md §5.1–5.5).
import { state, setSession, startDay, finishSession, hasPending } from "./store.js";
import { logSet, target, isDone, sessionDone, anyLogged, stepLoad } from "./session.js";
import { nextDay } from "../data/program.js";
import { statusLine } from "../engine/meso.js";
import { esc, sheet, closeSheet, toast, buzz } from "./dom.js";
import { startRest } from "./rest.js";

let chosenRir = null; // reps-in-reserve chip for the set on screen
let chosenFor = "";

const unitsFor = (ex) => {
  if (!ex) return "lb";
  if (ex.loadType === "dumbbell-pair") return "lb each hand";
  if (ex.loadType === "dumbbell-single") return "lb dumbbell";
  if (ex.loadType === "bodyweight-plus") return "added lb";
  if (ex.loadType === "assisted") return "lb assistance";
  if (/per side/i.test(ex.note ?? "")) return "lb per side";
  if (ex.equipment === "barbell") return "lb incl. bar";
  return "lb";
};

const fmt = (n) => (n == null || n === "" ? "—" : Number.isInteger(Number(n)) ? String(Number(n)) : String(Number(n)));
const repsText = (r) => (typeof r === "object" && r ? `L ${r.L} · R ${r.R}` : fmt(r));

function syncChip() {
  if (state.sync === "saving") return `<span class="sync"><i class="ti ti-loader" aria-hidden="true"></i>Saving…</span>`;
  if (state.sync === "pending" || hasPending()) return `<span class="sync bad"><i class="ti ti-cloud-off" aria-hidden="true"></i>Offline, will sync</span>`;
  if (state.offline) return `<span class="sync bad"><i class="ti ti-cloud-off" aria-hidden="true"></i>Offline</span>`;
  if (state.session && anyLogged(state.session) && !state.session.saved) return `<span class="sync"><i class="ti ti-device-mobile" aria-hidden="true"></i>On this phone</span>`;
  return `<span class="sync ok"><i class="ti ti-cloud-check" aria-hidden="true"></i>Saved</span>`;
}

function statusText(s) {
  const e = s.exercises[s.cur];
  const extra = e?.plan?.reason?.extraRir;
  if (extra) return `First session back · ${extra === 1 ? "one extra rep" : "two extra reps"} in the tank`;
  const rir = e?.plan?.reason?.baseRir ?? (s.weekInfo.deload ? 4 : 2);
  return statusLine(s.weekInfo, rir);
}

export function renderTrain(root) {
  const s = state.session;
  if (!s) { root.innerHTML = `<div class="splash"><div class="display">IronLog</div></div>`; return; }
  if (s.saved) return renderSaved(root, s);

  const e = s.exercises[s.cur];
  const strip = s.exercises.map((x, i) => `<i class="${isDone(x) ? "done" : i === s.cur ? "cur" : ""}"></i>`).join("");

  root.innerHTML = `
    <header class="t-head">
      <div>
        <div class="t-status">${esc(statusText(s))}</div>
        <button class="t-day" id="day-btn" aria-label="Change training day">${esc(s.dayLabel)}<i class="ti ti-chevron-down" aria-hidden="true"></i></button>
      </div>
      ${syncChip()}
    </header>
    <div class="strip" aria-hidden="true">${strip}</div>
    ${state.offline ? `<div class="notice warn">Couldn't reach your sheet. Today's sets are saved on this phone and will sync.</div>` : ""}
    ${e ? nowCard(s, e) : ""}
    ${upNext(s)}
    ${finishBlock(s)}
  `;
  bind(root, s);
}

function nowCard(s, e) {
  const done = isDone(e);
  const t = target(e);
  const si = Math.min(e.logged.length, e.sets - 1);
  const key = `${s.sessionKey}|${e.i}|${e.logged.length}`;
  if (chosenFor !== key) { chosenFor = key; chosenRir = t.rir ?? 2; }
  const plannedRir = t.rir ?? 2;
  const r = e.plan?.reason;
  const icon = r?.changePct > 0.5 ? "ti-trending-up up" : r?.changePct < -0.5 ? "ti-trending-down down" : "ti-info-circle";
  const reasonText = e.plan?.text ?? e.note ?? "";
  const manualFirst = !e.plan && e.logged.length === 0;

  const rows = Array.from({ length: e.sets }, (_, i) => {
    const l = e.logged.find((x) => x.index === i);
    if (l) return `<button class="set done" data-edit="${i}"><i class="ti ti-circle-check" aria-hidden="true"></i><span>${fmt(l.load)} × ${repsText(l.reps)}</span><span class="right">${l.rir} left</span></button>`;
    const p = e.plan?.sets?.[i];
    const txt = p ? `${fmt(p.load)} × ${p.reps}` : "—";
    if (i === e.logged.length) return `<div class="set now${p?.adjusted ? " adjusted" : ""}"><i class="ti ti-player-play" aria-hidden="true"></i><span>${txt}</span><span class="right">Now</span></div>`;
    return `<div class="set todo${p?.adjusted ? " adjusted" : ""}"><i class="ti ti-circle" aria-hidden="true"></i><span>${txt}</span><span class="right">${i === e.sets - 1 ? "more is fine" : ""}</span></div>`;
  }).join("");

  // "4+" covers any plan of 4 or more reps in reserve (deloads, first session back).
  const chips = [0, 1, 2, 3, 4].map((v) => `<button class="chip" data-rir="${v}" aria-pressed="${Math.min(chosenRir, 4) === v}">${v === 4 ? "4+" : v}</button>`).join("");
  const btnLabel = manualFirst ? `Enter set 1` : chosenRir === plannedRir ? "Done as planned" : `Log set ${si + 1}`;

  return `
  <section class="card" aria-label="Current exercise">
    <div class="card-top">
      <div>
        <div class="ex-name">${esc(e.ex?.name ?? e.name)}${e.mode === "calibrating" && e.logged.length === 0 ? `<span class="pill">Calibrating</span>` : ""}</div>
        <div class="ex-sub">${done ? "All sets done" : `Set ${si + 1} of ${e.sets}`}</div>
      </div>
    </div>
    ${done ? "" : `
    <div class="hero${String(fmt(t.load)).length > 3 ? " small" : ""}" aria-label="${fmt(t.load)} ${unitsFor(e.ex)}, ${t.reps} reps">
      <span class="load">${manualFirst ? "—" : fmt(t.load)}</span><span class="x">×</span><span class="reps">${manualFirst ? "?" : t.reps}</span>
    </div>
    <div class="units"><span style="min-width:120px">${unitsFor(e.ex)}</span><span>reps</span></div>`}
    ${reasonText ? `<button class="reason" id="why"><i class="ti ${icon}" aria-hidden="true"></i><span>${esc(reasonText)}</span></button>` : ""}
    <div class="sets">${rows}</div>
    ${done ? "" : `
    <div class="label">Reps left in the tank</div>
    <div class="chips" role="group" aria-label="Reps left in the tank">${chips}</div>
    <button class="primary" id="log-btn"><i class="ti ti-check" aria-hidden="true"></i>${btnLabel}</button>
    ${manualFirst ? "" : `<button class="link" id="edit-btn">Different numbers? Edit set</button>`}`}
  </section>`;
}

function upNext(s) {
  const items = s.exercises.map((x, i) => {
    if (i === s.cur) return "";
    const p = x.plan?.sets?.[x.logged.length] ?? x.plan?.sets?.[0];
    const right = isDone(x) ? `${x.logged.length} sets` : p ? `${x.sets} × ${p.reps} · ${fmt(p.load)}` : `${x.sets} sets`;
    return `<button data-jump="${i}" class="${isDone(x) ? "done-row" : ""}"><span>${isDone(x) ? `<i class="ti ti-circle-check" aria-hidden="true"></i>` : ""}${esc(x.ex?.name ?? x.name)}</span><span class="mut">${right}</span></button>`;
  }).join("");
  return items ? `<section class="next"><h2>Up next</h2>${items}</section>` : "";
}

function finishBlock(s) {
  if (sessionDone(s)) return `<div class="finish"><button class="primary" id="finish-btn"><i class="ti ti-flag" aria-hidden="true"></i>Finish workout</button></div>`;
  if (anyLogged(s)) return `<div class="finish"><button class="secondary" id="finish-btn">Finish early and save</button></div>`;
  return "";
}

function renderSaved(root, s) {
  const next = nextDay(state.program, state.rows);
  const sets = s.exercises.reduce((a, e) => a + e.logged.length, 0);
  root.innerHTML = `
    <header class="t-head"><div><div class="t-status">${esc(s.dayLabel)} · ${sets} sets</div><div class="t-day">${state.sync === "pending" ? "Saved on phone" : "Workout saved"}</div></div>${syncChip()}</header>
    <div class="empty">${state.sync === "pending" ? "Your sheet couldn't be reached, so this workout is saved on this phone and will sync next time IronLog opens online." : "Every set is in your sheet, and your strength estimates are updated."}
      <button class="primary" id="start-next"><i class="ti ti-player-play" aria-hidden="true"></i>Start ${esc(next.label)}</button>
      <button class="link" id="pick-day">Pick a different day</button>
    </div>`;
  root.querySelector("#start-next").onclick = () => { startDay(next.key); setSession(state.session); };
  root.querySelector("#pick-day").onclick = dayPicker;
}

function bind(root, s) {
  root.querySelector("#day-btn")?.addEventListener("click", dayPicker);
  root.querySelectorAll("[data-rir]").forEach((b) => b.addEventListener("click", () => {
    const v = Number(b.dataset.rir);
    const planned = target(s.exercises[s.cur]).rir ?? 2;
    chosenRir = v === 4 && planned >= 4 ? planned : v;
    renderTrain(root);
  }));
  root.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => setSession({ ...s, cur: Number(b.dataset.jump) })));
  root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editSheet(Number(b.dataset.edit))));
  root.querySelector("#why")?.addEventListener("click", whySheet);
  root.querySelector("#edit-btn")?.addEventListener("click", () => editSheet(null));
  root.querySelector("#log-btn")?.addEventListener("click", () => {
    const e = s.exercises[s.cur];
    if (!e.plan && e.logged.length === 0) return editSheet(null);
    const t = target(e);
    commit(s.cur, { load: t.load, reps: e.ex?.unilateral ? { L: t.reps, R: t.reps } : t.reps, rir: chosenRir });
  });
  root.querySelector("#finish-btn")?.addEventListener("click", async () => {
    const r = await finishSession();
    if (!r.ok) toast(r.msg);
  });
}

function commit(exIdx, entry) {
  const before = state.session;
  const e = before.exercises[exIdx];
  const next = logSet(before, exIdx, entry, Date.now());
  buzz(15);
  setSession(next);
  const ex = e.ex;
  if (!isDone(next.exercises[exIdx]) || !sessionDone(next)) startRest(ex);
  if (isDone(next.exercises[exIdx]) && !sessionDone(next)) toast(`${ex?.name ?? e.name} done`);
}

function dayPicker() {
  const s = state.session;
  const items = state.program.days.map((d) => `<button class="list-btn" data-day="${esc(d.key)}" aria-current="${s && d.key === s.dayKey && !s.saved}"><span>${esc(d.label)}</span><span class="mut">${d.exercises.length} exercises</span></button>`).join("");
  const el = sheet(`<h2>Pick today's workout</h2><div class="sub">${s && anyLogged(s) && !s.saved ? "Switching days discards the sets you've logged today." : "Your coached numbers come with it."}</div>${items}`);
  el.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => {
    if (s && anyLogged(s) && !s.saved && !confirm("Discard the sets you've logged today?")) return;
    closeSheet(); startDay(b.dataset.day); setSession(state.session);
  }));
}

function whySheet() {
  const e = state.session.exercises[state.session.cur];
  const r = e.plan?.reason;
  const lines = [];
  if (e.plan?.text) lines.push(esc(e.plan.text));
  if (r) {
    lines.push(`Strength estimate: <b>${Math.round(r.e1rm)} lb</b>${r.changePct != null && Math.abs(r.changePct) >= 0.5 ? ` (${r.changePct > 0 ? "+" : ""}${r.changePct}% since last time)` : ""}.`);
    lines.push(`Target: ${r.aimReps} reps with ${r.rir} left, at the closest load you can make.`);
    lines.push(`Fatigue: each set after the first costs you about ${Math.round((1 - r.decay) * 1000) / 10}% of your strength, which is why later sets get fewer reps.`);
  }
  if (e.mode === "calibrating") lines.push("Set 1 is a calibration set: the sets after it are recalculated from what you actually do.");
  sheet(`<h2>Why these numbers</h2><div class="sub">${esc(e.ex?.name ?? e.name)}</div>${lines.map((l) => `<p style="margin:10px 0;font-size:15px;line-height:1.5">${l}</p>`).join("")}`);
}

function editSheet(index) {
  const s = state.session;
  const e = s.exercises[s.cur];
  const editing = index != null ? e.logged.find((l) => l.index === index) : null;
  const t = editing ?? target(e);
  const uni = !!e.ex?.unilateral;
  let load = Number(t.load ?? e.slot.programWeight ?? 0) || 0;
  let reps = uni ? (typeof t.reps === "object" ? { ...t.reps } : { L: t.reps, R: t.reps }) : Number(typeof t.reps === "object" ? Math.min(t.reps.L, t.reps.R) : t.reps) || e.slot.repRange[1];
  let rir = editing ? editing.rir : chosenRir ?? 2;
  const setNo = (editing ? editing.index : e.logged.length) + 1;

  const stepper = (id, label, value) => `<div class="stepper"><span class="lbl">${label}</span><div class="ctl"><button data-dec="${id}" aria-label="Less ${label}"><i class="ti ti-minus" aria-hidden="true"></i></button><input id="${id}" inputmode="decimal" value="${value}" aria-label="${label}" /><button data-inc="${id}" aria-label="More ${label}"><i class="ti ti-plus" aria-hidden="true"></i></button></div></div>`;
  const html = `<h2>${editing ? "Fix" : "Log"} set ${setNo}</h2><div class="sub">${esc(e.ex?.name ?? e.name)} · ${unitsFor(e.ex)}</div>
    ${stepper("ed-load", "Load", fmt(load))}
    ${uni ? stepper("ed-L", "Left reps", reps.L) + stepper("ed-R", "Right reps", reps.R) : stepper("ed-reps", "Reps", reps)}
    <div class="label">Reps left in the tank</div>
    <div class="chips">${[0, 1, 2, 3, 4].map((v) => `<button class="chip" data-erir="${v}" aria-pressed="${Math.min(rir, 4) === v}">${v === 4 ? "4+" : v}</button>`).join("")}</div>
    <button class="primary" id="ed-save"><i class="ti ti-check" aria-hidden="true"></i>${editing ? "Save set" : `Log set ${setNo}`}</button>`;
  const el = sheet(html);
  const num = (id) => el.querySelector("#" + id);
  el.querySelectorAll("[data-inc],[data-dec]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.inc ?? b.dataset.dec; const dir = b.dataset.inc ? 1 : -1;
    const input = num(id);
    if (id === "ed-load") input.value = fmt(stepLoad(e.ex, Number(input.value) || 0, dir));
    else input.value = Math.max(0, (Number(input.value) || 0) + dir);
  }));
  el.querySelectorAll("[data-erir]").forEach((b) => b.addEventListener("click", () => {
    const v = Number(b.dataset.erir);
    rir = v === 4 && rir >= 4 ? rir : v;
    el.querySelectorAll("[data-erir]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.erir) === Math.min(rir, 4))));
  }));
  el.querySelector("#ed-save").addEventListener("click", () => {
    load = Number(num("ed-load").value);
    if (!(load >= 0)) return toast("Enter a load");
    const entryReps = uni ? { L: Number(num("ed-L").value), R: Number(num("ed-R").value) } : Number(num("ed-reps").value);
    if (uni ? !(entryReps.L >= 0 && entryReps.R >= 0) : !(entryReps >= 0)) return toast("Enter reps");
    closeSheet();
    commit(s.cur, { index: editing?.index, load, reps: entryReps, rir });
  });
}
