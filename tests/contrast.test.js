// DESIGN-SPEC.md §2 contrast targets, checked against the shipped tokens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles/app.css", import.meta.url), "utf8");
const tok = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("text/background pairs meet their targets", () => {
  const checks = [
    ["silver", "iron", 12], ["silver", "plate", 12], ["silver", "plate-deep", 12],
    ["steel", "plate", 4.5], ["steel", "iron", 4.5], ["silver-2", "plate-deep", 7],
    ["red", "iron", 3], ["red", "plate", 3], ["done", "plate-deep", 4.5], ["warn", "plate", 4.5], ["red-ink", "red-wash", 4.5],
  ];
  for (const [fg, bg, min] of checks) {
    const r = ratio(tok[fg], tok[bg]);
    assert.ok(r >= min, `${fg} on ${bg}: ${r.toFixed(2)} < ${min}`);
  }
  assert.ok(ratio("#FFFFFF", tok["red-fill"]) >= 4.5, `white on red-fill: ${ratio("#FFFFFF", tok["red-fill"]).toFixed(2)}`);
});
