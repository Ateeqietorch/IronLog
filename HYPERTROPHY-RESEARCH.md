# Hypertrophy Programming Research
### Evidence, coaching practice, and app methodology — October 2026
Companion to `COACH-ENGINE-SPEC.md`. Section 6 lists exactly what this research changes in the spec.

---

## 1. The short version

1. **Weekly volume is the main lever you control.** It's the only variable with a clear dose–response for growth; most other variables are "do it well enough and move on."
2. **Count sets fractionally** (direct = 1, indirect = 0.5). It predicts growth better than other counting methods, and per-session returns flatten around ~11 fractional sets per muscle.
3. **Progress volume from *your* baseline, not a generic number.** In trained lifters, adding ~20% to their own previous volume beat a standardized prescription.
4. **Effort: 0–3 RIR, mostly 1–2.** Failure isn't required; taking sets close is.
5. **Rep range barely matters for growth (≈5–30)** when effort is matched. Choose ranges for joint comfort, fatigue cost, and load-step convenience.
6. **Rest ≥ 90 s.** Short rest costs a little growth; benefits plateau beyond ~90 s.
7. **Exercise selection matters at the margins, and the margin is muscle length.** Exercises that load the muscle hard when stretched tend to win head-to-head comparisons.
8. **Splits, frequency, periodization model, tempo, machines vs free weights: roughly a wash for hypertrophy** when volume and effort are equal. Pick for adherence and logistics.
9. **Deloads don't build muscle, they manage fatigue.** Practitioners deload every ~5–6 weeks; the trial evidence favors doing it when needed rather than on a rigid calendar.
10. **The best apps all converge on the same loop:** estimate strength per exercise → prescribe load/reps at a target RIR → collect feedback → adjust sets per muscle. The differences are in how honestly they handle uncertainty and equipment.

---

## 2. Programming variables

### 2.1 Volume (weekly)
- **Dose–response is real but flattening.** Pelland et al. (2025/26, Sports Medicine; 67 studies, 2,058 participants) modeled volume continuously. Their best-fitting model used fractional counting, found a minimum effective dose around 4 fractional sets/week, and no clear plateau for hypertrophy — but with diminishing returns. ACSM's 2026 position stand (137 systematic reviews) recommends ~10+ sets per muscle per week for hypertrophy.
- **Individual baseline matters.** Scarpelli et al. (2022, JSCR) had trained subjects train one leg at a standard 22 sets/week and the other at 1.2× their own logged volume; the individualized leg grew more. A 2026 follow-up found a +120% abrupt volume jump produced no more growth than +20%. Aube et al. (2022) found big individual differences in which volume worked.
- **Implication:** start each muscle at your *recent logged* weekly fractional volume, add ≈10–20% across a mesocycle, and let feedback decide beyond that. Generic MEV/MRV tables are priors, not prescriptions.

### 2.2 Volume (per session) and frequency
- **Per-session cap:** Remmert et al. (2025) found hypertrophy returns plateau around ~11 fractional sets per muscle per session (vs ~2 direct sets for strength).
- **Frequency adds little once volume is matched** (Pelland 2025). Its main job is to *let you fit more weekly volume* without exceeding the per-session cap.
- **Split choice is logistics.** Ramos-Campo et al. (2024, 14 studies) found full-body and split routines produced similar hypertrophy and strength when volume was equated. Your 5-day PPL + Upper + Lower hits most muscles twice per week, which comfortably fits 12–20 weekly sets without blowing the per-session cap.

### 2.3 Effort (proximity to failure)
- Robinson et al. (2024, Sports Medicine; meta-regressions) found hypertrophy improves as sets end closer to failure, while strength is fairly insensitive to it.
- Refalo et al. (2024, J Sports Sci; within-subject, trained) found quad growth was essentially identical training to failure vs 1–2 RIR, with more fatigue from failure. A 2025 single-set trial found failure gave modest extra growth when volume is very low.
- ACSM 2026: near-failure effort is sufficient; absolute failure isn't necessary.
- People underestimate their reps-to-failure by about one rep on average (Halperin 2022), so "2 RIR" often means ~3 in reality — an occasional true-failure set on a safe isolation exercise calibrates you.
- **Implication:** default 1–3 RIR; allow 0 RIR only on the last set of isolation/machine work; keep compounds at ≥1 RIR.

