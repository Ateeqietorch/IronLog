# Decisions log
Choices made where the specs were ambiguous. Newest first.

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
