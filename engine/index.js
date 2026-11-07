// IronLog v3 engine — pure functions only.
// Rules (COACH-ENGINE-SPEC.md §1, CLAUDE-CODE-PROMPT.md ground rules):
//   no DOM, no fetch, no localStorage, no Date.now(); time is passed in.
// Modules are added phase by phase: catalog (1), model + prescribe (2),
// trials (4), coldstart (5), volume (6).
export const ENGINE_VERSION = "4.0.0";
export * as catalog from "./catalog.js";
export * as model from "./model.js";
export * as prescription from "./prescribe.js";
export * as replay from "./replay.js";
export * as recovery from "./recovery.js";
export * as validate from "./validate.js";
export * as assess from "./assess.js";
export * as volume from "./volume.js";
export * as progress from "./progress.js";
export * as block from "./block.js";
export * as directives from "./directives.js";
export * as brain from "./brain.js";
