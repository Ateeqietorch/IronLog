# Phase 0 audit — everything in v2 that changes a load, rep, or set count

Snapshot of `app.js` at commit `0681d5b` (Sept 14 merge). Line numbers refer to that file.
Every item here is replaced by one of three v3 functions: `prescribe()` / `recalcRemaining()` (loads and reps, engine §4) or `volume.js` (sets, engine §5). Nothing on this list gets ported.

## Loads and reps — between sessions
| # | Mechanism | Where | What it does | v3 replacement |
|---|---|---|---|---|
| 1 | `computeTarget()` | 747–882 | 8 branches: deload override, two ladder branches, AI hold, ≥75% hit-ratio bump, undershoot fast-track, RPE ≥ 9.5 hold, +1 rep "maintain" | `prescribe()` |
| 2 | `computeTargetPerSet()` | 895+ | Separate legacy path for unilateral exercises; no e1RM, resets to repMin on every bump | `prescribe()` with per-side models (§4.7) |
| 3 | `effectiveRepCeiling()` | 100 | +2 reps on the ceiling for "dumbbell" names before allowing a jump | Ladder-aware candidate search (§4.3) |
| 4 | `getLoadIncrement()` / `isDumbbellExercise()` | ~38–45 | Guesses 5 lb vs 2.5 lb steps from the exercise name | Gym profile ladders (§3.5) |
| 5 | Ladder sets (`isLadderEnabled`, `LADDER_TAG`) | 46–99 | One set tests the next dumbbell | Removed; the model decides when the heavier rung fits |
| 6 | `computeBackoffPct()` back-off | 21, 770, 787 | 10–25% cut after a failed set | `updateModel()` + `prescribe()` (a failure is just data) |
| 7 | Save-time program weight write | 2250 | After saving, overwrites the permanent program's `weight` with the next target | Models stored per exercise; program holds no weights |
| 8 | AI "hold" adjustments (`setAiAdjustment`, `holdVolume`) | 597–606, 791, 2438 | Post-session AI review freezes progression for an exercise | Coach can explain, never write numbers (§7) |
| 9 | `estimateSwapWeight()` / `TRANSFER_COEFF` | 431–477, 2535, 2553 | Name-keyed transfer ratios for swaps | Cold start (§6.3); ratios kept as seed data |

## Loads and reps — inside a session
| # | Mechanism | Where | What it does | v3 replacement |
|---|---|---|---|---|
| 10 | `autoregulateNextSet()` → `sessionAutoAdjust` | 1767–1797, 1579 | % nudge to the next set's weight from logged RPE | `recalcRemaining()` (§4.4) |
| 11 | `checkFirstSetStruggle()` | 1798–1887 | Set 1 miss → suggested back-off weight **and** adds a set (1871) | `recalcRemaining()` |
| 12 | High-fatigue rep bump | ~1584 | Pushes reps to the upper half when muscle fatigue is high | Readiness (§5.5), session-only |
| 13 | `targetRPEForSet()` climbing RPE per set | 588 | 7.5 → 9.5 across sets | Weekly RIR schedule (§5.3) + fatigue decay in the model |
| 14 | Pre-session feeling check (AI) | 2652–2700 | AI rewrites today's sets/reps/weights via override mode; can cancel a deload | Readiness (§5.5); AI may only propose |

## Set counts
| # | Mechanism | Where | What it does | v3 replacement |
|---|---|---|---|---|
| 15 | `applyVolumeRamp()` | 653–724 | Calendar ramp: +/− sets by mesocycle week and feedback | `volume.js` weekly adjustment (§5.2) |
| 16 | Deload set cut (`_preDeloadSets`) | 673, 682 | Cuts and restores sets in place on the program object | `volume.js` deload (§5.3) |
| 17 | Manual ± set buttons | 2001, 2009 | Edits the program directly | Edit sheet / engine (design §5.2) |
| 18 | Draft merge growing set count | 1419 | Restoring a draft enlarges the program's set count | Drafts never touch the program |
| 19 | AI program redesign | 2817–2910 | Replaces a whole day's exercise list | Coach `propose_program_change` with approval (§7) |
| 20 | Swap modal | 2561–2568 | Rewrites the program's exercise in place | Switch sheet: Today / Trial / Permanent (§6.1) |

## Deload timing
| # | Mechanism | Where | What it does | v3 replacement |
|---|---|---|---|---|
| 21 | `evaluateDeloadSignal()` | 499 | Average RPE ≥ threshold over recent sessions | Performance-based triggers (§5.4) |
| 22 | `getMesocycleState()` / `triggerAiDeload()` / `cancelDeload()` | 526–587 | Calendar meso + AI-triggered/cancelled deloads | `volume.js` meso state, server-side |

**Count: 22 separate mechanisms** (the spec estimated 12; it undercounted the save-time write, the draft merge, the feeling check, and the AI redesign).

## Security notes
- The Apps Script deployment URL is hard-coded in `app.js` line 2, in a **public** repo. Only `save_program` / `load_program` require the token; logging and the AI actions (`ai_review`, feeling check, redesign, reconsider) are open to anyone with the URL, and the AI actions spend your Anthropic key. Phase 1 should put every `doPost` action behind the token. Consider making the repo private, or at least rotating the deployment once the token check covers everything.
- No API keys are committed; the Anthropic key is read from Script Properties.
