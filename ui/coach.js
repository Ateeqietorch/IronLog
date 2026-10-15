// Coach tab: conversational agent (DESIGN-SPEC.md §5.9, COACH-ENGINE-SPEC.md §7).
// The coach reads app context, explains, remembers, and proposes changes to
// today's workout. It never writes weights or reps; Apply sends its proposal
// through the engine.
import { state, applyProposal, ls } from "./store.js";
import { describeChange, validateChange, isDone } from "./session.js";
import { e1rm } from "../engine/model.js";
import { post } from "../data/sheets.js";
import { esc, toast } from "./dom.js";

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
    })),
    current: s.cur,
  } : null;

  // Recent sessions, compact
  const bySession = new Map();
  for (const r of state.rows) {
    const k = r.sessionKey || `${r.date}_${r.day}`;
    if (!bySession.has(k)) bySession.set(k, { date: r.date, day: r.day, sets: [] });
    bySession.get(k).sets.push(`${r.exercise} ${r.weight}x${r.reps}${r.rpe ? "@RPE" + r.rpe : ""}`);
  }
  const recent = [...bySession.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
    .map((x) => ({ date: x.date, day: x.day, sets: x.sets.slice(0, 30) }));

  const strength = Object.entries(state.models).filter(([, m]) => m.logE1rm != null)
    .map(([k, m]) => ({ id: k.split("|")[0], side: k.split("|")[1], e1rm: Math.round(e1rm(m)), last: m.lastExposure, sessions: m.exposures }))
    .sort((a, b) => String(b.last).localeCompare(String(a.last))).slice(0, 40);

  // Catalog the coach may switch to: same patterns as today first, then the rest.
  const todayPatterns = new Set(today?.exercises.map((e) => e.pattern).filter(Boolean));
  const catalog = idx.list.filter((x) => x.source !== "free-exercise-db")
    .sort((a, b) => todayPatterns.has(b.pattern) - todayPatterns.has(a.pattern))
    .map((x) => `${x.id} | ${x.name} | ${x.pattern} | ${Object.keys(x.contributions).join(",")} | ${x.equipment}`);

  return {
    today, recent, strength,
    program: state.program.days.map((d) => ({ key: d.key, label: d.label, exercises: d.exercises.map((e) => e.name) })),
    settings: state.settings, bodyweight: state.bodyweight,
    predictionAccuracyReps: state.stats?.maeSettled ?? null,
    catalog,
    localDate: new Date().toISOString().slice(0, 10),
  };
}

const PROMPTS = [
  "I only have 40 minutes today",
  "Why is the weight lighter today?",
  "Something hurts on this exercise",
  "The machine is taken, what should I do instead?",
];

export function renderCoach(root) {
  const msgs = thread.map((m, i) => {
    if (m.role === "user") return `<div class="msg me">${esc(m.content)}</div>`;
    const cards = (m.proposals ?? []).map((p, j) => proposalCard(p, i, j)).join("");
    return `<div class="msg coach">${esc(m.content).replace(/\n/g, "<br>")}</div>${cards}`;
  }).join("");
  root.innerHTML = `
    <header class="p-head"><h1>Coach</h1>${thread.length ? `<button class="icon-btn" id="coach-clear" aria-label="Start a new conversation"><i class="ti ti-refresh" aria-hidden="true"></i></button>` : ""}</header>
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
  root.querySelector("#coach-clear")?.addEventListener("click", () => { thread = []; save(); renderCoach(root); });
  root.querySelectorAll("[data-apply]").forEach((b) => b.addEventListener("click", () => {
    const [i, j] = b.dataset.apply.split(":").map(Number);
    const p = thread[i].proposals[j];
    const problems = p.changes.map((c) => validateChange(state.session, c, state.index, state.program)).filter(Boolean);
    if (problems.length) { toast(problems[0]); return; }
    applyProposal(p.changes);
    p.status = "applied"; save(); renderCoach(root);
    toast("Applied to today's workout");
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

async function send(root, text) {
  const t = String(text ?? "").trim();
  if (!t || busy) return;
  thread.push({ role: "user", content: t });
  busy = true; save(); renderCoach(root);
  try {
    const messages = thread.map((m) => ({ role: m.role, content: m.content }));
    const d = await post("coach", { messages, context: buildContext() });
    thread.push({ role: "assistant", content: d.reply || "Done.", proposals: (d.proposals ?? []).map((p) => ({ ...p, status: null })) });
  } catch (err) {
    thread.push({ role: "assistant", content: /unknown action/.test(String(err.message)) ? "The coach needs the latest backend. Paste the new Code.js into Apps Script and redeploy (Deploy → Manage deployments → pencil → New version)." : `Couldn't reach the coach: ${err.message}. Check your connection and try again.` });
  }
  busy = false; save();
  if (document.getElementById("composer")) renderCoach(root);
}
