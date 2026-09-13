# IronLog → Autonomous AI Hypertrophy Trainer
## Research & Gap Analysis, September 2026

Companion document to `FEATURES.md`. That document describes what the app *is*. This one describes the distance between that and what you want, why the distance exists, and what the rest of the field has already solved.

Written to be handed to Claude Code alongside `FEATURES.md`.

---

## 0. The one-sentence diagnosis

**IronLog is a well-built *exercise-level session tracker with rules bolted on*. What you're describing is a *muscle-level training system with a program layer on top and an agent in the middle* — and almost every problem on your list is a downstream symptom of those three missing layers rather than a bug in the logic you already have.**

Your progression engine is genuinely sophisticated — median-based targets, severity-scaled back-offs, equipment-aware increments, an undershoot fast-track, global cross-day history. That work is not wasted. But it all operates on a single axis: *this exercise name, versus its own last session*. Every complaint you listed is something that axis structurally cannot express.

---

## 1. Root-causing your five complaints

### 1.1 "Progression is non-optimized, most workouts under 10 reps, following a standard rather than my performance"

There are three separate mechanisms stacking here, and they compound.

**(a) Reset-to-`repMin` on every weight bump.** Per §4 of FEATURES.md, when ≥75% of sets hit the ceiling, you bump weight and reset reps to `repMin`. That means the *steady state* of every exercise is "living at the bottom of its rep range, climbing one rep at a time, then getting knocked back to the floor." If `repMin` is 6 on compounds, you spend the majority of your training life at 6–8 reps by design.

**(b) The descending-rep schedule subtracts on top of that.** §5 has target RPE climb 7.5 → 9.5 across sets while weight stays fixed, and then *also* declines the displayed rep target by roughly one rep per RPE point, floored at 3.

This is the most consequential design flaw in the current system, and it's worth being precise about why. The rep decline is a **correct description** of what happens physiologically and an **incorrect prescription**. If weight is fixed and you go from RPE 7.5 to RPE 9.5, reps fall *automatically* — that's what the RPE climb means. You don't need to also tell the user to stop early. By printing a declining number as a *target*, the app converts an expected outcome into a ceiling. Set 4 at "5 reps" gets logged as 5 reps even when the honest RPE-9.5 answer was 7.

The stated motivation in FEATURES.md — that identical rep targets across climbing RPE were "physiologically incoherent" — was the right observation with the wrong fix. The right fix is to stop prescribing a fixed number at all and prescribe **a range plus an RIR target**: "8–12 @ 2 RIR." Then fatigue expresses itself in the logged reps instead of being pre-empted by the display.

**(c) The weight bump is a step function with a fixed size.** ~5% rounded to 2.5lb (or flat 5lb for dumbbells), triggered by a binary ≥75% hit-ratio. The only performance-sensitivity in the whole ladder is that hit-ratio threshold plus the undershoot fast-track. Whether you beat the target by one rep or by five, you get the same 5%.

That is precisely "following some standard rather than being based on my performance." The standard is ACSM's 2–10% guidance, which is a population-level recommendation, not an individualized prescription.

**What the field does instead — invert a performance model rather than apply a rule.** Alpha Progression normalizes every set to an estimated 10RM (a blend of Brzycki and Epley extrapolated to ten reps rather than one) so that sets with different rep counts are directly comparable, and drives its per-set recommendations from that. Dr. Muscle maintains a per-exercise 1RM estimate, progresses against it every session, and triggers a deload when the estimate falls. Fitbod maintains both a per-exercise 1RM estimate and an aggregated per-muscle strength score.

You already have `calcE1RM_RPE`. The change is *what you use it for*. Right now it powers a display quirk. It should be the spine of the whole progression engine:

```
target_load = invert_e1RM(current_e1RM_estimate, target_reps, target_RIR)
```

Progression then becomes continuous and intrinsically performance-driven — your e1RM moved 2%, so your load moves 2% — rather than a threshold that fires or doesn't. The 10RM anchor is worth considering over 1RM specifically because you train in the 5–20 range; extrapolating a 1RM from a set of 15 is far noisier than anchoring at 10.

