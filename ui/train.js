// Train screen (DESIGN-SPEC.md §5.1–5.5).
import { state, setSession, startDay, finishSession, hasPending, undo, isSaving, reviewTrial, suggestNext, today, addFeedback, feedbackFor, deloadNow } from "./store.js";
import { blockLine } from "../engine/block.js";
import { niceMuscleName } from "../engine/directives.js";
import { GROWN } from "../engine/volume.js";
import { switchSheet } from "./switch.js";
import { askAbout } from "./coach.js";
import { inReview, trialSummary } from "../data/trials.js";
import { logSet, target, isDone, sessionDone, anyLogged, stepLoad, stopExercise, resumeExercise, setExerciseNote, pastSessionsFor, partnerOf } from "./session.js";
import { resolveExercise } from "../engine/catalog.js";
import { statusLine } from "../engine/meso.js";
import { esc, sheet, closeSheet, toast, buzz, fmtDate } from "./dom.js";
import { startRest, primeAlerts } from "./rest.js";

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
  const base = s.block ? blockLine(s.block, rir) : statusLine(s.weekInfo, rir);
  return s.minutes ? `${base} · ~${s.minutes} min` : base;
}

// ── Feedback taps (feed the volume model; COACH-BRAIN.md §3.3) ─────────────
const SORENESS = [[0, "Not sore"], [1, "Healed early"], [2, "Just healed"], [3, "Still sore"]];
const PUMP = [[0, "Low"], [1, "Good"], [2, "Great"]];
const WORKLOAD = [[0, "Easy"], [1, "About right"], [2, "A lot"]];
const JOINTS = [[0, "Fine"], [1, "Achy"], [2, "Painful"]];
const prime = (ex) => Object.entries(ex?.contributions ?? {}).filter(([m, c]) => c >= 1 && GROWN.includes(m)).map(([m]) => m);
const fbChips = (kind, opts, value, extra = "") => `<div class="chips fb" role="group">${opts.map(([v, label]) => `<button class="chip" data-fb="${kind}" data-v="${v}" ${extra} aria-pressed="${value === v}">${esc(label)}</button>`).join("")}</div>`;

// Before the first set: how did this muscle recover from last time?
function sorenessAsk(s, e) {
  if (e.logged.length || !e.ex) return "";
  const trainedBefore = (m) => state.normSets.some((x) => x.date < s.date && (state.index.byId.get(x.id)?.contributions?.[m] ?? 0) >= 1);
  const m = prime(e.ex).find((x) => trainedBefore(x) && feedbackFor(s.date, { muscle: x })?.soreness == null);
  if (!m) return "";
  return `<div class="fb-box" data-muscle="${esc(m)}"><div class="label" style="margin:0 0 6px">${esc(cap(niceMuscleName(m)))} since last time? <span class="mut">(sets today adjust)</span></div>${fbChips("soreness", SORENESS, null)}</div>`;
}

