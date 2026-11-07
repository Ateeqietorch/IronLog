// Macros tab: daily targets, quick weight/food logging, the weight trend,
// and the weekly check-in that adjusts the targets (engine/nutrition.js).
import { state, today, nutritionView, setNutrition, logWeight, logIntake, runCheckIn } from "./store.js";
import { GOALS, ACTIVITY, trend } from "../engine/nutrition.js";
import { esc, sheet, closeSheet, toast, fmtDate } from "./dom.js";

const r1 = (x) => Math.round(x * 10) / 10;
const signed = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(r1(x))}`;
const goalText = (g) => {
  if (!g) return "—";
  const G = GOALS[g.type];
  return g.type === "maintain" ? G.label : `${G.label} · ${g.type === "gain" ? "+" : "−"}${g.ratePct}% a week`;
};

export function renderNutrition(root) {
  const n = state.nutrition;
  if (!n.profile || !n.goal) return renderSetup(root);
  const v = nutritionView();
  const t = v.target;
  const ate = v.today;
  const bar = (have, want) => `<div class="vbar" style="width:100%;max-width:none"><i class="${have > want * 1.05 ? "high" : "ok"}" style="width:${Math.min(100, Math.round((have / Math.max(1, want)) * 100))}%"></i></div>`;
  const macro = (label, g, have = null) => `<div class="macro"><div class="num" style="font-size:24px;color:var(--silver)">${g}<span class="mut" style="font-size:13px">g</span></div><div class="mut" style="font-size:12px">${label}${have != null ? ` · ${have} eaten` : ""}</div>${have != null ? bar(have, g) : ""}</div>`;

  const targets = t ? `<section class="card">
      <div class="label" style="margin-top:0"><i class="ti ti-flame" aria-hidden="true"></i> Today's targets</div>
      <div style="display:flex;align-items:baseline;gap:8px"><span class="num" style="font-size:44px;color:var(--silver)">${t.kcal.toLocaleString()}</span><span class="mut">calories</span></div>
      ${ate?.kcal ? `${bar(ate.kcal, t.kcal)}<div class="mut" style="font-size:13px;margin-top:4px">${ate.kcal.toLocaleString()} eaten · ${Math.max(0, t.kcal - ate.kcal).toLocaleString()} left</div>` : ""}
      <div class="macros">${macro("Protein", t.protein, ate?.protein ?? null)}${macro("Carbs", t.carbs)}${macro("Fat", t.fat)}</div>
    </section>` : `<div class="notice warn">Log your weight to get your first targets.</div>`;

  const log = `<section class="card">
      <div class="label" style="margin-top:0"><i class="ti ti-scale" aria-hidden="true"></i> Log today</div>
      <form id="nu-log" class="nu-grid">
        <label>Weight (lb)<input id="nu-w" inputmode="decimal" placeholder="${v.trendWeight ?? ""}" value="${state.weights.find((w) => w.date === today())?.weight ?? ""}" /></label>
        <label>Calories eaten<input id="nu-k" inputmode="numeric" placeholder="optional" value="${ate?.kcal ?? ""}" /></label>
        <label>Protein eaten (g)<input id="nu-p" inputmode="numeric" placeholder="optional" value="${ate?.protein ?? ""}" /></label>
        <button class="primary" style="height:44px;font-size:19px;margin:0;align-self:end">Save</button>
      </form>
      <div class="mut" style="font-size:12px;margin-top:8px">Weigh in most mornings after the bathroom. Food is optional: log it and the targets get more accurate; skip it and they assume you hit them.</div>
    </section>`;

  const tr = trend(state.weights, { until: today() }).slice(-42);
  const spark = tr.length >= 2 ? sparkline(tr) : "";
  const onTrack = v.rate != null && v.goalRate != null ? Math.abs(v.rate - v.goalRate) <= 0.25 : null;
  const trendCard = `<section class="card">
      <div class="label" style="margin-top:0"><i class="ti ti-trending-down" aria-hidden="true"></i> Weight trend</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span><span class="num" style="font-size:30px;color:var(--silver)">${v.trendWeight ?? "—"}</span> <span class="mut">lb trend</span></span>
      <span class="mut" style="text-align:right;font-size:13px">${v.rate != null ? `${signed(v.rate)} lb/week now` : "Need ~2 weeks of weigh-ins"}<br>goal ${signed(v.goalRate ?? 0)} lb/week</span></div>
      ${spark}
      ${onTrack != null ? `<div class="mut" style="font-size:13px;margin-top:6px">${onTrack ? "On track." : `${paceText(v.rate, v.goalRate)} The next check-in adjusts for it.`} ${v.weighIns14} weigh-ins in the last 2 weeks.</div>` : ""}
    </section>`;

  const last = [...n.checkins].sort((a, b) => a.date.localeCompare(b.date)).slice(-4).reverse();
  const checkCard = `<section class="card">
      <div class="label" style="margin-top:0"><i class="ti ti-calendar-check" aria-hidden="true"></i> Weekly check-in</div>
      ${last[0] ? `<p class="review-txt" style="margin:4px 0 8px">${esc(last[0].why)}</p><div class="mut" style="font-size:13px">Burning about ${last[0].tdee.toLocaleString()} a day (${last[0].source === "logged" ? "from your food logs" : last[0].source === "assumed" ? "assuming you hit your targets" : "starting estimate"}). Next check-in ${v.nextCheckIn ? esc(fmtDate(v.nextCheckIn)) : "—"}.</div>` : ""}
      ${last.length > 1 ? `<div class="rows" style="margin-top:8px">${last.slice(1).map((c) => `<div class="row"><span>${esc(fmtDate(c.date))}</span><span class="r">${c.kcal.toLocaleString()} kcal${c.change ? ` (${c.change > 0 ? "+" : "−"}${Math.abs(c.change)})` : ""}</span></div>`).join("")}</div>` : ""}
      <button class="link" id="nu-check" style="margin:8px 0 0">Check in now</button>
    </section>`;

  const prot = n.proteinPerLb ?? GOALS[n.goal.type].protein;
  const settings = `<div class="group-title">Goal and settings</div><div class="rows">
      <button class="list-btn" id="nu-goal"><span>Goal</span><span class="mut">${esc(goalText(n.goal))} <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>
      <button class="list-btn" id="nu-act"><span>Activity outside the gym</span><span class="mut">${esc(ACTIVITY[n.profile.activity]?.label ?? "—")} <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>
      <button class="list-btn" id="nu-prot"><span>Protein</span><span class="mut">${prot} g per lb <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>
      <button class="list-btn" id="nu-prof"><span>Profile</span><span class="mut">${n.profile.sex === "female" ? "F" : "M"}, ${n.profile.age}, ${Math.floor(n.profile.heightIn / 12)}′${n.profile.heightIn % 12}″ <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>
    </div>
    <div class="mut" style="font-size:12px;margin:10px 16px 16px">Targets start from a resting-burn formula, then each week the app compares what you ate (or your targets, if you don't log) with what your weight trend did, works out what you really burn, and moves calories at most 250 at a time toward your goal rate. Never below your resting burn.</div>`;

  root.innerHTML = `<header class="p-head"><h1>Macros</h1></header>${targets}${log}${trendCard}${checkCard}${settings}`;

  root.querySelector("#nu-log").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const w = root.querySelector("#nu-w").value.trim(), k = root.querySelector("#nu-k").value.trim(), p = root.querySelector("#nu-p").value.trim();
    const saved = [];
    if (w) { if (!logWeight(w)) return toast("Weight looks off"); saved.push("weight"); }
    if (k || p) { logIntake({ kcal: k || null, protein: p || null }); saved.push("food"); }
    toast(saved.length ? `Saved ${saved.join(" and ")}` : "Nothing to save");
  });
  root.querySelector("#nu-check").addEventListener("click", () => { const c = runCheckIn({ force: true }); toast(c ? `Target: ${c.kcal.toLocaleString()} kcal` : "Log a weight first"); });
  root.querySelector("#nu-goal").addEventListener("click", goalSheet);
  root.querySelector("#nu-act").addEventListener("click", activitySheet);
  root.querySelector("#nu-prot").addEventListener("click", proteinSheet);
  root.querySelector("#nu-prof").addEventListener("click", () => profileSheet());
}

