# Decisions log
Choices made where the specs were ambiguous. Newest first.

## Phase 3 — 2026-10-15
- **v3 is the main page; classic v2 lives at `v2.html`.** Settings and the Coach tab link to it. Both read the same sheet and the same program, so you can go back and forth.
- **Your program carries over.** v3 reads the program v2 kept in this browser (all your days, sets, rep ranges). On a fresh device it falls back to the PPL+UL template. Phase 6 moves the program into the sheet.
- **Exercises with no history start from your old program weight** as a calibration set (one extra rep in reserve), and the rest of the sets recompute from what you do. Exercises with neither go manual for set 1, then get coached.
- **Week-1 RIR schedule now; volume model in Phase 6.** A training block starts the first time you log a set in v3 (3 → 2 → 2 → 1 → 1 reps in reserve, then a deload week). Set counts come from your program until Phase 6.
- **Saving:** every set is kept on the phone as you go; *Finish* writes the session to the sheet in the same format v2 used (columns A–J unchanged) plus planned-vs-actual columns K–P. If the sheet can't be reached, it's kept as pending and retried when the app opens or comes back online.
- **"4+" chip** stands for any plan of 4 or more reps in reserve (deload, first session back) and keeps the planned number.
- **Switch button is hidden until Phase 4** rather than shown as a dead control.
- **Silver brightened to #DFE2E6** so primary text clears 12:1 on cards (contrast is a test now).
- **Fonts and icons load from Google Fonts / jsDelivr** and are cached by the browser; with no connection on a fresh install the app falls back to system fonts.

## Phase 2 — 2026-10-15
- **Models are rebuilt from your log, not stored separately.** The workout log is the source of truth; replaying ~800 sets takes milliseconds, so every model is derived on load. Nothing can drift out of sync. (The ExerciseModels tab stays available for later caching.)
- **Expected progress.** Before each session the estimate is nudged up ~1% per week (none after 10+ days off or in a deload), then corrected by what you actually do. Without it, doing exactly what was prescribed would never move the numbers. Spec scenario 1 is tested as "four on-plan weeks move the prescription forward" rather than "one session adds a rep", because a 1% gain is often less than one rep.
- **Readiness inside a session.** The in-session copy of the model gets extra day-to-day uncertainty (3%), so one set that runs hot or cold changes the remaining sets by about a rep, without rewriting the long-term model.
- **Mid-session load changes only when needed.** Remaining sets keep the planned load and only their reps change, unless the new reps would fall outside the rep range by more than 2 below / 3 above.
- **One-rung-down limit is off after a gap.** It exists to stop one bad day from tanking the next session; after 10+ days away the extra reps in reserve already lighten the load.
- **Outlier handling.** Sets of 0 lb or 0 reps are ignored. Any single set can move the estimate at most 2.5 standard deviations (typos like "6" for 60). Unrated sets that look weaker than expected count a quarter as much (probably not taken near failure).
- **Settings tuned on your history** (`scripts/replay.js`, grid search): week-to-week noise 4%, expected gain 1%/week, unrated sets assumed ~0.5 reps from failure, extra uncertainty for the first 4 exposures to an exercise. Larger noise than the spec's 1% fits a log with machine swaps, missing RPE, and long breaks.
- **Accuracy today:** ±2.4 reps after three sessions on an exercise, against a target of ±1.5. "Same reps as last time" scores ±1.3 when you repeat a load, so the engine isn't there yet. 70% of logged sets have no RPE, which is the biggest source of error; once every set carries a reps-in-reserve tap (Phase 3) and the RIR-bias learner runs (Phase 6), this should drop. The health panel (Phase 7) will track it.
- **UI wiring moved to Phase 3.** Showing v3 numbers and saving planned-vs-actual per set happens in the new Train screen instead of being bolted onto the v2 screen that Phase 3 replaces.

## Phase 1 follow-up — 2026-10-15
- **Backend lockdown removed at Ateeq's request.** Actions stay open as in v2 (only program backup checks the key). The v3 tables (`doPost`) are also open. Deploying the backend is now a plain paste-and-redeploy with no key reset. Revisit if the app is ever shared.

## Phase 1 — 2026-10-15
- **A typed name never auto-matches by similarity.** Resolution is exact id → exact name/alias (after normalization) → suggestions. The spec's "similarity ≥ 0.9" step is a *strong suggestion* the UI can preselect, not a silent match — a wrong silent match corrupts a strength model, a confirmation tap costs a second.
- **Normalization handles the variants in your log** (DB/dumbbell, tricep/triceps, pressdown/pushdown, plurals, word order), so "Leg Curl (Lying)" and "Lying Leg Curl" are the same exercise without any fuzzy matching.
- **Added a `shrug` pattern** to the vocabulary (traps-only movements had nowhere to go).
- **Seed precedence:** your own sheet entries → curated (83 exercises, hand-classified) → free-exercise-db (418 strength exercises after filtering, confidence 0.6). free-exercise-db's single "shoulders" muscle is split into front/side/rear delts by movement pattern; "abductors" credit glutes; neck, wrist, cardio, stretching, plyometric, Olympic and strongman entries are excluded. It's loaded lazily so it doesn't slow app start.
- **Ambiguous history names are not aliased.** "Machine incline press" (you told the old app it's plate-loaded, per side), "Leg curl", "Overhead tricep extension", and four others go to review instead of guessing.
- **v3 sheet tables are key/value (`Key | UpdatedAt | JSON`)** rather than one column per field. The engine owns the record shape; adding a field never means re-ordering spreadsheet columns. One `table_list` / `table_upsert` / `table_delete` trio serves Exercises, ExerciseModels, GymProfiles, Trials and Review.
- **Every backend action now requires the device key**, including the old GET actions. The existing bootstrap-on-first-use key (`PROGRAM_AUTH_TOKEN`) is reused so the program backup keeps working; DEPLOY-BACKEND.md says to reset it at deploy time so your phone becomes the trusted device. Devices without the key get a one-time prompt instead of failing silently, and the Library tab can copy or enter a key.
- **Backend is tested in Node** with fake Apps Script services (`tests/helpers/fakeAppsScript.js`) since it can't be deployed from here.
- **Your workout log is not committed.** The public repo holds the mapping script; the log export stayed outside the repo.

## Phase 0 — 2026-10-15
- **Classic app.js stays a classic script until Phase 3.** The prompt says "load the frontend as ES modules". `app.js` is 3,300 lines of top-level `let`s and DOM wiring written for sloppy-mode globals; switching it to `type="module"` (strict mode, module scope) risks silent runtime breakage in the gym for no user-visible gain, and Phase 3 rewrites the UI anyway. Instead, a new module entry `ui/main.js` loads the v3 engine and exposes it as `window.IronLogV3`, so v2 code can call v3 behind the engine toggle. All new code is ES modules.
- **Regression tests read v2 functions straight out of `app.js`** (`tests/helpers/loadV2.js`) instead of refactoring v2 to be importable. They pin current behavior and will be deleted with v2 in Phase 8.
- **Engine purity is enforced by a test** (`tests/engine-smoke.test.js`) that fails if any `engine/*.js` file references the DOM, network, storage, or the clock.
- **Service worker cache bumped to `ironlog-shell-v2`** and the new module files added to the shell list, so offline use keeps working.
- **Docs committed on `v3`, not `main`.** START-HERE says to commit them to `main`; keeping everything on the branch means `main` (and the live GitHub Pages app) is untouched until v3 is ready to merge.
