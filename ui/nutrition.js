// Macros tab: daily targets, quick weight/food logging, the weight trend,
// and the weekly check-in that adjusts the targets (engine/nutrition.js).
import { state, today, nutritionView, setNutrition, logWeight, removeWeight, logIntake, runCheckIn, addMeal, removeMeal, updateMealPortion, saveFood, unsaveFood, isSavedFood } from "./store.js";
import { FOODS, CATEGORIES, groceryPlan, SNACK_SWAPS, food, foodMeal, labelMeal, quickMeal, kcalFromMacros, recentMeals, searchFoods } from "../engine/foods.js";
import { estimateMeal, scaleMeal } from "./meals.js";
import { GOALS, ACTIVITY, trend } from "../engine/nutrition.js";
import { esc, sheet, closeSheet, toast, fmtDate } from "./dom.js";

const r1 = (x) => Math.round(x * 10) / 10;
let logDate = today();
const addDays = (iso, k) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const dayWord = () => (logDate === today() ? "today" : fmtDate(logDate));
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
      <div class="macros">${macro("Protein", t.protein, ate?.protein || ate?.meals?.length ? ate.protein ?? 0 : null)}${macro("Carbs", t.carbs, ate?.meals?.length ? ate.carbs ?? 0 : null)}${macro("Fat", t.fat, ate?.meals?.length ? ate.fat ?? 0 : null)}</div>
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

  // Food log: any of the last 30 days, today by default.
  if (logDate > today()) logDate = today();
  const isToday = logDate === today();
  const day = n.intake.find((x) => x.date === logDate) ?? null;
  const meals = day?.meals ?? [];
  const dayTot = day && (day.kcal || meals.length) ? `${(day.kcal ?? 0).toLocaleString()} kcal · P${day.protein ?? 0} C${day.carbs ?? 0} F${day.fat ?? 0}` : "Nothing logged";
  const mealCard = `<section class="card">
      <div class="label" style="margin-top:0;display:flex;align-items:center;justify-content:space-between"><span><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i> Food log</span>
        <span class="day-nav"><button class="link" id="fl-prev" aria-label="Previous day" ${logDate <= addDays(today(), -30) ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button><span>${isToday ? "Today" : esc(fmtDate(logDate))}</span><button class="link" id="fl-next" aria-label="Next day" ${isToday ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button></span></div>
      <div class="mut" style="font-size:13px;margin-bottom:10px">${dayTot}</div>
      <form id="fl-quick">
        <div class="note-label" style="margin-top:0">Exact macros</div>
        <div class="nu-grid fl-quick">
          <label>Protein g<input id="q-p" inputmode="decimal" /></label>
          <label>Carbs g<input id="q-c" inputmode="decimal" /></label>
          <label>Fat g<input id="q-f" inputmode="decimal" /></label>
          <label>Calories<input id="q-k" inputmode="numeric" placeholder="auto" /></label>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px"><input id="q-name" class="fs-q" style="margin:0;flex:1;height:44px" placeholder="Name (optional)" /><button class="primary" style="height:44px;width:auto;padding:0 18px;font-size:19px;margin:0">Add</button></div>
      </form>
      <div class="fl-add" style="margin-top:12px">
        <button class="secondary" id="fl-search"><i class="ti ti-search" aria-hidden="true"></i>Search foods</button>
        <button class="secondary" id="fl-label"><i class="ti ti-receipt" aria-hidden="true"></i>From a label</button>
      </div>
      <textarea id="nu-meal" rows="2" placeholder="Or describe it: Mom's chicken biryani, about 2 cups, with raita and a mango lassi"></textarea>
      <button class="primary" id="nu-est" style="height:44px;font-size:19px;margin:8px 0 0"><i class="ti ti-sparkles" aria-hidden="true"></i>Estimate macros</button>
      ${meals.length ? `<div class="rows" style="margin-top:10px">${meals.map((m) => `<button class="list-btn meal-row" data-meal="${esc(m.id)}"><span>${esc(m.name)}${m.portion && m.portion !== 1 ? ` <span class="mut">${m.portion}×</span>` : ""}<br><span class="mut" style="font-size:12px">${m.kcal} kcal · P${m.protein} C${m.carbs} F${m.fat}</span></span><i class="ti ti-chevron-right" aria-hidden="true"></i></button>`).join("")}</div>` : `<div class="mut" style="font-size:12px;margin-top:8px">Know your numbers? Type them above. Otherwise search the food list, copy a label, or describe homemade and restaurant food for an AI estimate.</div>`}
    </section>`;

  const groceryCard = t ? `<section class="card">
      <div class="label" style="margin-top:0"><i class="ti ti-shopping-cart" aria-hidden="true"></i> Grocery list</div>
      <p class="review-txt" style="margin:4px 0 8px">A week of macro-friendly staples sized to your ${t.kcal.toLocaleString()} kcal / ${t.protein} g protein target, plus a sample day.</p>
      <button class="link" id="nu-groc" style="margin:0">Open this week's list</button>
    </section>` : "";

  const tr = trend(state.weights, { until: today() }).slice(-42);
  const spark = tr.length >= 2 ? sparkline(tr) : "";
  const onTrack = v.rate != null && v.goalRate != null ? Math.abs(v.rate - v.goalRate) <= 0.25 : null;
  const trendCard = `<section class="card">
      <div class="label" style="margin-top:0"><i class="ti ti-trending-down" aria-hidden="true"></i> Weight trend</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span><span class="num" style="font-size:30px;color:var(--silver)">${v.trendWeight ?? "—"}</span> <span class="mut">lb trend</span></span>
      <span class="mut" style="text-align:right;font-size:13px">${v.rate != null ? `${signed(v.rate)} lb/week now` : "Need ~2 weeks of weigh-ins"}<br>goal ${signed(v.goalRate ?? 0)} lb/week</span></div>
      ${spark}
      ${weighInRows(state.weights, 7)}
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

  root.innerHTML = `<header class="p-head"><h1>Macros</h1></header>${targets}${mealCard}${log}${groceryCard}${trendCard}${checkCard}${settings}`;

  root.querySelector("#nu-log").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const w = root.querySelector("#nu-w").value.trim(), k = root.querySelector("#nu-k").value.trim(), p = root.querySelector("#nu-p").value.trim();
    const saved = [];
    if (w) { if (!logWeight(w)) return toast("Weight looks off"); saved.push("weight"); }
    if (k || p) { logIntake({ kcal: k || null, protein: p || null }); saved.push("food"); }
    toast(saved.length ? `Saved ${saved.join(" and ")}` : "Nothing to save");
  });
  bindWeighIns(root);
  root.querySelector("#wi-all")?.addEventListener("click", allWeighInsSheet);
  root.querySelector("#nu-est").addEventListener("click", () => estimate(root));
  root.querySelector("#fl-prev").addEventListener("click", () => { logDate = addDays(logDate, -1); renderNutrition(root); });
  root.querySelector("#fl-next").addEventListener("click", () => { logDate = addDays(logDate, 1); renderNutrition(root); });
  root.querySelector("#fl-search").addEventListener("click", searchSheet);
  const qf = root.querySelector("#fl-quick");
  const qv = (id) => qf.querySelector(id).value.trim();
  const qAuto = () => { const k = kcalFromMacros(qv("#q-p"), qv("#q-c"), qv("#q-f")); qf.querySelector("#q-k").placeholder = k > 0 ? String(k) : "auto"; };
  ["#q-p", "#q-c", "#q-f"].forEach((id) => qf.querySelector(id).addEventListener("input", qAuto));
  qf.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const m = quickMeal({ protein: qv("#q-p"), carbs: qv("#q-c"), fat: qv("#q-f"), kcal: qv("#q-k"), name: qv("#q-name") });
    if (!m) return toast("Enter protein, carbs or fat");
    addMeal(m, logDate);
    toast(`Added ${m.kcal} kcal · P${m.protein} C${m.carbs} F${m.fat}`);
  });
  root.querySelector("#fl-label").addEventListener("click", labelSheet);
  root.querySelectorAll("[data-meal]").forEach((b) => b.addEventListener("click", () => loggedSheet(b.dataset.meal)));
  root.querySelector("#nu-groc")?.addEventListener("click", () => grocerySheet(t));
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

// ── Weigh-in entries ───────────────────────────────────────────────────────
// Newest first, with the change from the weigh-in before it. Tap to edit.
function weighInRows(weights, limit = Infinity, title = true) {
  if (!weights.length) return "";
  const rows = weights.map((x, i) => ({ ...x, diff: i ? x.weight - weights[i - 1].weight : null })).reverse();
  const shown = rows.slice(0, limit);
  const diff = (d) => (d == null || Math.abs(d) < 0.05 ? "" : ` <span class="${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}</span>`);
  return `${title ? `<div class="note-label" style="margin-top:12px">Weigh-ins</div>` : ""}
    <div class="rows wi-rows">${shown.map((x) => `<button class="list-btn row" data-wi="${esc(x.date)}"><span>${esc(x.date === today() ? "Today" : fmtDate(x.date))}</span><span class="r"><span class="num">${r1(x.weight)}</span> lb${diff(x.diff)}</span></button>`).join("")}</div>
    ${rows.length > limit ? `<button class="link" id="wi-all" style="margin:8px 0 0">Show all ${rows.length}</button>` : ""}`;
}

