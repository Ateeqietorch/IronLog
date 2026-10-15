# Decisions log
Choices made where the specs were ambiguous. Newest first.

## Phase 0 — 2026-10-15
- **Classic app.js stays a classic script until Phase 3.** The prompt says "load the frontend as ES modules". `app.js` is 3,300 lines of top-level `let`s and DOM wiring written for sloppy-mode globals; switching it to `type="module"` (strict mode, module scope) risks silent runtime breakage in the gym for no user-visible gain, and Phase 3 rewrites the UI anyway. Instead, a new module entry `ui/main.js` loads the v3 engine and exposes it as `window.IronLogV3`, so v2 code can call v3 behind the engine toggle. All new code is ES modules.
- **Regression tests read v2 functions straight out of `app.js`** (`tests/helpers/loadV2.js`) instead of refactoring v2 to be importable. They pin current behavior and will be deleted with v2 in Phase 8.
- **Engine purity is enforced by a test** (`tests/engine-smoke.test.js`) that fails if any `engine/*.js` file references the DOM, network, storage, or the clock.
- **Service worker cache bumped to `ironlog-shell-v2`** and the new module files added to the shell list, so offline use keeps working.
- **Docs committed on `v3`, not `main`.** START-HERE says to commit them to `main`; keeping everything on the branch means `main` (and the live GitHub Pages app) is untouched until v3 is ready to merge.
