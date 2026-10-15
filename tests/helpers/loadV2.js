// Loads selected pure-ish functions out of the v2 app.js (a classic browser
// script) into a sandbox so tests can document current behavior. This exists
// only to pin down v2 behavior before it is replaced; delete in Phase 8.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

function slice(from, to) {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`v2 marker not found: ${from} / ${to}`);
  return SRC.slice(a, b);
}

export function loadV2() {
  const code = [
    slice("const MUSCLE_GROUPS_MAP", "// Primary muscle group"),
    slice("const STAGNATION_SESSIONS", "// ── Exercise Repository"),
    slice("function calcE1RM(", "// Exercise transfer"),
    slice("function median", "function daysBetween"),
    slice("function targetRPEForSet", "function getMuscleFeedback"),
    slice("function computeTarget(", "// Legacy per-set"),
    "function lsGet(k, f) { return f; }",
    "function lsSet() {}",
    "function roundToNearest(v, n) { return Math.round(v / n) * n; }",
  ].join("\n").replace(/^(const|let) /gm, "var ");
  const ctx = { console, Math, JSON, Object, Array, Number, isNaN, parseFloat, parseInt };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

export const V2_SOURCE = SRC;