function bindWeighIns(el) {
  el.querySelectorAll("[data-wi]").forEach((b) => b.addEventListener("click", () => editWeighInSheet(b.dataset.wi)));
}

function allWeighInsSheet() {
  const el = sheet(`<h2>Weigh-ins</h2><div class="sub">${state.weights.length} entries. Tap one to change or delete it.</div>
    <div style="max-height:60vh;overflow-y:auto">${weighInRows(state.weights, Infinity, false)}</div>
    <button class="secondary" id="wi-close" style="margin-top:12px">Done</button>`);
  bindWeighIns(el);
  el.querySelector("#wi-close").addEventListener("click", closeSheet);
}

function editWeighInSheet(date) {
  const cur = state.weights.find((x) => x.date === date);
  if (!cur) return;
  const el = sheet(`<h2>${esc(date === today() ? "Today" : fmtDate(date))}</h2><div class="sub">Change this weigh-in or remove it.</div>
    <div class="nu-grid"><label>Weight (lb)<input id="wi-w" inputmode="decimal" value="${cur.weight}" /></label></div>
    <button class="primary" id="wi-save" style="margin-top:12px"><i class="ti ti-check" aria-hidden="true"></i>Save</button>
    <button class="secondary" id="wi-del" style="margin-top:8px"><i class="ti ti-trash" aria-hidden="true"></i>Delete</button>`);
  el.querySelector("#wi-save").addEventListener("click", () => {
    if (!logWeight(el.querySelector("#wi-w").value.trim(), date)) return toast("Weight looks off");
    closeSheet(); toast("Weigh-in updated");
  });
  el.querySelector("#wi-del").addEventListener("click", () => {
    removeWeight(date);
    closeSheet();
    toast("Weigh-in deleted", { label: "Undo", fn: () => logWeight(cur.weight, date) });
  });
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

// ---- AI meal estimate ----
async function estimate(root) {
  const ta = root.querySelector("#nu-meal"), btn = root.querySelector("#nu-est");
  const text = ta.value.trim();
  if (text.length < 3) return toast("Describe what you ate first");
  btn.disabled = true; btn.textContent = "Estimating…";
  try {
    const m = await estimateMeal(text);
    if (!m.items.length) throw new Error("Couldn't break that meal down");
    mealSheet(m, () => { ta.value = ""; });
  } catch (err) {
    toast(err.message || "Estimate failed");
  } finally {
    btn.disabled = false; btn.textContent = "Estimate macros";
  }
}

function mealSheet(base, onAdd) {
  let k = 1;
  const draw = (el) => {
    const m = scaleMeal(base, k);
    el.querySelector("#ms-body").innerHTML = `
      <div class="rows">${m.items.map((it) => `<div class="row"><span>${esc(it.food)}<br><span class="mut" style="font-size:12px">${esc(it.amount)}</span></span><span class="r" style="text-align:right">${it.kcal} kcal<br><span class="mut" style="font-size:12px">P${it.protein} C${it.carbs} F${it.fat}</span></span></div>`).join("")}</div>
      <div class="row" style="font-weight:600;margin-top:6px"><span>Total</span><span class="r">${m.kcal} kcal · P${m.protein} C${m.carbs} F${m.fat}</span></div>`;
    return m;
  };
  const el = sheet(`<h2>${esc(base.name)}</h2>
    ${base.assumptions ? `<p class="mut" style="font-size:13px;margin:0 0 6px">${esc(base.assumptions)}</p>` : ""}
    <div class="mut" style="font-size:12px">Confidence: ${esc(base.confidence)}</div>
    <div id="ms-body"></div>
    <div class="label">How much did you have?</div>
    <div class="seg" data-seg="portion">${[0.5, 1, 1.5, 2].map((x) => `<button type="button" data-v="${x}" aria-pressed="${x === 1}">${x}×</button>`).join("")}</div>
    <label class="groc-item" style="border:0"><input type="checkbox" id="ms-save"/><span>Save to my foods</span></label>
    <button class="primary" id="ms-add">Add to ${esc(dayWord())}</button>
    <button class="link" id="ms-cancel">Cancel</button>`);
  draw(el);
  el.querySelectorAll("[data-seg=portion] button").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll("[data-seg=portion] button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    k = Number(b.dataset.v); draw(el);
  }));
  el.querySelector("#ms-add").addEventListener("click", () => {
    const m = scaleMeal(base, k);
    addMeal(m, logDate);
    if (el.querySelector("#ms-save").checked) saveFood(base);
    closeSheet(); onAdd?.();
    toast(`Added ${m.kcal} kcal`);
  });
  el.querySelector("#ms-cancel").addEventListener("click", closeSheet);
}

