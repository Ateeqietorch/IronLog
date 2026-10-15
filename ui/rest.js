// Rest dock (DESIGN-SPEC.md §5.4). Floor of 90 s for hypertrophy work
// (Singer et al. 2024); longer for heavy compounds.
import { buzz } from "./dom.js";

let endsAt = 0, timer = null, extra = 0;

export function restSecondsFor(ex) {
  if (!ex) return 120;
  if (ex.kClass === "leg-press" || ex.kClass === "lower-free") return 180;
  if (ex.kClass === "upper-compound") return 150;
  return 90;
}

export function startRest(ex) {
  endsAt = Date.now() + restSecondsFor(ex) * 1000;
  extra = 0;
  show();
}

function show() {
  const el = document.getElementById("rest");
  if (!el) return;
  el.classList.remove("hidden", "over");
  document.getElementById("app").classList.add("resting");
  clearInterval(timer);
  let buzzed = false;
  const tick = () => {
    const left = Math.round((endsAt - Date.now()) / 1000);
    const over = left <= 0;
    const t = Math.abs(left);
    el.classList.toggle("over", over);
    el.innerHTML = `<i class="ti ${over ? "ti-circle-check" : "ti-hourglass"}" aria-hidden="true"></i><span class="num">${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}</span><span class="mut" style="font-size:13px">${over ? "rest done" : "rest"}</span><span class="acts"><button id="rest-add">+30s</button><button id="rest-skip">${over ? "Hide" : "Skip"}</button></span>`;
    el.querySelector("#rest-add").onclick = () => { endsAt = Math.max(endsAt, Date.now()) + 30000; extra += 30; tick(); };
    el.querySelector("#rest-skip").onclick = hide;
    if (over && !buzzed) { buzzed = true; buzz([30, 60, 30]); }
    if (left < -120) hide();
  };
  tick();
  timer = setInterval(tick, 1000);
}

export function hide() {
  clearInterval(timer);
  document.getElementById("rest")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("resting");
}