// After the last set of a muscle today: pump and workload; and joints for
// this exercise.
function afterAsk(s, e, i, { inSheet = false } = {}) {
  if (!e.ex || !e.logged.length) return "";
  const parts = [];
  const j = feedbackFor(s.date, { exerciseId: e.ex.id })?.joints;
  parts.push(`<div class="label" style="margin:0 0 6px">Joints on ${esc(e.ex.name)}</div>${fbChips("joints", JOINTS, j ?? null, `data-ex="${esc(e.ex.id)}"`)}`);
  const lastFor = (m) => !s.exercises.some((x, k) => k !== i && !isDone(x) && (x.ex?.contributions?.[m] ?? 0) >= 1);
  for (const m of prime(e.ex).filter(lastFor)) {
    const f = feedbackFor(s.date, { muscle: m }) ?? {};
    parts.push(`<div class="label" style="margin:10px 0 6px">${esc(cap(niceMuscleName(m)))}: pump</div>${fbChips("pump", PUMP, f.pump ?? null, `data-muscle="${esc(m)}"`)}
      <div class="label" style="margin:10px 0 6px">${esc(cap(niceMuscleName(m)))}: workload</div>${fbChips("workload", WORKLOAD, f.workload ?? null, `data-muscle="${esc(m)}"`)}`);
  }
  return `<div class="fb-box"${inSheet ? ' style="border:0;padding:0;background:none"' : ""}>${parts.join("")}${inSheet ? "" : `<div class="mut" style="font-size:12px;margin-top:8px">Optional. This is how the coach decides next time's sets.</div>`}</div>`;
}
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const LEVER_CLASS = { "add-reps": "up", "add-load": "up", coarse: "up", intensify: "up", hold: "", "back-off": "down", recalibrate: "", deload: "", calibrate: "" };

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
    ${deloadCard(s)}
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
  const key = `${s.sessionKey}|${e.i}|${e.logged.length}|${t.rir}`;
  if (chosenFor !== key) { chosenFor = key; chosenRir = t.rir ?? 2; }
  const plannedRir = t.rir ?? 2;
  const r = e.plan?.reason;
  const icon = r?.changePct > 0.5 ? "ti-trending-up up" : r?.changePct < -0.5 ? "ti-trending-down down" : "ti-info-circle";
  const reasonText = e.plan?.text ?? e.note ?? "";
  const manualFirst = !e.plan && e.logged.length === 0;
  const partner = partnerOf(s, s.cur);
  const technique = e.plan?.technique && !done ? `<div class="technique"><i class="ti ti-bolt" aria-hidden="true"></i>${e.plan.technique === "myo-reps" ? "After the last set: myo-reps. Rest 15 s, do 3–5 reps, repeat 3 times." : "After the last set: long-length partials. Keep going with half reps in the stretched half until you can't."}</div>` : "";

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
        <div class="ex-name">${esc(e.ex?.name ?? e.name)}${e.slot.trial ? `<span class="pill trial-pill"><i class="ti ti-flask" aria-hidden="true"></i>${e.slot.trial.n}/${e.slot.trial.of}</span>` : e.mode === "calibrating" && e.logged.length === 0 ? `<span class="pill">Calibrating</span>` : e.label && !done ? `<span class="pill lever ${LEVER_CLASS[e.lever] ?? ""}">${esc(e.label)}</span>` : ""}</div>
        <div class="ex-sub">Exercise ${s.cur + 1} of ${s.exercises.length} · ${done ? "all sets done" : `set ${si + 1} of ${e.sets}`}${e.switchedFrom ? ` · instead of ${esc(e.switchedFrom)}` : e.slot.trial ? ` · instead of ${esc(e.slot.trial.fromName)}` : ""}${e.addOn ? ` · added for ${esc(niceMuscleName(e.addOn))}` : ""}</div>
        ${partner != null ? `<div class="ex-sub superset-tag"><i class="ti ti-link" aria-hidden="true"></i> Superset with ${esc(s.exercises[partner].ex?.name ?? s.exercises[partner].name)}: alternate, rest after the pair</div>` : ""}
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
    ${lastTimeRow(s, e)}
    ${reasonText ? `<button class="reason" id="why"><i class="ti ${icon}" aria-hidden="true"></i><span>${esc(reasonText)}</span></button>` : ""}
    ${technique}
    ${done ? "" : sorenessAsk(s, e)}
    <div class="sets">${rows}</div>
    ${done ? afterAsk(s, e, s.cur) : ""}
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

// ── Last time ──────────────────────────────────────────────────────────────
const effortOf = (rir) => (rir == null ? "" : rir <= 0 ? "failed" : rir <= 2 ? `${rir} left` : `${rir}+ left`);
const pastFor = (s, e, limit = 3) => pastSessionsFor(state.rows, { id: e.ex?.id ?? null, name: e.name }, {
  excludeKey: s.sessionKey, limit, resolve: (n) => resolveExercise(n, state.index).match?.id ?? null,
});
const setText = (x) => `${x.weight || "—"} × ${x.reps || "—"}`;

function lastTimeRow(s, e) {
  const last = pastFor(s, e, 1)[0];
  if (!last) return `<div class="last none"><i class="ti ti-history" aria-hidden="true"></i><span>No earlier sets logged for this one</span></div>`;
  return `<button class="last" id="last-btn" aria-label="See what you did last time"><i class="ti ti-history" aria-hidden="true"></i><span><b>Last time</b> · ${esc(fmtDate(last.date))} · ${esc(last.sets.map(setText).join(", "))}</span><i class="ti ti-chevron-right" aria-hidden="true"></i></button>`;
}

