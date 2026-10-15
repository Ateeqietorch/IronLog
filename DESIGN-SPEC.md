# IronLog v3 — Design Spec
### Silver and red, industrial type · October 2026
Visual reference: open `design-reference.html` in a browser. Where this doc and the reference disagree, this doc wins.

---

## 1. Principles
1. **One big number.** The current set's load × reps is the only large element on the Train screen, readable at arm's length mid-workout. Everything else is quiet.
2. **Red means "now".** Signal red marks the single thing you're doing: the current set, the primary button, the active tab, the rest timer. Nothing else is red. Errors use amber, not red, so red never means "wrong".
3. **One tap per set.** Numbers arrive prefilled; logging is choose reps-in-reserve, then *Done as planned*. Editing exists but is secondary.
4. **Every number explains itself.** A one-line reason sits under the prescription.
5. **Built for a gym:** dark, high contrast, 44px minimum tap targets, usable one-handed with sweaty thumbs, screen stays awake during a session.

---

## 2. Tokens
```css
:root {
  /* surfaces */
  --iron:       #121315;  /* app background */
  --plate:      #1E2024;  /* cards, sheets, chips */
  --plate-deep: #17181B;  /* set rows, inset panels inside cards */
  --seam:       #2E3136;  /* hairlines, borders, empty progress */
  --scrim:      #0B0C0D;  /* behind sheets */
  /* text */
  --silver:     #D9DCE1;  /* primary text */
  --silver-2:   #BFC3C9;  /* reason lines */
  --steel:      #8F959D;  /* secondary text, inactive icons */
  /* accent */
  --red:        #E5383B;  /* "now": current load, active tab, timer icon, links */
  --red-fill:   #CF2E32;  /* primary button / selected chip fill (white text ≥ 4.5:1) */
  --red-dim:    #5A2224;  /* in-progress segment, trial pill border */
  --red-wash:   #2A1416;  /* trial pill background */
  --red-ink:    #F07A7C;  /* text on --red-wash */
  /* status */
  --done:       #7FC48A;  /* completed sets, PRs, "Saved" */
  --warn:       #E8A93A;  /* errors, sync problems, stalls */
  /* shape */
  --r-control: 8px;  --r-button: 10px;  --r-card: 16px;  --r-sheet: 22px;
  --tap: 44px;
}
```
No shadows, no gradients. Depth comes from the three surface steps (iron → plate → plate-deep) and hairlines.

Contrast targets: silver on iron and plate ≥ 12:1; steel on plate ≥ 4.5:1; red text only at ≥ 18px or 500+ weight; white on `--red-fill` ≥ 4.5:1. Verify with a checker after implementation.

---

## 3. Typography
| Role | Face | Weight | Size / line | Case |
|---|---|---|---|---|
| Hero numeral (current load/reps) | Big Shoulders Display | 700 | 84 / 0.85 | — |
| Day title, sheet titles, primary buttons | Big Shoulders Display | 700 | 34 (day), 30 (review title), 22 (buttons) | Uppercase |
| Timer, steppers, big stats | Big Shoulders Display | 600 | 24–26 | — |
| Exercise name | Barlow | 500 | 18 / 1.3 | Sentence |
| Body, set rows, list rows | Barlow | 400 | 15 / 1.4 | Sentence |
| Secondary, reasons, captions | Barlow | 400 | 13 / 1.45 | Sentence |
| Minimum | — | — | 12 (nav labels only) | — |

Load from Google Fonts: `Big Shoulders Display:wght@600;700` and `Barlow:wght@400;500;600`. `font-variant-numeric: tabular-nums` everywhere numbers appear. Uppercase is reserved for Big Shoulders display text; Barlow is always sentence case. Retire DM Mono and Bebas Neue.

(The chat mockups used weight 500 for the display face because of preview constraints; production uses 700.)

---

## 4. Layout and navigation
- Single column, max-width 480px, centered; 12px outer gutter for cards, 18px for headers.
- **Bottom navigation, 4 items:** Train (`barbell`), History (`calendar`), Progress (`chart-line`), Coach (`message-circle`). Icons: Tabler outline, 22px. Active = red icon + label.
- Settings (gym profile, progression preference, engine version, account token) lives behind a gear in the History or Progress header, not in the nav.
- Old top tabs map to: Session → Train; Calendar → History; Progress + Volume + Weight → Progress (three segments: Muscles, Lifts, Body); Library → the switch sheet's search, plus a Library list inside Progress → Lifts.

---

## 5. Components

### 5.1 Train header
- Status line (13px steel): `Week 3 of 5 · leave 2 in the tank` — or `Deload week · easy sets`, or `First session back · one extra rep in the tank`. This single line replaces the meso banner, up-next banner, alert banner, override banner, and feeling-check button.
- Day title in Big Shoulders 34 uppercase.
- Right side: sync state — `Saved` (done green, cloud-check icon), `Saving…` (steel), `Offline, will sync` (warn).
- Exercise progress strip: one 4px segment per exercise; done = red, current = red-dim, upcoming = seam.