// ---- Grocery list ----
const weekKey = () => { const d = new Date(today() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return `il4:grocery:${d.toISOString().slice(0, 10)}`; };
const loadChecks = () => { try { return new Set(JSON.parse(localStorage.getItem(weekKey()) || "[]")); } catch { return new Set(); } };
const saveChecks = (set) => { try { localStorage.setItem(weekKey(), JSON.stringify([...set])); } catch { /* ignore */ } };

function grocerySheet(target) {
  const plan = groceryPlan(target);
  const checks = loadChecks();
  const byCat = (list, fn) => Object.entries(CATEGORIES).map(([c, label]) => { const xs = list.filter((x) => x.cat === c); return xs.length ? `<div class="label">${esc(label)}</div>${xs.map(fn).join("")}` : ""; }).join("");
  const weekHtml = byCat(plan.week, (x) => `<label class="groc-item"><input type="checkbox" data-g="${esc(x.id)}" ${checks.has(x.id) ? "checked" : ""}/><span>${esc(x.name)}</span><span class="mut">${x.amount != null ? `${x.amount}${/^\d/.test(x.unit) ? " ×" : ""} ${esc(x.unit)}` : `${x.servings} servings`}</span></label>`);
  const meals = [...new Set(plan.day.map((x) => x.meal))];
  const dayHtml = meals.map((m) => `<div class="label">${esc(m)}</div>${plan.day.filter((x) => x.meal === m).map((x) => `<div class="row"><span>${esc(x.name)}</span><span class="r mut">${x.n} × ${esc(x.serving)}</span></div>`).join("")}`).join("")
    + `<div class="row" style="font-weight:600;margin-top:8px"><span>Day total</span><span class="r">${plan.totals.kcal} kcal · P${plan.totals.protein} C${plan.totals.carbs} F${plan.totals.fat}</span></div>
       <div class="mut" style="font-size:12px;margin-top:4px">Target ${target.kcal} kcal · P${target.protein} C${target.carbs} F${target.fat}. Swap anything for something in the same group on the Foods tab.</div>`;
  const foodsHtml = byCat(FOODS, (f) => `<div class="row food-row"><span>${esc(f.name)}<br><span class="mut" style="font-size:12px">${esc(f.serving)} · ${f.kcal} kcal · P${f.p} C${f.c} F${f.f}</span>${f.tip ? `<br><span class="mut" style="font-size:12px">${esc(f.tip)}</span>` : ""}</span></div>`);
  const el = sheet(`<h2>Grocery list</h2>
    <div class="seg" data-seg="gtab"><button type="button" data-v="week" aria-pressed="true">This week</button><button type="button" data-v="day">Sample day</button><button type="button" data-v="foods">Foods</button></div>
    <div data-pane="week">${weekHtml}<div class="label">Snack picks to rotate in</div>${SNACK_SWAPS.map(([id, instead]) => { const f = food(id); return `<label class="groc-item"><input type="checkbox" data-g="${esc(id)}" ${checks.has(id) ? "checked" : ""}/><span>${esc(f.name)}<br><span class="mut" style="font-size:12px">${f.kcal} kcal · P${f.p} · instead of ${esc(instead)}</span></span><span class="mut">optional</span></label>`; }).join("")}<div class="mut" style="font-size:12px;margin-top:10px">Snack picks swap for something in the plan, so the day still adds up. Ticks reset each Monday.</div></div>
    <div data-pane="day" hidden>${dayHtml}</div>
    <div data-pane="foods" hidden>${foodsHtml}</div>
    <button class="link" id="g-close">Close</button>`);
  el.querySelectorAll("[data-seg=gtab] button").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll("[data-seg=gtab] button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    el.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.v; });
  }));
  el.querySelectorAll("[data-g]").forEach((c) => c.addEventListener("change", () => { c.checked ? checks.add(c.dataset.g) : checks.delete(c.dataset.g); saveChecks(checks); }));
  el.querySelector("#g-close").addEventListener("click", closeSheet);
}


