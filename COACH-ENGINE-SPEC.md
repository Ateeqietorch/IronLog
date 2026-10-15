# IronLog v3 — Coach Engine Spec
### October 2026 · companion to `FEATURES.md` and `GAP-ANALYSIS.md`

Hand this to Claude Code together with `CLAUDE-CODE-PROMPT.md` and `HYPERTROPHY-RESEARCH.md` (training-science basis and default PPL+UL template). `GAP-ANALYSIS.md` (Sept 2026) is still correct about *what* the field does; this document is about *why the September fixes didn't make the app feel like a coach*, and specifies the replacement precisely enough to build and test.

---

## 0. Diagnosis from the code audit

Phases 1–3 of the September plan were merged on Sept 14 (e1RM inversion, AMRAP, contribution vectors, per-muscle feedback, per-set autoregulation, ladder fixes). The app still doesn't work as a coach because those changes were **layered on top of** the old rule system instead of replacing it. Concretely:

**0.1 Twelve overlapping mechanisms decide the numbers.** `computeTarget()` alone has eight branches (deload override, two ladder branches, AI "hold" flag, ≥75% hit-ratio bump, undershoot fast-track, RPE ≥ 9.5 hold, +1 rep maintain), and four more mechanisms modify its output in-session (`autoregulateNextSet`, `checkFirstSetStruggle`, `sessionAutoAdjust`, the dumbbell `effectiveRepCeiling` hack), plus AI pre-session adjustments. Each was correct in isolation; together they produce numbers nobody can predict or explain, including the app.

**0.2 Load still moves in fixed steps.** e1RM inversion only runs *after* the threshold rule fires. Simulated on the real code: hack squat 270×10,10,10 at RPE 6/6.5/7 (≈4 RIR — far too easy) only moves to 282.5×9. The model's own estimate (e1RM ≈ 391) says the right prescription for 8 reps @ 2 RIR is ≈293. Progression is still "standard," not "your performance."

**0.3 Exercise identity is a free-text string with fuzzy substring matching.** Tested `getMuscleContributions()` directly:

| Input | Result |
|---|---|
| Pendulum Squat, Belt Squat, Hip Adduction, Cable Y-Raise, Machine Preacher Curl, Smith Machine Incline Press | `{ Other: 1 }` — **zero volume credited to any muscle** |
| "Row" | `{ Shoulders: 1, Back: 0.3 }` (matched Upright Row) |

So any exercise you add outside the hardcoded list silently disappears from the muscle model, and the swap estimator (`TRANSFER_COEFF`, name-keyed) returns `null` for it — the exact feature you want is structurally impossible today.

**0.4 Switching mutates the program.** `openSwapModal` writes into `exercises[activeDay]` and calls `persistExercises()`. A swap for availability permanently rewrites the day in localStorage.

**0.5 Unilateral exercises get none of the engine.** `computeTargetPerSet` is a legacy path with no e1RM, no autoregulation, reset-to-repMin on every bump (documented in the code as a deliberate scope boundary).

**Conclusion:** don't add Phase 4/5 on top. Replace the decision core with **one model and one prescription function**, make exercises first-class records, and put the AI only where judgment or lookup is needed.

---

## 1. Design principles

1. **One source of truth per decision.** Load/reps: the strength model. Sets: the muscle model. Exercise choice: the slot + catalog. Nothing else may change a number; the coach agent proposes, the engine computes.
2. **Every number is explainable.** Each prescription carries a machine-generated `reason` (e.g. "e1RM 312 (+1.4% from last session), target 10 reps @ 2 RIR, nearest load 225"). The coach can elaborate; it can't invent.
3. **Prescriptions are logged next to actuals.** The app measures its own accuracy (§9) — that's how you'll know it's working instead of guessing.
4. **Non-punitive and conservative under uncertainty.** When the model is unsure (new exercise, long gap), it adds reps in reserve rather than guessing heavy, then calibrates from the first set.
5. **Pure, tested engine.** The engine is a set of pure functions with no DOM, no network, no localStorage, covered by unit and scenario tests.

---

## 2. Evidence base (what the defaults are built on)

