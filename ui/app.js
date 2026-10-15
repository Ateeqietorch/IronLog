// IronLog v3 entry point.
import { state, boot, subscribe, retryPending } from "./store.js";
import { renderTrain } from "./train.js";
import { renderHistory, renderProgress, renderCoach } from "./tabs.js";
import { setHaptics, toast } from "./dom.js";

const view = document.getElementById("view");
let tab = "train";
const renderers = { train: renderTrain, history: renderHistory, progress: renderProgress, coach: renderCoach };

function render() {
  if (!state.index) return;
  setHaptics(state.settings.haptics);
  renderers[tab](view);
}

document.querySelectorAll(".nav button").forEach((b) => b.addEventListener("click", () => {
  tab = b.dataset.tab;
  document.querySelectorAll(".nav button").forEach((x) => x.removeAttribute("aria-current"));
  b.setAttribute("aria-current", "page");
  window.scrollTo({ top: 0 });
  render();
}));

subscribe(render);

// Keep the screen on during a workout (DESIGN-SPEC.md §6).
let wakeLock = null;
async function keepAwake() {
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen"); } catch { /* not allowed */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.session && !state.session.saved) keepAwake(); });
window.addEventListener("online", () => retryPending());

if ("serviceWorker" in navigator && !window.__IRONLOG_FIXTURE__) navigator.serviceWorker.register("sw.js").catch(() => {});

boot({ fixture: window.__IRONLOG_FIXTURE__ ?? null })
  .then(() => keepAwake())
  .catch((err) => {
    console.error(err);
    view.innerHTML = `<div class="empty">IronLog couldn't start: ${String(err.message || err)}.<br><br><a class="secondary" style="text-decoration:none" href="v2.html">Open classic IronLog</a></div>`;
  });

window.addEventListener("error", (e) => toast("Something went wrong: " + (e.message || "unknown error")));
