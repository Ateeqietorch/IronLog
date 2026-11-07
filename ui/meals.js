// "Tell the AI what you ate": one model call turns a description (homemade
// biryani, a plate at a friend's) into itemized calories and macros you can
// add to today. Uses the same backend relay as the coach.
import { post } from "../data/sheets.js";
import { sumItems } from "../engine/foods.js";

const SYSTEM = [
  "You estimate nutrition for IronLog, a training app. The lifter describes a meal in their own words, often homemade or restaurant food without a label.",
  "Break it into components with realistic portions and estimate calories, protein, carbs and fat for each from typical recipes and USDA-style values. Count cooking oil, butter, sauces and drinks: they're the usual misses. Use any amounts they give; otherwise assume a normal adult portion and say what you assumed.",
  "Home-style South Asian, Middle Eastern, Latin and other cuisines: use typical home recipes (e.g. biryani with oil/ghee), not restaurant extremes.",
  "Always answer by calling meal_estimate exactly once. Round to whole numbers. confidence: high when amounts were given, medium for normal assumed portions, low when the description is vague.",
].join("\n");

const TOOL = {
  name: "meal_estimate",
  description: "Report the meal estimate.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short meal name, e.g. 'Chicken biryani + raita'." },
      items: { type: "array", items: { type: "object", properties: { food: { type: "string" }, amount: { type: "string" }, kcal: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" } }, required: ["food", "amount", "kcal", "protein", "carbs", "fat"] } },
      assumptions: { type: "string", description: "One short sentence on portions assumed." },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["name", "items", "confidence"],
  },
};

export async function estimateMeal(text, { postImpl = post } = {}) {
  const res = await postImpl("coach_step", {
    system: [{ type: "text", text: SYSTEM }], tools: [TOOL], max_tokens: 1200,
    messages: [{ role: "user", content: String(text).slice(0, 1500) }],
  });
  const use = (res.content ?? []).find((b) => b.type === "tool_use" && b.name === "meal_estimate");
  if (!use) {
    const said = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    throw new Error(said || "No estimate came back");
  }
  return normalizeMeal(use.input, text);
}

export function normalizeMeal(m, text = "") {
  const items = (m.items ?? []).map((it) => ({
    food: String(it.food ?? "").slice(0, 80), amount: String(it.amount ?? "").slice(0, 40),
    kcal: Math.max(0, Math.round(Number(it.kcal) || 0)), protein: Math.max(0, Math.round(Number(it.protein) || 0)),
    carbs: Math.max(0, Math.round(Number(it.carbs) || 0)), fat: Math.max(0, Math.round(Number(it.fat) || 0)),
  })).filter((it) => it.food);
  return { name: String(m.name ?? "Meal").slice(0, 80), items, ...sumItems(items), assumptions: m.assumptions ? String(m.assumptions).slice(0, 240) : "", confidence: ["high", "medium", "low"].includes(m.confidence) ? m.confidence : "medium", text: String(text).slice(0, 300), source: "ai" };
}

// Portion scaling for the "I had half / I had more" buttons.
export function scaleMeal(m, k) {
  const items = m.items.map((it) => ({ ...it, kcal: Math.round(it.kcal * k), protein: Math.round(it.protein * k), carbs: Math.round(it.carbs * k), fat: Math.round(it.fat * k) }));
  return { ...m, items, ...sumItems(items), portion: k };
}
