# IronLog Coach Brain (engine v4)
### November 2026 · replaces the load-only prescription loop of v3

Every number on the Train screen and everything the coach says now comes from one place, `engine/brain.js`. It plans a whole session at once across seven levers instead of nudging weight and reps on a schedule, and the AI coach operates it through tools instead of sitting next to it.

---

## 1. Why it changed

**What the log showed (Mar 27 – Nov 3, 2026, 49 sessions, duplicate rows removed):**

| Finding | Detail |
|---|---|
| Breaks | Three gaps of 48, 44 and 31 days: about 17 of 32 weeks with no logged training. Every return restarted the rotation at Push. |
| Volume | Even in weeks you trained, most muscles averaged under 10 hard sets: side delts ~4, rear delts ~2, lats ~5, upper back ~5, quads ~6, hamstrings ~6, glutes ~5, calves ~2. Chest (~9) and triceps (~11) got the most. |
| Rotation | Push was trained 17+ times, Pull 3–4 times. A 5-day rotation at ~3 sessions a week trains each muscle about once every 9–10 days. |
| Time | The last two Push days ran out of time and the lateral raise (the only side-delt work) was the exercise skipped both times. |
| Effort | Not the problem: rated sets averaged 1–2 reps in reserve. |
| Strength | Main lifts roughly flat over 7 months (bench e1RM ~226 → 234, overhead press and incline DB slightly down). |
| Prediction | "Same reps as last time" predicted your next session better (±1.4 reps) than the v3 strength model using your logged reps-in-reserve (±2.3); your RIR ratings are too noisy to steer by. |

**What the code did:**
- Set counts never changed. v3 dropped v2's per-muscle feedback loop and the planned volume model (Phase 6) was never built.
- Load and reps came from a strength estimate that was nudged up ~1% per week before every session, plus a calendar effort ramp (3→2→2→1→1 RIR). Progress happened because a week passed, not because you earned it.
- The AI coach was a separate brain: it saw a snapshot, could propose a few today-only edits or hard-code numbers, and couldn't change how the engine progresses you.

---

## 2. The levers (per exercise, `engine/progress.js`)

Each session every exercise gets one lever, chosen from what you did last time:

