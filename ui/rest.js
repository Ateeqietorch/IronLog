// Rest dock (DESIGN-SPEC.md §5.4). Floor of 90 s for hypertrophy work
// (Singer et al. 2024); longer for heavy compounds.
//
// When rest ends:
//  - app open: vibrate (Android) + a short beep (both phones; iPhone has no
//    web vibration, and its silent switch mutes the beep).
//  - phone locked / app in background (Android): a system notification that
//    vibrates. Locking during rest also posts a quiet "rest ends at 5:42"
//    notification so the end time is on the lock screen.
//  - iPhone: web pages are frozen while locked, so nothing in here can fire.
//    The opt-in Shortcuts hand-off starts the native Clock timer instead,
//    which shows a live countdown on the lock screen and rings at 0.
import { buzz } from "./dom.js";
import { state } from "./store.js";

let endsAt = 0, timer = null, endTimer = null, extra = 0, nextText = "", alerted = false;
const TAG = "ironlog-rest";

export function restSecondsFor(ex) {
  if (!ex) return 120;
  if (ex.kClass === "leg-press" || ex.kClass === "lower-free") return 180;
  if (ex.kClass === "upper-compound") return 150;
  return 90;
}

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const opt = (k, dflt) => (state.settings?.[k] ?? dflt);
export const notifySupported = () => "Notification" in window && "serviceWorker" in navigator;
const canNotify = () => notifySupported() && Notification.permission === "granted" && opt("restNotify", false);

// ── Sound ────────────────────────────────────────────────────────────────
let ctx = null;
// Called from a tap so iOS lets audio play later. "ambient" mixes with your
// music instead of pausing it (iOS 17+).
export function primeAlerts() {
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch { /* older iOS */ }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* no audio */ }
}

export function beep() {
  if (!ctx || !opt("restBeep", true)) return;
  try {
    const t0 = ctx.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.18);
    });
  } catch { /* ignore */ }
}

// ── Notifications (Android, or any phone with the app open in background) ─
async function notify(title, options) {
  if (!canNotify()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { tag: TAG, icon: "icons/icon-192.png", badge: "icons/icon-192.png", ...options });
  } catch { /* blocked */ }
}
async function clearNotifications() {
  if (!notifySupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    (await reg.getNotifications({ tag: TAG })).forEach((n) => n.close());
  } catch { /* ignore */ }
}
export async function requestNotify() {
  if (!notifySupported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// ── iPhone: hand off to the native timer through Shortcuts ────────────────
export function iosTimerOn() { return isIOS() && opt("iosTimer", false); }
export function runIosTimer(seconds) {
  const name = encodeURIComponent(opt("iosShortcut", "IronLog Rest") || "IronLog Rest");
  window.location.href = `shortcuts://run-shortcut?name=${name}&input=text&text=${Math.max(1, Math.round(seconds))}`;
}

// ── The dock ─────────────────────────────────────────────────────────────
export function startRest(ex, { next = "" } = {}) {
  const secs = restSecondsFor(ex);
  endsAt = Date.now() + secs * 1000;
  extra = 0; nextText = next; alerted = false;
  show();
  if (iosTimerOn()) runIosTimer(secs);
}

function finishAlert() {
  if (alerted) return;
  alerted = true;
  if (document.visibilityState === "visible") {
    buzz([300, 120, 300, 120, 300]);
    beep();
  } else {
    notify("Rest's up", { body: nextText ? `Next: ${nextText}` : "Time for your next set", renotify: true, requireInteraction: false, vibrate: [400, 150, 400, 150, 400], silent: false });
  }
}

function scheduleEnd() {
  clearTimeout(endTimer);
  // A one-shot timeout lands closer to 0 than the 1 s tick when the browser
  // throttles a hidden page.
  endTimer = setTimeout(() => { finishAlert(); draw(); }, Math.max(0, endsAt - Date.now()));
}

function draw() {
  const el = document.getElementById("rest");
  if (!el || el.classList.contains("hidden")) return;
  const left = Math.round((endsAt - Date.now()) / 1000);
  const over = left <= 0;
  const t = Math.abs(left);
  el.classList.toggle("over", over);
  el.innerHTML = `<i class="ti ${over ? "ti-circle-check" : "ti-hourglass"}" aria-hidden="true"></i><span class="num">${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}</span><span class="mut" style="font-size:13px">${over ? "rest done" : "rest"}</span><span class="acts"><button id="rest-add">+30s</button><button id="rest-skip">${over ? "Hide" : "Skip"}</button></span>`;
  el.querySelector("#rest-add").onclick = () => {
    endsAt = Math.max(endsAt, Date.now()) + 30000; extra += 30; alerted = false;
    scheduleEnd(); draw();
  };
  el.querySelector("#rest-skip").onclick = hide;
  if (over) finishAlert();
  if (left < -120) hide();
}

function show() {
  const el = document.getElementById("rest");
  if (!el) return;
  el.classList.remove("hidden", "over");
  document.getElementById("app").classList.add("resting");
  clearInterval(timer);
  draw();
  timer = setInterval(draw, 1000);
  scheduleEnd();
  clearNotifications();
}

export function hide() {
  clearInterval(timer); clearTimeout(endTimer);
  endsAt = 0;
  document.getElementById("rest")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("resting");
  clearNotifications();
}

const resting = () => endsAt > Date.now();

// Locking the phone mid-rest puts the end time on the lock screen (Android);
// coming back clears it and catches up on an alert the browser held back.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (resting() && !alerted) notify(`Resting · back at ${clock(endsAt)}`, { body: nextText ? `Next: ${nextText}` : "", silent: true, renotify: false });
  } else {
    clearNotifications();
    if (endsAt && !resting() && !alerted) { alerted = true; buzz([300, 120, 300]); beep(); }
    if (endsAt) draw();
  }
});

// A test the lifter can run from Settings.
export function testAlert() {
  primeAlerts();
  buzz([300, 120, 300, 120, 300]);
  setTimeout(beep, 50);
  if (canNotify()) setTimeout(() => notify("Rest's up", { body: "This is what the end of rest looks like.", renotify: true, vibrate: [400, 150, 400, 150, 400] }), 600);
}
