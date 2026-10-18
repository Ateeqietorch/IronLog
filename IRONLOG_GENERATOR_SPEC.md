# IronLog — Session Generator Rework Spec

## Problem
The generator currently:
1. Picks the next session by **list order** (Legs A → Legs B ran on consecutive days).
2. Builds sessions by satisfying **one variable** (weekly volume per muscle), so it produced 9 horizontal-row sets across 3 near-identical exercises, and programmed Pendlay rows despite a lower-back constraint.
3. Relies on the user to catch problems by asking the coach.

**Principle:** The user should never have to audit a generated session. Every session must pass validation *before* it is shown. Any deviation from the default rules must be deliberate and explained.

---

## 1. Session selection: recovery-based, not list-based

Replace "next in list" with a readiness score for each candidate session in the program.

**Track per muscle group** (in the Sheet):
- `last_trained_at` (timestamp)
- `last_session_stimulus` = hard sets (RPE ≥ 7) from that session, weighted by RPE (e.g. RPE 7 = 0.8, 8 = 0.9, 9–10 = 1.0)
- `weekly_hard_sets_so_far`

**Recovery windows** (defaults, tunable):
| Muscle size | After ≤ 4 hard sets | After 5+ hard sets |
|---|---|---|
| Large (quads, hams, glutes, back, chest) | 48h | 72h |
| Small (biceps, triceps, delts, calves, abs) | 24h | 48h |
| Spinal erectors / lower back (indirect load counts) | 48h | 72h |

**Selection logic:**
1. For each candidate session, compute readiness = share of its *primary* muscles that are past their recovery window, plus a bonus for muscles furthest below their weekly MEV target.
2. **Hard block:** a session whose primary muscles were primary in the previous session (e.g. Legs A → Legs B) cannot be selected **unless** the program explicitly sets `allow_back_to_back: true` for that block (e.g. a specialization phase). If allowed, the coach states the reason when the session is shown.
3. Pick the highest-readiness session. If none qualify (e.g. user trains 6 days straight), choose the least-fatigued option and say so ("Everything is still recovering. Doing upper today, lower volume.").
4. Account for **indirect load**: rows, RDLs, squats, and deadlifts all add to lower back/erectors; pressing adds to front delts/triceps.

---

## 2. Exercise selection: multi-variable constraints

Each exercise in the library needs these tags:
- `primary_muscles`, `secondary_muscles` (with fractional set credit, e.g. rows = 1.0 lats/upper back, 0.5 biceps)
- `movement_pattern` (horizontal pull, vertical pull, horizontal press, vertical press, hinge, squat, lunge, isolation-[muscle])
- `resistance_profile` (stretch-biased / mid-range / shortened-biased)
- `spinal_load` (none / low / moderate / high)
- `joint_stress_flags` (lower back, shoulder, elbow, knee, wrist)
- `stability` (machine / supported / free)
- `equipment`

**Per-session hard rules:**
- Max **6 sets per movement pattern** per session (tunable).
- Max **2 exercises sharing a movement pattern**, and if there are 2, they must differ in `resistance_profile` or angle (e.g. chest-supported row + wide-grip high row, not chest-supported T-bar + chest-supported DB row).
- No exercise on the user's **avoid list** (see §4).
- If any `joint_stress_flags` match a user constraint, exclude or substitute a lower-stress variant.
- Total `spinal_load` budget per session: no more than one "high" exercise; none if lower back is flagged or not recovered.

**Weekly rules:**
- Each muscle lands between MEV and MRV, counting fractional/indirect sets (e.g. biceps get credit from rows and pulldowns, so curl volume shrinks accordingly).
- Pattern variety across the week: if horizontal pull dominated session 1, vertical pull leads in session 2.
- Prefer high stimulus-to-fatigue exercises (supported/machine) once a muscle is near MRV or fatigue is elevated.

**Optimization order** when constraints conflict:
1. Safety/user constraints (never violated)
2. Recovery
3. Redundancy/pattern caps
4. Weekly volume targets
5. Variety/preference

---

## 3. Pre-session validator

Runs on every generated session before it's displayed.

- **Hard check fails** → regenerate silently (max 3 attempts, then show the best option and explain what couldn't be satisfied).
- **Soft check fails** (e.g. volume slightly under MEV) → show the session with a one-line coach note.
- Validator output is logged so you can see why a session looks the way it does.

The coach agent receives the validator result and, when it changed anything, opens with a short explanation: "Swapped Pendlay for chest-supported T-bar (lower back). Moved pull to tomorrow since back is still recovering."

---

## 4. Persistent constraints store

New Sheet tab `Constraints`:
| type | target | rule | reason | added_at | source |
|---|---|---|---|---|---|
| avoid_exercise | Pendlay row | never | lower back | 2026-10-18 | coach chat |
| joint_flag | lower back | limit spinal_load ≤ moderate | | | |
| preference | horizontal pull | prefer chest-supported | | | |

- When the coach says "noted," it **must** write a row here (tool call to Apps Script), not just remember it in chat.
- The generator and validator read this tab on every run.
- Constraints are viewable/editable in the app.

---

## 5. Acceptance tests

1. After Legs A, the next suggested session is **not** Legs B (unless the program flags back-to-back).
2. Given the old pull day (Pendlay 4, cable row 2, DB row 3, pulldown 3), the validator rejects it: pattern cap exceeded, redundant exercises, avoid-list hit.
3. With "Pendlay row: avoid" in Constraints, Pendlay never appears in any generated session or swap suggestion.
4. With lower back flagged, no session contains more than one moderate spinal-load exercise and zero high.
5. Biceps weekly curl sets drop when row/pulldown volume rises (indirect credit works).
6. Training 3 consecutive days produces three different primary-muscle focuses.
7. Every regenerated or modified session has a one-line coach explanation.
