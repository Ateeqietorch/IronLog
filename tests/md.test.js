import { test } from "node:test";
import assert from "node:assert/strict";
import { md } from "../ui/md.js";

test("coach markdown: bold, lists, paragraphs, and escaping", () => {
  assert.equal(md("**Single-leg press:** four sets."), "<p><b>Single-leg press:</b> four sets.</p>");
  assert.equal(md("Try:\n- one **two**\n- three"), "<p>Try:</p><ul><li>one <b>two</b></li><li>three</li></ul>");
  assert.equal(md("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  assert.equal(md("a\n\nb"), "<p>a</p><p>b</p>");
  assert.equal(md("<script>x</script>"), "<p>&lt;script&gt;x&lt;/script&gt;</p>");
  assert.equal(md("3 * 4 = 12"), "<p>3 * 4 = 12</p>");
});