function paceText(rate, goal) {
  if (Math.abs(goal) < 0.05) return rate > 0 ? "Drifting up." : "Drifting down.";
  const losing = goal < 0;
  const faster = losing ? rate < goal : rate > goal;
  if (losing && rate >= 0) return "Not losing yet.";
  if (!losing && rate <= 0) return "Not gaining yet.";
  return `${losing ? "Losing" : "Gaining"} ${faster ? "faster" : "slower"} than your goal.`;
}

function sparkline(tr) {
  const W = 300, H = 70, P = 4;
  const vals = tr.flatMap((x) => [x.trend, x.weight].filter((v) => v != null));
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
  const X = (i) => P + (i / (tr.length - 1)) * (W - 2 * P), Y = (v) => P + (1 - (v - lo) / span) * (H - 2 * P);
  const line = tr.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x.trend).toFixed(1)}`).join("");
  const dots = tr.map((x, i) => (x.weight != null ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.weight).toFixed(1)}" r="2" class="sp-dot"/>` : "")).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" role="img" aria-label="Weight over the last ${tr.length} days: dots are weigh-ins, the line is the trend">${dots}<path d="${line}" class="sp-line"/></svg>
    <div class="mut" style="display:flex;justify-content:space-between;font-size:11px"><span>${esc(fmtDate(tr[0].date))}</span><span>${r1(lo)}–${r1(hi)} lb</span><span>today</span></div>`;
}

// ── Setup ──────────────────────────────────────────────────────────────────
function renderSetup(root) {
  root.innerHTML = `<header class="p-head"><h1>Macros</h1></header>
    <section class="card">
      <div class="label" style="margin-top:0"><i class="ti ti-flame" aria-hidden="true"></i> Set up your targets</div>
      <p class="review-txt" style="margin:4px 0 10px">A starting estimate now; after two or three weeks of weigh-ins it's tuned to what your body actually does.</p>
      ${profileFields(state.nutrition.profile ?? {}, true)}
      ${goalFields({ type: "cut", ratePct: 0.5 })}
      <button class="primary" id="su-save" style="margin-top:12px"><i class="ti ti-check" aria-hidden="true"></i>Get my targets</button>
    </section>`;
  bindSegs(root);
  root.querySelector("#su-save").addEventListener("click", () => {
    const p = readProfile(root), g = readGoal(root);
    const w = Number(root.querySelector("#pf-w").value);
    if (!p) return toast("Fill in age and height");
    if (!(w > 50 && w < 700)) return toast("Add your current weight");
    logWeight(w);
    setNutrition({ profile: p, goal: g });
    toast("Targets set");
  });
}

function profileFields(p, withWeight = false) {
  const seg = (name, val, opts) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(val) === String(v)}">${l}</button>`).join("")}</div>`;
  return `<div class="note-label">Sex (for the resting-burn formula)</div>${seg("sex", p.sex ?? "male", [["male", "Male"], ["female", "Female"]])}
    <div class="nu-grid" style="margin-top:10px">
      <label>Age<input id="pf-age" inputmode="numeric" value="${p.age ?? ""}" /></label>
      <label>Height ft<input id="pf-ft" inputmode="numeric" value="${p.heightIn ? Math.floor(p.heightIn / 12) : ""}" /></label>
      <label>in<input id="pf-in" inputmode="numeric" value="${p.heightIn ? p.heightIn % 12 : ""}" /></label>
      ${withWeight ? `<label>Weight (lb)<input id="pf-w" inputmode="decimal" value="${state.bodyweight ?? ""}" /></label>` : ""}
    </div>
    <div class="note-label">Activity outside the gym</div>${seg("activity", p.activity ?? "moderate", Object.entries({ low: "Desk", moderate: "Some walking", high: "On my feet", very: "Very active" }))}`;
}

function goalFields(g) {
  const seg = (name, val, opts) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(val) === String(v)}">${l}</button>`).join("")}</div>`;
  const rates = (type) => GOALS[type].rates.map((r) => [r, r === 0 ? "—" : `${r}%`]);
  return `<div class="note-label">Goal</div>${seg("goal", g.type, Object.entries(GOALS).map(([k, x]) => [k, x.label.split(" (")[0]]))}
    <div class="note-label">Rate (% of bodyweight a week)</div><div id="rate-wrap">${seg("rate", g.ratePct ?? GOALS[g.type].default, rates(g.type))}</div>
    <div class="mut" style="font-size:12px;margin-top:6px">Lean-out: 0.5–1% a week keeps muscle (Helms 2014). Building: 0.25–0.5% (Iraki 2019); slower if you're past your first few years.</div>`;
}