**And the rep-range problem is also a *program-level* problem, not only a progression problem.** Even a perfect progression engine will keep you under 10 reps if every exercise's `repMin`/`repMax` is set low. See §1.5.

---

### 1.2 "Static reps and weights which seem difficult"

Two causes:

**Fixed load across all sets of an exercise.** §4 holds weight constant for every set. Combined with the climbing RPE target, set 4 is meaningfully harder than set 1 with no mechanism to relieve it. The only in-session adaptation is the first-set struggle detector (§5), whose trigger conditions are narrow: set 1 specifically, >15% rep shortfall or RPE ≥9.5. If set 2 or set 3 falls apart, nothing happens.

**No set-structure vocabulary.** The app can express exactly one thing: N straight sets at a fixed load. It cannot express a top-set-plus-back-offs, a reverse pyramid, a terminal AMRAP set, myo-reps, a drop set, or rest-pause. Dr. Muscle ships rest-pause and daily undulating periodization as first-class features. Fitbod deliberately varies intensity between sessions — some heavier and lower-rep, some lighter and higher-rep — rather than pushing the same pattern every time.

**Recommended changes:**
- **Per-set autoregulation.** After each logged set, recompute the next set's target load from the actual RIR just reported, not from a schedule. RPE 9.5 on set 2 when 8 was targeted → drop set 3's load, don't just drop its printed rep count.
- **Terminal AMRAP.** Make the last set of each exercise an open "reps to target RIR" set. This is the single highest-value data point you can collect: it gives you a clean e1RM reading every session and removes the ceiling that's suppressing your rep counts.
- **A set-structure enum** on the exercise slot (`straight` / `top-set+backoff` / `reverse-pyramid` / `myo-rep` / `drop`), so progression logic branches on structure. This is also the clean way to finally merge the ladder-set branch: the reason it broke the stagnation detector is that the detector has no concept of set heterogeneity. Give sets an explicit *role*, and the detector stops misfiring.

---

### 1.3 "Inability to converse with the AI as if it's a trainer"

This is an architecture gap, not a prompt gap.

**Current state:** five distinct Claude calls, each with its own purpose-built prompt, each stateless. Only Redesign Day is multi-turn, and it resends its own private transcript. Consequences:

- There is no single entity that knows what it told you last week. `ai_review` doesn't know what `ai_presession_check` decided this morning.
- Each call sees a narrow slice. `ai_review` gets the current session plus five prior on that day. It cannot see your volume tab, your e1RM trends, your mesocycle state, your bodyweight trend, or your swap history — all of which exist in the Sheet.
- You cannot ask "why?" There's no interface for interrogating a recommendation.
- There is no durable coach memory. Injuries, preferences, equipment quirks, and past decisions live in `EXERCISE_CONSTRAINTS` as a hardcoded string.

**What a real conversational coach looks like in 2026.** The category has a name now. SensAI runs an actual LLM conversation with persistent memory that carries injuries, equipment and preferences between sessions, accepts mid-session changes in plain language, and layers in recovery context from wearables. Ray is a voice-guided LLM trainer that adapts on the fly and remembers injuries and preferences over time. Both are explicitly positioned against the "generates a plan then leaves you alone" model.

**Target architecture: one agent, many tools.** Replace five prompts with one `ai_coach` action that has tool access:

| Tool | Purpose |
|---|---|
| `get_exercise_history(name, n)` | Existing `loadAllHistory` slice |
| `get_muscle_summary(muscle, weeks)` | Volume, hard sets, e1RM trend, feedback scores |
| `get_program()` / `get_mesocycle_state()` | Current program + week/deload |
| `propose_program_change(diff)` | Returns a diff for approval — never auto-applies |
| `apply_session_override(diff)` | Today-only, routes through existing override path |
| `write_coach_note(text)` | Appends to durable coach memory |

