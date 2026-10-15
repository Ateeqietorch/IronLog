// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF).
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// IronLog "Sheet1" export → row objects.
export function logRows(text) {
  return parseCsv(text).slice(1).filter((r) => r.length > 5).map((r) => ({
    date: r[0], day: r[1], exercise: r[2], set: r[3], weight: r[4], reps: r[5], notes: r[6], sessionKey: r[7], rpe: r[8], completed: r[9],
  }));
}
