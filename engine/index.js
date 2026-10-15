// IronLog v3 engine — pure functions only.
// Rules (COACH-ENGINE-SPEC.md §1, CLAUDE-CODE-PROMPT.md ground rules):
//   no DOM, no fetch, no localStorage, no Date.now(); time is passed in.
// Modules are added phase by phase: catalog (1), model + prescribe (2),
// trials (4), coldstart (5), volume (6).
export const ENGINE_VERSION = "3.0.0-phase3";
export * as catalog from "./catalog.js";
export * as model from "./model.js";
export * as prescription from "./prescribe.js";
export * as replay from "./replay.js";
