# IronLog — Features, Processes & Logic

A complete reference for how the app actually works today, as of the current `main` branch. Written for someone who wants to understand the mechanics, not just the marketing description.

**Scope note:** this covers what's *shipped and live*. One feature — an experimental "ladder set" progression path for dumbbell exercises — exists on a separate, unmerged branch and is **not** part of the live app. It's called out at the end for completeness.

---

## 1. Architecture

- **Frontend:** a single-page vanilla JS/HTML/CSS app (`app.js`, `index.html`, `style.css`), no framework, no build step. Hosted on GitHub Pages.
- **Backend:** a Google Apps Script web app (`apps-script/Code.js`) fronting a Google Sheet. All requests are GET (to sidestep CORS) with parameters serialized into the query string.
- **Data store:** the Google Sheet is the source of truth for everything that's actually been *logged* (sessions, bodyweight, drafts, AI summaries, swap history). The program itself (which exercises, what sets/reps, current weights) lives in the browser's `localStorage`, not the Sheet.
- **AI:** Claude (model `claude-sonnet-5`), called server-side only — the API key lives in Apps Script's Script Properties and is never exposed to client JS. There are 5 distinct AI-backed actions, each with its own system prompt (details in §7).
- **PWA:** installable to a home screen, with a service worker for offline app-shell caching (§10).

### Known, deliberately-unfixed gap
The Apps Script web app has no authentication — it's deployed `ANYONE_ANONYMOUS`, and its URL is visible in the public `app.js` source. Anyone who finds the URL could read/write the Sheet or trigger Claude API calls billed to the owner's key. Flagged during an audit; the owner chose not to add a PIN/token gate for now.

---

## 2. Session Tab — the core workout screen

The default landing tab. Structure top to bottom:

1. **Draft banner** (if an unfinished session is detected — see §9)
2. **"Up Next" banner** (§6)
3. **Mesocycle banner** — current week or deload status (§4)
4. **Workout alert** — a session-wide warning (e.g., "first compound set significantly below target")
5. Session date picker, day-selector buttons, override toggle
6. Action buttons: *How are you feeling today?*, *Check for a saved draft*, *Log a past session by description*, *Redesign this day*
7. "Last session for this day" summary box
8. The exercise cards themselves (sets, targets, inputs)
9. Save Session button
10. AI Session Review panel (appears after saving)

A rest timer bar is fixed to the bottom of the screen whenever a set is in its rest window (§5).

---

## 3. The Program & Exercise Data Model

### Default program
Five hardcoded days (`DEFAULTS`), each a list of exercises: **Day 1 — Push, Day 2 — Pull, Day 3 — Legs, Day 4 — Upper, Day 5 — Lower**. Each exercise object carries `name`, `sets`, `repMin`/`repMax`, a starting `weight` (or `null` for bodyweight moves), and `unilateral` (true/false).

### Exercise Repository
A separate library of 50+ exercises (`EXERCISE_REPO`), each tagged with a `group` (muscle group) and a sensible default rep range/weight. This is what populates the Library tab and the "swap exercise" / "add exercise" pickers — it's independent of what's currently in your program.

### Muscle groups
`MUSCLE_GROUPS_MAP` assigns every known exercise name to one of: Chest, Shoulders, Triceps, Back, Biceps, Quads, Hamstrings, Glutes, Calves (anything unmatched falls into "Other"). This mapping drives volume tracking, the rest timer's muscle-size scaling, and mesocycle volume ramping. **Ab/core work is deliberately not in this map or the repo** — see §7's ab/core-awareness note.

### Days: internal identity vs. display name
A day's *internal* key (e.g. `"Day 3 — Legs"`) never changes — it's how every historical Sheet row, draft, and volume calculation identifies that day. Renaming a day (via the ✎ icon next to its button) only writes a *display label* (`il:dayLabels`), looked up wherever a name is shown. This is what lets you call it "Legs A" in the UI without orphaning past data.

### Custom days
Beyond the 5 defaults, you can accumulate custom days (`il:customDays`) — created either from the Library, or by saving an override session as a new day (§8).

---

## 4. The Progression Engine

This is the heart of the app: given an exercise and its logged history, decide what weight/reps to ask for next time. Lives in `computeTarget()` (bilateral exercises) and `computeTargetPerSet()` (unilateral).

### History is global, not day-scoped
Progression for an exercise pulls from **all** logged sessions across every day, override, and Freeball — filtered only by exercise name, never by which day it happened to be logged under (`loadAllHistory()`, most recent 60 sessions). Log "Leg Press" under a Day 3 override today and Day 5 normally next week — it's one continuous trend either way.

