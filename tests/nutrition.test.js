import { test } from "node:test";
import assert from "node:assert/strict";
import { bmr, trend, rate, macros, checkIn, checkInDue, goalRateLb, summary } from "../engine/nutrition.js";

const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const profile = { sex: "male", age: 29, heightIn: 69, activity: "moderate" };

test("resting burn: Mifflin-St Jeor", () => {
  // 151 lb, 5'9", 29, male ≈ 1,640
  assert.ok(Math.abs(bmr({ ...profile, weightLb: 151 }) - 1640) < 5);
});

test("trend smooths water swings; rate reads the real slope", () => {
  const w = [];
  for (let i = 0; i < 21; i++) w.push({ date: addDays("2026-10-01", i), weight: 160 - i * (0.5 / 7) + (i % 2 ? 1.5 : -1.5) });
  const t = trend(w);
  const swings = t.slice(7).map((x, i, a) => (i ? Math.abs(x.trend - a[i - 1].trend) : 0));
  assert.ok(Math.max(...swings) < 0.5);
  const r = rate(w, "2026-10-21");
  assert.ok(Math.abs(r.lbPerWeek + 0.5) < 0.15, String(r.lbPerWeek));
  assert.equal(rate(w.slice(0, 3), "2026-10-03"), null); // not enough data
});

test("macros: protein by goal, fat ~25% with a floor, carbs the rest", () => {
  const m = macros(2200, 150, { type: "cut" });
  assert.equal(m.protein, 150);
  assert.ok(Math.abs(m.fat * 9 / 2200 - 0.25) < 0.02);
  assert.ok(Math.abs(m.protein * 4 + m.fat * 9 + m.carbs * 4 - 2200) < 15);
  const low = macros(1500, 150, { type: "cut" });
  assert.ok(low.fat >= 45); // 0.3 g/lb floor
  assert.equal(macros(2600, 150, { type: "gain" }).protein, 120);
});

test("first check-in: starting estimate with the goal deficit", () => {
  const c = checkIn({ profile, goal: { type: "cut", ratePct: 0.5 }, weights: [{ date: "2026-11-01", weight: 151 }], checkins: [], date: "2026-11-01" });
  // ~1660 × 1.55 ≈ 2575 maintenance, −0.75 lb/wk ≈ −375
  assert.ok(c.kcal > 2100 && c.kcal < 2300, String(c.kcal));
  assert.equal(c.source, "estimate");
  assert.equal(checkInDue([c], "2026-11-05"), false);
  assert.equal(checkInDue([c], "2026-11-08"), true);
});

// A lifter whose real expenditure is 2,300 (lower than the formula guesses)
// eats exactly the targets. The coach should find it and get the cut on rate.
test("adapts: losing too slowly → target comes down until the goal rate is hit", () => {
  const goal = { type: "cut", ratePct: 0.5 };
  const trueTdee = 2300;
  let weight = 160, date = "2026-09-01";
  const weights = [], checkins = [];
  for (let day = 0; day < 84; day++) {
    weights.push({ date, weight: weight + (day % 3 === 0 ? 1 : day % 3 === 1 ? -0.8 : 0) });
    if (checkInDue(checkins, date)) checkins.push(checkIn({ profile, goal, weights, checkins, date }));
    const eat = checkins[checkins.length - 1].kcal;
    weight += (eat - trueTdee) / 3500;
    date = addDays(date, 1);
  }
  const last = checkins[checkins.length - 1];
  const target = goalRateLb(goal, last.weight);
  assert.ok(Math.abs(last.tdee - trueTdee) < 120, `tdee ${last.tdee}`);
  assert.ok(Math.abs(last.kcal - (trueTdee + target * 500)) < 150, `kcal ${last.kcal}`);
  assert.ok(checkins.every((c, i) => i === 0 || Math.abs(c.change) <= 250));
  assert.ok(checkins.some((c) => c.change < 0));
});

test("logged intake beats the assumption, and the floor holds", () => {
  const goal = { type: "cut", ratePct: 1 };
  const weights = [], intake = [];
  for (let i = 0; i < 21; i++) { weights.push({ date: addDays("2026-10-01", i), weight: 151 }); intake.push({ date: addDays("2026-10-01", i), kcal: 1700 }); }
  const prev = [{ date: "2026-10-14", kcal: 1700, tdee: 1800 }];
  const c = checkIn({ profile, goal, weights, intake, checkins: prev, date: "2026-10-21" });
  assert.equal(c.source, "logged");
  assert.ok(c.kcal >= 1640, String(c.kcal)); // never under resting burn
});

test("gain goal: target above expenditure; maintain: on it", () => {
  const w = [{ date: "2026-11-01", weight: 151 }];
  const g = checkIn({ profile, goal: { type: "gain", ratePct: 0.25 }, weights: w, checkins: [], date: "2026-11-01" });
  const m = checkIn({ profile, goal: { type: "maintain" }, weights: w, checkins: [], date: "2026-11-01" });
  assert.ok(g.kcal > m.kcal);
  assert.ok(Math.abs(m.kcal - m.tdee) <= 10);
  const s = summary({ profile, goal: { type: "maintain" }, weights: w, checkins: [m], date: "2026-11-02" });
  assert.equal(s.target.kcal, m.kcal);
});
