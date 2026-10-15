import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as engine from "../engine/index.js";

test("engine loads in Node as an ES module", () => {
  assert.match(engine.ENGINE_VERSION, /^3\./);
});

test("engine files stay pure (no DOM, network, storage, or clock)", () => {
  const banned = /\b(document|window|localStorage|sessionStorage|fetch|XMLHttpRequest|Date\.now)\b/;
  for (const f of readdirSync(new URL("../engine/", import.meta.url)).filter((f) => f.endsWith(".js"))) {
    const code = readFileSync(new URL(`../engine/${f}`, import.meta.url), "utf8")
      .replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, banned, `engine/${f} uses a banned API`);
  }
});
