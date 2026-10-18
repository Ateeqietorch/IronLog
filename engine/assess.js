// End-of-workout assessment: is the lifter getting closer to the goal?
// Goal (from the backend's TRAINING_GOAL): balanced hypertrophy across every
// trained muscle. "Closer" means, in order of weight:
//   1. performance going up on the lifts (estimated strength, like-for-like)
//   2. every major muscle getting enough weekly hard sets (10–20), none left behind
//   3. sets taken close enough to failure to count
// Pure: session + rows + index + date in, plain data out.
import { normalizeRows } from "./replay.js";
import { defaultK, e1rmFrom, daysBetween } from "./model.js";
import { muscleState, niceMuscle, listText, WEEKLY_TARGET } from "./recovery.js";

export const MAJOR = ["chest", "lats", "upper-back", "side-delts", "rear-delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];
const UP = 0.01, DOWN = -0.02;

const bestE1rm = (sets, k) => Math.max(...sets.map((s) => e1rmFrom(s.load, s.reps + (s.rir ?? 2), k)));
const comparable = (ex) => ex && !["assisted", "bodyweight-plus"].includes(ex.loadType);
const pct = (x) => `${x > 0 ? "+" : ""}${Math.round(x * 1000) / 10}%`;

export function assessSession({ session, rows, index, date }) {
  const all = normalizeRows(rows, index).sets.filter((s) => s.side !== "R");
  const byEx = new Map();
  for (const s of all) {
    if (!byEx.has(s.id)) byEx.set(s.id, new Map());
    const d = byEx.get(s.id);
    if (!d.has(s.date)) d.set(s.date, []);
    d.get(s.date).push(s);
  }

  // 1. Strength, per exercise done today.
  const strength = [];
  for (const e of session.exercises) {
    if (!e.ex || !e.logged.length || !comparable(e.ex)) continue;
    const k = defaultK(e.ex.kClass);
    const todaySets = e.logged.map((l) => ({ load: l.load, reps: typeof l.reps === "object" ? Math.min(l.reps.L, l.reps.R) : l.reps, rir: l.rir }));
    const now = bestE1rm(todaySets, k);
    const past = [...(byEx.get(e.ex.id) ?? new Map())].filter(([d]) => d < date).sort((a, b) => a[0].localeCompare(b[0]));
    const last = past.length ? bestE1rm(past[past.length - 1][1], k) : null;
    const month = past.filter(([d]) => daysBetween(d, date) >= 21 && daysBetween(d, date) <= 42);
    const base = month.length ? bestE1rm(month[month.length - 1][1], k) : null;
    const change = last ? now / last - 1 : null;
    strength.push({
      id: e.ex.id, name: e.ex.name, now: Math.round(now), last: last && Math.round(last), change,
      monthChange: base ? now / base - 1 : null,
      status: change == null ? "new" : change >= UP ? "up" : change <= DOWN ? "down" : "held",
    });
  }

  // 2. Weekly volume (rolling 7 days, including today).
  const st = muscleState(rows, index, date);
  const trainedToday = new Set();
  for (const e of session.exercises) for (const [m, c] of Object.entries(e.ex?.contributions ?? {})) if (c >= 1 && e.logged.length) trainedToday.add(m);
  const volume = MAJOR.map((m) => {
    const sets = st[m]?.weeklySets ?? 0;
    return { muscle: m, sets, status: sets < WEEKLY_TARGET[0] ? "low" : sets > WEEKLY_TARGET[1] ? "high" : "ok", today: trainedToday.has(m) };
  });
  // Only call a muscle "behind" once there's a full week of history to judge.
  const firstDate = all.reduce((a, s) => (!a || s.date < a ? s.date : a), null);
  const fullWeek = firstDate && daysBetween(firstDate, date) >= 6;
  const behind = fullWeek ? volume.filter((v) => v.sets < WEEKLY_TARGET[0] / 2) : [];

  // 3. Effort: did sets land near the planned reps-in-reserve?
  const logged = session.exercises.flatMap((e) => e.logged);
  const withPlan = logged.filter((l) => l.plannedRir != null && l.rir != null);
  const onTarget = withPlan.filter((l) => Math.abs(l.rir - l.plannedRir) <= 1).length;
  // Sets planned easy (calibration, deload) don't count against effort.
  const tooEasy = logged.filter((l) => l.rir != null && l.rir >= 4 && !(l.plannedRir >= 4) && !session.weekInfo?.deload).length;
  const effort = { sets: logged.length, planned: withPlan.length, onTarget, tooEasy, share: withPlan.length ? onTarget / withPlan.length : null };

  // Verdict.
  const judged = strength.filter((s) => s.status !== "new");
  const up = judged.filter((s) => s.status === "up").length, held = judged.filter((s) => s.status === "held").length, down = judged.filter((s) => s.status === "down").length;
  const perf = judged.length ? (up + 0.5 * held) / judged.length : null;
  const balance = fullWeek ? volume.filter((v) => v.status !== "low").length / volume.length : null;
  const effortOk = effort.share == null ? true : effort.share >= 0.6 && tooEasy <= logged.length * 0.25;

  let verdict;
  if (perf == null) verdict = "baseline";
  else if (perf >= 0.6 && effortOk && down <= 1) verdict = "closer";
  else if (perf >= 0.35 || (down <= 1 && effortOk)) verdict = "steady";
  else verdict = "off";

  const headline = {
    closer: "Closer to your goal",
    steady: "Holding steady",
    off: "Not closer today",
    baseline: "Baseline set",
  }[verdict];

  const lines = [];
  if (judged.length) {
    const ups = judged.filter((s) => s.status === "up").map((s) => `${s.name} ${pct(s.change)}`);
    const downs = judged.filter((s) => s.status === "down").map((s) => `${s.name} ${pct(s.change)}`);
    lines.push(`Strength: ${up} of ${judged.length} lifts up on last time${held ? `, ${held} held` : ""}${down ? `, ${down} down` : ""}.`);
    if (ups.length) lines.push(`Best gains: ${ups.slice(0, 3).join(", ")}.`);
    if (downs.length) lines.push(`Dipped: ${downs.join(", ")}. One off day is normal; two in a row on the same lift is worth a look.`);
  } else {
    lines.push("First time logging these lifts with the new coach, so today is the baseline the next sessions are measured against.");
  }
  const month = strength.filter((s) => s.monthChange != null);
  if (month.length) {
    const avg = month.reduce((a, s) => a + s.monthChange, 0) / month.length;
    lines.push(`Over the last month: ${pct(avg)} average estimated strength across ${month.length} lift${month.length > 1 ? "s" : ""}.`);
  }
  const todayVol = volume.filter((v) => v.today);
  if (todayVol.length) {
    const txt = todayVol.map((v) => `${niceMuscle(v.muscle)} ${Math.round(v.sets)}`).join(", ");
    lines.push(`Weekly sets (last 7 days) for what you trained: ${txt}. Target is ${WEEKLY_TARGET[0]}–${WEEKLY_TARGET[1]}.`);
  }
  if (behind.length) lines.push(`Falling behind for balanced growth: ${listText(behind.map((v) => niceMuscle(v.muscle)))} (under ${WEEKLY_TARGET[0] / 2} sets this week).`);
  if (effort.share != null) {
    lines.push(effortOk
      ? `Effort: ${onTarget} of ${withPlan.length} sets landed within a rep of the target, so they count.`
      : tooEasy > logged.length * 0.25
        ? `Effort: ${tooEasy} sets had 4+ reps left. Those barely count for growth; push closer to the target.`
        : `Effort: only ${onTarget} of ${withPlan.length} sets landed near the target. Log reps-in-reserve honestly and the numbers will match you better.`);
  }

  return { verdict, headline, lines, strength, volume, behind, effort, perf, balance };
}