| Finding | Source | How the engine uses it |
|---|---|---|
| Hypertrophy is similar across a wide load range when effort is high; ACSM's 2026 position stand (137 systematic reviews) recommends ~10+ weekly sets per muscle, near-failure effort, and finds absolute failure unnecessary | Currier et al. 2026, ACSM Position Stand (MSSE) | Rep ranges chosen for exercise suitability; target the **middle** of the range, not the floor; weekly floor of 10 fractional sets |
| Per-session returns plateau around ~11 fractional sets per muscle | Remmert et al. 2025 meta-regression (sportRxiv 537) | Soft cap of 11 fractional sets per muscle per session |
| Fractional counting (indirect = 0.5) best fits the dose–response | Pelland et al. 2025, Sports Med | Contribution vectors with 1.0 / 0.5 defaults |
| Lifters underpredict reps-to-failure by ~1 rep on average, with better accuracy closer to failure, below ~12 reps, and in later sets | Halperin et al. 2022, scoping review + meta-analysis | Observation weights favour low-RIR, ≤12-rep, later sets; optional per-user RIR bias term |
| Reps at a given %1RM differ by exercise: at 70% 1RM roughly 14 reps on bench vs 19 on leg press, with large between-person spread | Nuzzo et al. 2024 meta-regression (PMC10933212) | Per-exercise "rep-endurance" constant `k`, defaulted by class and **learned from your data** |
| Adding reps and adding load produce similar hypertrophy | Plotkin et al. 2022, PeerJ | Engine is free to progress by reps when load steps are coarse |
| When the next dumbbell is a big relative jump, mature apps add reps instead; they also treat recommendations as non-punitive | MacroFactor Workouts help docs (Smart Progression); RP Hypertrophy help centre | Load-ladder–aware candidate search (§4.3) |
| A 1-week training break didn't affect hypertrophy but modestly reduced strength gains; the authors now favour autoregulated deloads | Coleman et al. 2024, PeerJ 12:e16777 | Deloads triggered by data, not calendar; active deload, not cessation |
| Strength is largely retained for up to ~4 weeks off; submaximal strength-endurance declines faster than max force | Bosquet et al. 2013 meta-analysis (via SBS); Barbell Medicine review | Gap handling adds reps-in-reserve to the first session back rather than cutting the estimate |
| Planned variation is fine or helpful; very frequent random rotation may not be | Kassiano et al. 2022 systematic review; Baz-Valle et al. 2019 | Free switching allowed; coach flags if a slot changes every session |
| DB press ≈ 80% of barbell 1RM with ~14 lb individual error | Arkansas State thesis 2012; Mayhew et al. | Transfer ratios are priors with wide uncertainty, always followed by calibration |

---

## 3. Data model

All tables live in the Google Sheet (source of truth). localStorage is cache only.

### 3.1 `Exercises` (catalog)
```js
{
  id: "pendulum-squat",               // stable slug, never the display name
  name: "Pendulum Squat",
  aliases: ["pendulum", "pendy squat"],
  pattern: "squat-machine",           // controlled vocabulary, §3.6
  equipment: "machine-plate",         // barbell | dumbbell | cable | machine-stack | machine-plate | smith | bodyweight | assisted | band
  loadType: "plates",                 // plates | stack | dumbbell-pair | dumbbell-single | bodyweight-plus | assisted | fixed
  unilateral: false,
  contributions: { quads: 1.0, glutes: 0.5, adductors: 0.5 },
  lengthenedBias: 0.8,                // 0–1 tiebreaker for slot filling
  stability: "high",                  // high (machine) | medium | low (free weight) — affects transfer discount
  kClass: "leg-press",                // default rep-endurance class, §4.1
  defaultRepRange: [8, 12],
  source: "ai-lookup",                // seed | free-exercise-db | ai-lookup | manual
  sourceUrls: ["https://…"],
  confidence: 0.7,
  createdAt: "2026-10-14"
}
```

**Seeding:** (a) migrate every exercise in the current `EXERCISE_REPO` / `CONTRIBUTIONS`; (b) import the public-domain **free-exercise-db** (github.com/yuhonas/free-exercise-db, 876 exercises, Unlicense — verified) for names, equipment, primary/secondary muscles. Map primary → 1.0, secondary → 0.5 into the app's muscle taxonomy. It lacks newer machines (no pendulum squat, for example), which is what the AI lookup covers.

**Resolution order for any typed name:** exact id → exact alias (case/punctuation-normalized) → catalog name similarity ≥ 0.9 → **ask** ("Did you mean Hack Squat?") → AI lookup. **Never fuzzy-substring. Never silently map to `Other`.**

