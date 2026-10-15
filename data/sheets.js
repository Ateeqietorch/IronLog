// v3 data layer: JSON over POST to the Apps Script backend.
// The engine never imports this; UI code calls it and hands plain data to
// the engine.
import { SCRIPT_URL } from "./config.js";

export class Unauthorized extends Error {}

function deviceKey() {
  try { return localStorage.getItem("il:authToken"); } catch { return null; }
}

// Apps Script can't answer CORS preflights, so the body goes as text/plain.
export async function post(action, body = {}, { fetchImpl = fetch, key = deviceKey() } = {}) {
  const r = await fetchImpl(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, action, token: key }),
    redirect: "follow",
  });
  const d = await r.json();
  if (!d.ok && d.msg === "unauthorized") throw new Unauthorized("This device's key isn't accepted by your sheet.");
  if (!d.ok) throw new Error(d.msg || "Backend error");
  return d;
}

export const tables = {
  list: (table, opts) => post("table_list", { table }, opts).then((d) => d.records),
  upsert: (table, records, opts) => post("table_upsert", { table, records }, opts),
  remove: (table, keys, opts) => post("table_delete", { table, keys }, opts),
};