// ---- Food log sheets ----
const macroLine = (m) => `${m.kcal} kcal · P${m.protein} C${m.carbs} F${m.fat}`;

// Search saved foods, recent meals and the food list; tap one to set servings.
function searchSheet() {
  const n = state.nutrition;
  const recent = recentMeals(n.intake, { limit: 15 });
  const el = sheet(`<h2>Add food</h2>
    <input id="fs-q" type="search" class="fs-q" placeholder="Search: yogurt, chicken, my shake…" autocomplete="off" />
    <div id="fs-res"></div>
    <button class="link" id="fs-close">Close</button>`);
  const tag = { saved: "My food", recent: "Recent", library: "" };
  const draw = () => {
    const q = el.querySelector("#fs-q").value;
    const res = searchFoods(q, { saved: n.saved ?? [], recent, library: FOODS }).slice(0, 40);
    el.querySelector("#fs-res").innerHTML = res.length
      ? `<div class="rows">${res.map((x, i) => `<button class="list-btn" data-i="${i}"><span>${esc(x.name)}<br><span class="mut" style="font-size:12px">${x.kind === "library" ? `${esc(x.serving)} · ${x.kcal} kcal · P${x.p} C${x.c} F${x.f}` : `${macroLine(x)}${tag[x.kind] ? ` · ${tag[x.kind]}` : ""}`}</span></span><i class="ti ti-plus" aria-hidden="true"></i></button>`).join("")}</div>`
      : `<div class="mut" style="font-size:13px;margin:10px 2px">${q.trim() ? "No match. Use “From a label” or describe it for an AI estimate." : "Your saved foods and recent meals show up here. Type to search the food list."}</div>`;
    el.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => servingsSheet(res[Number(b.dataset.i)])));
  };
  el.querySelector("#fs-q").addEventListener("input", draw);
  el.querySelector("#fs-close").addEventListener("click", closeSheet);
  draw();
}

