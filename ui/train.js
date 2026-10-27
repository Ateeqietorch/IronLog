// Train screen (DESIGN-SPEC.md §5.1–5.5).
import { state, setSession, startDay, finishSession, hasPending, undo, isSaving, reviewTrial, suggestNext, today } from "./store.js";
import { switchSheet } from "./switch.js";
import { inReview, trialSummary } from "../data/trials.js";
import { logSet, target, isDone, sessionDone, anyLogged, stepLoad, stopExercise, resumeExercise, setExerciseNote } from "./session.js";
import { statusLine } from "../engine/meso.js";
import { esc, sheet, closeSheet, toast, buzz } from "./dom.js";
import { startRest } from "./rest.js";

let chosenRir = null; // reps-in-reserve chip for the set on screen

// Three effort buttons instead of 0–4+: picking between "1 or 2 left" is the
// hard part of self-rating and the engine barely needs it. A bucket maps to
// the plan's number when the plan falls inside it, so "on plan" stays exact.
const EFFORT = [
  { id: "fail", label: "Failed", hint: "couldn't do another" },
  { id: "close", label: "1–2 left", hint: "slowed down, could grind 1–2" },
  { id: "easy", label: "3+ left", hint: "reps still moved well" },
];
const bucketOf = (rir) => (rir <= 0 ? "fail" : rir <= 2 ? "close" : "easy");
function rirFor(bucket, planned) {
  if (bucket === "fail") return 0;
  if (bucket === "close") return planned >= 1 && planned <= 2 ? planned : planned < 1 ? 1 : 2;
  return planned >= 3 ? planned : 3;
}
const effortChips = (attr, rir) => EFFORT.map((b) => `<button class="chip effort" data-${attr}="${b.id}" aria-pressed="${bucketOf(rir) === b.id}" aria-label="${b.label}: ${b.hint}">${b.label}</button>`).join("");
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
    ${reviewCards()}
    ${checkCard(s)}
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
  const chips = effortChips("rir", chosenRir);
  const btnLabel = manualFirst ? `Enter set 1` : chosenRir === plannedRir ? "Done as planned" : `Log set ${si + 1}`;

  return `
  <section class="card" aria-label="Current exercise">
    <div class="card-top">
      <div>
        <div class="ex-name">${esc(e.ex?.name ?? e.name)}${e.slot.trial ? `<span class="pill trial-pill"><i class="ti ti-flask" aria-hidden="true"></i>${e.slot.trial.n}/${e.slot.trial.of}</span>` : e.mode === "calibrating" && e.logged.length === 0 ? `<span class="pill">Calibrating</span>` : ""}</div>
        <div class="ex-sub">Exercise ${s.cur + 1} of ${s.exercises.length} · ${done ? "all sets done" : `set ${si + 1} of ${e.sets}`}${e.switchedFrom ? ` · instead of ${esc(e.switchedFrom)}` : e.slot.trial ? ` · instead of ${esc(e.slot.trial.fromName)}` : ""}</div>
      </div>
      <div class="ex-nav">
        <button class="icon-btn" id="prev-ex" aria-label="Previous exercise" ${s.cur === 0 ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <button class="icon-btn" id="next-ex" aria-label="Next exercise" ${s.cur === s.exercises.length - 1 ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </div>
    </div>
    ${done ? "" : `
    <div class="hero${String(fmt(t.load)).length > 3 ? " small" : ""}" aria-label="${fmt(t.load)} ${unitsFor(e.ex)}, ${t.reps} reps">
      <span class="load">${manualFirst ? "—" : fmt(t.load)}</span><span class="x">×</span><span class="reps">${manualFirst ? "?" : t.reps}</span>
    </div>
    <div class="units"><span style="min-width:120px">${unitsFor(e.ex)}</span><span>reps</span></div>`}
    ${reasonText ? `<button class="reason" id="why"><i class="ti ${icon}" aria-hidden="true"></i><span>${esc(reasonText)}</span></button>` : ""}
    <div class="sets">${rows}</div>
    ${e.stopped ? `<div class="label stopped"><i class="ti ti-hand-stop" aria-hidden="true"></i> ${e.logged.length ? `Stopped after ${e.logged.length} of ${e.stopped.of} sets` : "Skipped"}</div>` : ""}
    ${e.userNote ? `<button class="ex-note" id="note-btn" aria-label="Edit note"><i class="ti ti-note" aria-hidden="true"></i><span>${esc(e.userNote)}</span></button>` : ""}
    ${done ? `<div class="card-links">
      <button class="link" id="note-btn2"><i class="ti ti-note" aria-hidden="true"></i>${e.userNote ? "Edit note" : "Add note"}</button>
      ${e.stopped ? `<button class="link" id="resume-btn"><i class="ti ti-player-play" aria-hidden="true"></i>Resume</button>` : "<span></span>"}
    </div>` : `
    <div class="label">How close to failure? <span class="mut">(rate right after the last rep)</span></div>
    <div class="chips" role="group" aria-label="How close to failure">${chips}</div>
    <button class="primary" id="log-btn"><i class="ti ti-check" aria-hidden="true"></i>${btnLabel}</button>
    <div class="card-links">
      ${manualFirst ? "<span></span>" : `<button class="link" id="edit-btn"><i class="ti ti-pencil" aria-hidden="true"></i>Edit set</button>`}
      <button class="link" id="switch-btn"><i class="ti ti-arrows-exchange" aria-hidden="true"></i>Switch exercise</button>
    </div>
    <div class="card-links">
      ${e.userNote ? "<span></span>" : `<button class="link" id="note-btn2"><i class="ti ti-note" aria-hidden="true"></i>Add note</button>`}
      <button class="link" id="stop-btn"><i class="ti ti-hand-stop" aria-hidden="true"></i>${e.logged.length ? "End exercise here" : "Skip exercise"}</button>
    </div>`}
  </section>`;
}