### 2.4 Load and rep range
- Hypertrophy is similar across a wide loading range (roughly 30–85% 1RM, ≈5–30 reps) when sets are taken near failure (ACSM 2026; Schoenfeld et al. 2017, 2021).
- Very high reps make RIR estimation worse (Halperin 2022: accuracy degrades above ~12 reps), and very low reps cost more joint stress per unit of stimulus.
- **Implication:** default ranges — heavy compounds 6–10, machine/secondary compounds 8–12, isolation 10–20. Prescribe toward the *middle* of the range (spec §4.3).

### 2.5 Progression method
- Plotkin et al. (2022, PeerJ): adding reps at a fixed load and adding load at fixed reps produced similar hypertrophy over 8 weeks in trained lifters.
- **Implication:** the engine can progress by reps whenever load steps are coarse, without costing growth.

### 2.6 Rest intervals
- Singer et al. (2024, Bayesian meta-analysis): a small hypertrophy benefit for rest >60 s; no detectable additional benefit beyond ~90 s.
- **Implication:** rest-timer floor of 90 s; longer (2–3 min) for heavy compounds is fine for performance, not required for growth.

### 2.7 Exercise selection — muscle length
- Long-length partials vs short-length partials: 2026 meta-analysis (8 studies) favored long-length training (ES ≈ 0.28), especially distally.
- Lengthened partials vs full ROM in trained lifters (Wolf et al. 2025): similar gains — so full ROM through the stretch is the safe default; lengthened partials are a valid option, not a necessity.
- A 2025 meta-analysis on *regional* hypertrophy found no clear advantage for longer mean muscle length — the evidence is mixed. Treat this as a tiebreaker, not dogma.
- Head-to-head trials that favor the stretched option:
  - **Overhead cable triceps extension > pushdown** (Maeo et al. 2023, 12 weeks): more growth in the long head *and* the other heads.
  - **Seated leg curl > lying leg curl** (Maeo et al. 2021): more hamstring growth in the heads stretched by hip flexion.
  - **Standing calf raise > seated** for gastrocnemius (Kinoshita/Maeo 2023).
- **Implication:** keep `lengthenedBias` in the catalog and weight it more heavily in slot ranking; seed it from these comparisons.

### 2.8 Range of motion and tempo
- Full ROM is the default; partials at long lengths are acceptable (above).
- Repetition duration from 0.5 to 8 s gives similar growth; extremely slow reps (>10 s) appear inferior (Schoenfeld 2015). A 2025 Bayesian meta-analysis separating eccentric and concentric tempo found no clear advantage for either.
- **Implication:** don't prescribe tempo. Cue "controlled lowering, no bouncing."

### 2.9 Set techniques (drop sets, rest-pause, myo-reps, supersets)
- Drop sets: similar hypertrophy to traditional sets in a fraction of the time (Sødal et al. 2023; Havers et al. 2026, 12 studies).
- Rest-pause: possibly a small hypertrophy edge in a 2026 meta-analysis of advanced methods; it's also more fatiguing.
- Supersets: time-efficient; no growth advantage.
- **Implication:** offer these as a **time-saver mode**, not a growth booster. Count a drop set (top set + ~3 drops) as about 2–3 straight sets for volume, not 4.

### 2.10 Free weights vs machines
- Haugen et al. (2023, 13 studies): similar hypertrophy; strength gains are specific to the modality trained.
- **Implication:** equipment availability can drive switching freely. The strength *transfer* between a machine and its free-weight cousin is the uncertain part (spec §6.3 handles it with calibration).

### 2.11 Exercise variation
- Kassiano et al. (2022): planned variation can help regional growth; very frequent random rotation may hinder progress. Baz-Valle et al. (2019): random-each-session selection gave similar results and better motivation over 8 weeks.
- **Implication:** switch freely; keep a stable "anchor" exercise per slot so progress stays measurable.

### 2.12 Periodization
- Periodized vs non-periodized programs: better for strength, no clear difference for hypertrophy (Moesgaard et al. 2022). Linear vs daily undulating: no hypertrophy difference (Grgic 2017).
- **Implication:** keep the mesocycle simple — rising effort and volume, then a deload. Don't build in rep-range undulation for its own sake.

