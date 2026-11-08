// Macro-friendly foods and a weekly grocery plan scaled to your targets
// (NUTRITION.md §Groceries). Pure. Values are typical label/USDA numbers per
// serving; meats are raw weight (what you buy).
//
// buy: how a week's servings turn into a shopping amount.
//   { per, unit, as, div }  →  servings × per [unit] ÷ div  [as]
export const FOODS = Object.freeze([
  // Protein
  { id: "greek-yogurt", name: "Nonfat plain Greek yogurt", cat: "protein", serving: "1 cup", kcal: 130, p: 23, c: 9, f: 0, buy: { per: 1, unit: "cup", as: "32-oz tubs", div: 4 }, tip: "Add berries and a little honey or sweetener; mix in whey for a 45 g protein bowl." },
  { id: "chicken-breast", name: "Chicken breast", cat: "protein", serving: "4 oz raw", kcal: 136, p: 25, c: 0, f: 3, buy: { per: 4, unit: "oz", as: "lb", div: 16 }, tip: "Batch-cook on Sunday; season half one way, half another." },
  { id: "lean-beef", name: "93% lean ground beef", cat: "protein", serving: "4 oz raw", kcal: 170, p: 23, c: 0, f: 8, buy: { per: 4, unit: "oz", as: "lb", div: 16 }, tip: "Tacos, burger bowls, chili." },
  { id: "salmon", name: "Salmon", cat: "protein", serving: "4 oz raw", kcal: 200, p: 23, c: 0, f: 12, buy: { per: 4, unit: "oz", as: "lb", div: 16 }, tip: "Frozen fillets are cheaper and just as good." },
  { id: "shrimp", name: "Shrimp (frozen, peeled)", cat: "protein", serving: "4 oz raw", kcal: 96, p: 23, c: 1, f: 1, buy: { per: 4, unit: "oz", as: "lb", div: 16 }, tip: "Leanest protein there is; thaws in 10 minutes under cold water." },
  { id: "turkey", name: "93% lean ground turkey", cat: "protein", serving: "4 oz raw", kcal: 170, p: 21, c: 0, f: 9, buy: { per: 4, unit: "oz", as: "lb", div: 16 } },
  { id: "eggs", name: "Eggs", cat: "protein", serving: "1 large", kcal: 72, p: 6, c: 0, f: 5, buy: { per: 1, unit: "eggs", as: "dozen", div: 12 } },
  { id: "egg-whites", name: "Liquid egg whites", cat: "protein", serving: "½ cup", kcal: 63, p: 13, c: 1, f: 0, buy: { per: 0.5, unit: "cup", as: "32-oz cartons", div: 4 }, tip: "Stretch whole eggs: 2 eggs + ½ cup whites is a 25 g protein scramble." },
  { id: "cottage-cheese", name: "Low-fat cottage cheese", cat: "protein", serving: "½ cup", kcal: 81, p: 14, c: 3, f: 1, buy: { per: 0.5, unit: "cup", as: "16-oz tubs", div: 2 } },
  { id: "whey", name: "Whey protein", cat: "protein", serving: "1 scoop", kcal: 120, p: 24, c: 3, f: 2, buy: { per: 1, unit: "scoops", as: "scoops", div: 1 }, tip: "On the go, a Core Power or Premier Protein shake does the same job." },
  { id: "tuna", name: "Canned tuna in water", cat: "protein", serving: "1 can", kcal: 120, p: 26, c: 0, f: 1, buy: { per: 1, unit: "cans", as: "cans", div: 1 } },
  { id: "ultrafiltered-milk", name: "Ultra-filtered skim milk", cat: "protein", serving: "1 cup", kcal: 80, p: 13, c: 6, f: 0, buy: { per: 1, unit: "cup", as: "52-oz bottles", div: 6.5 } },
  { id: "tofu", name: "Firm tofu", cat: "protein", serving: "½ block (7 oz)", kcal: 180, p: 20, c: 4, f: 10, buy: { per: 0.5, unit: "blocks", as: "blocks", div: 1 } },
  { id: "deli-turkey", name: "Lean deli turkey", cat: "protein", serving: "2 oz", kcal: 60, p: 12, c: 2, f: 1, buy: { per: 2, unit: "oz", as: "lb", div: 16 } },
  { id: "string-cheese", name: "Part-skim string cheese", cat: "protein", serving: "1 stick", kcal: 80, p: 7, c: 1, f: 5, buy: { per: 1, unit: "sticks", as: "sticks", div: 1 } },
  { id: "jerky", name: "Beef jerky", cat: "protein", serving: "1 oz", kcal: 80, p: 10, c: 6, f: 1, buy: { per: 1, unit: "oz", as: "oz", div: 1 } },
  // Carbs
  { id: "oats", name: "Rolled oats", cat: "carbs", serving: "½ cup dry", kcal: 150, p: 5, c: 27, f: 3, buy: { per: 0.5, unit: "cup", as: "cups dry", div: 1 } },
  { id: "rice", name: "White or jasmine rice", cat: "carbs", serving: "1 cup cooked", kcal: 205, p: 4, c: 45, f: 0, buy: { per: 1 / 3, unit: "cup dry", as: "lb dry", div: 2.25 }, tip: "Microwave pouches if you won't cook it." },
  { id: "potato", name: "Potatoes", cat: "carbs", serving: "1 medium", kcal: 160, p: 4, c: 37, f: 0, buy: { per: 1, unit: "potatoes", as: "medium potatoes", div: 1 }, tip: "Most filling food per calorie; air-fry wedges." },
  { id: "sweet-potato", name: "Sweet potatoes", cat: "carbs", serving: "1 medium", kcal: 130, p: 2, c: 30, f: 0, buy: { per: 1, unit: "", as: "medium", div: 1 } },
  { id: "pasta", name: "Pasta", cat: "carbs", serving: "2 oz dry", kcal: 200, p: 7, c: 42, f: 1, buy: { per: 2, unit: "oz", as: "lb", div: 16 } },
  { id: "bread", name: "Whole-wheat bread", cat: "carbs", serving: "2 slices", kcal: 160, p: 8, c: 28, f: 2, buy: { per: 2, unit: "slices", as: "loaves (20 slices)", div: 20 } },
  { id: "black-beans", name: "Canned black beans", cat: "carbs", serving: "½ cup", kcal: 110, p: 7, c: 20, f: 0, buy: { per: 0.5, unit: "cup", as: "15-oz cans", div: 1.5 } },
  { id: "rice-cakes", name: "Rice cakes", cat: "carbs", serving: "2 cakes", kcal: 70, p: 1, c: 15, f: 1, buy: { per: 2, unit: "", as: "cakes", div: 1 } },
  // Fruit and veg
  { id: "banana", name: "Bananas", cat: "produce", serving: "1 medium", kcal: 105, p: 1, c: 27, f: 0, buy: { per: 1, unit: "", as: "bananas", div: 1 } },
  { id: "berries", name: "Frozen mixed berries", cat: "produce", serving: "1 cup", kcal: 70, p: 1, c: 17, f: 0, buy: { per: 1, unit: "cup", as: "3-lb bags", div: 14 } },
  { id: "apple", name: "Apples", cat: "produce", serving: "1 medium", kcal: 95, p: 0, c: 25, f: 0, buy: { per: 1, unit: "", as: "apples", div: 1 } },
  { id: "broccoli", name: "Broccoli (fresh or frozen)", cat: "produce", serving: "1½ cups", kcal: 45, p: 4, c: 8, f: 0, buy: { per: 1.5, unit: "cup", as: "12-oz bags", div: 3 } },
  { id: "stir-fry-veg", name: "Frozen stir-fry vegetables", cat: "produce", serving: "1½ cups", kcal: 45, p: 3, c: 9, f: 0, buy: { per: 1.5, unit: "cup", as: "16-oz bags", div: 4 } },
  { id: "spinach", name: "Spinach / salad greens", cat: "produce", serving: "2 cups", kcal: 15, p: 2, c: 2, f: 0, buy: { per: 2, unit: "cup", as: "5-oz tubs", div: 5 } },
  { id: "peppers-onions", name: "Bell peppers and onions", cat: "produce", serving: "1 cup", kcal: 35, p: 1, c: 8, f: 0, buy: { per: 1, unit: "cup", as: "cups chopped", div: 1 } },
  // Fats
  { id: "olive-oil", name: "Olive oil", cat: "fats", serving: "1 tbsp", kcal: 120, p: 0, c: 0, f: 14, buy: { per: 1, unit: "tbsp", as: "tbsp", div: 1 }, tip: "Measure it: a free pour is often 2–3 tbsp." },
  { id: "avocado", name: "Avocados", cat: "fats", serving: "½ avocado", kcal: 120, p: 2, c: 6, f: 11, buy: { per: 0.5, unit: "", as: "avocados", div: 1 } },
  { id: "almonds", name: "Almonds", cat: "fats", serving: "1 oz (23)", kcal: 165, p: 6, c: 6, f: 14, buy: { per: 1, unit: "oz", as: "oz", div: 1 } },
  { id: "pb-powder", name: "Powdered peanut butter", cat: "fats", serving: "2 tbsp", kcal: 60, p: 6, c: 5, f: 2, buy: { per: 2, unit: "tbsp", as: "tbsp", div: 1 }, tip: "Peanut-butter taste for a third of the calories." },
  { id: "peanut-butter", name: "Peanut butter", cat: "fats", serving: "2 tbsp", kcal: 190, p: 7, c: 7, f: 16, buy: { per: 2, unit: "tbsp", as: "tbsp", div: 1 } },
  // Grab-and-go snacks (branded; label values, flavors vary a little)
  { id: "goldfish-100", name: "Goldfish 100-calorie pouches", cat: "snacks", serving: "1 pouch", kcal: 100, p: 3, c: 14, f: 3.5, buy: { per: 1, unit: "pouches", as: "pouches", div: 1 }, tip: "Already portioned, so a crunchy carb hit can't turn into half a bag. Good 30–60 min before training." },
  { id: "oikos-pro", name: "Oikos Pro yogurt cup", cat: "snacks", serving: "1 cup (5.3 oz)", kcal: 130, p: 20, c: 6, f: 3, buy: { per: 1, unit: "cups", as: "cups", div: 1 }, tip: "20 g protein with a spoon and no prep." },
  { id: "core-power", name: "Fairlife Core Power 26 g shake", cat: "snacks", serving: "1 bottle (14 oz)", kcal: 170, p: 26, c: 6, f: 4.5, buy: { per: 1, unit: "bottles", as: "bottles", div: 1 }, tip: "Swap for a whey scoop when you're out of the house." },
  { id: "premier-protein", name: "Premier Protein shake", cat: "snacks", serving: "1 carton (11 oz)", kcal: 160, p: 30, c: 4, f: 3, buy: { per: 1, unit: "cartons", as: "cartons", div: 1 }, tip: "Cheapest ready-to-drink protein at Costco." },
  { id: "chomps", name: "Chomps beef stick", cat: "snacks", serving: "1 stick", kcal: 100, p: 10, c: 0, f: 7, buy: { per: 1, unit: "sticks", as: "sticks", div: 1 }, tip: "Lives in a gym bag for weeks." },
  { id: "babybel-light", name: "Mini Babybel Light", cat: "snacks", serving: "1 cheese", kcal: 50, p: 6, c: 0, f: 3, buy: { per: 1, unit: "cheeses", as: "cheeses", div: 1 } },
  { id: "rice-krispies-treat", name: "Rice Krispies Treats bar", cat: "snacks", serving: "1 bar", kcal: 90, p: 1, c: 17, f: 2.5, buy: { per: 1, unit: "bars", as: "bars", div: 1 }, tip: "Fast pre-workout sugar for 90 calories." },
  // Free flavor
  { id: "flavor", name: "Salsa, hot sauce, mustard, spices, pickles, sugar-free syrup", cat: "free", serving: "as needed", kcal: 10, p: 0, c: 2, f: 0, buy: null, tip: "Near-zero calories; this is how lean meals stay interesting." },
]);
export const CATEGORIES = Object.freeze({ protein: "Protein", carbs: "Carbs", produce: "Fruit and vegetables", fats: "Fats", snacks: "Grab-and-go snacks", free: "Flavor for free" });
const byId = new Map(FOODS.map((f) => [f.id, f]));
export const food = (id) => byId.get(id);

