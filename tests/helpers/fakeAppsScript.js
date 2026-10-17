// Minimal in-memory stand-ins for the Apps Script services Code.js uses, so
// the backend can be exercised in Node without deploying it.
import { readFileSync } from "node:fs";
import vm from "node:vm";

class FakeSheet {
  constructor(name, rows = []) { this.name = name; this.rows = rows.map((r) => [...r]); }
  getDataRange() { const rows = this.rows; return { getValues: () => (rows.length ? rows.map((r) => [...r]) : [[]]) }; }
  getLastRow() { return this.rows.length; }
  getMaxColumns() { return this.maxCols ?? Math.max(10, ...this.rows.map((r) => r.length)); }
  insertColumnsAfter(after, n) { this.maxCols = this.getMaxColumns() + n; this.insertedCols = (this.insertedCols ?? 0) + n; }
  appendRow(r) { this.rows.push([...r]); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  deleteRows(start, count) { this.rows.splice(start - 1, count); }
  getRange(row, col, nRows, nCols) {
    if (row < 1) throw new Error(`bad row ${row}`);
    if (col - 1 + nCols > this.getMaxColumns()) throw new Error(`range past last column (${col - 1 + nCols} > ${this.getMaxColumns()})`);
    return {
      setValues: (vals) => {
        vals.forEach((v, i) => {
          const r = row - 1 + i;
          while (this.rows.length <= r) this.rows.push([]);
          for (let j = 0; j < nCols; j++) this.rows[r][col - 1 + j] = v[j];
        });
      },
    };
  }
}

export function loadBackend({ sheets = {}, props = {}, fetchReplies = [] } = {}) {
  const fetched = [];
  const book = new Map(Object.entries(sheets).map(([n, rows]) => [n, new FakeSheet(n, rows)]));
  const store = { ...props };
  const cache = new Map();
  const ctx = {
    console, JSON, Date, Math, Object, Array, String, Number, parseInt, parseFloat, isNaN, Error,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => book.get(n) ?? null,
      insertSheet: (n) => { const s = new FakeSheet(n); book.set(n, s); return s; },
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => store[k] ?? null,
      setProperty: (k, v) => { store[k] = v; },
    }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => { cache.set(k, v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (t) => ({ setMimeType: () => ({ body: JSON.parse(t) }) }),
    },
    UrlFetchApp: { fetch: (url, opts) => {
      if (!fetchReplies.length) throw new Error("network disabled in tests");
      fetched.push({ url, payload: JSON.parse(opts.payload) });
      const r = fetchReplies.shift();
      return { getResponseCode: () => r.code ?? 200, getContentText: () => JSON.stringify(r.body) };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../../apps-script/Code.js", import.meta.url), "utf8"), ctx);
  return {
    get: (params) => ctx.doGet({ parameter: params }).body,
    post: (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body,
    sheet: (n) => book.get(n),
    props: store,
    fetched,
  };
}
