// Nutrition coach (NUTRITION.md). Pure.
//
// Daily calorie and macro targets that adapt to what your scale does:
//   1. Start: resting burn (Mifflin-St Jeor) × activity = estimated expenditure.
//   2. Every day: a smoothed trend weight (raw weigh-ins bounce 1–3 lb on water).
//   3. Weekly check-in: expenditure is re-estimated from intake and the trend
//      (eating X while losing Y lb/week means you burn X + Y × 500 a day), then
//      the target is set to hit your goal rate, moving at most 250 kcal at a time.
//      With no food logged, it assumes you ate your target (like a coach would)
//      and trusts the result a little less.
//   4. Macros: protein from bodyweight (higher in a cut), fat ~25% of calories
//      with a floor, carbs the rest.
// Evidence: Helms 2014 (cut 0.5–1%/wk, protein 2.3–3.1 g/kg lean mass, fat
// 15–30%); Iraki 2019 (gain 0.25–0.5%/wk, protein 1.6–2.2 g/kg, fat 0.5–1.5
// g/kg); MacroFactor's intake-minus-trend expenditure method.

export const KCAL_PER_LB = 3500;            // ≈ 500 kcal/day per lb/week
export const MAX_STEP = 250;                // kcal change per check-in
export const CHECKIN_DAYS = 7;
export const WINDOW_DAYS = 21;              // weigh-ins used for the rate
export const ACTIVITY = Object.freeze({
  low: { factor: 1.4, label: "Desk job, under 5k steps" },
  moderate: { factor: 1.55, label: "Some walking, 5–8k steps" },
  high: { factor: 1.7, label: "On your feet, 8–12k steps" },
  very: { factor: 1.85, label: "Physical job or 12k+ steps" },
});
export const GOALS = Object.freeze({
  cut: { label: "Lose fat", rates: [0.25, 0.5, 0.75, 1], default: 0.5, protein: 1.0 },
  recomp: { label: "Recomp (lean out slowly)", rates: [0.25], default: 0.25, protein: 1.0 },
  maintain: { label: "Maintain", rates: [0], default: 0, protein: 0.9 },
  gain: { label: "Build (lean gain)", rates: [0.1, 0.25, 0.5], default: 0.25, protein: 0.8 },
});

const DAY = 86400000;
const toT = (d) => Date.parse(d + "T00:00:00Z");
const addDays = (d, n) => new Date(toT(d) + n * DAY).toISOString().slice(0, 10);
const days = (a, b) => Math.round((toT(b) - toT(a)) / DAY);
const r0 = (x) => Math.round(x);
const r1 = (x) => Math.round(x * 10) / 10;

// Resting burn, kcal/day. Mifflin-St Jeor.
export function bmr({ sex = "male", age, heightIn, weightLb }) {
  const kg = weightLb / 2.2046, cm = heightIn * 2.54;
  return 10 * kg + 6.25 * cm - 5 * age + (sex === "female" ? -161 : 5);
}

export function startingExpenditure(profile, weightLb) {
  return bmr({ ...profile, weightLb }) * (ACTIVITY[profile.activity]?.factor ?? 1.55);
}

// One weigh-in per day (the last one wins), oldest first.
export function cleanWeights(entries = []) {
  const by = new Map();
  for (const e of entries) if (e?.date && Number(e.weight) > 50 && Number(e.weight) < 700) by.set(e.date, Number(e.weight));
  return [...by].sort((a, b) => a[0].localeCompare(b[0])).map(([date, weight]) => ({ date, weight }));
}