| Lever | When | What happens |
|---|---|---|
| **+1 rep** (add-reps) | Last time was inside the rep range | Same weight, one more rep on each set (two if it was easy: 3+ left when the target was ≤1). Sets that failed last time hold. |
| **+weight** (add-load) | Top set reached the top of the range | Smallest sensible step (≤5% compounds, ≤10% isolation, at least one rung), reps restart near the middle of the range. |
| **coarse** | Next rung is too big a jump (20 → 25 lb dumbbells, coarse stacks) | Extra reps at the same weight, up to 3 past the range, then the jump (RP's rule). |
| **Hold** | Set 1 failed last time, or under the range once, or 17–28 days away | Same numbers; owning them is the progress. |
| **Back off** | Under the range two sessions in a row | Lighter, back into the range. |
| **Recalibrate** | 29+ days away | ~0.8% lighter per week past two weeks (max 10%), +1 rep in the tank, set 1 checks it. One fewer set only if the *muscle* has been idle that long. |
| **Intensify** | No improvement for 2+ sessions (machines/isolation) | Same plan plus myo-reps or long-length partials after the last set. |
| **Deload** | Deload week | Same weights, ~4 reps short of failure, half the sets. |

Sets that would fall under the range get a lighter back-off weight, so "no sets under 8" is honoured by the engine, not by you. The top set is your heaviest load (ramp-ups are fine). After each logged set, the rest of today's sets adjust (unchanged from v3).

## 3. Volume per muscle (`engine/volume.js`)

- **Landmarks** (weekly fractional hard sets; direct = 1, indirect = 0.5): minimum to grow (MEV) chest/lats/upper back/side delts/biceps/quads/calves 8, triceps/hamstrings/rear delts 6, glutes 4; ceilings 16–26. Front delts, traps, abs, adductors, forearms, lower back get indirect work only unless prioritized.
- **Per-session target** starts from your recent per-session volume (or the program), never under the weekly minimum spread over how often you actually train the muscle, never over ~11 fractional sets (Remmert 2025).
- **Feedback moves it** (RP-style): soreness before the first set (not sore / healed early / just healed / still sore), pump and workload after the muscle's last set, plus performance computed from the log:
  - low pump + easy + recovered early → **+2 sets**; room for more → **+1**; just recovered or workload already high → **hold**; still sore, or performance down twice → **−1**.
  - No feedback: +1 only when performing better and still below the productive range.
  - "Still sore" today also means one fewer set and +1 rep in the tank for that muscle **today**.
- **Weekly floor**: a muscle that would finish the week under its minimum gets up to +2 sets on a day that trains it.
- **Frequency lever (add-ons)**: when the program structurally can't reach a small muscle's minimum at your training frequency (side delts, rear delts, biceps, triceps, calves, abs), a lagging one gets a short 2–3 set add-on on a day that doesn't train it. Max one per session; off with a directive.
- **Allocation** turns muscle targets into sets per exercise: adds go to isolation and long-length exercises first; trims only clear excess, isolation first, and a compound never loses more than one set from the program; no more than 6 sets per movement pattern.

## 4. Blocks (`engine/block.js`)

Derived from your session dates every time, so it can't drift: 5 build weeks (RIR 3, 2, 2, 1, 1; compounds never below 1; isolation may go to 0 on the last set of the final week) then a deload week. A break of 14+ days starts a new block with a re-entry week; shorter breaks pause it instead of skipping you into a deload. A deload is **offered** (never forced) when two muscles drop two sessions running or two exercises are flagged painful in 10 days. You or the coach can start a deload or a new block any time; block length 4–6 weeks is a directive.

## 5. Time and order (`engine/brain.js`)

Each session gets a time estimate (work + rest by exercise type + warm-ups). Over your budget (default 75 min, a directive): isolation work is paired into supersets (antagonists first: biceps/triceps, chest/rear delts, side delts with arms), then sets come off muscles already ahead this week. Exercises for lagging or prioritized muscles move right after the compounds so they're not the ones cut when time runs short.

## 6. Directives and the coach (`engine/directives.js`, `ui/agent.js`)

A **directive** is a standing input to the planner, shown in the Plan tab with who set it: schedule (days/week, minutes), minimum reps, rep range for an exercise/pattern/compounds/isolation, muscle priority (priority / grow / maintain / no direct work), ± sets per session for a muscle, effort offset, techniques on/off (myo-reps, partials, supersets, add-ons), progression style, block length, deload / new block, and a starting estimate for an exercise with no history.

**The coach operates the engine.** The backend relays one model call at a time (`coach_step`); the tool loop runs in the app, where the engine and your data live:
- reads: `get_plan` (today or any program day, with levers and reasons), `get_exercise`, `get_muscle`, `search_exercises`
- writes: `set_directive`, `remove_directive`, `change_workout` (switch / add / skip / sets / rep range / exact numbers / reorder / change day; today, trial or permanent), `log_feedback`, `add_rule` / `remove_rule`, `remember` / `forget`
- every write returns the recomputed plan, so the coach reports what the engine now prescribes; changes you asked for apply with **Undo**, its own ideas come as **Apply / Not now** cards.

Without the backend update the coach runs in basic mode (it sees the engine's state and can change today's workout, as before).

## 7. Evidence base (what the defaults rest on)

- Weekly volume dose–response with diminishing returns, fractional counting fits best: Pelland et al. 2025 (Sports Med); ~10+ sets/muscle/week: ACSM position stand 2026 (Currier et al.).
- Per-session returns flatten ~11 fractional sets: Remmert et al. 2025 (SportRxiv 537).
- Adding 4 or 6 sets every two weeks for 12 weeks gave trained men more strength than constant volume, with a possible small, uncertain hypertrophy benefit ("Effects of Different Weekly Set Progressions on Muscular Adaptations in Trained Males", PubMed 37796222). Individualized +20% beat standardized volume: Scarpelli et al. 2022.
- Near-failure effort drives growth; failure not required: Robinson et al. 2024; Refalo et al. 2024.
- Reps-in-reserve self-ratings are biased toward thinking you're closer to failure, worse at lighter loads and further from failure: Halperin et al. 2022; Casanova et al. 2025 (J Phys Educ Sport) — hence progression anchored to reps achieved, not ratings.
- Load vs rep progression build similar muscle: Plotkin et al. 2022.
- Detraining and muscle memory: a 10-week break was regained quickly; long-run outcomes matched continuous training (Halonen et al. 2024, PubMed 39364857); strength largely kept ~4 weeks (Bosquet 2013).
- Supersets keep adaptations with roughly half the session time: Mang, Beam & Kravitz 2025 (JSCR narrative review); time-efficient programming: Iversen et al. 2021 (Sports Med).
- Exercise order: train what you most want to grow first (Nunes et al. 2021, via Examine).
- Lengthened partials ≈ full ROM in trained lifters (Wolf et al. 2025); long-length partials favoured over short (Strey et al. 2026).
- App practice: RP Hypertrophy (pump/soreness/workload → sets; weight up a few % weekly, reps when the jump is too big), MacroFactor Workouts (expected reps = mid-range + RIR; beat it to progress; hold or lower otherwise), JuggernautAI (readiness and RPE adjust that session), Fitbod (muscle recovery %, lowers weights after a break), Alpha Progression (gym-aware loads, reps before coarse jumps).