// A day built from staples (servings). Lean protein, starches and fats are
// scaled to hit the targets; the rest stays as is.
const TEMPLATE = [
  { id: "greek-yogurt", n: 1, meal: "Breakfast" }, { id: "berries", n: 1, meal: "Breakfast" }, { id: "oats", n: 1, meal: "Breakfast", scale: "carbs" },
  { id: "chicken-breast", n: 1.5, meal: "Lunch", scale: "protein" }, { id: "rice", n: 1, meal: "Lunch", scale: "carbs" }, { id: "broccoli", n: 1, meal: "Lunch" },
  { id: "DINNER", n: 1.5, meal: "Dinner", scale: "protein" }, { id: "potato", n: 1, meal: "Dinner", scale: "carbs" }, { id: "stir-fry-veg", n: 1, meal: "Dinner" },
  { id: "olive-oil", n: 1, meal: "Cooking", scale: "fat" },
  { id: "whey", n: 1, meal: "Snack" }, { id: "eggs", n: 2, meal: "Snack" }, { id: "banana", n: 1, meal: "Snack" }, { id: "almonds", n: 0.5, meal: "Snack", scale: "fat" }, { id: "goldfish-100", n: 1, meal: "Snack" },
];
// Dinner protein rotates through the week (days per source).
export const DINNER_ROTATION = Object.freeze([["lean-beef", 2], ["salmon", 2], ["shrimp", 1], ["turkey", 2]]);

