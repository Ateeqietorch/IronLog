# Claude Code prompt — IronLog v3

Paste everything below the line into Claude Code, run from the `ateeqietorch/IronLog` repo, after copying the files listed in `START-HERE.md` into the repo root.

---

You are rebuilding IronLog, a hypertrophy training PWA (GitHub Pages frontend in `app.js`, Google Apps Script backend in `apps-script/Code.js`, Google Sheet as the source of truth), into a coach that prescribes exact weights and reps, adapts from every set, lets me switch or trial exercises freely, and looks completely different.

Read these first, in order, and don't write code until you have:
1. `COACH-ENGINE-SPEC.md` — the engine. Authoritative where docs conflict, except on visual design.
2. `DESIGN-SPEC.md` + `design-reference.html` — the visual design. Authoritative on anything visual. Open the HTML and match it.
3. `HYPERTROPHY-RESEARCH.md` — the training science behind the defaults, and the default PPL+UL template (§5).
4. `FEATURES.md` — what the app does today.
5. `GAP-ANALYSIS.md` — background; §1.3 and §1.5 still apply.

## Ground rules
- Work on branch `v3`. Commit after each phase with a clear message. Never force-push `main`.
- Engine code (`/engine/*.js`) is **pure functions**: no DOM, no `fetch`, no `localStorage`, no `Date.now()` (time is passed in). ES modules usable from browser and Node.
- Write tests alongside every engine function with `node:test` (no extra dependencies). Every acceptance scenario in engine spec §12 becomes a test.
- Don't port anything in engine spec §10 or design spec §8. If you're about to add a threshold, a special case, or a second place that changes a load/rep number, stop — that's the bug this rebuild removes.
- The app stays usable after every phase. Keep v2 reachable behind a Settings toggle ("Engine: v2 / v3") until Phase 8.
- Preserve what already works: offline draft safety net, adaptive rest timer, calendar history, global cross-day history.
- Secrets: the Anthropic key lives only as a Cloudflare Worker secret (`wrangler secret put ANTHROPIC_API_KEY`). Never commit keys. Flag any deployment URL or ID in the repo that shouldn't be public.
- When a spec is ambiguous, pick the simpler option, log it in `DECISIONS.md`, and continue. Ask me only if the choice changes what I see or do in the gym.

## Phase 0 — Audit and scaffolding
1. Reproduce engine spec §0 findings as `tests/regression-v2.test.js` (fuzzy `getMuscleContributions` → `Other`; hack-squat example in `computeTarget`; swap mutating the program).
2. Create `/engine`, `/data`, `/ui`, `/styles`; `package.json` with `"type": "module"` and `npm test`. Load the frontend as ES modules. No build step.
3. Report every place in `app.js` that changes a load, rep, or set count.

## Phase 1 — Exercise catalog and identity (engine §3.1, §3.6)
1. `engine/catalog.js`: vocabularies, `normalizeName()`, `resolveExercise()` per the resolution order. No substring matching.
2. Seed: migrate `EXERCISE_REPO`/`CONTRIBUTIONS`; import `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json` (public domain) into `engine/seed/`, mapped to the schema (primary 1.0, secondary 0.5). Seed `lengthenedBias` per research §2.7.
3. Apps Script: add `Exercises`, `ExerciseModels`, `GymProfiles`, `Trials` tabs and JSON `doPost` actions with the existing token auth. Old `doGet` actions keep working.
4. Map every historical exercise string to an id; write unmatched names to a `Review` list and show me before finalizing.

## Phase 2 — Strength model and prescription (engine §4)
1. `engine/model.js` and `engine/prescribe.js` per §4.1–4.7, including unilateral, dumbbell-pair, bodyweight-plus, assisted, and stack load types.
2. `scripts/replay.js`: rebuild all ExerciseModels from history; print rep-prediction MAE per exercise and overall. Paste me the summary.
3. Store `plannedLoad/plannedReps/plannedRIR/predictedRepsAtLoggedLoad/engineVersion` with every set.
4. Tests: engine scenarios 1, 2, 3, 4, 7, 8, 11, 12.

