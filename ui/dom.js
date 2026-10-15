// Small DOM helpers shared by the views.
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let scrimEl = null;
export function sheet(html) {
  closeSheet();
  scrimEl = document.createElement("div");
  scrimEl.className = "scrim";
  scrimEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${html}</div>`;
  scrimEl.addEventListener("click", (ev) => { if (ev.target === scrimEl) closeSheet(); });
  document.body.appendChild(scrimEl);
  const first = scrimEl.querySelector("button, input");
  first?.focus({ preventScroll: true });
  return scrimEl.querySelector(".sheet");
}
export function closeSheet() { scrimEl?.remove(); scrimEl = null; }
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeSheet(); });

let toastTimer = null;
export function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

let hapticsOn = true;
export const setHaptics = (on) => { hapticsOn = !!on; };
export function buzz(pattern) { if (hapticsOn && navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* unsupported */ } } }

export function fmtDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
