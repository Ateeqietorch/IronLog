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