// Smoothed trend (exponential moving average, 10% per day; gaps carry the
// trend forward). Returns [{ date, weight|null, trend }] for every day.
export function trend(weights, { alpha = 0.1, until = null } = {}) {
  const w = cleanWeights(weights);
  if (!w.length) return [];
  const by = new Map(w.map((x) => [x.date, x.weight]));
  const end = until && until > w[w.length - 1].date ? until : w[w.length - 1].date;
  const out = [];
  let t = w[0].weight;
  for (let d = w[0].date; d <= end; d = addDays(d, 1)) {
    const x = by.get(d);
    if (x != null) t += alpha * (x - t);
    out.push({ date: d, weight: x ?? null, trend: r1(t) });
  }
  return out;
}

// Weight change in lb/week from the weigh-ins in the window (least squares
// on the raw weigh-ins: it doesn't lag like the trend does).
export function rate(weights, date, windowDays = WINDOW_DAYS) {
  const w = cleanWeights(weights).filter((x) => x.date <= date && days(x.date, date) < windowDays);
  if (w.length < 4 || days(w[0].date, w[w.length - 1].date) < 7) return null;
  const xs = w.map((x) => days(w[0].date, x.date)), ys = w.map((x) => x.weight);
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  return { lbPerWeek: slope * 7, points: n, spanDays: days(w[0].date, w[w.length - 1].date) };
}

export const goalRateLb = (goal, weightLb) => {
  const g = GOALS[goal?.type] ?? GOALS.maintain;
  const pct = goal?.ratePct ?? g.default;
  const sign = goal?.type === "gain" ? 1 : goal?.type === "cut" || goal?.type === "recomp" ? -1 : 0;
  return sign * (pct / 100) * weightLb;
};

// Protein, fat and carbs for a calorie target.
export function macros(kcal, weightLb, goal = {}, { proteinPerLb = null } = {}) {
  const g = GOALS[goal.type] ?? GOALS.maintain;
  const protein = r0((proteinPerLb ?? g.protein) * weightLb);
  const fatFloor = 0.3 * weightLb;
  let fat = Math.max(fatFloor, (0.25 * kcal) / 9);
  let carbs = (kcal - protein * 4 - fat * 9) / 4;
  if (carbs < 0.5 * weightLb) { // keep some carbs for training: take it from fat down to the floor
    fat = Math.max(fatFloor, fat - (0.5 * weightLb - carbs) * 4 / 9);
    carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  }
  return { kcal: r0(kcal), protein, fat: r0(fat), carbs: r0(carbs) };
}

// Average logged intake over the window, if enough days were logged.
export function loggedIntake(intake = [], date, windowDays = 14) {
  const xs = intake.filter((x) => x.date <= date && days(x.date, date) < windowDays && Number(x.kcal) > 300);
  if (xs.length < Math.ceil(windowDays * 0.5)) return null;
  return { kcal: xs.reduce((a, x) => a + Number(x.kcal), 0) / xs.length, days: xs.length };
}

// The target in force on a date (from check-in history).
export const targetOn = (checkins, date) => [...checkins].filter((c) => c.date <= date).sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null;

