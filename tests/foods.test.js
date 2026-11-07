import { test } from "node:test";
import assert from "node:assert/strict";
import { FOODS, CATEGORIES, groceryPlan, sumItems } from "../engine/foods.js";
import { normalizeMeal, scaleMeal, estimateMeal } from "../ui/meals.js";

test("every food is complete and its calories match its macros", () => {
  const ids = new Set();
  for (const f of FOODS) {
    assert.ok(!ids.has(f.id), f.id); ids.add(f.id);
    assert.ok(CATEGORIES[f.cat], f.id);
    assert.ok(f.serving && f.kcal >= 0, f.id);
    const fromMacros = f.p * 4 + f.c * 4 + f.f * 9;
    if (f.kcal > 40) assert.ok(Math.abs(fromMacros - f.kcal) / f.kcal < 0.2, `${f.id}: ${fromMacros} vs ${f.kcal}`);
  }
  assert.ok(FOODS.find((f) => f.id === "greek-yogurt"));
});

test("grocery plan lands near the targets across goals", () => {
  for (const t of [{ kcal: 2170, protein: 151, carbs: 256, fat: 60 }, { kcal: 2730, protein: 121, carbs: 391, fat: 76 }, { kcal: 3200, protein: 150, carbs: 450, fat: 90 }, { kcal: 1700, protein: 150, carbs: 150, fat: 50 }]) {
    const g = groceryPlan(t);
    assert.ok(Math.abs(g.totals.kcal - t.kcal) / t.kcal < 0.1, `${t.kcal} → ${g.totals.kcal}`);
    assert.ok(g.totals.protein >= t.protein * 0.95, `protein ${g.totals.protein} for ${t.protein}`);
    assert.ok(g.week.length > 10);
    for (const x of g.week) assert.ok(x.amount == null || x.amount > 0, x.id);
  }
});

test("meal estimates are cleaned, summed and scaled", async () => {
  const m = normalizeMeal({ name: "Biryani", confidence: "weird", items: [{ food: "chicken biryani", amount: "2 cups", kcal: 640.4, protein: "32", carbs: 70, fat: 24 }, { food: "", kcal: 9 }, { food: "raita", amount: "1/2 cup", kcal: -5, protein: 4, carbs: 6, fat: 3 }] });
  assert.equal(m.items.length, 2);
  assert.equal(m.kcal, 640);
  assert.equal(m.protein, 36);
  assert.equal(m.confidence, "medium");
  const h = scaleMeal(m, 0.5);
  assert.equal(h.kcal, 320);
  assert.deepEqual(sumItems([{ kcal: 1, protein: 2 }]), { kcal: 1, protein: 2, carbs: 0, fat: 0 });
  // the backend relay is called with an IronLog system prompt and one tool
  let sent;
  const r = await estimateMeal("bowl of dal", { postImpl: async (a, b) => { sent = { a, b }; return { content: [{ type: "tool_use", name: "meal_estimate", input: { name: "Dal", confidence: "low", items: [{ food: "dal", amount: "1 cup", kcal: 230, protein: 12, carbs: 30, fat: 7 }] } }] }; } });
  assert.equal(sent.a, "coach_step");
  assert.match(JSON.stringify(sent.b.system), /IronLog/);
  assert.equal(r.kcal, 230);
  await assert.rejects(estimateMeal("x", { postImpl: async () => ({ content: [{ type: "text", text: "What did you eat?" }] }) }), /What did you eat/);
});