function servingsSheet(x) {
  let k = 1;
  const make = () => (x.kind === "library" ? foodMeal(x, k) : { ...scaleMeal({ ...x, items: x.items?.length ? x.items : [{ food: x.name, amount: "1 serving", kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat }] }, k), name: x.name, source: x.kind === "saved" ? "saved" : (x.source ?? "food") });
  const el = sheet(`<h2>${esc(x.name)}</h2>
    <div class="mut" style="font-size:13px">${x.kind === "library" ? `Serving: ${esc(x.serving)}` : "Servings are relative to how you saved or last logged it."}</div>
    <div class="stepper" style="margin-top:12px"><span class="lbl">Servings</span><span class="ctl"><button type="button" id="sv-dn" aria-label="Fewer"><i class="ti ti-minus" aria-hidden="true"></i></button><input id="sv-n" inputmode="decimal" value="1" aria-label="Servings"/><button type="button" id="sv-up" aria-label="More"><i class="ti ti-plus" aria-hidden="true"></i></button></span></div>
    <div class="row" style="font-weight:600"><span>Total</span><span class="r" id="sv-tot"></span></div>
    ${x.kind !== "saved" ? `<label class="groc-item" style="border:0"><input type="checkbox" id="sv-save"/><span>Save to my foods</span></label>` : ""}
    <button class="primary" id="sv-add">Add to ${esc(dayWord())}</button>
    <button class="link" id="sv-back">Back</button>`);
  const inp = el.querySelector("#sv-n");
  const draw = () => { el.querySelector("#sv-tot").textContent = macroLine(make()); };
  const set = (v) => { k = Math.max(0.25, Math.min(20, Math.round(v * 4) / 4)); inp.value = k; draw(); };
  el.querySelector("#sv-dn").addEventListener("click", () => set(k - 0.5));
  el.querySelector("#sv-up").addEventListener("click", () => set(k + 0.5));
  inp.addEventListener("input", () => { const v = Number(inp.value); if (v > 0) { k = v; draw(); } });
  el.querySelector("#sv-add").addEventListener("click", () => {
    const m = make();
    addMeal(m, logDate);
    if (el.querySelector("#sv-save")?.checked) saveFood({ ...m, ...(k !== 1 ? { name: `${m.name} (${k}×)` } : {}) });
    closeSheet();
    toast(`Added ${m.kcal} kcal`);
  });
  el.querySelector("#sv-back").addEventListener("click", searchSheet);
  draw();
}

