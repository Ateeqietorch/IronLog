# IronLog Macros (November 2026)

Daily calorie and macro targets that adapt to your weight trend. Code: `engine/nutrition.js` (pure), `ui/nutrition.js` (Macros tab), store functions in `ui/store.js`, coach tools in `ui/agent.js`.

## How targets are set
1. **Start:** resting burn (Mifflin-St Jeor from sex, age, height, weight) × activity outside the gym (1.4 desk · 1.55 some walking · 1.7 on your feet · 1.85 very active) = starting expenditure.
2. **Goal rate** (% bodyweight per week): lose fat 0.25–1% (default 0.5), recomp 0.25% down, maintain, build 0.1–0.5% (default 0.25). Target = expenditure + rate × 500 kcal per lb/week.
3. **Weekly check-in** (7 days after the last): weight change over the last 21 days (least squares on weigh-ins, needs 4+ over 7+ days) and intake (your food logs if 7+ of the last 14 days are logged, otherwise your targets, assumed eaten) give measured expenditure = intake − rate × 500. The estimate moves halfway there (30% when intake is assumed), and the target moves at most 250 kcal per check-in. Never below resting burn (and 1,500 men / 1,200 women).
4. **Macros:** protein 1.0 g/lb (lose fat, recomp), 0.9 (maintain), 0.8 (build), adjustable 0.7–1.2; fat 25% of calories, at least 0.3 g/lb; carbs the rest (fat gives way down to its floor before carbs drop under 0.5 g/lb).
5. Trend weight on screen is a 10%/day moving average so water swings don't move it.

A goal change re-targets immediately from the current expenditure estimate (no 250 cap).

## Data
Weigh-ins go to the existing **Bodyweight** sheet (one per day; uploads queue offline). Profile, goal, check-ins and food logs live on the phone and back up to a **Nutrition** tab once the new Code.js is deployed (older backend: phone only).

## Evidence
- Helms, Aragon & Fitschen 2014 (JISSN): lose 0.5–1%/wk; protein 2.3–3.1 g/kg lean mass; fat 15–30%; carbs the rest.
- Iraki et al. 2019 (Sports): gain ~0.25–0.5%/wk (novice/intermediate), surplus ~10–20%; protein 1.6–2.2 g/kg; fat 0.5–1.5 g/kg; carbs ≥3–5 g/kg.
- MacroFactor: expenditure = intake − weight trend energy (~500 kcal/day per lb/week); targets step down gradually until the goal rate is reached.

## Meals described in words (AI estimate)

Homemade and restaurant food rarely has a label. On the Macros tab, "Describe a meal" sends the description to Claude (through the same `coach_step` relay the coach uses) with a meal-estimator prompt. Claude itemizes it (portions, cooking oil, sauces, drinks) and returns calories and macros per item, its assumptions and a confidence level. You can scale the portion (0.5×–2×) before adding it. A meal adds to the day's totals; removing it subtracts them again. Typing totals in "Log today" still overwrites the day.

The coach can do the same from chat ("log the biryani I just had"): the `log_meal` tool adds it with Undo.

## Grocery list

`engine/foods.js` holds about 37 macro-friendly staples (Greek yogurt, skyr, cottage cheese, chicken, lean beef and turkey, salmon, shrimp, eggs, whey, oats, rice, potatoes, fruit, vegetables, fats, zero-calorie flavor), each with a serving, macros, a shopping unit and a tip. `groceryPlan(target)` builds a sample day from a fixed template: lean protein is scaled to the protein target, fats to the fat target, then starches fill the remaining calories, all in half servings. Dinner protein rotates (beef, salmon, shrimp, turkey). The week's list multiplies that out into shopping amounts (lb, dozen, tubs, bags). The plan lands within about 10% of calories and at or above the protein target. Ticks on the list are stored per week on the phone. The coach reads the same list with `get_groceries`.

### Branded snacks
The plan includes one Goldfish 100-calorie pouch a day. "Snack picks to rotate in" lists branded snacks (Oikos Pro, Core Power, Premier Protein, Chomps, Mini Babybel Light, Rice Krispies Treats), each with the plan item it replaces so the day still adds up. The numbers come from the product labels (checked Nov 2026); they vary a little by flavor.

## Food log
The Food log card on the Macros tab logs to today or any of the last 30 days (‹ › to switch). Four ways in:
- **Search foods:** your saved foods and recent meals first, then the built-in food list (`engine/foods.js`). Pick servings in 0.5 steps.
- **From a label:** type the per-serving numbers and how many servings you ate. Saved to My foods by default.
- **Describe it:** the AI estimate, as before.
- **Tap a logged meal** to change its portion (0.5–2×, relative to how it was first logged), save it to My foods, log it again today, or delete it (with undo).

My foods live in `state.nutrition.saved` and back up to the Nutrition sheet under the `saved` key. Day totals feed the weekly check-in the same way as before (7+ logged days in 14 → it uses your logs).