function upNext(s) {
  const items = s.exercises.map((x, i) => {
    if (i === s.cur) return "";
    const p = x.plan?.sets?.[x.logged.length] ?? x.plan?.sets?.[0];
    const right = x.stopped ? (x.logged.length ? `stopped · ${x.logged.length} of ${x.stopped.of}` : "skipped") : isDone(x) ? `${x.logged.length} sets` : p ? `${x.sets} × ${p.reps} · ${fmt(p.load)}` : `${x.sets} sets`;
    return `<button data-jump="${i}" class="${isDone(x) ? "done-row" : ""}"><span>${x.stopped ? `<i class="ti ti-hand-stop stopped" aria-hidden="true"></i>` : isDone(x) ? `<i class="ti ti-circle-check" aria-hidden="true"></i>` : ""}${esc(x.ex?.name ?? x.name)}${x.userNote ? ` <i class="ti ti-note mut" aria-label="has a note"></i>` : ""}</span><span class="mut">${right}</span></button>`;
  }).join("");
  return items ? `<section class="next"><h2>Up next</h2>${items}</section>` : "";
}

function reviewCards() {
  return inReview(state.trials).map((t) => {
    const r = trialSummary(t, state.models);
    const trend = r.changePct == null ? "" : r.changePct > 0.5 ? `Your strength on it went <b>up ${r.changePct}%</b> over the trial.` : r.changePct < -0.5 ? `Your strength on it went <b>down ${Math.abs(r.changePct)}%</b> over the trial.` : "Your strength on it held steady over the trial.";
    const per = r.per.map((p) => `<span>${esc(p.top)}</span>`).join(" · ");
    return `<section class="card review" aria-label="Trial review">
      <div class="label" style="margin-top:0"><i class="ti ti-flask" aria-hidden="true"></i> Trial finished · ${esc(state.program.days.find((d) => d.key === t.dayKey)?.label ?? t.dayKey)}</div>
      <div class="ex-name">${esc(t.toName)} <span class="mut" style="font-size:15px">instead of ${esc(t.fromName)}</span></div>
      <p class="review-txt">${r.sessions} sessions done${per ? `, first sets: ${per}` : ""}. ${trend} Keep it if it felt good on the target muscle and your joints; go back if not.</p>
      <div class="prop-acts">
        <button class="primary" data-review="keep" data-id="${esc(t.id)}" style="height:44px;font-size:19px;margin:0">Keep it</button>
        <button class="secondary" data-review="revert" data-id="${esc(t.id)}" style="height:44px">Go back</button>
      </div>
      <button class="link" data-review="extend" data-id="${esc(t.id)}">Not sure yet, 2 more sessions</button>
    </section>`;
  }).join("");
}