## Phase 3 — Redesign: design system and Train screen (design spec §1–§5.5, §6–§8)
1. `styles/tokens.css` with the exact tokens from design spec §2; fonts per §3; retire the old palette and fonts.
2. Bottom navigation (§4) replacing the top tabs; map old tabs as described.
3. Train screen exactly as `design-reference.html` screen 1: header status line, progress strip, Now card with hero numeral, reason line, set rows, reps-left chips, `DONE AS PLANNED`, edit sheet, up-next list, rest dock. Logging a set runs engine §4.4 and re-renders remaining sets.
4. Wake lock, haptics, motion, and focus per §6. Copy per §7.
5. Check contrast pairs listed in §2 with a script; fix anything under target.
6. Show me screenshots at 375px wide before moving on.

## Phase 4 — Switching and trials (engine §6.1, §6.1b; design §5.6, §5.7)
1. `engine/catalog.js`: `rankAlternatives(slot, catalog, models, gymProfile)`.
2. `engine/trials.js`: start, record session feedback, early exit, review metrics (trend excluding session 1, session 2 at half weight), deterministic recommendation, keep / switch back / extend.
3. Switch sheet with `Today` / `Trial` / `Permanent`, trial-length stepper, search, ranked rows. Trial pill on the Now card; post-exercise Pump/Joints chips for trial exercises; Trial review screen as in `design-reference.html` screen 3.
4. Gym profile settings: dumbbell ladder, plate minimum, machine stack increments, unavailable exercises.
5. Tests: scenarios 6 and 6b; a "painful joints" early-exit test; a test that switching back after > 10 days applies gap handling.

## Phase 5 — AI exercise lookup and cold start (engine §6.2, §6.3)
1. `worker/` Cloudflare Worker, `POST /lookup-exercise`, token-validated. Anthropic Messages API with the web search server tool (`{"type":"web_search_20260318","name":"web_search","max_uses":4}`) and a strict client tool `submit_exercise_profile` (schema = engine §3.1 + `strengthAnchors` + `referenceRatios`, enums from the vocabularies). Put my catalog's ids/names in the prompt. Confirm in the Anthropic docs/Models API that the model supports web search; at the time of writing use `claude-sonnet-5-5`. Handle `pause_turn`. Cache by normalized name.
2. `engine/coldstart.js`: three estimators, geometric mean, stability discount, prior variance, +1 RIR calibration first set.
3. UI: `Not listed? Look it up` → loading → profile card (`Save and use` / `Edit details`) → defaults to Trial scope.
4. Tests: scenario 5 with a mocked response; lookup failure falls back to manual entry without blocking the workout.
5. Give me exact Worker deploy commands and where to paste its URL.

## Phase 6 — Muscle model and program (engine §5; research §5, §6)
1. `engine/volume.js`: baseline-from-history starting volume with the +20%/meso cap, fractional sets, objective performance score, RP-style set adjustment, 10-set weekly floor, 11-set session cap, RIR schedule, deload triggers, readiness (session-scoped only), set-technique counting, 90 s rest floor, progression preference.
2. Ship the PPL+UL template from research §5 as my default program (server-side Program/Slots, not localStorage).
3. Progress screen per design §5.8 (Muscles, Lifts, Body).
4. Tests: scenarios 9 and 10, deload triggers, and a test that low readiness changes today's targets but not the stored model.

## Phase 7 — Engine health (engine §9)
Health row in Progress → Lifts: rep-prediction error, effort accuracy, calibration speed.

## Phase 8 — Cleanup
After I confirm two weeks on v3: delete everything in engine §10 and design §8, remove the v2 toggle, update `FEATURES.md`, and write a plain-language `ENGINE.md`.

## Phase 9 — Coach agent (engine §7)
Only after Phases 1–8 are merged: `/coach` Worker endpoint with streaming, the tools in engine §7, a `CoachMemory` tab, Coach screen per design §5.9. The agent never writes loads or reps directly.

## Definition of done for each phase
- `npm test` passes, including that phase's scenarios.
- Loads on iPhone Safari from GitHub Pages with no console errors.
- You've shown me what changed, what was deleted, screenshots for any UI phase, and new `DECISIONS.md` entries.
