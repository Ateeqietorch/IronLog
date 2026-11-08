// Food log: library foods by serving, label entry, saved foods, recents,
// search, portion edits, and logging to a past day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { food, foodMeal, labelMeal, recentMeals, searchFoods } from "../engine/foods.js";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const calls = [];
globalThis.fetch = async (url, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : Object.fromEntries(new URL(url).searchParams);
  calls.push(body);
  return { json: async () => ({ ok: true, records: [], rows: [] }) };
};
const store = await import("../ui/store.js");
await store.boot({ fixture: { rows: [], program: { exercises: { A: [{ name: "Leg Extension", sets: 3, repMin: 8, repMax: 12, weight: "" }] }, dayLabels: { A: "A" } }, weights: [] } });

test("library food scales by servings", () => {
  const m = foodMeal(food("greek-yogurt"), 1.5);
  assert.equal(m.kcal, 195);
  assert.equal(m.protein, 35);
  assert.equal(m.items[0].amount, "1.5 × 1 cup");
  assert.equal(m.source, "food");
});

test("label entry needs a name and calories; multiplies by servings", () => {
  assert.equal(labelMeal({ name: "", kcal: 200 }), null);
  assert.equal(labelMeal({ name: "Bar", kcal: "" }), null);
  const m = labelMeal({ name: "Quest bar", kcal: 190, protein: 21, carbs: 22, fat: 8, servings: 2 });
  assert.deepEqual([m.kcal, m.protein, m.carbs, m.fat], [380, 42, 44, 16]);
});

test("search: saved and recent first, library by every word; empty shows mine only", () => {
  const saved = [{ name: "Morning shake", kcal: 300, protein: 40, carbs: 20, fat: 5 }];
  const recent = [{ name: "Chicken biryani", kcal: 700, protein: 35, carbs: 80, fat: 25 }, { name: "Morning shake", kcal: 300, protein: 40, carbs: 20, fat: 5 }];
  const empty = searchFoods("", { saved, recent });
  assert.deepEqual(empty.map((x) => [x.kind, x.name]), [["saved", "Morning shake"], ["recent", "Chicken biryani"]]);
  const chick = searchFoods("chicken", { saved, recent });
  assert.equal(chick[0].kind, "recent");
  assert.ok(chick.some((x) => x.kind === "library" && x.name === "Chicken breast"));
  assert.ok(searchFoods("greek yogurt").some((x) => x.id === "greek-yogurt"));
  assert.equal(searchFoods("salsa hot").length, 0); // free-flavor row isn't loggable
});

test("recent meals: newest first, distinct by name", () => {
  const intake = [
    { date: "2026-11-01", meals: [{ name: "Oats", kcal: 300 }, { name: "Dal", kcal: 400 }] },
    { date: "2026-11-03", meals: [{ name: "oats", kcal: 310 }] },
  ];
  const r = recentMeals(intake);
  assert.deepEqual(r.map((x) => [x.name, x.lastDate]), [["oats", "2026-11-03"], ["Dal", "2026-11-01"]]);
});

test("log to a past day, change portion, delete — day totals follow", () => {
  const day = "2026-11-02";
  const m = store.addMeal(foodMeal(food("chicken-breast"), 2), day);
  let d = store.state.nutrition.intake.find((x) => x.date === day);
  assert.equal(d.kcal, 272);
  const half = store.updateMealPortion(m.id, 0.5, day);
  assert.equal(half.kcal, 136);
  d = store.state.nutrition.intake.find((x) => x.date === day);
  assert.equal(d.kcal, 136);
  assert.equal(d.protein, 25);
  store.updateMealPortion(m.id, 1, day); // relative to the original logging
  assert.equal(store.state.nutrition.intake.find((x) => x.date === day).kcal, 272);
  store.removeMeal(m.id, day);
  assert.equal(store.state.nutrition.intake.find((x) => x.date === day).kcal, 0);
});

test("my foods: save replaces same name, unsave removes, backed up to the sheet", async () => {
  store.saveFood({ name: "Morning shake", kcal: 300, protein: 40, carbs: 20, fat: 5 });
  store.saveFood({ name: "morning shake ", kcal: 320, protein: 42, carbs: 22, fat: 5 });
  assert.equal(store.state.nutrition.saved.length, 1);
  assert.equal(store.state.nutrition.saved[0].kcal, 320);
  assert.ok(store.isSavedFood("Morning Shake"));
  await new Promise((r) => setTimeout(r, 0));
  const up = calls.filter((c) => JSON.stringify(c).includes("\"saved\""));
  assert.ok(up.length, "saved list sent to the Nutrition sheet");
  store.unsaveFood(store.state.nutrition.saved[0].id);
  assert.equal(store.state.nutrition.saved.length, 0);
});

test("exact macros: calories from 4/4/9 unless given; name optional", async () => {
  const { quickMeal } = await import("../engine/foods.js");
  const m = quickMeal({ protein: 60, carbs: 25, fat: 7 });
  assert.deepEqual([m.name, m.kcal, m.protein, m.carbs, m.fat], ["Quick add", 403, 60, 25, 7]);
  assert.equal(quickMeal({ protein: 60, carbs: 25, fat: 7, kcal: 410, name: "Lunch" }).kcal, 410);
  assert.equal(quickMeal({}), null);
  assert.equal(labelMeal({ name: "Bar", protein: 20, carbs: 20, fat: 10 }).kcal, 250);
});