### Double progression (bilateral exercises)
1. Take the most recent session with data for this exercise.
2. Compute the **median** weight and median reps across that session's valid sets (median, not average or "last set," so one outlier set doesn't skew the target).
3. Compute a **hit ratio**: the fraction of sets that reached the rep ceiling (see below).
4. **If ≥75% of sets hit the ceiling** (or an "undershot effort" fast-track applies — see below): bump the weight, then project the new starting rep count by inverting the athlete's current e1RM estimate at the new weight and set-1's target RIR — clamped to `[repMin, repMax]` — rather than always resetting to `repMin`. A ~5% bump usually still leaves several reps above the bottom of the range; resetting unconditionally meant the steady state of every exercise was "climb to the ceiling, get knocked back to the floor, repeat."
5. **Otherwise:** hold the weight, and let reps climb by 1 (capped at the ceiling).
6. A session with **zero valid sets** for this exercise last time: back off from the program weight.
7. A session with **some failed sets** (weight logged, 0 reps — abandoned): flags a "back-off" alert with a suggested reduced weight, using severity-scaled logic (see below).

**Undershot-effort fast-track:** if last session's actual logged RPE came in a full point or more below what was targeted for that point in the session, *and* reps were already near the ceiling, the exercise progresses immediately rather than waiting to grind out one more rep-by-rep session. This is the autoregulation half of the system — reps aren't the only signal, actual effort matters too.

**Overshoot guard:** if RPE came in at ≥9.5 (true failure) without reaching the rep ceiling, the exercise holds rather than pushing reps further into unplanned fatigue.

### Unilateral exercises
Tracked per-set-index independently (`computeTargetPerSet`) rather than via a single median across all sets, since their weight/reps are stored as `L:x/R:y` strings that don't fit the same math. Each set index (S1, S2, S3...) has its own progression thread.

