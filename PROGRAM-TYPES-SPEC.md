# Program Types — spec

Status: proposed (Nov 25 2026). Builds on the rep-jump fix and calibration test sets (commit 697389b).

## 1. Why, and what the research actually says

The goal is several ways to make progress (sets, reps at a fixed tempo, reps per cluster, rest, load), not only a rising 1RM estimate. Before designing it, the honest baseline:

| Question | What the evidence shows | What it means for the app |
|---|---|---|
| Does tempo change growth? | Reps of 0.5–8 s total grow muscle about equally. Very slow reps (>10 s) are worse (Schoenfeld 2015). A 2025 Bayesian meta-analysis that split lowering from lifting found tempo has little overall effect (Enes et al. 2025, 14 RCTs). Some single studies favor a 4 s lowering for parts of the quads (Kojic 2025; Azevedo 2022). | Tempo is a **control and consistency tool**, not a growth hack. Keep every rep ≤ 8 s. Never prescribe a deliberately slow lifting phase: slower lifting phases trade off strength gains (Amdi & King 2025). |
| Per-exercise "best tempo"? | No study ranks tempos per exercise. | Per-exercise tempos come from **mechanics**: pause where the muscle is stretched *and* the exercise is stable enough to do it safely, and remove bounce (calves, leg press). Rules in §4. |
| Muscle length | Training at long muscle lengths tends to grow more than at short lengths (2025 systematic review). Lengthened partials ≈ full ROM in trained lifters' arms (Wolf et al. 2025). | Stretch pauses and lengthened partials are worth their own block. |
| Volume | More weekly sets → more growth, with diminishing returns (Pelland et al. 2024/2026, 67 studies). The returns flatten faster for strength than for size. | Volume stays the main lever and the default block. |
| Proximity to failure | Growth improves as sets end closer to failure (Robinson et al. 2024). Strength gains are similar across a wide RIR range. | Every block keeps sets near failure. Blocks differ in *how*, not in effort. |
| Rest | Small benefit to resting > 60 s, unclear benefit past ~90 s (Singer et al. 2024). Short rest only hurts when it cuts the reps you can do. | Density/metabolic work may shorten rest only on isolation, and only while reps hold. |
| Myo-reps | Similar growth and strength to straight sets in less time (Bradshaw et al. 2025, trained men, 8 wk). | Myo-reps are a legitimate block, not just a stall-breaker. |
| Periodization model | Linear vs undulating: no difference in growth (Grgic 2017; Moesgaard 2022, volume-equated). | Rotating block types does **not** add growth by itself. It's for joints, staleness, breaking stalls and giving the app more ways to measure progress. The default stays the Volume block. |

## 2. The program types

Every block keeps the current block shape (4–6 accumulation weeks + deload), calibration test sets in week 1, and RIR ending at 1 (compounds) or 0 (last isolation set, final week).

| Type | Sets | Reps | Effort | Tempo | Rest | Techniques | What "progress" means |
|---|---|---|---|---|---|---|---|
| **Volume** (default) | Start at MEV, add toward MAV/MRV | Exercise defaults | RIR 3 → 1 | Standard (§4) | 2–3 min compounds, 1.5–2 min isolation | Myo-reps/partials only when stalled | Weekly hard sets, then reps at load |
| **Tempo / Control** | ~75% of Volume (MEV → MAV) | Compounds 6–12, isolation 8–15 | RIR 2 → 1 | Tempo column (§4) | Same as Volume | None | Reps and load **at the same tempo** |
| **Metabolic / Density** | MEV → MAV, isolation-weighted | Isolation 15–30, compounds 8–12 | RIR 2 → 0 (isolation) | Standard | Isolation 60–90 s, compounds unchanged | Myo-reps on machine/cable isolation (last set) | Total cluster reps, or same reps with less rest (uses logged rest times) |
| **Stretch** | Same as Volume | Exercise defaults | RIR 3 → 1 | Standard + stretch pause 1–2 s | Same as Volume | Lengthened partials after the last set on machines/cables | Reps at load, plus partial reps |
| **Strength base** (optional) | Compounds at MEV, isolation at maintenance | Compounds 5–8, isolation 10–15 | RIR 3 → 2 | Standard | 3–4 min compounds | None | Estimated 1RM on 2–3 compounds |

Strength base is never suggested while a joint flag covers the region it would load.

### Block-to-block suggestions (the app proposes, you choose)

- Volume block ended with ≥ 2 stalled muscles, or hit MRV → suggest **Metabolic** or **Stretch**.
- A joint flag is active, or the in-app "anxious/unsure on this lift" note was used → suggest **Tempo** (lighter loads, more control).
- Two hypertrophy blocks in a row → offer **Strength base** (skip if flagged).
- Otherwise → repeat **Volume**.