### 3.2 `ExerciseModels` (one row per exercise id, per side if unilateral)
```js
{ exerciseId, side: "both"|"L"|"R",
  logE1rm, logVar,            // strength estimate in log space + variance (§4.2)
  k,  kN,                     // rep-endurance constant + number of informative observations
  fatigueDecay,               // per-set multiplier, default 0.98 (≈1 rep lost per set at 2 RIR)
  lastExposure, exposures, updatedAt }
```

### 3.3 `Sets` (extend the existing log; never drop columns)
Add: `exerciseId`, `slotId`, `plannedLoad`, `plannedReps`, `plannedRIR`, `loggedRIR`, `predictedRepsAtLoggedLoad`, `switchScope` (`today` | `trial` | `permanent`), `trialId`, `engineVersion`. Keep RPE input for back-compat but store `loggedRIR = 10 − RPE`.

### 3.4 `Programs` / `Slots`
As specified in GAP-ANALYSIS §1.5: Program → Days → Slots. A slot holds a **pattern + muscle target + rep range**, and a *current* exerciseId. Switching changes the exercise *in the slot* for today or permanently; the slot's history persists either way.

### 3.4b `Trials`
```js
{ id, slotId, originalExerciseId, trialExerciseId,
  sessionsPlanned,          // default 3, range 2–6
  sessionsDone, startedAt, status: "active"|"kept"|"reverted"|"extended",
  feedback: [{ sessionDate, targetFeel: 1|2|3, joints: 0|1|2 }] }
```

### 3.5 `GymProfiles`
```js
{ id, name, ladders: {
    "dumbbell-pair": [5,7.5,10,12.5,15,17.5,20,22.5,25,…],
    "plates": { bar: 45, smallest: 2.5 },
    "stack": { "cable-default": [10,15,20,…], "<exerciseId>": [...] } },
  unavailable: ["exerciseId", …] }
```
Recommendations only ever use loads the profile can actually make.

### 3.6 Controlled vocabularies
- **Muscles:** chest, front-delts, side-delts, rear-delts, lats, upper-back, traps, biceps, triceps, forearms, quads, hamstrings, glutes, adductors, calves, abs, lower-back. (Lats and upper-back are separate — a known RP complaint.)
- **Patterns:** horizontal-press, incline-press, vertical-press, fly, lateral-raise, rear-delt, vertical-pull, horizontal-row, pullover, elbow-flexion, elbow-extension, squat-free, squat-machine, leg-press, hip-hinge, knee-flexion, knee-extension, hip-extension, hip-adduction, hip-abduction, calf-raise, trunk.

---

## 4. The strength model (replaces `computeTarget`, ladder, struggle detection, autoregulation)

### 4.1 Load–reps relationship
For an exercise with estimated one-rep strength `E` and rep-endurance constant `k`:

```
RTF(L) = k × (E / L − 1)        // reps to failure at load L
L(RTF) = E / (1 + RTF / k)      // load for a given reps-to-failure
```
With `k = 30` this is Epley. `k` is per exercise because reps-at-%1RM varies by exercise (Nuzzo 2024). Defaults by `kClass`, derived from that paper's tables (70% 1RM ≈ 14.1 reps bench → k ≈ 33; ≈ 19.0 leg press → k ≈ 44):

| kClass | default k |
|---|---|
| upper-compound (presses, rows, pulldowns) | 32 |
| lower-free (RDL, free squat variants) | 34 |
| leg-press (leg press, hack, pendulum, belt squat) | 42 |
| isolation (curls, raises, extensions, flies) | 34 |

`k` is **learned** once you've logged ≥2 distinct rep zones (≥4 reps apart) on that exercise: fit `k` by least squares on the exercise's recent observations; clamp to [24, 50]; blend `k = (n·k_fit + 4·k_default)/(n+4)` so it moves gradually.

### 4.2 Updating the estimate (Kalman-style, in log space)
State per exercise: `x = ln E`, variance `P`.