const dinnerAvg = () => {
  const total = DINNER_ROTATION.reduce((a, [, d]) => a + d, 0);
  const m = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const [id, d] of DINNER_ROTATION) { const x = food(id); for (const k of Object.keys(m)) m[k] += (x[k] * d) / total; }
  return m;
};
const macroOf = (id) => (id === "DINNER" ? dinnerAvg() : food(id));
const half = (x) => Math.max(0, Math.round(x * 2) / 2);

function totals(items) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const it of items) { const m = macroOf(it.id); for (const k of Object.keys(t)) t[k] += m[k] * it.n; }
  return t;
}

// target: { kcal, protein, carbs, fat }. Returns { day: [...], totals, week: [...] }.
export function groceryPlan(target, { days = 7 } = {}) {
  const items = TEMPLATE.map((x) => ({ ...x }));
  const group = (g) => items.filter((x) => x.scale === g);
  const scaleGroup = (g, key, want) => {
    for (let pass = 0; pass < 3; pass++) {
      const t = totals(items);
      const gs = group(g);
      const from = gs.reduce((a, x) => a + macroOf(x.id)[key] * x.n, 0);
      if (from <= 0) return;
      const rest = t[key] - from;
      const k = Math.max(0, (want - rest) / from);
      for (const x of gs) x.n = half(x.n * k);
    }
  };
  scaleGroup("protein", "p", target.protein);
  scaleGroup("fat", "f", target.fat);
  // Starches fill whatever calories are left (calories matter most).
  scaleGroup("carbs", "kcal", target.kcal);
  const day = items.filter((x) => x.n > 0);
  const t = totals(day);
  // Weekly shopping amounts.
  const servings = new Map();
  for (const x of day) {
    if (x.id === "DINNER") {
      const total = DINNER_ROTATION.reduce((a, [, d]) => a + d, 0);
      for (const [id, d] of DINNER_ROTATION) servings.set(id, (servings.get(id) ?? 0) + x.n * d * (days / total));
    } else servings.set(x.id, (servings.get(x.id) ?? 0) + x.n * days);
  }
  const week = [...servings].map(([id, n]) => {
    const f = food(id);
    const amount = f.buy ? (n * f.buy.per) / f.buy.div : null;
    return { id, name: f.name, cat: f.cat, servings: Math.round(n * 10) / 10, amount: amount == null ? null : roundBuy(amount, f.buy.as), unit: f.buy?.as ?? "" };
  }).sort((a, b) => Object.keys(CATEGORIES).indexOf(a.cat) - Object.keys(CATEGORIES).indexOf(b.cat));
  return {
    day: day.map((x) => ({ ...x, name: x.id === "DINNER" ? "Rotating dinner protein (beef, salmon, shrimp, turkey)" : food(x.id).name, serving: x.id === "DINNER" ? "4 oz raw" : food(x.id).serving })),
    totals: { kcal: Math.round(t.kcal), protein: Math.round(t.p), carbs: Math.round(t.c), fat: Math.round(t.f) },
    week,
  };
}