function bindSegs(root) {
  root.querySelectorAll("[data-seg] button").forEach((b) => b.addEventListener("click", () => {
    const seg = b.closest("[data-seg]");
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (seg.dataset.seg === "goal") {
      const type = b.dataset.v;
      root.querySelector("#rate-wrap").innerHTML = `<div class="seg" data-seg="rate">${GOALS[type].rates.map((r) => `<button type="button" data-v="${r}" aria-pressed="${r === GOALS[type].default}">${r === 0 ? "—" : `${r}%`}</button>`).join("")}</div>`;
      bindSegs(root.querySelector("#rate-wrap"));
    }
  }));
}
const segVal = (root, name) => root.querySelector(`[data-seg="${name}"] [aria-pressed="true"]`)?.dataset.v;
function readProfile(root) {
  const age = Number(root.querySelector("#pf-age").value), ft = Number(root.querySelector("#pf-ft").value), inch = Number(root.querySelector("#pf-in").value || 0);
  if (!(age >= 14 && age <= 100) || !(ft >= 4 && ft <= 7)) return null;
  return { sex: segVal(root, "sex") ?? "male", age, heightIn: ft * 12 + inch, activity: segVal(root, "activity") ?? "moderate" };
}
const readGoal = (root) => ({ type: segVal(root, "goal") ?? "maintain", ratePct: Number(segVal(root, "rate") ?? 0) });