## 3. Progress has to compare like with like

This is the part most apps get wrong, and the same mistake as the rep-jump bug: comparing numbers done under different conditions.

- Every logged set stores a **context**: `{ blockType, tempo, technique, restTargetSec }`.
- Progression levers (`engine/progress.js`) anchor only to history in the **same context**. Tempo 3-1-1-0 at 80 lb is not compared to standard tempo at 90 lb.
- When the context changes (new block type), the first session is a **calibration test set**. Until there's history in the new context, the strength model converts using a starting factor (tempo: 0.88× the standard-tempo estimate; stretch pause: 0.93×), which the test set then corrects.
- The Progress screen shows one line per context, so a tempo block reads as its own climb, not as "weights went down."

## 4. Tempo for each exercise type

Notation is **lower – pause in stretch – lift – pause at top**, in seconds. "1" for the lift means *controlled, with intent to move it fast*. Reps slow down as you tire, and that's fine. Every tempo totals ≤ 8 s.

| Pattern (catalog `pattern`) | Standard | Tempo block | Why |
|---|---|---|---|
| horizontal-press: barbell | 2-0-1-0 | 3-1-1-0 | Light touch, 1 s pause on chest removes the bounce. Free weight: pause capped at 1 s. |
| horizontal-press / incline-press: dumbbell, machine | 2-1-1-0 | 3-1-1-0 | Pecs are loaded at the stretch. Stable enough to pause. |
| fly (cable, machine, pec deck) | 2-1-1-0 | 3-2-1-0 | Stretch-biased and stable: longest pause. |
| fly (dumbbell) | 2-1-1-0 | 3-1-1-0 | Shoulder stress at the bottom with free weights: cap at 1 s. |
| vertical-press | 2-0-1-0 | 3-1-1-0 | Pause just above the shoulders, not resting on them. |
| lateral-raise | 2-0-1-0 | 3-0-1-1 | Side delts are hardest at the top. A 1 s hold there beats a pause at the bottom, where there's no tension. Cable versions from behind: 2-1-1-0 standard. |
| rear-delt | 2-0-1-1 | 3-0-1-1 | Hardest in the shortened position. |
| horizontal-row | 2-1-1-0 | 3-1-1-1 | Pause in the stretch (arms long, shoulder blades spread), brief squeeze in the tempo block. |
| vertical-pull | 2-1-1-0 | 3-2-1-0 | Lats are stretched at the top. A full hang is safe on machines/pulldowns. |
| pullover | 2-1-1-0 | 3-2-1-0 | Stretch-biased by design. |
| elbow-flexion: preacher, incline, bayesian cable | 2-1-1-0 | 3-2-1-0 | Biceps loaded at length. |
| elbow-flexion: standing curls, hammer | 2-0-1-0 | 3-1-1-0 | Little tension at the bottom, so a short pause. |
| elbow-extension: overhead | 2-1-1-0 | 3-2-1-0 | Long head stretched overhead. |
| elbow-extension: pushdown | 2-0-1-1 | 3-0-1-1 | Hardest at lockout. |
| squat-machine (hack, pendulum) | 2-1-1-0 | 3-2-1-0 | Stable at the bottom, quads at length. |
| squat-free | 2-0-1-0 | 3-0-1-0 | No pause in the hole with a free bar. |
| leg-press | 2-0-1-0 | 3-1-1-0 | 1 s pause removes the rebound off the sled. Stop before the hips tuck. |
| hip-hinge (RDL) | 2-0-1-0 | 3-1-1-0 | Pause just short of your stretch limit, back neutral. Never at the very end of range. |
| knee-extension | 2-0-1-1 | 3-1-1-1 | Reclined seat lengthens the rectus femoris. A brief squeeze at the top works the vasti. |
| knee-flexion (seated, lying) | 2-1-1-0 | 3-2-1-0 | Seated curls load the hamstrings at length: pause there. |
| hip-extension (hip thrust, kickback) | 2-0-1-1 | 3-0-1-2 | Glutes are hardest at lockout. |
| calf-raise | 2-2-1-0 | 3-2-1-1 | The 2 s bottom pause kills the Achilles bounce. Without it, calf raises are mostly tendon. |
| hip-abduction / hip-adduction | 2-1-1-0 | 3-1-1-0 | Adduction: **no stretch pause** while an adductor joint flag is active. |
| shrug | 1-0-1-1 | 2-0-1-2 | Short range. A top hold is the point. |
| trunk | 2-0-1-0 | 3-1-1-0 | — |

Overrides, in order:
1. **Joint flags** on a muscle or joint: stretch pause → 0, and depth capped (e.g. "stop before the hips tuck"). See §6.
2. **Low-stability exercises** (`stability: "low"`): stretch pause capped at 1 s.
3. **Myo-rep activation sets and lengthened-partial finishers** use the standard tempo. The technique already changes the stimulus.
4. A per-exercise override in the catalog (`tempo: { standard, block }`) beats the pattern default. That's how an exercise added from the internet gets its own tempo.