function finishBlock(s) {
  if (isSaving()) return `<div class="finish"><button class="primary" disabled><i class="ti ti-loader" aria-hidden="true"></i>Saving…</button></div>`;
  const noteLink = `<button class="link" id="wnote-btn"><i class="ti ti-note" aria-hidden="true"></i> ${s.workoutNote ? "Edit workout note" : "Add a workout note"}</button>`;
  const noteLine = s.workoutNote ? `<button class="ex-note" id="wnote-show" aria-label="Edit workout note"><i class="ti ti-note" aria-hidden="true"></i><span>${esc(s.workoutNote)}</span></button>` : "";
  if (sessionDone(s)) return `<div class="finish">${noteLine}<button class="primary" id="finish-btn"><i class="ti ti-flag" aria-hidden="true"></i>Finish workout</button>${noteLink}</div>`;
  if (anyLogged(s)) return `<div class="finish">${noteLine}<button class="secondary" id="finish-early">Finish early and save</button>${noteLink}</div>`;
  return "";
}

// What the generator decided before showing today's workout, and why.
function checkCard(s) {
  const fixes = (s.adjustments ?? []).filter((n) => n.kind === "fix");
  const notes = (s.adjustments ?? []).filter((n) => n.kind === "note");
  if (!s.selection && !fixes.length && !notes.length) return "";
  if (anyLogged(s)) return "";
  const items = [...fixes, ...notes].map((n) => `<li>${esc(n.text)}</li>`).join("");
  return `<section class="card check" aria-label="Why this workout">
    <div class="label" style="margin-top:0"><i class="ti ti-shield-check" aria-hidden="true"></i> Checked before you start</div>
    ${s.selection ? `<p class="review-txt">${esc(s.selection)}</p>` : ""}
    ${items ? `<ul class="check-list">${items}</ul>` : ""}
  </section>`;
}

function assessmentCard(a) {
  if (!a) return "";
  const icon = { closer: "ti-trending-up up", steady: "ti-arrow-right", off: "ti-trending-down down", baseline: "ti-flag" }[a.verdict];
  return `<section class="card assess ${esc(a.verdict)}" aria-label="Workout assessment">
    <div class="label" style="margin-top:0"><i class="ti ti-target-arrow" aria-hidden="true"></i> Goal: balanced muscle growth</div>
    <div class="ex-name"><i class="ti ${icon}" aria-hidden="true"></i> ${esc(a.headline)}</div>
    <ul class="check-list">${a.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  </section>`;
}