### 2.13 Deloads and time off
- Coleman et al. (2024): a full week off mid-program didn't affect hypertrophy but slightly reduced strength gains; the lead author now favors autoregulated deloads.
- Practice: athletes in a 246-person survey deloaded for ~6 days every ~5.6 weeks, usually pre-planned *plus* triggered by stalled performance or aches, keeping the same exercises (Rogerson/Bell 2024). Coaches interviewed reported 5–7 day deloads every 4–6 weeks with no single method (Bell 2022).
- Strength is largely retained for up to ~4 weeks off (Bosquet 2013).
- **Implication:** default meso 5 weeks + deload, with early triggers; deload = same exercises, ~half the sets, RIR 4.

### 2.14 Cardio
- Concurrent aerobic and strength training doesn't compromise whole-muscle hypertrophy on average (Schumann et al. 2022, 43 studies). Fiber-level data suggest running may interfere slightly more than cycling (Lundberg et al. 2022).
- **Implication:** optional cardio log; if logged, the coach can suggest cycling over running on leg days and keep hard cardio away from lower sessions.

### 2.15 Nutrition (context only — the app won't prescribe it)
- Protein around 1.6 g/kg/day captures most of the benefit for muscle gain (Morton et al. 2018), with some uncertainty about the exact breakpoint.
- In trained lifters, maintenance vs 5% vs 15% surplus over 8 weeks showed little difference in muscle thickness, while bigger surpluses added fat (Helms et al. 2023).
- **Implication:** at maintenance you can still grow; the coach can mention protein if progress stalls, nothing more.

---

## 3. What coaches and athletes actually do
- **Deloads:** 5–7 days every 4–6 weeks, mixed planned/autoregulated, exercises kept the same (Bell 2022; Rogerson/Bell 2024).
- **Rep ranges in practice:** experienced RP-app users commonly run 5–10 on heavy compounds, 8–12 on fatiguing machine work, 10–15+ on isolation, picking starting loads at the beginning of a meso and letting the algorithm progress from there (community reports).
- **Volume:** RP's own guidance treats MEV/MRV landmarks as directional and notes they vary with exercise choice; Fitbod targets 10–20 working sets per muscle per week.
- **Autoregulation is mainstream.** Every serious app now uses RIR/RPE and some form of subjective recovery input.

---

## 4. App methodology teardown

| App | Load/rep decision | Set/volume decision | Notable mechanism | Lesson for IronLog |
|---|---|---|---|---|
| **RP Hypertrophy** | Weight up a few % weekly; if the next dumbbell is too big a jump, add a rep per set instead | Continuous adjustment from pump, soreness, and workload ratings; user can always override | Every future session is shaped by past feedback | Feedback-driven sets; coarse-increment rule |
| **MacroFactor Workouts** | Target rep range + RIR; expected reps-to-failure = mid-range + RIR; performance above expectation → progress | Program generator + volume | Non-punitive; equipment-aware (recommends high reps when load steps are coarse); "reps-first vs weight-first" setting; working on smoothing strength/fatigue estimates | The cleanest model to emulate; expose a progression-preference setting |
| **Fitbod** | Per-exercise 1RM estimate + muscle strength score | Muscle recovery 0–100% per muscle; targets 10–20 sets/muscle/week | Two engines: exercise selector + capability recommender; learns from your swaps/removals | Learn from switching behavior; muscle-level state |
| **Alpha Progression** | 10RM-normalized double progression | Sets rise across 4–6 week cycles while RIR falls | Gym profiles with real plate/dumbbell inventories; auto warm-ups | Equipment inventory; warm-up generation |
| **JuggernautAI** | RPE-based, readiness-adjusted | MEV/MRV seeded from profile, adjusted weekly/block | Pre-session readiness (sleep, mood, soreness) adjusts the day's loads, for that session only | Session-scoped readiness adjustments that don't corrupt the long-term model |
| **StrongLifts / rule-based loggers** | Add fixed increment on success; deload 10% after 3 fails | Fixed | Simple and predictable | What IronLog v2 effectively became — avoid |