function goalSheet() {
  const el = sheet(`<h2>Goal</h2>${goalFields(state.nutrition.goal)}<button class="primary" id="g-save" style="margin-top:12px">Save</button>`);
  bindSegs(el);
  el.querySelector("#g-save").addEventListener("click", () => { const c = setNutrition({ goal: readGoal(el) }); closeSheet(); toast(c ? `New target: ${c.kcal.toLocaleString()} kcal` : "Saved"); });
}
function activitySheet() {
  const el = sheet(`<h2>Activity</h2><div class="sub">Only matters for the starting estimate; after that your weight trend takes over.</div>${profileFields(state.nutrition.profile)}<button class="primary" id="a-save" style="margin-top:12px">Save</button>`);
  bindSegs(el);
  el.querySelector("#a-save").addEventListener("click", () => { const p = readProfile(el); if (!p) return toast("Fill in age and height"); setNutrition({ profile: p }); closeSheet(); toast("Saved"); });
}
const profileSheet = activitySheet;
function proteinSheet() {
  const cur = state.nutrition.proteinPerLb ?? GOALS[state.nutrition.goal.type].protein;
  const opts = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
  const el = sheet(`<h2>Protein</h2><div class="sub">Grams per lb of bodyweight. 0.7–1.0 covers the research range (1.6–2.2 g/kg); 1.0 while losing fat helps keep muscle.</div>
    <div class="seg" data-seg="prot">${opts.map((o) => `<button type="button" data-v="${o}" aria-pressed="${o === cur}">${o}</button>`).join("")}</div>
    <button class="secondary" id="p-auto" style="margin-top:10px">Use the default for my goal</button><button class="primary" id="p-save" style="margin-top:8px">Save</button>`);
  bindSegs(el);
  el.querySelector("#p-auto").addEventListener("click", () => { setNutrition({ proteinPerLb: null }); closeSheet(); toast("Saved"); });
  el.querySelector("#p-save").addEventListener("click", () => { setNutrition({ proteinPerLb: Number(segVal(el, "prot")) }); closeSheet(); toast("Saved"); });
}