function tomorrow() {
  return new Date(Date.parse(today() + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
}

function renderSaved(root, s) {
  const pick = suggestNext(tomorrow());
  const next = pick.day;
  const sets = s.exercises.reduce((a, e) => a + e.logged.length, 0);
  root.innerHTML = `
    <header class="t-head"><div><div class="t-status">${esc(s.dayLabel)} · ${sets} sets</div><div class="t-day">${state.sync === "saving" ? "Saving…" : state.sync === "pending" ? "Saved on phone" : "Workout saved"}</div></div>${syncChip()}</header>
    ${assessmentCard(s.assessment)}
    ${reviewCards()}
    <div class="empty">${state.sync === "saving" ? "Sending your sets to your sheet. You can close the app; it finishes next time if it doesn't get through." : state.sync === "pending" ? "Your sheet couldn't be reached, so this workout is saved on this phone and will sync next time IronLog opens online." : "Every set is in your sheet, and your strength estimates are updated."}
      ${pick.reason ? `<div class="mut" style="margin-top:10px">Next up: <b>${esc(next.label)}</b>. ${esc(pick.reason)}</div>` : ""}
      <button class="primary" id="start-next"><i class="ti ti-player-play" aria-hidden="true"></i>Start ${esc(next.label)}</button>
      <button class="link" id="pick-day">Pick a different day</button>
    </div>`;
  root.querySelector("#start-next").onclick = () => { const p = suggestNext(today()); startDay(p.day.key, { selection: p.reason }); setSession(state.session); };
  root.querySelector("#pick-day").onclick = dayPicker;
  bindReviews(root);
}

function bindReviews(root) {
  root.querySelectorAll("[data-review]").forEach((b) => b.addEventListener("click", () => {
    const d = b.dataset.review;
    reviewTrial(b.dataset.id, d);
    toast(d === "keep" ? "Kept, it's in your program now" : d === "revert" ? "Back to the original from next time" : "Two more sessions");
  }));
}

function bind(root, s) {
  root.querySelector("#day-btn")?.addEventListener("click", dayPicker);
  root.querySelectorAll("[data-rir]").forEach((b) => b.addEventListener("click", () => {
    const planned = target(s.exercises[s.cur]).rir ?? 2;
    chosenRir = rirFor(b.dataset.rir, planned);
    renderTrain(root);
  }));
  root.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => setSession({ ...s, cur: Number(b.dataset.jump) })));
  root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editSheet(Number(b.dataset.edit))));
  root.querySelector("#why")?.addEventListener("click", whySheet);
  root.querySelector("#prev-ex")?.addEventListener("click", () => s.cur > 0 && setSession({ ...s, cur: s.cur - 1 }));
  root.querySelector("#next-ex")?.addEventListener("click", () => s.cur < s.exercises.length - 1 && setSession({ ...s, cur: s.cur + 1 }));
  root.querySelector("#edit-btn")?.addEventListener("click", () => editSheet(null));
  root.querySelector("#switch-btn")?.addEventListener("click", () => switchSheet(s.cur));
  bindReviews(root);
  root.querySelector("#log-btn")?.addEventListener("click", () => {
    const e = s.exercises[s.cur];
    if (!e.plan && e.logged.length === 0) return editSheet(null);
    const t = target(e);
    commit(s.cur, { load: t.load, reps: e.ex?.unilateral ? { L: t.reps, R: t.reps } : t.reps, rir: chosenRir });
  });
  root.querySelector("#finish-btn")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    const r = await finishSession();
    if (!r.ok) toast(r.msg);
  });
  root.querySelector("#finish-early")?.addEventListener("click", finishEarlySheet);
  root.querySelector("#note-btn")?.addEventListener("click", () => noteSheet(s.cur));
  root.querySelector("#note-btn2")?.addEventListener("click", () => noteSheet(s.cur));
  root.querySelector("#stop-btn")?.addEventListener("click", () => stopSheet(s.cur));
  root.querySelector("#resume-btn")?.addEventListener("click", () => { setSession(resumeExercise(state.session, s.cur), { undoable: true }); toast("Back on"); });
  root.querySelector("#wnote-btn")?.addEventListener("click", workoutNoteSheet);
  root.querySelector("#wnote-show")?.addEventListener("click", workoutNoteSheet);
}

// ── Notes ──────────────────────────────────────────────────────────────────
const REASONS = ["Pain or discomfort", "Out of time", "Too fatigued", "Equipment taken", "Felt off"];

function noteBox(value, placeholder) {
  return `<textarea class="note-input" id="note-text" maxlength="300" placeholder="${esc(placeholder)}">${esc(value ?? "")}</textarea>`;
}

function bindChips(el) {
  el.querySelectorAll("[data-reason]").forEach((b) => b.addEventListener("click", () => {
    const t = el.querySelector("#note-text");
    t.value = t.value.trim() ? `${t.value.trim()}, ${b.dataset.reason.toLowerCase()}` : b.dataset.reason;
    t.focus();
  }));
}

function noteSheet(exIdx) {
  const e = state.session.exercises[exIdx];
  const el = sheet(`<h2>Note</h2><div class="sub">${esc(e.ex?.name ?? e.name)} · saved with these sets in your log, and your coach sees it</div>
    ${noteBox(e.userNote, "e.g. left adductor felt strained on set 2")}
    <button class="primary" id="note-save"><i class="ti ti-check" aria-hidden="true"></i>Save note</button>`);
  el.querySelector("#note-save").addEventListener("click", () => {
    setSession(setExerciseNote(state.session, exIdx, el.querySelector("#note-text").value));
    closeSheet(); toast("Note saved");
  });
}