**Recurring user complaints worth designing against:** RP — no rest timer, coarse muscle groups (lats/upper back merged), no offline; JuggernautAI — readiness caps ignored in warm-ups, hypertrophy and strength MEV treated alike; rule-based apps — punitive deloads after a bad day.

---

## 5. A default template for your 5-day PPL + Upper + Lower
Built from the evidence above and your constraints (no barbell back squat or conventional deadlift; hack squat and RDL as lower compounds). These are **slot defaults**, every one switchable. Sets are week-1 starting points; the engine adjusts from your logged baseline and feedback.

| Day | Slot (pattern) | Default exercise | Range | Sets |
|---|---|---|---|---|
| **Push** | incline-press | Incline DB Press | 8–12 | 3 |
| | horizontal-press | Machine Chest Press | 8–12 | 2 |
| | lateral-raise | Cable Lateral Raise | 12–20 | 3 |
| | elbow-extension (overhead) | Overhead Cable Triceps Extension | 10–15 | 3 |
| | fly | Pec Deck | 12–15 | 2 |
| **Pull** | vertical-pull | Lat Pulldown | 8–12 | 3 |
| | horizontal-row | Chest-Supported Row | 8–12 | 3 |
| | rear-delt | Reverse Pec Deck | 12–20 | 2 |
| | elbow-flexion (stretched) | Incline DB Curl | 10–15 | 3 |
| | elbow-flexion | Hammer Curl | 10–15 | 2 |
| **Legs** | squat-machine | Hack Squat | 6–10 | 3 |
| | hip-hinge | Romanian Deadlift | 6–10 | 3 |
| | knee-flexion (seated) | Seated Leg Curl | 10–15 | 3 |
| | knee-extension | Leg Extension | 10–15 | 2 |
| | calf-raise (standing) | Standing Calf Raise | 10–15 | 3 |
| **Upper** | horizontal-press | Flat DB Press | 8–12 | 3 |
| | vertical-pull | Pull-Up / Assisted | 6–12 | 3 |
| | horizontal-row | Seated Cable Row | 10–12 | 2 |
| | lateral-raise | DB Lateral Raise | 12–20 | 3 |
| | elbow-extension | Triceps Pushdown | 10–15 | 2 |
| **Lower** | leg-press | Leg Press | 8–12 | 3 |
| | knee-flexion | Lying Leg Curl | 10–15 | 2 |
| | hip-extension | Hip Thrust or 45° Back Extension | 8–12 | 3 |
| | knee-extension | Leg Extension | 12–15 | 2 |
| | calf-raise | Seated Calf Raise | 12–20 | 2 |

Approximate week-1 sets per muscle (direct, then fractional total including indirect work at 0.5): chest 10 (~11), lats/upper back 11 (~12), side delts 6 (~8), rear delts 2 (~5), biceps 5 (~10), triceps 5 (~9), quads 10 (~10), hamstrings 8 (~9.5), glutes 3 (~7.5), calves 5. Arms, rear delts, and calves start lowest on purpose — they get heavy indirect work or are common stragglers, and they're the first place the engine adds direct sets if feedback allows. The engine will replace these numbers with your logged baseline as soon as it has two weeks of data.

---