Plus a **Coach Memory** tab in the Sheet: durable facts the agent writes and reads on every call — injuries and their history, exercises you hate, why the app pulled your incline press back in March, your stated goal for this block. Inject it as context every time. This is the thing that makes it feel like a trainer instead of five disconnected bots.

**Infrastructure warning.** Your current backend is GET-only Apps Script with parameters in the query string, deployed `ANYONE_ANONYMOUS`. For a conversational agent this breaks in three ways:

1. **Query-string length.** Multi-turn transcripts plus tool results will blow past URL limits fast.
2. **No streaming, 6-minute execution ceiling.** An agentic tool-use loop is exactly the workload Apps Script is worst at, and `UrlFetchApp` is synchronous.
3. **Cost exposure.** An unauthenticated one-shot review endpoint is a modest risk. An unauthenticated *conversational* endpoint billed to your Anthropic key is an open tap.

**Recommendation: move the AI layer off Apps Script** to a small serverless function (Cloudflare Worker or Vercel) that holds the API key, handles POST, streams, and runs the tool loop — while Apps Script remains the data layer. This is a bounded change and it unblocks everything in §1.3 and §1.5.

---

### 1.4 "Progression tied to exact exercises rather than a holistic understanding of the muscle"

This is the deepest gap and the most valuable to fix.

**Current state:** `MUSCLE_GROUPS_MAP` maps each exercise name to exactly one group. Progression threads are keyed on exercise name. A hard set credits 1.0 to one muscle and 0.0 to everything else.

**What that costs you:**
- Bench press contributes nothing to triceps or front delts. Your triceps volume reads artificially low; your chest volume reads as the whole story.
- Swapping Incline DB Press → Incline Barbell Press starts a cold progression thread with no history, even though it's the same stimulus to the same tissue at a different load scale.
- Nothing in the system can answer "is my chest actually growing," only "did Incline DB Press go up."
- The volume ramp (§9) increases sets one exercise at a time with a cap, which is a proxy for muscle-level allocation rather than the real thing.

**Two live approaches in the field, and they disagree — you should know why.**

*Fractional counting.* The 2025 Pelland/Zourdos dose-response meta-regressions classified every contributing set as direct or indirect and compared three counting methods. The fractional method — indirect sets weighted at 0.5 — produced the best-fitting dose-response models, and the authors concluded that distinguishing direct from indirect sets is essential for predicting adaptation. Their marginal estimate was roughly a 0.24% hypertrophy increase per additional set at an average fractional weekly volume of about 12 sets.

*Prime-mover-only.* RP explicitly rejects fractional math. Their stated position is that they count only sets where the target muscle is the prime mover, or isolation work for that muscle — and that their published landmark numbers are already *deflated* to account for indirect stimulus. So "18 sets is triceps MRV" means 18 direct sets, with pressing volume already priced in.