// Packaged food: copy the label (per serving), say how many servings.
function labelSheet() {
  const el = sheet(`<h2>From a label</h2>
    <div class="nu-grid"><label style="grid-column:1/-1">Food<input id="lb-name" placeholder="e.g. Quest bar, cookies & cream" /></label></div>
    <div class="note-label">Per serving, as printed</div>
    <div class="nu-grid">
      <label>Calories<input id="lb-k" inputmode="numeric" placeholder="auto" /></label>
      <label>Protein g<input id="lb-p" inputmode="decimal" /></label>
      <label>Carbs g<input id="lb-c" inputmode="decimal" /></label>
      <label>Fat g<input id="lb-f" inputmode="decimal" /></label>
      <label>Servings eaten<input id="lb-n" inputmode="decimal" value="1" /></label>
    </div>
    <label class="groc-item" style="border:0"><input type="checkbox" id="lb-save" checked/><span>Save to my foods</span></label>
    <button class="primary" id="lb-add">Add to ${esc(dayWord())}</button>
    <button class="link" id="lb-cancel">Cancel</button>`);
  const v = (id) => el.querySelector(id).value.trim();
  el.querySelector("#lb-add").addEventListener("click", () => {
    const servings = Number(v("#lb-n")) || 1;
    const m = labelMeal({ name: v("#lb-name"), kcal: v("#lb-k"), protein: v("#lb-p"), carbs: v("#lb-c"), fat: v("#lb-f"), servings });
    if (!m) return toast("Add a name and some macros");
    addMeal(m, logDate);
    if (el.querySelector("#lb-save").checked) saveFood(labelMeal({ name: v("#lb-name"), kcal: v("#lb-k"), protein: v("#lb-p"), carbs: v("#lb-c"), fat: v("#lb-f") }));
    closeSheet();
    toast(`Added ${m.kcal} kcal`);
  });
  el.querySelector("#lb-cancel").addEventListener("click", closeSheet);
}