## 6. What this changes in `COACH-ENGINE-SPEC.md`
1. **§5.2 Volume start point:** initialize each muscle's weekly target from your trailing 2–4 week logged fractional volume; cap progression at ~+20% per mesocycle unless feedback is all 1s. (Scarpelli 2022; +120% vs +20% trial.)
2. **§5.3 Effort:** compounds floor at 1 RIR; 0 RIR only on the final set of isolation/machine slots in the last accumulation week; one optional "calibration to failure" set per week on a safe isolation to feed the RIR-bias learner (§4.5).
3. **§3.1 / §6.1 Exercise ranking:** raise `lengthenedBias` weight in ranking; seed it from the Maeo comparisons (overhead extension, seated curl, standing calf).
4. **New §5.6 Set techniques:** optional time-saver mode with drop sets / myo-reps / supersets; drop set counts as 2.5 straight sets, myo-rep cluster as 2.
5. **Rest timer:** floor 90 s for hypertrophy work (keep the adaptive timer's upward adjustments).
6. **§5.4 Deloads:** default 5-week accumulation + deload; deload keeps the same exercises (practice data); early triggers unchanged.
7. **Program templates:** ship §5 above as the default PPL+UL template.
8. **Optional cardio log:** used only by the coach for scheduling advice.
9. **Readiness check (JuggernautAI lesson):** a pre-session check may lower *that session's* targets (e.g. +1 RIR) but must never feed back into the strength model as if it were performance.
10. **Progression preference setting (MacroFactor lesson):** `reps-first` / `balanced` / `load-first`, mapping to where in the rep range the prescription aims.

---

## 7. Sources
Pelland JC et al. *The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains.* Sports Med 2025/2026.
Remmert JF et al. *Meta-Regressions of the Effect of Per-Session Volume on Hypertrophy and Strength.* SportRxiv 2025.
Currier BS et al. *ACSM Position Stand: Resistance training prescription for muscle function, hypertrophy, and physical performance in healthy adults.* MSSE 2026.
Scarpelli MC et al. *Muscle hypertrophy response is affected by previous resistance training volume in trained individuals.* JSCR 2022;36(4):1153–1157.
Robinson ZP et al. *Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy.* Sports Med 2024;54:2209–2231.
Refalo MC et al. *Similar muscle hypertrophy following eight weeks of resistance training to momentary muscular failure or with repetitions-in-reserve in resistance-trained individuals.* J Sports Sci 2024;42(1):85–101.
Halperin I et al. *Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise.* Sports Med 2022.
Plotkin D et al. *Progressive overload without progressing load?* PeerJ 2022;10:e14142.
Singer A et al. *Give it a rest: a systematic review with Bayesian meta-analysis on inter-set rest interval duration and muscle hypertrophy.* Front Sports Act Living 2024.
Wolf M et al. *Lengthened partial repetitions elicit similar muscular adaptations as full ROM repetitions in trained individuals.* PeerJ 2025.
Strey B et al. *Muscle hypertrophy from partial repetition at long vs. short muscle length: a systematic review and meta-analysis.* Sport Sci Health 2026;22:33.
Varovic D et al. *Does muscle length influence regional hypertrophy?* Int J Sports Med 2025.
Maeo S et al. *Greater hamstrings muscle hypertrophy but similar damage protection after training at long versus short muscle lengths.* MSSE 2021. — *Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position.* EJSS 2023.
Kinoshita M, Maeo S et al. *Triceps surae muscle hypertrophy is greater after standing versus seated calf-raise training.* Front Physiol 2023.
Schoenfeld BJ et al. *Effect of repetition duration during resistance training on muscle hypertrophy.* Sports Med 2015.
Sødal LK et al. *Effects of Drop Sets on Skeletal Muscle Hypertrophy.* Sports Med Open 2023.
Haugen ME et al. *Effect of free-weight vs. machine-based strength training.* BMC Sports Sci Med Rehabil 2023.
Kassiano W et al. *Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains?* JSCR 2022. — Baz-Valle E et al. PLoS ONE 2019.
Moesgaard L et al. *Effects of Periodization on Strength and Muscle Hypertrophy in Volume-Equated Resistance Training Programs.* Sports Med 2022. — Grgic J et al. PeerJ 2017.
Ramos-Campo DJ et al. *Efficacy of Split Versus Full-Body Resistance Training on Strength and Muscle Growth.* JSCR 2024.
Coleman M et al. *The effects of a one-week deload period during supervised resistance training on muscular adaptations.* PeerJ 2024;12:e16777.
Bell L et al. *Coaches' perceptions, practices and experiences of deloading in strength and physique sports.* Front Sports Act Living 2022. — Rogerson D, Bell L et al. *Deloading Practices in Strength and Physique Sports: A Cross-sectional Survey.* Sports Med Open 2024.
Schumann M et al. *Compatibility of concurrent aerobic and strength training.* Sports Med 2022. — Lundberg TR et al. Sports Med 2022.
Morton RW et al. Br J Sports Med 2018. — Helms ER et al. *Effect of Small and Large Energy Surpluses…* Sports Med Open 2023.
App documentation: RP Hypertrophy help centre (progression and set-adjustment articles); MacroFactor Workouts help centre (Smart Progression, RIR, high-rep recommendations); Fitbod algorithm blog and help centre; Alpha Progression site; JuggernautAI help centre and reviews; StrongLifts and KeyLifts support docs.