function roundBuy(x, unit) {
  if (/^(lb|dozen)/.test(unit)) return Math.max(0.5, Math.ceil(x * 2) / 2);
  return Math.ceil(x);
}

// Sum a list of meal items.
export function sumItems(items = []) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const it of items) for (const k of Object.keys(t)) t[k] += Number(it[k]) || 0;
  for (const k of Object.keys(t)) t[k] = Math.round(t[k]);
  return t;
}

// Branded snacks to rotate in (not counted in the plan): each with what it replaces.
export const SNACK_SWAPS = Object.freeze([
  ["oikos-pro", "a scoop of whey or the yogurt bowl"], ["core-power", "a scoop of whey"], ["premier-protein", "a scoop of whey"],
  ["chomps", "2 eggs"], ["babybel-light", "1 egg"], ["rice-krispies-treat", "the Goldfish pouch, pre-workout"],
]);

// ── Food log helpers (pure) ─────────────────────────────────────────────────
// A library food at N servings, as a meal the store can log.
export function foodMeal(f, servings = 1) {
  const n = Math.max(0.25, Number(servings) || 1);
  const r = (x) => Math.round((Number(x) || 0) * n);
  const amount = `${n === 1 ? "" : `${n} × `}${f.serving}`;
  const item = { food: f.name, amount, kcal: r(f.kcal), protein: r(f.p), carbs: r(f.c), fat: r(f.f) };
  return { name: f.name, items: [item], ...sumItems([item]), source: "food", foodId: f.id, servings: n };
}