### 5.2 Now card (the current exercise)
- `--plate`, radius 16, padding 16.
- Top row: exercise name (18/500) + optional **Trial pill** (`Trial 2 of 3`, 12px, red-ink on red-wash, red-dim border); below it `Set 2 of 3` (13 steel). Right: 40px circular **Switch** button (`arrows-exchange`).
- Hero numeral row: load in `--red`, `×` in steel at 34px, reps in silver. Units underneath at 12 steel (`lb each hand`, `lb incl. bar`, `lb per side`, `added lb` for weighted bodyweight).
- Reason line: inset `--plate-deep` row, trend icon (`trending-up` done-green / `trending-down` warn / `equal` steel) + engine reason (13, silver-2). Tap opens the full reasoning sheet.
- Set rows (44px, radius 8, gap 6):
  - done: plate-deep, `circle-check` in done green, `125 × 10`, right `2 left` steel;
  - now: 1.5px red border, `player-play` red, right `Now` red;
  - upcoming: plate-deep, steel text, `circle`; last set right label `more is fine`;
  - edited/deviated: as done, with the logged numbers and a small `pencil` icon.
- **Reps-left chips:** label `Reps left in the tank`; five 40px chips `0 1 2 3 4+`; prefilled to the planned RIR; selected = red-fill/white.
- **Primary button:** `DONE AS PLANNED` (Big Shoulders 22, 52px, red-fill, radius 10). After a chip other than the plan is chosen, label becomes `LOG SET 2`.
- Secondary text link: `Different numbers? Edit set` → **edit sheet** with two big steppers (load steps follow the gym ladder; reps ±1) and the chips.
- Unilateral: the hero shows one load; set rows show `L 10 · R 9`; edit sheet has per-side reps.

### 5.3 Up next list
Bordered rows (not cards): name left (15), `3 × 15 · 15` right (steel). Tap to jump to that exercise. Long-press to reorder.

### 5.4 Rest dock
Sits above the bottom nav, 44px, plate, radius 10: hourglass (red) · countdown in Big Shoulders 26 · `rest` · right `+30s · Skip`. Starts automatically on logging a set. At zero: icon turns done-green, one short vibration.

### 5.5 Post-exercise check (only when needed)
Inline under the last set, two rows of three chips — *Pump* (weak / good / great) and *Joints* (fine / noticeable / painful). Shown for trial exercises every session, and for the last exercise of each muscle when the engine needs weekly feedback.

### 5.6 Switch sheet
Bottom sheet over a scrim, radius 22 top corners, grab handle.
- Title `Switch incline DB press` (18/500) + `Your chest progress carries over either way` (13 steel).
- **Scope segmented control:** `Today` · `Trial` · `Permanent`. Selected = red-fill.
- When Trial is selected: inset panel `Try it for [−] 3 [+] push sessions` (stepper 2–6) + one line explaining the original stays in the program and you'll get a side-by-side to choose.
- Search field (46px) `Search any exercise`.
- Ranked alternatives as bordered rows: name + one caption — `From your history · 150 × 10` or `Estimated 115 × 10 · first set checks it`.
- Last row in red: `world-search` icon + `Not listed? Look it up` → lookup loading state (`Looking up pendulum squat…`) → profile card (muscles, equipment) with `Save and use` / `Edit details`.

### 5.7 Trial review
Full-screen card shown before the next session of that day once a trial completes.
- Caption `Trial finished · 3 push sessions`; title in Big Shoulders 30 uppercase: `KEEP INCLINE SMITH PRESS?`
- Comparison table on plate: rows *Strength trend*, *Pump*, *Joint comfort*, *Prediction accuracy*; columns original vs trial; the better value in done green (worse never red — red is reserved).
- One steel note on early learning effects.
- Primary button carries the engine's recommendation (`KEEP SMITH PRESS` or `SWITCH BACK`); secondary chips for the other choice and `Extend trial`. If the result is a toss-up: primary reads `KEEP SMITH PRESS` and the note says either is fine.

### 5.8 Progress screen
Segments: **Muscles** (weekly fractional sets per muscle as horizontal bars against the target band; this week's bar silver, target band seam; above-target never red), **Lifts** (strength trend per exercise, sparkline + current estimate), **Body** (bodyweight chart). An **Engine health** row at the bottom of Lifts shows rep-prediction error.

### 5.9 Coach screen
Chat. User bubbles: plate. Coach text: no bubble, silver on iron. Proposed changes render as cards with `Apply` (red-fill) / `Not now`.

---

## 6. Behavior
- **Screen Wake Lock** while a session is active.
- **Haptics:** one short `navigator.vibrate(15)` on logging a set; `[30, 60, 30]` when rest ends. Respect a Settings toggle.
- **Motion:** sheets slide up 220ms ease-out; logging a set checks the row and slides the red border down to the next one (180ms). Nothing animates on its own. `prefers-reduced-motion` → instant.
- **Focus:** visible 2px silver focus ring on keyboard focus.
- Keep the existing offline draft/recovery; surface it as the status line (`Unsaved session from Tuesday · Restore`), not a banner.

---

## 7. Copy
Sentence case (except Big Shoulders display text), plain verbs, no emoji, no exclamation marks. Same action, same name everywhere: the button says `Switch`, the sheet says `Switch …`, the toast says `Switched for today` / `Trial started` / `Switched permanently`. Errors say what happened and what to do: `Couldn't reach your sheet. Your sets are saved on this phone and will sync.`

---

## 8. Remove
Top tab bar · gold/near-black palette · DM Mono / Bebas Neue · uppercase micro-labels · emoji buttons (🤔 ⇄ ✕ 💬 🔍 🪜) · the six banners · 26px set ± buttons (sets are added from the edit sheet or by the engine) · inline e1RM readouts on every set (moved to the reasoning sheet) · the "Override Today" checkbox (replaced by the switch sheet's scope control).