**Before a session:** `P += q_weeks`, where `q = 0.01²` per week since last exposure, plus `0.02²` per week beyond 14 days (uncertainty grows when you're away).

**Each logged working set i** (weight > 0, reps > 0):
```
RTF_i   = reps_i + loggedRIR_i + rirBias          // rirBias default 0 (see 4.5)
E_obs_i = L_i × (1 + RTF_i / k) / fatigueDecay^(i−1)   // fatigue-adjust back to "fresh"
z_i     = ln E_obs_i
R_i     = (0.04 × (1 + loggedRIR_i/2) × (reps_i > 12 ? 1.5 : 1))²
K       = P / (P + R_i)
x      += K × (z_i − x);   P = (1 − K) × P
```
Weights follow Halperin 2022: sets closer to failure and under ~12 reps are trusted more. Sets with no RIR logged use `R × 2²`.

**Prior for a new exercise:** `x0` from the cold-start pipeline (§6), `P0 = (0.15)²` (or `(0.10)²` when derived from the user's own history on a same-pattern lift). This makes the first logged set dominate — which is what calibration means.

`fatigueDecay` is learned per exercise from set-index residuals across sessions (clamp [0.93, 1.00]).

### 4.3 Prescription (exact weight and reps for every set)
Inputs: model `(E, k, fatigueDecay)`, slot rep range `[lo, hi]`, this week's target RIR `r` (§5.3), gym ladder, policy `hold-load` (default) or `reps-first` / `load-first` (user setting).

```
mid = round((lo + hi) / 2)
candidates = ladder loads within ±25% of L(mid + r)
for each candidate L:
   reps_1(L) = floor(RTF(L) − r)
choose L* = argmin |reps_1(L) − mid|, tie → heavier, subject to lo ≤ reps_1 ≤ hi + 3
for set i: reps_i = floor(k × (E × fatigueDecay^(i−1) / L* − 1) − r), floored at lo − 2
```
- **Progression is emergent.** When E rises, predicted reps at the same load rise; when a heavier rung lands nearer `mid`, the load moves up — by exactly as much as your performance justifies. No thresholds, no fixed 5%.
- **Coarse increments handled for free.** Lateral raise 20 → 25 lb is +25%: the 25s won't land in range until E justifies it, so you keep getting 20 × more reps (the `hi + 3` allowance). Retire `effectiveRepCeiling`.
- **Last set:** same target load, displayed as `≥ N reps @ r RIR`. More reps is welcome data.
- **Output per set:** `{ load, reps, rir, reason }`. UI shows `Set 2 · 65 lb × 10 · 2 RIR` with a tap-to-see-why.

### 4.4 In-session recalculation (the only in-session mechanism)
After each set is logged, run the §4.2 update on a **session copy** of the model (gain capped at 0.5 so one weird set can't swing things), then re-run §4.3 for the remaining sets. If you ran 2 RIR hotter than planned, set 3 drops load or reps automatically; if it was much easier, it rises. Never modify a set the lifter has already started typing into.

### 4.5 RIR bias (optional, Phase 6)
Sets logged at 0 RIR are the most reliable anchor. Track the residual between their actual RTF and the model's prediction from non-failure sets; the median residual over the last 20 such sets becomes `rirBias` (clamped −1 to +2). This corrects the ~1-rep underprediction tendency Halperin et al. found, for *your* calibration rather than the average.

### 4.6 Gaps and returns
- Days since last exposure > 10: first session back at target RIR **+1** (strength-endurance falls faster than max force). The estimate itself is not cut; the session's data recalibrates it.
- Days > 28: +2 RIR and one fewer set per slot for that session.

### 4.7 Special load types
- **Unilateral:** separate models for L and R; prescribe one load for both at the weaker side's prediction; reps per side. Full machinery, no legacy path.
- **Dumbbell-pair:** model on per-hand load. **Bodyweight-plus / assisted:** effective load = bodyweight (latest from Bodyweight tab) × `bwFraction` + added load (or − assistance). `bwFraction` defaults: pull-up/chin-up 1.0, dip 0.95, push-up 0.65.
- **Machine stacks:** ask once per exercise per gym for the stack increments; default 10 lb steps.

---

## 5. The muscle model (sets, volume, deloads)

### 5.1 Volume accounting
Weekly fractional sets per muscle = Σ (hard sets × contribution). A hard set = loggedRIR ≤ 4 (or RPE ≥ 6). Every catalog exercise has a vector, so nothing falls into `Other`.

### 5.2 Weekly set adjustment
Keep the September RP-style per-muscle feedback (soreness-recovery 1–4 × performance 1–4), but compute **performance** objectively when possible: median E change across that muscle's exercises vs last week (≥ +1% = 1, ±1% = 2, −1 to −3% = 3, < −3% = 4), falling back to the user's tap if there's no data. Then:
- 1s on both → +2 sets · 1–2 mix → +1 · any 3 with soreness ≥ 3 → hold · performance 4 → recovery session or deload.

**Starting point:** each muscle's week-1 target = its trailing 2–4 week logged fractional volume (fallback: the template in `HYPERTROPHY-RESEARCH.md` §5). Cap growth at ~+20% per mesocycle unless both feedback scores are 1 (Scarpelli 2022; a +120% jump grew no more muscle than +20%).

Constraints: weekly floor 10 fractional sets for target muscles (ACSM 2026); per-session soft cap 11 fractional sets per muscle (Remmert 2025) — overflow is moved to another day that trains the muscle, or flagged.

### 5.3 Mesocycle RIR schedule
Default 5 accumulation weeks + 1 deload (matches practice: ~6-day deloads every ~5–6 weeks, Rogerson/Bell 2024): RIR **3 → 2 → 2 → 1 → 1**, isolation slots may go to 0 on the last set in week 5; compound slots floor at 1. Optionally one true-failure set per week on a safe isolation exercise to feed the RIR-bias learner (§4.5). Deload: same exercises, half the sets, RIR 4, same loads as week 1.

### 5.4 Autoregulated deload triggers (any one)
- Performance score 4 for a muscle two exposures in a row.
- E down ≥ 3% across two consecutive exposures on ≥ 2 exercises of the same muscle.
- End of meso. (A deload week of complete rest is also acceptable per Coleman 2024; active deload is the default.)

---

### 5.5 Readiness (session-scoped only)
An optional pre-session check (sleep, energy, soreness per muscle) may add +1 RIR or drop one set *for that session*. It never updates the strength model directly — only the sets you actually log do.

### 5.6 Set techniques (time-saver mode)
Optional per session: drop sets (top set + ~3 drops, counts as 2.5 sets), myo-rep clusters (counts as 2), antagonist supersets (count normally). Evidence: similar growth in less time, not more growth. Excluded from strength-model updates except the first (top) set.

### 5.7 Rest
Adaptive timer keeps its logic with a 90 s floor for hypertrophy sets (Singer 2024: small benefit above 60 s, none detected beyond ~90 s).

### 5.8 Settings
`progressionPreference`: `reps-first` (aim upper third of range) · `balanced` (middle, default) · `load-first` (lower third). Optional cardio log: used only by the coach for scheduling advice (cycling interferes less than running).

## 6. Switching and adding exercises

### 6.1 Switch button (any reason)
Tap **Switch** on any exercise → sheet with:
1. **Ranked alternatives**: same slot pattern, overlapping contributions (cosine similarity ≥ 0.7), not marked unavailable in the gym profile, sorted by (has own history) → lengthenedBias (weighted ×2; seeded from head-to-head trials: overhead > pushdown, seated > lying curl, standing > seated calf) → recency.
2. **Search box**: type anything. Catalog resolution (§3.1); if not found → "Look it up" (§6.2).
3. **Scope toggle — three options:**
   - *Today* (default for availability swaps): writes `switchScope: today`; program untouched (fixes §0.4).
   - *Trial*: the in-between option — see §6.1b. Default when the chosen exercise has no history or came from an AI lookup.
   - *Permanent*: replaces the slot's exercise; old exercise keeps its history and model.

Starting numbers: if the exercise has its own model → use it (with gap handling). Otherwise → cold start (§6.3).

### 6.1b Trial mode
Purpose: test whether a switch is worth keeping long-term without committing.
- **Setup:** pick trial length (2–6 sessions of the day that holds the slot; default 3). The original exercise stays the slot's *anchor*; the trial exercise fills the slot until the trial ends. One active trial per slot.
- **During the trial:** the trial exercise gets full prescriptions (cold start §6.3 on session 1). Its sets count toward muscle volume normally. After its last set each session, two taps: *Target muscle feel* (weak / good / great) and *Joints* (fine / noticeable / painful). The exercise card shows a "Trial n of N" pill.
- **Early exit:** "painful" joints → the coach offers to end the trial now (switch back) or swap to another candidate. The user can also end any trial from the switch sheet.
- **Review (after the last trial session, shown before the next session of that day):** side-by-side of trial vs the original's last N exposures:
  - strength trend (%/week of E), **excluding trial session 1 and weighting session 2 at 0.5** — early gains on a new movement are partly skill learning;
  - mean target-muscle feel; worst joint rating; rep-prediction error (§9); lengthenedBias.
- **Recommendation (deterministic):** any "painful" → switch back. Otherwise score = Δfeel + Δcomfort + 0.5 × Δtrend (normalized); ≥ +0.5 → keep, ≤ −0.5 → switch back, in between → "either is fine, your call." The coach can explain; it doesn't decide.
- **Outcomes:** *Keep* → becomes permanent; *Switch back* → original returns with §4.6 gap handling if > 10 days unused; *Extend* → +2 sessions (once).
- Both exercises keep their own models and history regardless of outcome.

If a slot's exercise has changed in each of the last 4 sessions, the coach adds a one-line note (planned variation is fine; constant rotation makes progress harder to read). Informational only — never blocks.

### 6.2 AI exercise lookup
Endpoint `POST /lookup-exercise { name, context }` on the AI layer (§8).

- Model: current Claude Sonnet (`claude-sonnet-5-5` at time of writing; verify web-search support via the Models API `capabilities.server_tools.web_search.supported` field).
- Tools: Anthropic **web search** server tool (`web_search_20260318`, `max_uses: 4`) + one **strict** client tool `submit_exercise_profile` whose input schema is the §3.1 record restricted to the §3.6 vocabularies, plus:
  ```js
  strengthAnchors: [{ source, url, sex, bodyweightLb, level, oneRepMaxLb }],   // e.g. Strength Level standards
  referenceRatios: [{ referenceExerciseId, ratio, basis }],                    // vs exercises in the user's catalog
  ```
- System prompt instructs: search for how the movement is performed and which muscles it targets; search for published strength standards for it (Strength Level publishes data-backed standards for ~287 exercises including machines and cables); choose reference exercises **only from the catalog list provided in context**; express uncertainty in `confidence`.
- Cache by normalized name. Cost is roughly a few cents per new exercise (web search is billed at $10 per 1,000 searches plus tokens), and it only happens once per exercise.
- Result is shown to the user as a card ("Pendulum Squat — quads 1.0, glutes 0.5, adductors 0.5 · machine, plate-loaded") with Save / Edit before it enters the catalog.

### 6.3 Cold-start strength estimate
Compute up to three independent estimates of E for the new exercise:

1. **Transfer:** for each reference exercise with a current model, `E_ref × ratio`. Ratio priority: the user's own historical ratio between the two (if both have models) → seed ratio table (migrated from `TRANSFER_COEFF`) → AI `referenceRatios`.
2. **Percentile mapping:** compute your percentile on your reference lifts against their published standards at your bodyweight; take the same percentile on the new exercise's standard (`strengthAnchors`).
3. **Pattern index:** bodyweight-normalized median E across all your exercises sharing the pattern, scaled by the class median ratio.

Combine with the geometric mean of available estimates, then apply a **cold-start discount**: −10% for `stability: high` machines (unknown leverage/stack), −5% otherwise. `P0 = 0.15²` (0.10² if estimate 1 used your own ratio).

**Calibration:** the first set is prescribed at target RIR **+1** in the middle of the rep range. When it's logged, §4.4 runs with the large prior variance, so the estimate snaps to your real performance and sets 2+ are recomputed immediately. Expect the prescription to be right by set 2 and dialed in by the second session. A wrong cold estimate costs nothing — the calibration set is a normal working set.

---

## 7. The coach agent (Phase 5, unchanged in spirit from GAP-ANALYSIS §1.3)
One agent, tool access, durable Coach Memory tab. Tools add: `lookup_exercise`, `get_prescription(slotId)` (read-only), `explain(setId)` (returns the engine's reason chain), `propose_switch(slotId, exerciseId, scope)`, `propose_program_change(diff)`. **The agent never writes loads or reps directly.** Session-scoped changes auto-apply and are listed; program-scoped changes require approval.

---

## 8. Architecture

```
GitHub Pages (PWA, ES modules)
  /engine   ← pure functions, zero I/O, unit-tested in Node
     model.js        (§4.1–4.2)
     prescribe.js    (§4.3–4.7)
     volume.js       (§5)
     catalog.js      (resolution, vocabularies, seed data)
     coldstart.js    (§6.3)
  /data     ← Sheets client, cache, offline queue (keep the dual-layer draft safety net)
  /ui       ← rendering only
Apps Script  ← data layer only (doPost JSON; keep token auth)
Cloudflare Worker  ← AI layer: /lookup-exercise, /coach; holds the Anthropic key as a secret
```

Why a Worker: the free plan allows 100,000 requests/day and time spent waiting on `fetch()` doesn't count toward its CPU limit, so long Claude calls are fine. Apps Script can run the lookup (6-minute execution cap, 20,000 UrlFetch calls/day on consumer accounts) as a fallback, but the conversational coach needs POST, streaming, and a tool loop.

Split the current 3,300-line `app.js` along these lines. Do not port the superseded mechanisms (§10).

---

## 9. Self-measurement ("engine health")
Every set stores `predictedRepsAtLoggedLoad`. A Health panel shows, per exercise and overall:
- **Rep prediction error** (MAE of predicted vs actual reps at the load you used). Target ≤ 1.5 reps after 3 exposures.
- **Effort accuracy** (planned vs logged RIR).
- **Calibration speed** for new exercises (sets until error ≤ 1.5).

If MAE stays > 2 on an exercise for 3 sessions, the coach flags it and the engine widens `R` for that exercise. This is how you'll *know* the app works.

---

## 10. Remove (superseded — do not port)
`computeTarget` threshold branches · hit-ratio bump · undershoot fast-track · RPE ≥ 9.5 hold · ladder sets and `LADDER_TAG` · `effectiveRepCeiling` · `computeTargetPerSet` · `autoregulateNextSet` · `checkFirstSetStruggle` · `sessionAutoAdjust` · descending-rep display · `TRANSFER_COEFF` as a name-keyed table (keep the numbers as seed ratios) · fuzzy `getMuscleContributions` · AI `holdVolume` adjustments · calendar volume ramp remnants.

---

## 11. Migration
1. Build the catalog; create an alias map from every distinct historical exercise string to an id (Smith Machine Hack Squat ≠ Hack Squat). Unmatched strings go to a review list — not `Other`.
2. Replay all historical sets chronologically through §4.2 to initialize every ExerciseModel and learn `k` / `fatigueDecay`.
3. Report the replay's own rep-prediction MAE as a baseline.
4. Keep v2 code on a branch; v3 behind a settings toggle for two weeks so you can compare.

---

## 12. Acceptance scenarios (must pass as automated tests)
1. **On-plan session** (all sets at planned RIR) → E rises 0.5–2%; next prescription adds a rep or a rung.
2. **Too easy** (logged 4 RIR vs planned 2) → next load rises in proportion; hack-squat case from §0.2 → ≈ 290–295 × 8 on set 1 (current code gives 282.5 × 9).
3. **Too hard** (logged 0 vs planned 2) → load or reps drop, never more than one rung below last session.
4. **Coarse dumbbells** (lateral raise 20 lb, next is 25) → stays 20 with reps up to `hi + 3` until 25 predicts in range.
5. **Unknown exercise** "Pendulum Squat" → lookup → contributions credit quads/glutes/adductors → cold-start from hack squat → set 1 at +1 RIR → sets 2–3 recomputed from set 1.
6. **Today-only switch** → program unchanged tomorrow; volume credited correctly.
6b. **Trial** of 3 sessions → slot uses the trial exercise for exactly 3 sessions, original untouched in the program; review appears before session 4; "painful" on session 1 triggers the early-exit offer; trend metric ignores session 1; Keep / Switch back / Extend each produce the right program state.
7. **10-day gap** → first session at +1 RIR; E unchanged before the session.
8. **Unilateral** (single-arm cable row) → separate L/R models; prescription at weaker side.
9. **No `Other`**: every exercise in history and catalog resolves to a real contribution vector or is in the review list.
10. **Session cap**: a day that would put > 11 fractional sets on one muscle is flagged.
11. **In-session recalc**: logging set 1 at 2 RIR hotter than planned changes set 2's load or reps; editing set 2 by hand stops further changes to it.
12. **Determinism**: same history in → same prescriptions out.
