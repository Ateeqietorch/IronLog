# IronLog v3 — handoff

## Files
| File | What it is |
|---|---|
| `CLAUDE-CODE-PROMPT.md` | The prompt to paste into Claude Code |
| `COACH-ENGINE-SPEC.md` | How the coach decides weights, reps, sets, switches, and trials |
| `DESIGN-SPEC.md` | Silver-and-red industrial redesign: tokens, type, components |
| `design-reference.html` | Pixel reference for the three key screens (open in a browser) |
| `HYPERTROPHY-RESEARCH.md` | Training science, app teardown, default PPL+UL template |

## Steps
1. Copy all five files above into the root of the `ateeqietorch/IronLog` repo (next to `FEATURES.md` and `GAP-ANALYSIS.md`) and commit them to `main`.
2. Open Claude Code in the repo.
3. Paste everything below the line in `CLAUDE-CODE-PROMPT.md`.
4. Let it finish one phase at a time. Review the screenshots and test output it shows you before saying "next phase".
5. Phase 5 needs a Cloudflare account (free plan is enough) and your Anthropic API key, added as a Worker secret — Claude Code will give you the exact commands.

## Expect
Phases 0–2 change the numbers, Phase 3 changes the look, Phase 4 adds switching and trials. You can train on the app after Phase 3.