function lastTimeSheet() {
  const s = state.session;
  const e = s.exercises[s.cur];
  const past = pastFor(s, e, 3);
  if (!past.length) return;
  const dayLabel = (d) => state.program.days.find((x) => x.key === d)?.label ?? d.split("—")[1]?.trim() ?? d;
  const block = (p, full = true) => `<div class="group-title" style="margin:${full ? "6px" : "18px"} 0 2px">${esc(fmtDate(p.date))} · ${esc(dayLabel(p.day))}${p.name !== (e.ex?.name ?? e.name) ? ` <span class="mut">(${esc(p.name)})</span>` : ""}</div>
    <div class="rows">${p.sets.map((x) => `<div class="row"><span>Set ${x.set}</span><span class="r"><span class="num" style="font-size:${full ? 22 : 17}px;color:var(--silver)">${esc(setText(x))}</span>${x.rir != null ? `<br>${esc(effortOf(x.rir))}` : ""}</span></div>`).join("")}
    ${p.note ? `<div class="h-note" style="padding:8px 0"><i class="ti ti-note" aria-hidden="true"></i> ${esc(p.note)}</div>` : ""}
    ${full && p.sessionNote ? `<div class="h-note" style="padding:0 0 8px"><i class="ti ti-notes" aria-hidden="true"></i> Workout: ${esc(p.sessionNote)}</div>` : ""}</div>`;
  sheet(`<h2>Last time</h2><div class="sub">${esc(e.ex?.name ?? e.name)} · ${unitsFor(e.ex)}</div>
    ${block(past[0], true)}
    ${past.length > 1 ? `<div class="label" style="margin-top:18px">Before that</div><div class="rows">${past.slice(1).map((p) => `<div class="row"><span>${esc(fmtDate(p.date))}</span><span class="r" style="color:var(--silver-2)">${esc(p.sets.map(setText).join(", "))}</span></div>`).join("")}</div>` : ""}`);
}

function upNext(s) {
  const items = s.exercises.map((x, i) => {
    if (i === s.cur) return "";
    const p = x.plan?.sets?.[x.logged.length] ?? x.plan?.sets?.[0];
    const right = x.stopped ? (x.logged.length ? `stopped · ${x.logged.length} of ${x.stopped.of}` : "skipped") : isDone(x) ? `${x.logged.length} sets` : p ? `${x.sets} × ${p.reps} · ${fmt(p.load)}` : `${x.sets} sets`;
    const tag = x.superset ? ` <i class="ti ti-link mut" aria-label="superset"></i>` : "";
    const lever = !isDone(x) && x.label ? ` <span class="lever-mini ${LEVER_CLASS[x.lever] ?? ""}">${esc(x.label)}</span>` : "";
    return `<button data-jump="${i}" class="${isDone(x) ? "done-row" : ""}"><span>${x.stopped ? `<i class="ti ti-hand-stop stopped" aria-hidden="true"></i>` : isDone(x) ? `<i class="ti ti-circle-check" aria-hidden="true"></i>` : ""}${esc(x.ex?.name ?? x.name)}${tag}${x.userNote ? ` <i class="ti ti-note mut" aria-label="has a note"></i>` : ""}${lever}</span><span class="mut">${right}</span></button>`;
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

// The data says you're run down: offer a deload (never automatic).
function deloadCard(s) {
  if (!s.deloadSignal || s.deloadDismissed || anyLogged(s) || s.weekInfo?.deload) return "";
  return `<section class="card check" aria-label="Deload suggestion">
    <div class="label" style="margin-top:0"><i class="ti ti-battery-2" aria-hidden="true"></i> Time to back off?</div>
    <p class="review-txt">${esc(s.deloadSignal.reason)} A deload week (same exercises, half the sets, easy effort) usually brings the numbers back up.</p>
    <div class="prop-acts">
      <button class="primary" id="deload-yes" style="height:44px;font-size:19px;margin:0">Deload this week</button>
      <button class="secondary" id="deload-no" style="height:44px">Not now</button>
    </div>
  </section>`;
}

// What the generator decided before showing today's workout, and why: one
// line on the Train screen, the full list a tap away (keeps the current
// exercise above the fold).
function checkCard(s) {
  const fixes = (s.adjustments ?? []).filter((n) => n.kind === "fix");
  const notes = (s.adjustments ?? []).filter((n) => n.kind === "note");
  if (!s.selection && !fixes.length && !notes.length) return "";
  if (anyLogged(s)) return "";
  const n = fixes.length + notes.length;
  const lead = notes[0]?.text ?? fixes[0]?.text ?? s.selection;
  return `<button class="reason check-line" id="check-btn" aria-label="Why this workout"><i class="ti ti-shield-check" aria-hidden="true"></i><span><b>Built for today${n > 1 ? ` · ${n} adjustments` : ""}:</b> ${esc(lead)}</span><i class="ti ti-chevron-right" aria-hidden="true"></i></button>`;
}

function checkSheet() {
  const s = state.session;
  const items = (s.adjustments ?? []).map((n) => `<li>${esc(n.text)}</li>`).join("");
  sheet(`<h2>Built for today</h2><div class="sub">${esc(s.dayLabel)}${s.minutes ? ` · about ${s.minutes} minutes` : ""}</div>
    ${s.selection ? `<p class="review-txt" style="margin:10px 0">${esc(s.selection)}</p>` : ""}
    ${items ? `<ul class="check-list">${items}</ul>` : ""}`);
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
  root.querySelector("#check-btn")?.addEventListener("click", checkSheet);
  root.querySelector("#deload-yes")?.addEventListener("click", () => { deloadNow(); toast("Deload week: half the sets, easy effort"); });
  root.querySelector("#deload-no")?.addEventListener("click", () => setSession({ ...state.session, deloadDismissed: true }));
  root.querySelectorAll("[data-fb]").forEach((b) => b.addEventListener("click", () => {
    const kind = b.dataset.fb, v = Number(b.dataset.v);
    const muscle = b.dataset.muscle ?? b.closest("[data-muscle]")?.dataset.muscle ?? null;
    const exerciseId = b.dataset.ex ?? null;
    addFeedback({ date: s.date, sessionKey: s.sessionKey, ...(kind === "joints" ? { exerciseId } : { muscle }), [kind]: v });
    buzz(10);
    if (kind === "soreness" && v === 3) toast(`Still sore: one fewer ${niceMuscleName(muscle)} set and an extra rep in the tank today`);
    if (kind === "joints" && v === 2) toast("Painful: tell the coach or switch it. Never train through joint pain.");
  }));
  root.querySelectorAll("[data-rir]").forEach((b) => b.addEventListener("click", () => {
    const planned = target(s.exercises[s.cur]).rir ?? 2;
    chosenRir = rirFor(b.dataset.rir, planned);
    renderTrain(root);
  }));
  root.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => setSession({ ...s, cur: Number(b.dataset.jump) })));
  root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editSheet(Number(b.dataset.edit))));
  root.querySelector("#why")?.addEventListener("click", whySheet);
  root.querySelector("#last-btn")?.addEventListener("click", lastTimeSheet);
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

