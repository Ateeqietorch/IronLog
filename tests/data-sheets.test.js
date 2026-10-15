import { test } from "node:test";
import assert from "node:assert/strict";
import { post, Unauthorized } from "../data/sheets.js";

const fakeFetch = (reply, seen) => async (url, init) => { seen?.push({ url, init }); return { json: async () => reply }; };

test("post sends text/plain JSON with the action and device key", async () => {
  const seen = [];
  await post("table_list", { table: "Exercises" }, { fetchImpl: fakeFetch({ ok: true, records: [] }, seen), key: "k" });
  assert.equal(seen[0].init.method, "POST");
  assert.match(seen[0].init.headers["Content-Type"], /^text\/plain/);
  assert.deepEqual(JSON.parse(seen[0].init.body), { table: "Exercises", action: "table_list", token: "k" });
});

test("post surfaces an unauthorized key as its own error type", async () => {
  await assert.rejects(post("ping", {}, { fetchImpl: fakeFetch({ ok: false, msg: "unauthorized" }), key: "x" }), Unauthorized);
});