// Run a check-in: re-estimate expenditure, set the new target.
// Returns the new check-in record (not stored).
export function checkIn({ profile, goal, weights, intake = [], checkins = [], date, proteinPerLb = null, goalChange = false }) {
  const tr = trend(weights, { until: date });
  const weight = tr.length ? tr[tr.length - 1].trend : profile.weightLb;
  if (!weight) return null;
  const prev = targetOn(checkins, addDays(date, -1));
  const floor = r0(Math.max(bmr({ ...profile, weightLb: weight }), profile.sex === "female" ? 1200 : 1500));
  const start = startingExpenditure(profile, weight);
  let tdee = prev?.tdee ?? start;
  let why = prev ? "" : "Starting estimate from your height, weight, age and activity.";
  let source = prev ? "unchanged" : "estimate";
  const rt = rate(weights, date);
  if (prev && rt && !goalChange) {
    const logged = loggedIntake(intake, date);
    // Intake: what you logged, else the targets you were given (assumed eaten).
    const eaten = logged?.kcal ?? avgTarget(checkins, addDays(date, -WINDOW_DAYS + 1), date);
    if (eaten) {
      const measured = eaten - (rt.lbPerWeek * KCAL_PER_LB) / 7;
      const sane = Math.max(floor * 1.05, Math.min(start * 1.6, measured));
      const trust = logged ? 0.5 : 0.3;
      tdee = tdee + trust * (sane - tdee);
      source = logged ? "logged" : "assumed";
      why = `${rt.lbPerWeek >= 0 ? "Gaining" : "Losing"} ${Math.abs(r1(rt.lbPerWeek))} lb/week while ${logged ? `eating about ${r0(eaten)} (your logs)` : `eating about ${r0(eaten)} (your targets, assumed)`} means you burn about ${r0(measured)} a day.`;
    }
  } else if (goalChange) {
    why = "New goal: same expenditure estimate, new target.";
  } else if (prev && !rt) {
    why = "Not enough weigh-ins in the last 3 weeks to see a trend, so the target holds. Weigh in most mornings.";
  }
  const goalLb = goalRateLb(goal, weight);
  let kcal = tdee + (goalLb * KCAL_PER_LB) / 7;
  if (prev && !goalChange) kcal = Math.max(prev.kcal - MAX_STEP, Math.min(prev.kcal + MAX_STEP, kcal));
  kcal = Math.max(floor, kcal);
  kcal = Math.round(kcal / 10) * 10;
  const m = macros(kcal, weight, goal, { proteinPerLb });
  const change = prev ? kcal - prev.kcal : null;
  const clampedFloor = kcal === floor && tdee + (goalLb * KCAL_PER_LB) / 7 < floor;
  return {
    date, kcal, protein: m.protein, fat: m.fat, carbs: m.carbs, tdee: r0(tdee), weight: r1(weight),
    rate: rt ? r1(rt.lbPerWeek * 100) / 100 : null, goalRate: r1(goalLb * 100) / 100, source, change,
    why: [why, change != null && change !== 0 ? `Target ${change > 0 ? "up" : "down"} ${Math.abs(change)} kcal to aim for ${fmtRate(goalLb)}.` : change === 0 ? `Target holds for ${fmtRate(goalLb)}.` : `Aiming for ${fmtRate(goalLb)}.`, clampedFloor ? "Held at your floor (resting burn): a slower rate is safer than eating less." : ""].filter(Boolean).join(" "),
  };
}

const fmtRate = (lb) => (Math.abs(lb) < 0.05 ? "a stable weight" : `${lb < 0 ? "−" : "+"}${Math.abs(r1(lb))} lb/week`);

function avgTarget(checkins, from, to) {
  let sum = 0, n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const t = targetOn(checkins, d); if (t) { sum += t.kcal; n++; } }
  return n ? sum / n : null;
}

// Is a check-in due? First one as soon as there's a profile; then weekly.
export function checkInDue(checkins, date) {
  const last = [...checkins].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return !last || days(last.date, date) >= CHECKIN_DAYS;
}

export function nextCheckIn(checkins) {
  const last = [...checkins].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return last ? addDays(last.date, CHECKIN_DAYS) : null;
}

// What the screen and the coach show.
export function summary({ profile, goal, weights = [], intake = [], checkins = [], date }) {
  const current = targetOn(checkins, date);
  const tr = trend(weights, { until: date });
  const rt = rate(weights, date);
  const todayIn = intake.find((x) => x.date === date) ?? null;
  return {
    target: current, trendWeight: tr.length ? tr[tr.length - 1].trend : null, rate: rt ? r1(rt.lbPerWeek * 100) / 100 : null,
    goalRate: tr.length ? r1(goalRateLb(goal, tr[tr.length - 1].trend) * 100) / 100 : null, today: todayIn,
    nextCheckIn: nextCheckIn(checkins), weighIns14: cleanWeights(weights).filter((w) => w.date <= date && days(w.date, date) < 14).length,
    goal, profile,
  };
}