// Right after an exercise's last set: joints for it, and pump/workload for
// any muscle that's finished for today. Optional; tap outside to skip.
function feedbackSheet(exIdx) {
  const s = state.session;
  const e = s.exercises[exIdx];
  if (!e?.ex) return;
  const el = sheet(`<h2>How was ${esc(e.ex.name)}?</h2><div class="sub">Optional, two seconds: this is how next time's sets get decided.</div>${afterAsk(s, e, exIdx, { inSheet: true })}<button class="secondary" id="fb-done" style="margin-top:12px">Done</button>`);
  el.querySelectorAll("[data-fb]").forEach((b) => b.addEventListener("click", () => {
    const kind = b.dataset.fb, v = Number(b.dataset.v);
    addFeedback({ date: s.date, sessionKey: s.sessionKey, ...(kind === "joints" ? { exerciseId: b.dataset.ex } : { muscle: b.dataset.muscle }), [kind]: v });
    el.querySelectorAll(`[data-fb="${kind}"]${b.dataset.muscle ? `[data-muscle="${b.dataset.muscle}"]` : ""}`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    buzz(10);
    if (kind === "joints" && v === 2) toast("Painful: tell the coach or switch it. Never train through joint pain.");
    const groups = new Set([...el.querySelectorAll("[data-fb]")].map((x) => `${x.dataset.fb}|${x.dataset.muscle ?? ""}`));
    const answered = new Set([...el.querySelectorAll('[data-fb][aria-pressed="true"]')].map((x) => `${x.dataset.fb}|${x.dataset.muscle ?? ""}`));
    if (answered.size >= groups.size) setTimeout(closeSheet, 250);
  }));
  el.querySelector("#fb-done").addEventListener("click", closeSheet);
}

function commit(exIdx, entry) {
  primeAlerts();
  const before = state.session;
  const e = before.exercises[exIdx];
  const next = logSet(before, exIdx, entry, Date.now());
  buzz(15);
  setSession(next, { undoable: true });
  const ex = e.ex;
  // Supersets: a short walk to the partner after the first one, a shared rest after the second.
  const partner = partnerOf(next, exIdx);
  const partnerOpen = partner != null && !isDone(next.exercises[partner]);
  const seconds = partnerOpen ? (partner > exIdx ? 20 : 75) : null;
  if (!isDone(next.exercises[exIdx]) || !sessionDone(next)) startRest(ex, { next: nextUpText(next), seconds });
  const finished = isDone(next.exercises[exIdx]) && !isDone(e) && entry.index == null;
  const what = isDone(next.exercises[exIdx]) ? `${ex?.name ?? e.name} done` : `Set ${(entry.index ?? e.logged.length) + 1} logged`;
  toast(what, { label: "Undo", fn: () => { undo(); toast("Set removed"); } });
  if (finished && ex && feedbackFor(next.date, { exerciseId: ex.id })?.joints == null) setTimeout(() => feedbackSheet(exIdx), 350);
}

// What the rest alert says is next, e.g. "Lat pulldown · set 3: 140 × 10".
function nextUpText(s) {
  const e = s.exercises[s.cur];
  const x = e && !isDone(e) ? e : s.exercises.find((y) => !isDone(y));
  if (!x) return "";
  const t = target(x);
  return `${x.ex?.name ?? x.name} · set ${x.logged.length + 1}${t.load != null && x.plan ? `: ${fmt(t.load)} × ${t.reps}` : ""}`;
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

const LEVER_WHY = {
  "add-reps": "You were inside your rep range last time, so the job today is one more rep at the same weight. When the top set reaches the top of the range, the weight goes up.",
  "add-load": "You reached the top of the rep range, so the weight goes up by the smallest sensible step and the reps start again lower in the range.",
  coarse: "The next weight available is too big a jump, so you earn it with extra reps first (the range stretches by up to 3 reps).",
  hold: "Holding today: either last time was a grind, you were under the range, or it's been a while. Owning these numbers is the progress.",
  "back-off": "Two sessions in a row under the range means the weight is ahead of you. A little lighter gets you back into the range where you can progress again.",
  recalibrate: "It's been 4+ weeks on this one, so it starts a bit lighter with a rep to spare and set 1 resets the numbers.",
  intensify: "No progress for a few sessions, so the plan stays and a technique on the last set adds stimulus without adding a whole set.",
  deload: "Deload week: same weights, well short of failure, half the sets. Fatigue drops so the next block can push harder.",
};
function whySheet() {
  const s = state.session;
  const e = s.exercises[s.cur];
  const r = e.plan?.reason;
  const lines = [];
  if (e.plan?.text) lines.push(esc(e.plan.text));
  if (e.lever && LEVER_WHY[e.lever]) lines.push(`<b>${esc(e.label ?? e.lever)}:</b> ${esc(LEVER_WHY[e.lever])}`);
  if (r?.range) lines.push(`Rep range ${r.range[0]}–${r.range[1]}, ${r.rir} rep${r.rir === 1 ? "" : "s"} left in the tank${s.block ? ` (week ${s.block.week} of ${s.block.of}${s.block.deload ? ", deload" : ""})` : ""}.`);
  else if (r?.aimReps) lines.push(`Target: ${r.aimReps} reps with ${r.rir} left, at the closest load you can make.`);
  if (r?.e1rm) lines.push(`Strength estimate: <b>${Math.round(r.e1rm)} lb</b>. It's used to pick the weight when the load changes and to adjust the rest of today's sets after each one.`);
  const plan = state.plan;
  if (plan && e.ex) {
    const ms = Object.entries(e.ex.contributions).filter(([m, c]) => c >= 1 && plan.muscles[m]).map(([m]) => [m, plan.muscles[m]]);
    for (const [m, x] of ms) lines.push(`${esc(cap(niceMuscleName(m)))}: ${x.done7} sets in the last 7 days, aiming for about ${x.weeklyTarget} a week (${x.perSession} per session${x.lastChange?.d ? `; last change ${x.lastChange.d > 0 ? "+" : ""}${x.lastChange.d}, ${esc(x.lastChange.why)}` : ""}).`);
  }
  if (e.mode === "calibrating") lines.push("Set 1 is a calibration set: the sets after it are recalculated from what you actually do.");
  const t = target(e);
  const el = sheet(`<h2>Why these numbers</h2><div class="sub">${esc(e.ex?.name ?? e.name)}</div>${lines.map((l) => `<p style="margin:10px 0;font-size:15px;line-height:1.5">${l}</p>`).join("")}
    <button class="secondary" id="why-ask" style="margin-top:8px"><i class="ti ti-message-circle" aria-hidden="true"></i> Ask the coach about this</button>`);
  el.querySelector("#why-ask").addEventListener("click", () => {
    closeSheet();
    askAbout(`${e.ex?.name ?? e.name} is ${t.load} × ${t.reps} today. `);
  });
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