// Label numbers typed in by hand (per serving × servings).
export const kcalFromMacros = (p, c, f) => Math.round(4 * (Number(p) || 0) + 4 * (Number(c) || 0) + 9 * (Number(f) || 0));

// Exact macros, no name needed: calories default to 4/4/9 when left blank.
export function quickMeal({ protein = 0, carbs = 0, fat = 0, kcal = null, name = "" } = {}) {
  const k = Number(kcal) > 0 ? Math.round(Number(kcal)) : kcalFromMacros(protein, carbs, fat);
  if (!(k > 0)) return null;
  const r = (x) => Math.max(0, Math.round(Number(x) || 0));
  const item = { food: String(name ?? "").trim().slice(0, 80) || "Quick add", amount: "exact", kcal: k, protein: r(protein), carbs: r(carbs), fat: r(fat) };
  return { name: item.food, items: [item], ...sumItems([item]), source: "quick" };
}

export function labelMeal({ name, kcal, protein = 0, carbs = 0, fat = 0, servings = 1 }) {
  const n = Math.max(0.25, Number(servings) || 1);
  const k = Math.round((Number(kcal) > 0 ? Number(kcal) : kcalFromMacros(protein, carbs, fat)) * n);
  if (!(k > 0) || !String(name ?? "").trim()) return null;
  const r = (x) => Math.max(0, Math.round((Number(x) || 0) * n));
  const item = { food: String(name).trim().slice(0, 80), amount: n === 1 ? "1 serving" : `${n} servings`, kcal: k, protein: r(protein), carbs: r(carbs), fat: r(fat) };
  return { name: item.food, items: [item], ...sumItems([item]), source: "label", servings: n };
}

// Distinct meals logged recently (newest first), for one-tap re-logging.
export function recentMeals(intake = [], { limit = 12 } = {}) {
  const seen = new Set(), out = [];
  for (const day of [...intake].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const m of [...(day.meals ?? [])].reverse()) {
      const key = m.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key); out.push({ ...m, lastDate: day.date });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// Search: every word must appear in the name. Saved foods and recents first,
// then the library. Empty query → saved + recents.
export function searchFoods(q, { saved = [], recent = [], library = FOODS } = {}) {
  const words = String(q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (name) => words.every((w) => name.toLowerCase().includes(w));
  const names = new Set();
  const take = (kind) => (x) => { const k = x.name.toLowerCase(); if (names.has(k)) return null; names.add(k); return { kind, ...x }; };
  const pick = (xs, kind) => xs.filter((x) => !words.length || hit(x.name)).map(take(kind)).filter(Boolean);
  const mine = [...pick(saved, "saved"), ...pick(recent, "recent")];
  return words.length ? [...mine, ...pick(library.filter((f) => f.cat !== "free"), "library")] : mine;
}
