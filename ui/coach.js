// Coach tab: conversational agent (DESIGN-SPEC.md §5.9, COACH-ENGINE-SPEC.md §7).
// The coach reads app context, explains, remembers, and proposes changes to
// today's workout or the program, including exact weights and reps and
// exercises that aren't in the catalog yet. Nothing changes until Apply.
import { state, applyProposal, ls, addConstraint, removeConstraint } from "./store.js";
import { active, describe } from "../data/constraints.js";
import { describeChange, validateChange, isDone } from "./session.js";
import { e1rm } from "../engine/model.js";
import { post } from "../data/sheets.js";
import { esc, toast, sheet } from "./dom.js";
import { isAvoided } from "../engine/validate.js";
import { md } from "./md.js";

const KEY = "il3:coach";
let thread = ls.get(KEY, []);
let busy = false;

const save = () => ls.set(KEY, thread.slice(-40));

export function buildContext() {
  const s = state.session;
  const idx = state.index;
  const today = s && !s.saved ? {
    date: s.date, day: s.dayLabel, dayKey: s.dayKey,
    week: s.weekInfo,
    exercises: s.exercises.map((e, i) => ({
      index: i, name: e.ex?.name ?? e.name, id: e.ex?.id ?? null, pattern: e.ex?.pattern, muscles: e.ex?.contributions,
      mode: e.mode, done: isDone(e), sets: e.sets, repRange: e.slot.repRange,
      plan: e.plan?.sets?.map((x) => `${x.load}x${x.reps}@${x.rir}RIR`), reason: e.plan?.text, estimate: e.plan?.reason?.e1rm,
      logged: e.logged.map((l) => `${l.load}x${typeof l.reps === "object" ? `L${l.reps.L}/R${l.reps.R}` : l.reps}@${l.rir}RIR`),
      switchedFrom: e.switchedFrom,
      ...(e.userNote ? { note: e.userNote } : {}),
      ...(e.stopped ? { stopped: `ended after ${e.logged.length} of ${e.stopped.of} sets` } : {}),
      ...(e.added ? { addedByCoach: true } : {}),
    })),
    ...(s.workoutNote ? { note: s.workoutNote } : {}),
    current: s.cur,
    selection: s.selection ?? null,
    checks: (s.adjustments ?? []).map((n) => n.text),
  } : null;

  // Recent sessions, compact
  const bySession = new Map();
  for (const r of state.rows) {
    const k = r.sessionKey || `${r.date}_${r.day}`;
    if (!bySession.has(k)) bySession.set(k, { date: r.date, day: r.day, sets: [], notes: {}, note: "" });
    const b = bySession.get(k);
    b.sets.push(`${r.exercise} ${r.weight}x${r.reps}${r.rpe ? "@RPE" + r.rpe : ""}`);
    if (r.notes && String(r.notes).trim()) b.notes[r.exercise] = String(r.notes).trim();
    if (r.sessionNote && !b.note) b.note = String(r.sessionNote).trim();
  }
  // The lifter's notes ride along so the coach knows about a tweak or why
  // a workout was cut short.
  const recent = [...bySession.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
    .map((x) => ({ date: x.date, day: x.day, sets: x.sets.slice(0, 24),
      ...(Object.keys(x.notes).length ? { exerciseNotes: x.notes } : {}), ...(x.note ? { note: x.note } : {}) }));

  const strength = Object.entries(state.models).filter(([, m]) => m.logE1rm != null)
    .map(([k, m]) => ({ id: k.split("|")[0], side: k.split("|")[1], e1rm: Math.round(e1rm(m)), last: m.lastExposure, sessions: m.exposures }))
    .sort((a, b) => String(b.last).localeCompare(String(a.last))).slice(0, 30);

  // Catalog the coach may switch to: same patterns as today first, then the rest.
  const todayPatterns = new Set(today?.exercises.map((e) => e.pattern).filter(Boolean));
  const catalog = idx.list.filter((x) => x.source !== "free-exercise-db")
    .sort((a, b) => todayPatterns.has(b.pattern) - todayPatterns.has(a.pattern))
    .map((x) => `${x.id} | ${x.name} | ${x.pattern} | ${Object.keys(x.contributions).join(",")} | ${x.equipment}`);

  return {
    today, recent, strength,
    program: state.program.days.map((d) => ({ key: d.key, label: d.label, exercises: d.exercises.map((e) => e.name) })),
    rules: active(state.constraints).map((c) => ({ id: c.id, type: c.type, target: c.target, reason: c.reason, text: describe(c, idx) })),
    lastAssessment: (s?.saved && s.assessment ? { date: s.date, day: s.dayLabel, headline: s.assessment.headline, lines: s.assessment.lines } : null) ?? ls.get("il3:lastAssessment", null),
    settings: state.settings, bodyweight: state.bodyweight,
    predictionAccuracyReps: state.stats?.maeSettled ?? null,
    catalog,
    localDate: new Date().toISOString().slice(0, 10),
  };
}

const PROMPTS = [
  "I only have 40 minutes today",
  "Add another biceps exercise today",
  "Why is the weight lighter today?",
  "Something hurts on this exercise",
  "The machine is taken, what should I do instead?",
];

export function renderCoach(root) {
  const msgs = thread.map((m, i) => {
    if (m.role === "user") return `<div class="msg me">${esc(m.content)}</div>`;
    const cards = (m.proposals ?? []).map((p, j) => proposalCard(p, i, j)).join("");
    return `<div class="msg coach">${md(m.content)}</div>${cards}`;
  }).join("");
  root.innerHTML = `
    <header class="p-head"><h1>Coach</h1><div style="display:flex;gap:6px"><button class="icon-btn" id="coach-rules" aria-label="Your training rules"><i class="ti ti-list-check" aria-hidden="true"></i></button>${thread.length ? `<button class="icon-btn" id="coach-clear" aria-label="Start a new conversation"><i class="ti ti-refresh" aria-hidden="true"></i></button>` : ""}</div></header>
    <div class="chat" id="chat">
      ${thread.length ? msgs : `<div class="empty" style="margin-top:4px">Ask about today's numbers, tell it what's going on, or ask for a change. It sees your workout, history and strength estimates, and anything it changes, you approve first.</div>`}
      ${busy ? `<div class="msg coach mut"><i class="ti ti-loader" aria-hidden="true"></i> Thinking…</div>` : ""}
    </div>
    ${thread.length ? "" : `<div class="prompts">${PROMPTS.map((p) => `<button class="prompt">${esc(p)}</button>`).join("")}</div>`}
    <form class="composer" id="composer">
      <input id="coach-input" autocomplete="off" placeholder="Ask your coach" aria-label="Message the coach" ${busy ? "disabled" : ""} />
      <button class="send" aria-label="Send" ${busy ? "disabled" : ""}><i class="ti ti-arrow-up" aria-hidden="true"></i></button>
    </form>`;
  root.querySelector("#composer").addEventListener("submit", (ev) => { ev.preventDefault(); send(root, root.querySelector("#coach-input").value); });
  root.querySelectorAll(".prompt").forEach((b) => b.addEventListener("click", () => send(root, b.textContent)));
  root.querySelector("#coach-rules")?.addEventListener("click", rulesSheet);
  root.querySelector("#coach-clear")?.addEventListener("click", () => { thread = []; save(); renderCoach(root); });
  root.querySelectorAll("[data-apply]").forEach((b) => b.addEventListener("click", () => {
    const [i, j] = b.dataset.apply.split(":").map(Number);
    const p = thread[i].proposals[j];
    const problems = p.changes.map((c) => validateChange(state.session, c, state.index, state.program)
      ?? ((c.type === "switch_exercise" || c.type === "add_exercise") && isAvoided(state.index.byId.get(c.toExerciseId), active(state.constraints)) ? "That exercise is on your avoid list." : null)).filter(Boolean);
    if (problems.length) { toast(problems[0]); return; }
    const failed = applyProposal(p.changes);
    if (failed.length) toast(failed[0]);
    p.status = "applied"; save(); renderCoach(root);
    if (!failed.length) toast(p.changes.some((c) => c.scope === "permanent") ? "Applied, and your program is updated" : "Applied");
  }));
  root.querySelectorAll("[data-dismiss]").forEach((b) => b.addEventListener("click", () => {
    const [i, j] = b.dataset.dismiss.split(":").map(Number);
    thread[i].proposals[j].status = "dismissed"; save(); renderCoach(root);
  }));
  const chat = root.querySelector("#chat");
  window.scrollTo({ top: document.body.scrollHeight });
  chat?.lastElementChild?.scrollIntoView?.({ block: "end" });
}

function proposalCard(p, i, j) {
  const s = state.session;
  const lines = p.changes.map((c) => `<li>${esc(s ? describeChange(s, c, state.index) : c.type)}</li>`).join("");
  const status = p.status === "applied" ? `<div class="mut" style="font-size:13px;margin-top:8px"><i class="ti ti-check" aria-hidden="true"></i> Applied</div>`
    : p.status === "dismissed" ? `<div class="mut" style="font-size:13px;margin-top:8px">Not applied</div>`
    : `<div class="prop-acts"><button class="primary" data-apply="${i}:${j}" style="height:44px;font-size:19px;margin:0">Apply</button><button class="secondary" data-dismiss="${i}:${j}" style="height:44px">Not now</button></div>`;
  return `<div class="proposal"><div style="font-weight:500">${esc(p.summary)}</div><ul>${lines}</ul>${status}</div>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Phones drop requests that take more than about a minute ("Load failed"),
// but the backend finishes anyway and parks the answer. So on a network
// error, ask for the parked answer for up to two more minutes.
async function askCoach(payload) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    return await post("coach", { ...payload, requestId });
  } catch (err) {
    if (!(err instanceof TypeError)) throw err; // a real answer from the backend, e.g. an API error
    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      try {
        const d = await post("coach_result", { requestId });
        if (!d.pending) return d;
      } catch (e) {
        if (/unknown action/.test(String(e.message))) throw err;
      }
    }
    throw new Error("The coach took too long to answer");
  }
}

async function send(root, text) {
  const t = String(text ?? "").trim();
  if (!t || busy) return;
  thread.push({ role: "user", content: t });
  busy = true; save(); renderCoach(root);
  try {
    // Only the recent conversation goes up; old turns just slow it down.
    const messages = thread.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    while (messages.length && messages[0].role !== "user") messages.shift();
    const d = await askCoach({ messages, context: buildContext() });
    for (const r of d.rulesAdded ?? []) addConstraint(r);
    for (const id of d.rulesRemoved ?? []) removeConstraint(id);
    // Pin the names now: once applied, the session shows the new exercise
    // and a later lookup would read "swap X for X".
    const named = (c) => {
      const e = state.session?.exercises?.[c.exerciseIndex];
      const fromName = e ? (e.ex?.name ?? e.name) : undefined;
      const toName = c.type === "switch_exercise" || c.type === "add_exercise" ? (c.newExercise?.name ?? state.index.byId.get(c.toExerciseId)?.name) : undefined;
      const before = c.type === "add_exercise" && c.toPosition != null ? state.session?.exercises?.[c.toPosition] : null;
      const beforeName = before ? (before.ex?.name ?? before.name) : undefined;
      return { ...c, ...(fromName && c.type !== "add_exercise" ? { fromName } : {}), ...(toName ? { toName } : {}), ...(beforeName ? { beforeName } : {}) };
    };
    const proposals = (d.proposals ?? []).map((p) => ({ ...p, changes: (p.changes ?? []).map(named), status: null }));
    thread.push({ role: "assistant", content: d.reply || (proposals.length ? "Here's what I'd change:" : "Noted."), proposals });
  } catch (err) {
    const m = String(err.message);
    thread.push({ role: "assistant", content: /unknown action/.test(m) ? "The coach needs the latest backend. Paste the new Code.js into Apps Script and redeploy (Deploy → Manage deployments → pencil → New version)."
      : /ANTHROPIC_API_KEY/.test(m) ? "The coach isn't set up yet: add ANTHROPIC_API_KEY under Project Settings → Script Properties in Apps Script."
      : `Couldn't reach the coach (${m}). Try again in a moment.` });
  }
  busy = false; save();
  if (document.getElementById("composer")) renderCoach(root);
}

// The standing rules the generator enforces. Viewable and removable here;
// new ones come from telling the coach.
export function rulesSheet() {
  const list = active(state.constraints);
  const rows = list.map((c) => `<div class="rule-row"><span>${esc(describe(c, state.index))}${c.reason ? `<br><span class="mut">${esc(c.reason)}</span>` : ""}</span><button class="icon-btn" data-rm="${esc(c.id)}" aria-label="Remove rule"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join("");
  const el = sheet(`<h2>Your training rules</h2><div class="sub">Every workout is checked against these before you see it. Tell the coach to add one.</div>${rows || `<div class="mut" style="padding:12px 0">No rules yet.</div>`}`);
  el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Remove this rule?")) return;
    removeConstraint(b.dataset.rm);
    rulesSheet();
    toast("Rule removed");
  }));
}