Both are internally consistent. What is *not* consistent is your current setup: you use single-muscle attribution (RP's method) with MEV/MRV bands that are user-editable and probably not deflated the way RP's are. You're running RP's counting with un-RP'd landmarks.

**Recommendation: go fractional, because you're building a model, not a book.** RP avoids fractional math to keep it doable on paper. You have a computer.

Change the exercise data model from `group: "Chest"` to a **contribution vector**:

```js
{ name: "Incline Dumbbell Press",
  contributions: { chest: 1.0, frontDelt: 0.5, triceps: 0.5 },
  pattern: "horizontal-press-incline",
  lengthenedBias: 0.7,
  equipment: "dumbbell" }
```

Then build the layer that doesn't exist today:

**A muscle-level model, sitting above the exercise level.** Per muscle, per week, maintained continuously:
- fractional hard sets
- normalized volume load (sets × reps × load, or e1RM-weighted stimulus)
- aggregate strength trend across every exercise touching it
- subjective feedback scores (see §1.6)
- current position between MEV and MRV
- estimated recovery state

Then split the decision hierarchy:

| Layer | Decides |
|---|---|
| **Muscle** | How many sets this muscle gets this week; whether to add, hold, cut, or deload |
| **Slot** | Which movement pattern fills each slot; when to rotate |
| **Exercise** | Load and reps for each set of that specific movement |

Right now all three collapse into `computeTarget()`.

**Movement-pattern equivalence classes.** You already got burned by naive merging — Smith Machine Hack Squat folding into Hack Squat and corrupting the trend. The fix is not to merge identities; it's to **link them with a conversion factor**. Same `pattern`, separate trends, but:
- a swap inherits a *seeded* starting load via the ratio between the two exercises (estimated from your own history once both exist, seeded from a default before that),
- and both feed the same muscle-level stimulus pool.

You get history continuity across swaps without the identity corruption that bit you before.

---

### 1.5 "No clear programs in the app, just days I've put in"

**Current state:** five hardcoded days in `DEFAULTS` plus accumulated custom days. Critically, **the program lives in `localStorage`, not the Sheet.** There is no Program entity. Clearing your browser wipes your programming. Sharing is impossible by construction.

**What the field ships.** RP offers 45+ premade templates plus a custom meso builder where you state which muscles to prioritize and it builds the program around that, supporting 2–6 training days per week. Alpha Progression generates a plan from your goal, experience, training frequency and prioritized muscle groups, with full manual editing. Both let you save a configured mesocycle as a reusable template.

**What you need:**

1. **A Program entity persisted server-side**, not in localStorage:
   ```
   Program { name, daysPerWeek, splitType, mesoLength,
             musclePriorities{}, days[ Day{ slots[] } ],
             progressionPolicy }
   ```

2. **Exercise *slots*, not exercise instances.** A slot is a specification:
   ```
   Slot { pattern: "horizontal-press",
          lengthenedBias: "preferred",
          equipment: ["machine","dumbbell"],
          repRange: [8,12], sets: 3, role: "primary" }
   ```
   The app fills it from `EXERCISE_REPO` against your equipment and your `EXERCISE_CONSTRAINTS`. **This is the thing that makes a program shareable** — the slot is portable across people and gyms; the exercise instance is not. It also gives rotation a natural home: rotate *within* a slot, and the slot's history carries.

3. **A template library keyed on days available.** You don't need 45. Six to ten covers it: 3/4/5/6-day full-body, upper-lower, PPL, PPL+UL (your current split), plus emphasis variants. Include the constraint set — no back squat, no conventional deadlift, no unsupported bent-over row — as a *profile-level* filter rather than a hardcoded prompt string, so a shared template adapts to whoever loads it.

4. **Deliberate rep-range assignment per slot.** This is the structural fix for your "everything's under 10 reps" complaint. Assign heavy compound slots 5–8, secondary compounds 8–12, isolation 12–20. The evidence supports the breadth: meta-analyses find hypertrophy is essentially load-independent across roughly 5–30 reps when sets are taken near failure and volume is equated, while strength gains do favour heavier loads. RP's own working-set definition spans 30–85% of 1RM and 5–30 reps at 0–4 RIR. You are currently exploiting a narrow slice of an interval the literature says is flat.

5. **Multi-user, if you want to share it.** Needs a real user key — which brings us to the deferred auth decision.

---

### 1.6 The gap you didn't list, which may matter most

**You collect no per-muscle subjective feedback, so your volume progression can't be autoregulated.**

You have per-set RPE and per-exercise free-text notes. You do not have: pump quality, soreness recovery timing, workload perception, or joint pain — per muscle, per session.

That single omission is why §9's volume ramp is a fixed schedule (MEV → MRV across six weeks). Which is the *same complaint you made about load progression*, applied to volume: following a standard rather than your performance.

**RP's published set-progression algorithm** — the mechanism that makes their app feel adaptive — is a two-factor per-muscle assessment of the previous week:

*Soreness recovery (1–4):* no soreness / healed well before next session / healed just in time / still sore.
*Performance (1–4):* exceeded targets easily / hit targets / struggled / couldn't match last week.

Then:
- 1s on both → **add 2–3 sets**
- 2s, or a mix of 1s and 2s → **add 1 set**
- any 3 plus soreness 3–4 → **hold volume**
- performance 4 → **recovery session or deload**

That's it. That's the whole thing. It is not complicated and it is a strictly better mechanism than a calendar ramp.

They also publish a per-session MEV check — pump 0–2, muscle challenge 0–2, soreness 0–2, where 0–1 total means you're below MEV, 2–4 at it, 5–6 above.

Their support documentation is explicit that the same feedback drives load too: weight rises a few percent weekly, and **when the next available load increment would be too large a jump — the classic 10lb → 15lb dumbbell problem — the app adds a rep to each set instead.** That is a cleaner solution than your current dumbbell hack of extending the rep ceiling by 2, because it's derived from the actual available loads rather than a heuristic about equipment type.

**Recommendation:** add a post-session per-muscle card (3 taps: pump, soreness-recovery, workload) and a pre-session soreness check. It's maybe 15 seconds of user time per session and it converts your entire volume engine from scheduled to autoregulated. Notably, your existing `ai_review` pathway is a natural place to *infer* some of this from notes and RPE when the user skips the card.

---

## 2. Competitive teardown

### RP Hypertrophy
- **Progression:** load rises a few percent weekly; if the next increment is too coarse, adds reps instead. Sets driven by per-muscle pump/soreness/workload feedback, recalculated continuously so every future session is shaped by past feedback. RIR ramps across the mesocycle (commonly 3 → 0).
- **Programming:** 45+ templates, 2–6 days/week, custom meso builder driven by stated muscle priorities. 250+ technique videos.
- **Volume model:** MV/MEV/MAV/MRV, prime-mover counting only, landmarks pre-deflated for indirect work.
- **Known weaknesses (from user reviews):** unusable offline; coarse muscle granularity (users report lats and mid-back collapsed into one group); no fractional set tracking; no rest timer; awkward set reordering; no calendar view of past sessions.
- **Relevance to you:** the volume-feedback loop is the single biggest thing to copy. Several of their weaknesses are things IronLog already beats them on.

### Fitbod
- **Per-muscle recovery percentage, 0–100%**, computed from logged sets/reps/weight, with a post-session muscle heat map and manual override. Full recovery assumed at 6–7 days; targets 48–72h between sessions for a muscle.
- **`mStrength`** — a per-muscle-group relative strength score — plus per-exercise 1RM estimates and an aggregated overall strength score.
- **Exercise selection** scores its full library per session on recovery status, goal fit, equipment, variety, and learned preferences from your skips/swaps/replacements.
- **Deliberate intensity undulation** between sessions rather than monotonic overload.
- **Relevance to you:** this is the reference implementation of the muscle-level model in §1.4. The recovery-percentage abstraction in particular is a clean, legible primitive.

### Alpha Progression
- **10RM normalization** via blended Brzycki/Epley, displayed next to every set so performance is comparable across different rep counts.
- **Set progression and weight progression as explicit, separate axes**: sets increase week to week within a 4–6 week cycle; load increases while RIR falls from ~3 to 0; deload drops load hard and goes to ~5 RIR for resensitization.
- **Gym profiles with plate/dumbbell inventory** plus a plate calculator, so recommendations only ever propose loads you can actually make.
- **Automatic warmup calculation** from exercise type, first working-set reps, experience level and available weights.
- **Per-muscle volume analytics** (sets per muscle over trailing windows), and PR tracking across weight, reps, volume, and per-muscle-group load.
- **Relevance to you:** the equipment/available-load model and the 10RM normalization are both directly portable and would each fix a real problem.

### Dr. Muscle
- Per-exercise 1RM as the central state variable; progression measured against it every session; **automatic deload when the estimate declines** (cuts the 1RM estimate ~10%, or sets ~50%).
- Ships rest-pause, daily undulating periodization, RIR-based RPE, and strength-phase switching.
- **Relevance to you:** demonstrates that a single well-maintained strength estimate per exercise can carry both progression *and* fatigue detection, replacing a lot of ad-hoc rules.

### SensAI / Ray (the conversational tier)
- Genuine LLM conversation with **persistent memory across sessions** — injuries, equipment, preferences — rather than a scripted chatbot.
- Plain-language in-session modification: shorten it, my knee hurts, swap the lunges.
- SensAI additionally ingests HRV, sleep and resting HR via HealthKit and programs from recovery context rather than logs alone. Ray is voice-first and adapts mainly from what you tell it.
- **Relevance to you:** this is the §1.3 target. Note that both are thin on the deep progression math you've already built — nobody currently combines a rigorous RP-grade progression engine with a real conversational agent. **That's your opening.**

### Boostcamp
- Curated named programs from real coaches, per-muscle volume heat map, mostly free.
- **Relevance to you:** the program-library model, and evidence that shareable programs are the feature that turns a personal tool into a product.

---

## 3. Evidence base worth encoding

Things the current engine either contradicts or doesn't exploit.

**Rep range is broad and flat.** Meta-analyses consistently find no meaningful hypertrophy difference across roughly 5–30 reps when effort is high and volume equated; strength specifically favours heavier loads. Schoenfeld's 2017 meta found equivalent CSA gains across 2–4, 8–12, and 25–35 rep conditions at matched volume. Practical implication: your rep ranges should be chosen for *exercise suitability and joint stress*, not because a band is magic — and your app should be comfortable prescribing sets of 15–20 on isolation work.

**Proximity to failure matters for size, not for strength.** The 2024 Robinson/Zourdos meta-regressions found hypertrophy improves as sets terminate closer to failure, while strength gains were similar across a wide RIR range. Implication: your ascending 7.5 → 9.5 RPE schedule is directionally right. But it should be a *floor on effort*, not a cap on reps — which is exactly the §1.1(b) fix.

**Volume dose-response is real but shallow, and counting method matters.** Pelland et al.'s marginal estimate was around 0.24% additional hypertrophy per added set at ~12 fractional weekly sets. Two implications: (i) fractional counting is the better-fitting model, and (ii) the returns per set are small enough that *fatigue cost* should be weighted heavily — adding sets indefinitely is not free.

**Autoregulation beats fixed loading.** A systematic review and meta-analysis found autoregulated methods outperformed fixed loading for maximal strength, with a pooled effect around 0.64. Validates the direction you're already heading.

**Long-muscle-length training has an edge, though it's contested.** A 2025 meta-analysis found partials at long muscle length produced greater hypertrophy than at short length (ES ≈ 0.28). Wolf et al. 2025 found lengthened partials produced adaptations similar to full ROM in trained lifters, and at least one systematic review argues lengthened partials are a trend without support when full ROM is available. Practical implication: not "prescribe partials," but **add a `lengthenedBias` score to exercises and use it as a tiebreaker in slot filling.** Low cost, defensible either way the evidence lands.

**MEV/MRV are heuristics, not measurements.** Even RP frames them as directions rather than dogma, and notes the values shift with exercise selection — heavy compounds carry lower MEV and MRV but higher stimulus per set. Your app should treat its landmark bands as *priors to be updated from the user's own feedback data*, not as fixed user-editable constants. That's an ideal use for the muscle-level model: after a few mesocycles you can estimate his actual landmarks from where performance started degrading.

---

## 4. Capability matrix

| Capability | IronLog today | Field standard | Gap |
|---|---|---|---|
| Per-set load/rep recommendation | ✅ rule-based | ✅ model-based | **Medium** — invert e1RM instead |
| Cross-day exercise history | ✅ | ✅ | None — you're ahead of RP here |
| Autoregulated back-off | ✅ severity-scaled | ⚠️ mostly cruder | **None — you're ahead** |
| RPE/RIR logging | ✅ per set | ✅ | None |
| Per-muscle volume tracking | ⚠️ single-muscle attribution | ✅ fractional / weighted | **High** |
| Per-muscle recovery state | ❌ | ✅ (Fitbod %) | **High** |
| Per-muscle subjective feedback | ❌ | ✅ (RP core loop) | **High** |
| Autoregulated *set* progression | ❌ calendar ramp | ✅ feedback-driven | **High** |
| Muscle-level strength trend | ❌ | ✅ (mStrength) | **High** |
| Program entity + templates | ❌ | ✅ 45+ (RP) | **High** |
| Exercise slots / rotation | ❌ | ✅ | **High** |
| Equipment/available-load model | ⚠️ hardcoded increments | ✅ gym profiles | **Medium** |
| Set-structure variety | ❌ straight sets only | ✅ | **Medium** |
| Conversational coach w/ memory | ❌ 5 stateless prompts | ✅ (SensAI, Ray) | **High** |
| Program sharing / multi-user | ❌ | ✅ | **High** |
| Wearable / recovery ingest | ❌ | ✅ (SensAI) | Low priority |
| Offline resilience | ✅ dual-layer draft | ⚠️ RP is criticized here | **None — you're ahead** |
| Rest timer | ✅ adaptive | ❌ RP has none | **None — you're ahead** |
| Calendar / session history view | ✅ | ⚠️ RP users complain | **None — you're ahead** |
| Auth / security | ❌ anonymous | ✅ | **Blocking** |

**Five things you already beat the market on.** Don't rebuild those. The adaptive rest timer, the dual-layer draft safety net, the calendar view, the global cross-day exercise history, and the severity-scaled autoregulated back-off are all genuinely better than what RP ships.

---

## 5. The blocking dependency nobody wants to talk about

`FEATURES.md` §1 records the unauthenticated Apps Script endpoint as a "known, deliberately-unfixed gap." That was a defensible call for a single-user logger.

**Three of your five goals are now blocked by it:**

1. **Programs server-side** — required for the Program entity, because localStorage can't be the source of truth for something you want to share.
2. **Sharing with other people** — requires per-user data partitioning, which requires identity.
3. **A conversational agent** — an open, unauthenticated LLM endpoint billed to your key is a materially different risk profile than an open logging endpoint.

This doesn't need to be elaborate. A per-user token in the URL plus a token→sheet-range mapping in Script Properties covers it. But it needs to happen before, not after, the three features above.

---

## 6. Phased roadmap

Ordered so each phase is independently shippable and unblocks the next.

### Phase 0 — Unblock (small, do first)
- Per-user token auth on the Apps Script endpoint.
- Move program state from `localStorage` into a `Programs` sheet tab.
- Stand up a serverless function for the AI layer (POST, streaming, key custody, tool loop); Apps Script stays the data layer.

### Phase 1 — Fix the rep suppression (highest ratio of impact to effort)
- Replace fixed rep targets with **rep range + RIR target** per set. Kill the prescriptive descending-rep display; keep the ascending RIR schedule.
- Make the last set of each exercise a **terminal AMRAP to target RIR**.
- Stop resetting to `repMin` on weight bumps — re-enter the range at the point the model says preserves the target RIR.
- Rewrite `computeTarget()` to invert an e1RM (or 10RM) estimate rather than apply a threshold rule.
- **You will feel this one inside two sessions.**

### Phase 2 — The muscle layer
- Migrate `MUSCLE_GROUPS_MAP` to per-exercise contribution vectors; backfill historical sessions.
- Recompute the Volume tab on fractional sets.
- Add a per-muscle state record: fractional sets, normalized volume load, aggregate strength trend, recovery estimate.
- Add `pattern` and `lengthenedBias` tags to `EXERCISE_REPO`.

### Phase 3 — The feedback loop
- Post-session per-muscle card: pump, soreness recovery, workload (3 taps).
- Pre-session per-muscle soreness check.
- Implement the RP-style two-factor set progression (soreness 1–4 × performance 1–4) at the **muscle** level, replacing the calendar-based volume ramp in §9.
- Make MEV/MRV bands learned priors rather than fixed constants.

### Phase 4 — The program layer
- Program entity with slots rather than exercise instances.
- 6–10 templates keyed on days available, including your PPL+UL.
- Constraints (no back squat, no conventional deadlift, no unsupported bent-over row) move from a prompt string to a profile-level filter.
- Slot rotation policy, with history carrying at the slot level.
- Equipment/available-load inventory; adopt RP's "if the next load jump is too coarse, add a rep instead" rule and retire the dumbbell rep-ceiling hack.

### Phase 5 — The coach
- Single `ai_coach` agent with the tool set from §1.3.
- Coach Memory tab, injected on every call.
- Retire the five separate actions into tools the agent calls — keeping Redesign Day's approve-before-apply discipline as the default for anything that changes the program permanently.
- Then merge the ladder-set branch: set *roles* make the stagnation detector safe.

### Phase 6 — Sharing
- Multi-user data partitioning.
- Template export/import.
- Optional: wearable recovery ingest.

---

## 7. Open decisions for you

1. **Fractional or prime-mover-only volume counting?** I've recommended fractional. If you go prime-mover-only, you must deflate your MEV/MRV bands the way RP does, and right now you haven't.

2. **1RM or 10RM as the normalization anchor?** 10RM is more stable in the rep ranges you actually train, and it's what Alpha Progression uses. 1RM is the more common convention and easier to talk about.

3. **How much does the agent auto-apply?** Today `ai_review` auto-applies holds and `ai_redesign_day` requires approval. With an agent that can touch more, you need a clear policy — my suggestion: session-scoped changes auto-apply and are listed; program-scoped changes always require approval.

4. **Does the app keep being RP-framework-shaped?** You've followed RP closely and it's served you. But RP's model is one opinionated school. Fitbod's recovery model, Alpha Progression's set/weight axis separation, and the raw dose-response literature don't perfectly agree with it. Worth deciding whether IronLog is "RP, automated" or "the evidence, automated" — they diverge on volume counting, on rep-range breadth, and on how rigid a mesocycle should be.

5. **Ab/core.** Currently excluded by design, with the AI allowed to nag about it. That's a coherent personal choice but it's an odd hole in a shareable program. Consider making it a profile toggle rather than a global exclusion.

6. **Single-user tool or product?** Phases 0–5 are worth doing either way. Phase 6 only makes sense if the answer is product — and it changes how much you invest in template quality and onboarding.

---

## 8. Sources

**App documentation**
- RP Hypertrophy help centre — progression algorithm, deloads, navigation: help.rpstrength.com
- RP Strength — training volume landmarks, set-progression algorithm, working-set definition: rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth
- RP Hypertrophy app store listings (Apple/Google) — features and user-reported weaknesses
- Fitbod help centre and engineering blog — algorithm, muscle recovery, mStrength: help.fitbod.me, fitbod.me/blog/fitbod-algorithm
- Alpha Progression — app listing, glossary on progression, blog on 10RM normalization: alphaprogression.com
- Dr. Muscle — feature documentation and algorithm description: dr-muscle.com
- SensAI and Ray — 2026 conversational AI coach reviews and comparisons: sensai.fit, rayfit.com
- Boostcamp — 2026 hypertrophy app comparison: boostcamp.app/best/hypertrophy

**Literature**
- Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. *The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains.* Sports Medicine, 2025. doi:10.1007/s40279-025-02344-w
- Robinson ZP, Pelland JC, Remmert JF, Refalo MC, Jukic I, Steele J, Zourdos MC. *Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy.* Sports Medicine 54:2209–2231, 2024. doi:10.1007/s40279-024-02069-2
- Schoenfeld BJ et al., 2017 meta-analysis on load and hypertrophy (PMID 28834797)
- Wolf M et al. *Lengthened partial repetitions elicit similar muscular adaptations as full range of motion repetitions during resistance training in trained individuals.* PeerJ 13:e18904, 2025
- 2025 systematic review/meta-analysis on partial ROM at long vs. short muscle length (PROSPERO CRD42024626784)
- Systematic review and meta-analysis on auto-regulation vs. fixed loading for maximal strength, PMC7994759
- Stronger by Science, *The "Hypertrophy Rep Range" – Fact or Fiction?*