// A logged meal: change the portion, save it, log it again, or delete it.
function loggedSheet(id) {
  const date = logDate;
  const m = state.nutrition.intake.find((x) => x.date === date)?.meals?.find((x) => x.id === id);
  if (!m) return;
  const cur = m.portion ?? 1;
  const saved = isSavedFood(m.name);
  const opts = [0.5, 0.75, 1, 1.5, 2];
  const el = sheet(`<h2>${esc(m.name)}</h2>
    <div class="mut" style="font-size:13px">${macroLine(m)}${m.text ? `<br>“${esc(m.text)}”` : ""}</div>
    ${m.items?.length > 1 ? `<div class="rows" style="margin-top:8px">${m.items.map((it) => `<div class="row"><span>${esc(it.food)}<br><span class="mut" style="font-size:12px">${esc(it.amount)}</span></span><span class="r mut" style="font-size:12px;text-align:right">${it.kcal} kcal<br>P${it.protein} C${it.carbs} F${it.fat}</span></div>`).join("")}</div>` : ""}
    <div class="label">Portion</div>
    <div class="seg" data-seg="lp">${opts.map((o) => `<button type="button" data-v="${o}" aria-pressed="${o === cur}">${o}×</button>`).join("")}</div>
    <div class="rows">
      <button class="list-btn" id="lm-save"><span>${saved ? "Remove from my foods" : "Save to my foods"}</span><i class="ti ti-${saved ? "star-off" : "star"}" aria-hidden="true"></i></button>
      <button class="list-btn" id="lm-again"><span>Log again ${date === today() ? "" : "today"}</span><i class="ti ti-copy" aria-hidden="true"></i></button>
      <button class="list-btn" id="lm-del" style="color:var(--red)"><span>Delete</span><i class="ti ti-trash" aria-hidden="true"></i></button>
    </div>
    <button class="link" id="lm-close">Done</button>`);
  el.querySelectorAll("[data-seg=lp] button").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll("[data-seg=lp] button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const next = updateMealPortion(id, Number(b.dataset.v), date);
    if (next) el.querySelector(".mut").innerHTML = `${macroLine(next)}${m.text ? `<br>“${esc(m.text)}”` : ""}`;
  }));
  el.querySelector("#lm-save").addEventListener("click", () => {
    if (saved) { const f = state.nutrition.saved.find((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase()); if (f) unsaveFood(f.id); toast("Removed from my foods"); }
    else { saveFood(m); toast("Saved to my foods"); }
    closeSheet();
  });
  el.querySelector("#lm-again").addEventListener("click", () => {
    const cur2 = state.nutrition.intake.find((x) => x.date === date)?.meals?.find((x) => x.id === id) ?? m;
    addMeal({ ...cur2, source: cur2.source }, today());
    closeSheet(); toast(`Logged again: ${cur2.kcal} kcal`);
  });
  el.querySelector("#lm-del").addEventListener("click", () => {
    const keep = state.nutrition.intake.find((x) => x.date === date)?.meals?.find((x) => x.id === id) ?? m;
    removeMeal(id, date); closeSheet();
    toast("Meal deleted", { label: "Undo", fn: () => addMeal(keep, date) });
  });
  el.querySelector("#lm-close").addEventListener("click", closeSheet);
}
