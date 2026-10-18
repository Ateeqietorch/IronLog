// Switch sheet (COACH-ENGINE-SPEC.md §6.1, §6.1b): pick a replacement, then
// choose how long it lasts — today only, a trial of a few sessions, or
// permanently in the program.
import { state, switchExercise } from "./store.js";
import { rankAlternatives, searchExercises } from "../engine/alternatives.js";
import { isAvoided } from "../engine/validate.js";
import { active } from "../data/constraints.js";
import { FREE_EXERCISE_DB } from "../engine/seed/free-exercise-db.js";
import { TRIAL_MIN, TRIAL_MAX, TRIAL_DEFAULT } from "../data/trials.js";
import { esc, sheet, closeSheet, toast } from "./dom.js";

const MUSCLE = (id) => id.replace(/-/g, " ");

function muscles(ex) {
  return Object.entries(ex.contributions ?? {}).filter(([, v]) => v >= 1).map(([m]) => MUSCLE(m)).slice(0, 3).join(", ");
}

function row(r) {
  const tag = r.known ? `<span class="tag ok">Exact numbers</span>` : `<span class="tag">Set 1 calibrates</span>`;
  return `<button class="list-btn alt" data-pick="${esc(r.ex.id)}"><span><span class="alt-name">${esc(r.ex.name)}</span><span class="alt-sub">${esc(muscles(r.ex))}${r.ex.equipment ? ` · ${esc(r.ex.equipment.replace(/-/g, " "))}` : ""}</span></span>${tag}</button>`;
}

export function switchSheet(exIdx) {
  const s = state.session;
  const e = s.exercises[exIdx];
  const lookup = new Map([...state.index.list, ...FREE_EXERCISE_DB].map((x) => [x.id, x]));
  const ranked = e.ex ? rankAlternatives(e.ex, state.index.list, { models: state.models, limit: 10, avoid: (c) => !!isAvoided(c, active(state.constraints)) }) : [];
  const name = e.ex?.name ?? e.name;

  const el = sheet(`<h2>Switch ${esc(name)}</h2>
    <div class="sub">${e.logged.length ? `Your ${e.logged.length} logged ${e.logged.length === 1 ? "set stays" : "sets stay"}; the new exercise gets the ${Math.max(1, e.sets - e.logged.length)} left.` : "Pick a replacement. Numbers come from your history, or set 1 calibrates."}</div>
    <input class="search" id="sw-q" type="search" autocomplete="off" placeholder="Search any exercise" aria-label="Search exercises" />
    <div id="sw-list">${ranked.length ? `<div class="label">Best matches</div>${ranked.map(row).join("")}` : `<div class="mut" style="padding:12px 0">Search for the exercise you want to do instead.</div>`}</div>`);

  const list = el.querySelector("#sw-list");
  const bindPicks = () => list.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => chooseMode(exIdx, lookup.get(b.dataset.pick))));
  bindPicks();
  el.querySelector("#sw-q").addEventListener("input", (ev) => {
    const q = ev.target.value;
    if (!q.trim()) { list.innerHTML = ranked.length ? `<div class="label">Best matches</div>${ranked.map(row).join("")}` : ""; bindPicks(); return; }
    const hits = searchExercises(q, [state.index.list, FREE_EXERCISE_DB], { models: state.models }).filter((h) => h.ex.id !== e.ex?.id);
    list.innerHTML = hits.length ? hits.map(row).join("") : `<div class="mut" style="padding:12px 0">Nothing matches “${esc(q)}”. Try a shorter name.</div>`;
    bindPicks();
  });
}

function chooseMode(exIdx, to) {
  if (!to) return;
  const s = state.session;
  const e = s.exercises[exIdx];
  const progDay = state.program.days.find((d) => d.key === s.dayKey);
  const inProgram = !!progDay?.exercises[e.slotIndex ?? exIdx];
  let n = TRIAL_DEFAULT;
  const el = sheet(`<h2>${esc(to.name)}</h2>
    <div class="sub">Instead of ${esc(e.ex?.name ?? e.name)}. How long for?</div>
    <button class="mode" data-mode="today"><i class="ti ti-calendar-event" aria-hidden="true"></i><span><b>Today only</b><span class="desc">Back to normal next time.</span></span></button>
    ${inProgram ? `
    <div class="mode trial" role="group" aria-label="Trial">
      <button data-mode="trial"><i class="ti ti-flask" aria-hidden="true"></i><span><b>Try it for <span id="tn">${n}</span> sessions</b><span class="desc">Then IronLog shows how it went and you keep it or go back.</span></span></button>
      <div class="tn-ctl"><button data-tn="-1" aria-label="Fewer sessions"><i class="ti ti-minus" aria-hidden="true"></i></button><button data-tn="1" aria-label="More sessions"><i class="ti ti-plus" aria-hidden="true"></i></button></div>
    </div>
    <button class="mode" data-mode="permanent"><i class="ti ti-pin" aria-hidden="true"></i><span><b>Make it permanent</b><span class="desc">Replaces it in your ${esc(s.dayLabel)} program.</span></span></button>` : ""}
    <button class="link" id="sw-back">Pick a different exercise</button>`);
  el.querySelectorAll("[data-tn]").forEach((b) => b.addEventListener("click", () => {
    n = Math.max(TRIAL_MIN, Math.min(TRIAL_MAX, n + Number(b.dataset.tn)));
    el.querySelector("#tn").textContent = n;
  }));
  el.querySelector("#sw-back").addEventListener("click", () => switchSheet(exIdx));
  el.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    const mode = b.dataset.mode;
    closeSheet();
    switchExercise(exIdx, to, mode, { sessions: n });
    toast(mode === "trial" ? `Trying ${to.name} for ${n} sessions` : mode === "permanent" ? `${to.name} is now in your program` : `Switched to ${to.name} for today`);
  }));
}