function stopSheet(exIdx) {
  const e = state.session.exercises[exIdx];
  const n = e.logged.length;
  const el = sheet(`<h2>${n ? `End ${esc(e.ex?.name ?? e.name)} at ${n} ${n === 1 ? "set" : "sets"}?` : `Skip ${esc(e.ex?.name ?? e.name)}?`}</h2>
    <div class="sub">${n ? `It counts as done with ${n} of ${e.sets} sets, and the reason goes in your log.` : "The reason goes in your workout note."} Your coach sees it too.</div>
    <div class="note-chips">${REASONS.map((r) => `<button data-reason="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    ${noteBox(e.userNote, "What happened? e.g. left adductor felt like it was going to tear")}
    <button class="primary" id="stop-save"><i class="ti ti-hand-stop" aria-hidden="true"></i>${n ? "End exercise" : "Skip exercise"}</button>`);
  bindChips(el);
  el.querySelector("#stop-save").addEventListener("click", () => {
    const next = stopExercise(state.session, exIdx, el.querySelector("#note-text").value);
    closeSheet();
    setSession(next, { undoable: true });
    toast(n ? `${e.ex?.name ?? e.name} ended at ${n} ${n === 1 ? "set" : "sets"}` : `${e.ex?.name ?? e.name} skipped`, { label: "Undo", fn: () => { undo(); toast("Back on"); } });
  });
}

function workoutNoteSheet() {
  const el = sheet(`<h2>Workout note</h2><div class="sub">How today went overall. Saved with the workout; your coach sees it.</div>
    ${noteBox(state.session.workoutNote, "e.g. finished yesterday's legs today, short on sleep")}
    <button class="primary" id="wnote-save"><i class="ti ti-check" aria-hidden="true"></i>Save note</button>`);
  el.querySelector("#wnote-save").addEventListener("click", () => {
    setSession({ ...state.session, workoutNote: el.querySelector("#note-text").value.trim() });
    closeSheet(); toast("Note saved");
  });
}

// Finishing with exercises left: say why, so the log doesn't look abandoned.
function finishEarlySheet() {
  const s = state.session;
  const left = s.exercises.filter((x) => !isDone(x));
  const list = left.map((x) => `<li>${esc(x.ex?.name ?? x.name)}${x.logged.length ? ` (${x.logged.length} of ${x.sets} sets)` : ""}</li>`).join("");
  const el = sheet(`<h2>Finish early</h2><div class="sub">Not done yet:</div><ul class="check-list" style="margin:0 0 10px">${list}</ul>
    <div class="note-chips">${REASONS.map((r) => `<button data-reason="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    ${noteBox(s.workoutNote, "Why you're stopping (optional)")}
    <button class="primary" id="early-save"><i class="ti ti-flag" aria-hidden="true"></i>Save workout</button>`);
  bindChips(el);
  el.querySelector("#early-save").addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    const note = el.querySelector("#note-text").value.trim();
    // Unfinished exercises are marked stopped so the log says so.
    let next = { ...state.session, workoutNote: note };
    next.exercises.forEach((x, i) => { if (!isDone(x)) next = stopExercise(next, i); });
    closeSheet();
    setSession(next);
    const r = await finishSession();
    if (!r.ok) toast(r.msg);
  });
}

function commit(exIdx, entry) {
  const before = state.session;
  const e = before.exercises[exIdx];
  const next = logSet(before, exIdx, entry, Date.now());
  buzz(15);
  setSession(next, { undoable: true });
  const ex = e.ex;
  if (!isDone(next.exercises[exIdx]) || !sessionDone(next)) startRest(ex);
  const what = isDone(next.exercises[exIdx]) ? `${ex?.name ?? e.name} done` : `Set ${(entry.index ?? e.logged.length) + 1} logged`;
  toast(what, { label: "Undo", fn: () => { undo(); toast("Set removed"); } });
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
    <div class="label">How close to failure?</div>
    <div class="chips">${effortChips("erir", rir)}</div>
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
    rir = rirFor(b.dataset.erir, editing ? editing.rir : target(e).rir ?? 2);
    el.querySelectorAll("[data-erir]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.erir === bucketOf(rir))));
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