### Rep ranges + terminal AMRAP within a session
A bilateral exercise's target RPE climbs across its sets (7.5 → 9.5, see §5), but the *weight* stays fixed for all sets. Fewer reps are achievable at a fixed weight as target effort climbs, so each non-final set displays a **rep range**, not a single number: the athlete's current e1RM estimate (`calcE1RM_RPE` off last session's median weight/reps/RPE) is inverted at that set's fixed weight and target RPE to get an expected rep count, shown as `[expected−1, expected+2]`, floored at 3 reps. The **last set of every exercise is an open AMRAP** ("N+" — go to the target RPE, log whatever you actually get) instead of a prescribed number at all.

This replaced an earlier version that printed a single declining number as the target for every set. That was a correct *description* of what happens physiologically (fewer reps are left as effort climbs) but an incorrect *prescription*: it converted an expected outcome into a ceiling, so a set that was honestly good for 7 reps at that RPE got logged as the printed "5" instead. A range plus an open-ended final set lets fatigue show up in what actually gets logged rather than pre-empting it — and the AMRAP set doubles as the session's cleanest e1RM read, closest to true failure.

Brand-new exercises (no history yet, or coming off a deload/backoff) have no e1RM estimate to invert, so non-final sets fall back to a flat `repMin` target with no range — deliberately conservative until there's real data to model from.

### Rep ceiling: fixed vs. equipment-aware
For most exercises, the "ceiling" that triggers a weight bump is just `repMax`. For **dumbbell exercises** specifically (`isDumbbellExercise()` — anything with "dumbbell," "(DB)," or matching Hammer Curl/Concentration Curl), the ceiling is extended by 2 reps past `repMax` (`effectiveRepCeiling()`). Rationale: the next dumbbell size is a much bigger relative jump (20→25lb is +25%) than the next barbell plate (~5%), so it's worth "earning" that jump with extra rep volume first rather than forcing it the moment the nominal range is touched.

### Weight increments are equipment-realistic
- **Barbell/cable/machine** (anything not classified as dumbbell): bump by ~5% of current weight (ACSM's 2–10% progressive-overload guidance), rounded to the nearest 2.5lb, floored at 2.5lb.
- **Dumbbells:** bump by a flat 5lb, then the *result* is snapped to the nearest 5lb multiple — not just the delta, since a starting weight that isn't itself a multiple of 5 (an odd manual entry) would otherwise still land on a nonexistent rack weight.

### Autoregulated back-off severity
When a set is missed or a first-set struggle is detected, the weight cut scales 10–25% based on how badly it missed (fraction of target reps short) plus an extra bump if RPE hit true failure (≥9.5) — not a flat percentage. Mirrors real-world autoregulation practice (typically cited as a 10–25% range tied to severity).

### AI "hold" adjustments
The AI Session Review (§7) can flag a specific exercise to hold at its current weight/reps for one session (e.g., form breaking down, just took a big jump). This is read by `computeTarget` and caps progression regardless of what the numbers alone would say, then auto-clears once honored.

---

## 5. In-Session Structure

### Target RPE per set
`targetRPEForSet()` produces an ascending schedule from 7.5 (set 1) to 9.5 (last set) in 0.5 steps — Schoenfeld's descending-RIR structure: more reserve early, tightening toward failure by the final set. During a deload, every set targets a flat RPE 6 instead.

### Warmup ramp
For compound lifts (`repMax ≤ 10`) with a real working weight, a 3-step ascending warmup is displayed above the work sets: 40%/60%/80% of the working weight at 8/5/3 reps. Display-only guidance — warmup sets are never logged, only the prescribed work sets.

### Rest timer
Starts automatically when a set is marked complete (the ✓ shortcut, or on losing focus after typing reps/RPE manually). Duration depends on:
- **Rep range** (heavy compound ≤8 reps vs. small isolation ≥12 reps vs. moderate in between)
- **Muscle group size** (Quads/Hamstrings/Glutes/Back/Chest get more; smaller groups less)
- **Logged RPE** — ≥9.5 extends rest (more for large muscle groups), ≤7 shortens it

This is explicitly *not* justified as "more rest = more growth" — the literature (a 2024 Bayesian meta-analysis) found no meaningful hypertrophy benefit past ~90s rest, and found proximity-to-failure didn't interact with rest duration for the hypertrophy outcome specifically. The scaling here is justified instead on **next-set performance and safety** grounds (measurable technique/velocity degradation under fatigue, autoregulation literature supporting RPE-based rest over a fixed clock) — a different, better-supported claim.

Controls: `+15s` and `Skip`. Restarts automatically with the *real* logged RPE if you fill it in after using the ✓ shortcut (which has to estimate from the planned target RPE at the moment of tapping).

### In-session fatigue context
Before rendering an exercise's targets, the app sums a "fatigue score" from all *preceding* exercises on the same muscle group that session (compound = 3 points, isolation = 1 point). Above a threshold, the target rep count shifts toward the upper half of the exercise's rep range instead of the usual bottom-up climb — reasoning that if a muscle is already pre-fatigued from earlier work, grinding toward the range's floor isn't the right ask.

### First-set struggle detection
Watches set 1 of the first exercise (and generally set 1 of any exercise) for either: reps landing >15% below target, or RPE hitting true failure (≥9.5). If triggered: shows an alert, suggests a reduced weight for the remaining sets (severity-scaled, anchored to whatever was actually lifted — never suggests going *above* a weight that was just failed), and auto-adds one extra set at that reduced weight for compound lifts (guarded so it only adds once per struggle, not on every keystroke). If it's the very first exercise of the session and it's a compound lift, also raises a session-wide "consider treating today as a recovery session" alert.

---

## 6. "Up Next" — Day Suggestion & Adherence

Two independent, read-only signals shown as a banner on the Session tab (never auto-switches your day):

- **Day suggestion:** whichever program day was trained longest ago (or never) is recommended, with a one-tap Switch button.
- **Adherence nudge:** if the gap since your last session is unusually long *relative to your own recent average cadence* (not a fixed number — computed from your last 8 sessions), it says so.

---

## 7. AI Features

Five distinct backend actions, each a separate Claude call with its own purpose-built prompt. A shared `TRAINING_GOAL` constant ("balanced hypertrophy, no specific weak-point priority") and `EXERCISE_CONSTRAINTS` string (never suggest Barbell Back Squat/Deadlift; never suggest a free-standing unsupported bent-over row — the user wants to preserve their lower back) are threaded into every prompt that can select exercises.

### 1. Reconsider Exercise (`ai_reconsider`)
Per-exercise, on-demand (🤔 icon). You give a reason ("shoulder's cranky," "bored of it"); the AI proposes one substitute with adjusted sets/reps/weight and a rationale, pulling that exercise's own recent history (independent of day, same as the progression engine). You accept or dismiss.

### 2. Session Review (`ai_review`)
Fires automatically after every save. Reads the just-logged session plus the last 5 prior sessions on that day, and returns:
- A short coaching summary
- `deload_recommended` (boolean + reason)
- Per-exercise `hold` adjustments

**Auto-applied, not confirm-first** — but always visibly listed under the summary as "Applied," per the owner's explicit choice. The deload-recommendation bar is deliberately high: it requires *several different exercises* on that day each showing a sustained pattern over 3-4+ sessions, explicitly told that two flat sessions on one exercise is normal variance (routed to a "hold" instead), and to default to "no" when uncertain — a deload is a whole-program, disruptive intervention, not a one-exercise call.

Also checks (via `recentAbCoreCheck`) whether any ab/core exercise has been logged anywhere in the last 14 days, across every day — if not, it's mentioned as a plain-text suggestion only. Ab/core work is intentionally not part of the structured program (no repo entry, nothing auto-inserted); this is the one place the AI is allowed to flag the gap.

**Notes matter here.** Every exercise's free-text Notes field is included in what the AI reads (`"— note: knee felt off"`), specifically so qualitative signals it can't get from raw numbers (form breakdown, joint discomfort) can inform its hold/deload judgment.

### 3. Pre-Session Feeling Check (`ai_presession_check`)
Opened manually before starting ("💬 How are you feeling today?"). You describe how you feel; the AI can reduce weight/sets/reps, substitute an exercise, or make no change — applied as a **today-only override** (routes through the same mechanism as manual Override Today, §8), never touching the permanent program. If a deload is currently active and your stated feeling clearly indicates you feel strong and don't want it, the AI can cancel it — restarting the mesocycle clock from today rather than just clearing the flag (which would otherwise immediately re-trigger if you're already past the scheduled week).

### 4. Redesign This Day (`ai_redesign_day`)
A genuine multi-turn conversation, not a one-shot call — the client resends the full transcript each turn so Claude has real conversational context. Opens with an auto-generated proposal for the active day (better exercise order, no redundant back-to-back isolation movements for the same muscle). You can push back, ask questions, or give direction before deciding. **Nothing is applied until you tap Approve** — Reject discards it, no partial/silent application. This is the one AI feature explicitly *not* auto-apply, by the owner's own choice, since it's a permanent program change.

### 5. Log a Past Session by Description (`ai_log_description`)
Free-text paragraph describing a workout already done (any date, any day) → parsed into structured per-set weight/reps, loaded into the normal editable session view for review before you hit Save. Never writes to the Sheet directly. Matches exercise names to the closest programmed exercise, but is explicitly told never to merge across different equipment variants (a past bug: "Smith Machine Hack Squat" was once merged into the tracked "Hack Squat," corrupting its trend).

---

## 8. Day & Program Management

### Override Today
A toggle that redirects all edits for the current session to a throwaway copy of the day's exercise list (`overrideExercises`), never touching the permanent program directly. Persisted separately (`il:overrideState`) so an in-progress override survives an accidental close/reopen.

**On save, you're offered, in order:**
1. Make the changes **permanent for the day it overrode** (updates that day's actual exercise list)
2. Save as a **separate new day** instead (prompts for a name)
3. Neither — today-only, as before

(Option 1 was added after a real bug: without it, the *only* way to persist an override was spinning off a brand-new day, so declining that prompt meant the next "Override Today" on the same day silently reverted to the old exercise list — different exercise identities than what was actually logged, so progression for the substituted exercises looked broken. It wasn't broken; it just had no exercise-identity match to find.)

### Freeball
A permanent pseudo-day for one-off, built-on-the-fly sessions. Its exercise list is cleared after every save (nothing to carry over structurally), but logged history still lives in the Sheet keyed by exercise name — so an exercise done under Freeball feeds the same progression trend as anywhere else.

---

## 9. Mesocycle & Deload Engine

- **Default cycle:** 6 weeks, evaluated fresh on every load rather than a rigid countdown (`getMesocycleState()`), so it can be pulled forward early.
- **Early trigger:** if average logged RPE across the last 6 session-dates (program-wide) hits ≥9.3, a deload starts immediately regardless of what week it is.
- **AI trigger:** the Session Review can also start one (§7), subject to its now-stricter evidence bar.
- **Deload magnitude:** ~10% weight cut, ~25% set-count cut, target RPE capped at 6 (≈4 reps in reserve). These specific numbers come from a 2022 survey of real strength/physique coaches' actual practice — earlier versions of this app stacked a deeper cut (15% weight *and* RPE cap 8 *and* 50% volume cut), which was double-dipping two separate interventions and using a powerlifting-style volume cut on what's explicitly a hypertrophy-focused program.
- **Volume ramp:** each muscle group's weekly hard-set count ramps from its MEV toward its MRV across the 6 weeks (one exercise at a time, capped so no single exercise balloons too far), resetting after a deload.
- **Cancellable:** via the pre-session feeling check (§7) if you explicitly say you feel strong and don't want it.

---

## 10. Data-Loss Safety Net

Two independent layers, because a single point of failure here was a real reported bug (a draft silently lost on app close):

1. **Local snapshot** (`il:liveSession`) — mirrors your in-progress sets to `localStorage` on every input, synchronously, with zero network dependency. Checked first on load, before anything remote, since it's always at least as fresh.
2. **Remote draft** — written to the Sheet's Drafts tab on every input (fire-and-forget). Recoverable via "Check for a saved draft," which checks the local snapshot first, then falls back to the Drafts sheet — and if nothing matches your *current* tab, offers the most recent draft on *any* day rather than a flat "not found" (since the app always resets to a default tab on reload, so a draft from a different day/override is easy to miss otherwise).

---

## 11. Other Tabs

### Calendar
Month grid; days with a logged session are dotted. Tapping a date shows that day's full logged session (all exercises, sets, weights, reps, e1RM) with a Delete option.

### Progress
An e1RM line chart per exercise (picker below it), a weight-progression history log, and a "current suggested weights" summary.

### Volume
Weekly hard-set counts per muscle group, plotted against that muscle's MEV/MRV band (user-editable per muscle — tap a muscle name). A set counts as "hard" if its logged RPE is ≥7, **or if no RPE was logged at all** (defaults to counting, rather than penalizing sets logged without RPE). Also shows an effort (RPE) distribution and a session volume-load chart (sets × reps × weight).

### Weight
Simple bodyweight log with date, a chart, and history list.

### Library
Full exercise repository, searchable and filterable by muscle group, with one-tap add to the current day.

---

## 12. Backend Actions (Apps Script)

| Action | Purpose |
|---|---|
| `read` / `write` / `clear` | Core session CRUD against the Sessions sheet |
| `read_day_history` / `read_week` | Historical reads for specific views |
| `read_draft` / `write_draft` / `clear_draft` / `clear_all_drafts` | Draft safety net |
| `read_bodyweight` / `write_bodyweight` / `delete_bodyweight` | Bodyweight log |
| `ai_reconsider` | Per-exercise substitution suggestion |
| `log_swap` | Records an accepted substitution to an ExerciseSwaps sheet |
| `ai_review` | End-of-session summary + deload/hold decisions |
| `ai_presession_check` | Pre-session feeling-based adjustment |
| `ai_redesign_day` | Conversational full-day redesign |
| `ai_log_description` | Free-text past-session parsing |

Claude calls go through a shared `callClaudeMessages()` helper (supports full multi-turn message arrays, needed for the redesign conversation); single-shot actions wrap it via `callClaude()`. Responses are parsed with a 3-tier fallback (`parseClaudeJson`): direct JSON parse → markdown-fence-stripped parse → outermost `{...}` substring extraction — because despite explicit instructions, Claude occasionally wraps or annotates its JSON.

---

## 13. PWA / Installability

`manifest.json` + a hand-generated barbell icon (no image tooling was available in the build environment, so it's a hand-rolled PNG encoder via `zlib`/`struct`) + a service worker (`sw.js`) caching the static app shell. Network-first strategy for the shell — since this app gets redeployed often, an online device should always get the latest code, falling back to the last cached copy only when offline. **Does not include push notifications** — that needs real backend infrastructure (VAPID keys, a subscription store, a scheduled trigger mechanism) that was explicitly scoped out as a separate project.

---

## 14. Explicitly Not Built (by choice, not oversight)

- **Security/auth on the backend** — flagged, deferred by the owner.
- **Push notifications** — needs infra beyond what a static site + Apps Script backend can do.
- **Ab/core tracked exercises** — deliberately kept out of the structured program; the AI notices and mentions the gap instead (§7).
- **"Ladder set" progression for dumbbells** (one heavier, lower-rep set while the rest hold at the current weight) — built and functional on a separate branch, but held back pending resolution of real open issues: it would make the existing stagnation/decline detector misfire (that detector has no concept of "this session's set 1 doesn't compare to others"), it can't distinguish a real ladder attempt from a coincidental heavier first set logged for an unrelated reason, and the AI Session Review doesn't know the pattern is intentional and might comment on it as an anomaly. Not merged to `main`.