## 5. Engine changes

- `engine/programs.js` (new): `PROGRAM_TYPES` with `{ id, name, setsFactor, repRanges: { compound, isolation }, rirSchedule, restSec, tempoMode, techniques, exercisePreference, progressMetric }`.
- `engine/tempo.js` (new): `tempoFor(ex, blockType, constraints)` → `{ code: "3-1-1-0", ecc, pause, con, top, why }`, using the table and overrides above.
- `engine/block.js`: a block carries `type`. `blockFor` reads it from the sheet's Program tab (new column) or a directive. The RIR schedule comes from the type.
- `engine/progress.js`: `exerciseHistory(sets, id, ctx)` filters by context. If nothing matches, the app runs `calibrate` with a converted estimate.
- `engine/volume.js`: `setsFactor` scales the weekly target. Stretch and Metabolic blocks prefer exercises with `lengthenedBias ≥ 0.65` / machine and cable isolation when choosing.
- Hard-set counting: a myo-rep cluster (activation set + ≥ 3 mini-sets) counts as **2** hard sets. That's conservative next to claims of "~3 straight sets." Revisit with your own data.
- Rest: `restSec` drives the rest timer target. The Density metric uses the time between set logs (already recorded).

## 6. Injury / joint flag (builds on `data/constraints.js` `joint_flag`)

- New flag targets, e.g. `left-adductor`, with a `rules` set: `no-unilateral-lower`, `no-deep-hip-flexion`, `no-wide-stance`, `no-adduction-stretch`.
- The generator avoids exercises that break a rule. Tempo drops stretch pauses for affected patterns. Leg press gets a "stop before hips tuck" cue.
- Every 10–14 days the coach asks: "Inner thigh: better, same, worse?" Two "better" answers in a row → reintroduce one compound at RIR 3, with a calibration test set and a pain check after set 1.
- If it's not clearly better in about 2 weeks, if walking hurts, or if there's bruising, the coach recommends seeing a physical therapist.

## 7. UI

- Settings → **Program type** picker with a one-line description and what progress means for each type. "Next block" suggestion card at the deload week.
- Train screen: a tempo chip under the exercise name (`3-1-1-0`); tapping it explains the tempo in plain words ("3 s down, 1 s pause at the bottom, up"). Rest timer target follows the block.
- Progress screen: lines split by context (§3).

## 8. Build order and tests

1. `tempo.js` + table + overrides. Tests: every pattern returns ≤ 8 s total, joint flag removes pauses, low stability caps pauses.
2. Set context on logged sets (sheet column `ctx`, backward compatible: missing = standard Volume).
3. Context-aware history + conversion factors + calibration on context change. Tests: a tempo block never anchors to standard-tempo history; the first tempo session has a test set.
4. `programs.js` + block type + RIR/sets/rest per type. Tests: each type's weekly sets land inside its landmarks.
5. Joint flag rules + check-ins.
6. UI: picker, tempo chip, suggestion card, split progress lines.
7. Coach agent prompt: describe types, tempo and the like-for-like rule.

## References

- Schoenfeld, Ogborn & Krieger 2015, repetition duration meta-analysis — https://pubmed.ncbi.nlm.nih.gov/25601394/
- Enes et al. 2025, "How Slow Should You Go?" JSCR 39(12) — tempo split by phase, 14 RCTs
- Amdi & King 2025, eccentric phase duration meta-analysis — https://openrepository.aut.ac.nz/bitstreams/897681c9-8d6d-4595-b739-3ab5b25ca8b1/download
- Kojic, Mandic & Duric 2025, eccentric tempo in squats — https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1531926/full
- Longer vs shorter muscle length systematic review 2025 — https://pmc.ncbi.nlm.nih.gov/articles/PMC12869050
- Wolf et al. 2025, lengthened partials vs full ROM — https://peerj.com/articles/18904
- Pelland et al., volume/frequency dose-response meta-regressions — https://sportrxiv.org/index.php/server/preprint/view/460
- Robinson et al. 2024, proximity to failure meta-regressions — https://rke.abertay.ac.uk/en/publications/exploring-the-dose-response-relationship-between-estimated-resist/
- Singer et al. 2024, rest interval Bayesian meta-analysis — https://pubmed.ncbi.nlm.nih.gov/39205815/
- Bradshaw et al. 2025, myo-reps vs straight sets (JSCR)
- Grgic et al. 2017, linear vs undulating periodization — https://peerj.com/articles/3695
- Moesgaard et al. 2022, periodization in volume-equated programs — https://pubmed.ncbi.nlm.nih.gov/35044672/
