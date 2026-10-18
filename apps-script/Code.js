const SESSIONS_SHEET   = "Sheet1";
const DRAFTS_SHEET     = "Drafts";
const BODYWEIGHT_SHEET = "Bodyweight";
const SWAPS_SHEET       = "ExerciseSwaps";
const SUMMARIES_SHEET   = "SessionSummaries";
const PROGRAMS_SHEET    = "Programs";
const CLAUDE_MODEL       = "claude-sonnet-5";

// Explicit training goal, threaded into every AI prompt that proposes or
// evaluates exercises — makes "what is this optimizing for" a stated fact the
// model reasons from, instead of something only implicit in the hand-authored
// default program.
const TRAINING_GOAL = "Balanced hypertrophy across all trained muscle groups — no specific weak-point priority; even development everywhere.";

// Exercise-selection guardrails shared by every prompt that can propose or
// substitute exercises (reconsider, presession-check, redesign).
const EXERCISE_CONSTRAINTS =
  "Never suggest Barbell Back Squat or Barbell Deadlift (use Hack Squat / Romanian Deadlift patterns instead). " +
  "The user wants to preserve their lower back, so never suggest a free-standing, unsupported bent-over row " +
  "(e.g. Pendlay Row, Bent-Over Row) — chest-supported rows (T-Bar, DB) and seated cable/machine rows are fine.";

function doGet(e) {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const action = e.parameter.action;


    // ── Sessions ──────────────────────────────────────────────────────────────
    if (action === "read") {
      const rows = ss.getSheetByName(SESSIONS_SHEET).getDataRange().getValues();
      return respond({ ok: true, rows });
    }

    if (action === "write") {
      const rows  = JSON.parse(e.parameter.rows);
      const sheet = ss.getSheetByName(SESSIONS_SHEET);
      rows.forEach(row => sheet.appendRow(row));
      return respond({ ok: true, msg: "written" });
    }

    if (action === "clear") {
      clearByKey(ss.getSheetByName(SESSIONS_SHEET), e.parameter.sessionKey, 7);
      return respond({ ok: true, msg: "cleared" });
    }

    // ── Read recent sessions for a specific day (for progression analysis) ────
    // Returns last N sessions for a given training day
    if (action === "read_day_history") {
      const sheet    = ss.getSheetByName(SESSIONS_SHEET);
      const day      = e.parameter.day;
      const limit    = parseInt(e.parameter.limit) || 10;
      const allRows  = sheet.getDataRange().getValues();
      const header   = allRows[0];

      // Group rows by sessionKey, filter to requested day
      const sessionMap = {};
      for (let i = 1; i < allRows.length; i++) {
        const [rawDate, rowDay, exercise, set, weight, reps, notes, sessionKey] = allRows[i];
        if (rowDay !== day) continue;
        if (!sessionMap[sessionKey]) sessionMap[sessionKey] = { date: cleanDate(rawDate), day: rowDay, rows: [] };
        sessionMap[sessionKey].rows.push({ exercise, set: parseInt(set), weight, reps, notes, sessionKey });
      }

      // Sort sessions by date descending, take last N
      const sorted = Object.values(sessionMap)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit);

      return respond({ ok: true, sessions: sorted });
    }

    // ── Read all sessions within a date range (for weekly volume) ─────────────
    if (action === "read_week") {
      const sheet    = ss.getSheetByName(SESSIONS_SHEET);
      const fromDate = e.parameter.from; // YYYY-MM-DD
      const toDate   = e.parameter.to;   // YYYY-MM-DD
      const allRows  = sheet.getDataRange().getValues();
      const filtered = [allRows[0]];
      for (let i = 1; i < allRows.length; i++) {
        const date = cleanDate(String(allRows[i][0]));
        if (date >= fromDate && date <= toDate) filtered.push(allRows[i]);
      }
      return respond({ ok: true, rows: filtered });
    }

    // ── Drafts ────────────────────────────────────────────────────────────────
    if (action === "read_draft") {
      const rows = ss.getSheetByName(DRAFTS_SHEET).getDataRange().getValues();
      return respond({ ok: true, rows });
    }

    if (action === "write_draft") {
      const rows  = JSON.parse(e.parameter.rows);
      const sheet = ss.getSheetByName(DRAFTS_SHEET);
      rows.forEach(row => sheet.appendRow(row));
      return respond({ ok: true, msg: "draft written" });
    }

    if (action === "clear_draft") {
      clearByKey(ss.getSheetByName(DRAFTS_SHEET), e.parameter.draftKey, 7);
      return respond({ ok: true, msg: "draft cleared" });
    }

    if (action === "clear_all_drafts") {
      const sheet   = ss.getSheetByName(DRAFTS_SHEET);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
      return respond({ ok: true, msg: "all drafts cleared" });
    }

    // ── Bodyweight ────────────────────────────────────────────────────────────
    if (action === "read_bodyweight") {
      const rows = ss.getSheetByName(BODYWEIGHT_SHEET).getDataRange().getValues();
      return respond({ ok: true, rows });
    }

    if (action === "write_bodyweight") {
      const sheet = ss.getSheetByName(BODYWEIGHT_SHEET);
      sheet.appendRow([e.parameter.date, parseFloat(e.parameter.weight)]);
      return respond({ ok: true, msg: "bodyweight written" });
    }

    if (action === "delete_bodyweight") {
      clearByKey(ss.getSheetByName(BODYWEIGHT_SHEET), e.parameter.date, 0);
      return respond({ ok: true, msg: "bodyweight deleted" });
    }

    // ── Program backup (additive, opt-in) ──────────────────────────────────────
    // Server-side copy of program state (exercises/customDays/dayLabels), which
    // otherwise lives ONLY in localStorage — clearing the browser wipes it with
    // no recovery. This is a BACKUP, not the source of truth: the client still
    // reads/writes localStorage as before on every session; these two actions
    // just mirror it here in the background (save_program, fire-and-forget) and
    // let the user pull a copy back manually (load_program, via an explicit
    // "Restore from cloud backup" action — never automatic, never silent).
    // Token-gated via checkAuthToken's bootstrap-on-first-use: this raises the
    // bar above a fully open endpoint, but a token embedded in client-side JS
    // is not real secrecy — anyone who reads the deployed JS can find it. It's
    // sized for "not casually discoverable by scanning," not for hostile actors.
    if (action === "save_program") {
      if (!checkAuthToken(e.parameter.token)) return respond({ ok: false, msg: "unauthorized" });
      const sheet = getOrCreateSheet(ss, PROGRAMS_SHEET, ["UpdatedAt", "ProgramJSON"]);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
      sheet.appendRow([new Date().toISOString(), e.parameter.program]);
      return respond({ ok: true, msg: "program backed up" });
    }

    if (action === "load_program") {
      if (!checkAuthToken(e.parameter.token)) return respond({ ok: false, msg: "unauthorized" });
      const sheet = getOrCreateSheet(ss, PROGRAMS_SHEET, ["UpdatedAt", "ProgramJSON"]);
      const data  = sheet.getDataRange().getValues();
      if (data.length < 2) return respond({ ok: true, program: null });
      const [updatedAt, programJson] = data[1];
      return respond({ ok: true, program: programJson, updatedAt: String(updatedAt) });
    }

    // ── AI: per-exercise reconsideration ───────────────────────────────────────
    // On-demand, mid-session. Pulls recent history for the exercise itself
    // (never trusts the client to supply it), asks Claude for a substitute +
    // adjusted sets/reps/weight, returns a suggestion the user can accept/dismiss.
    if (action === "ai_reconsider") {
      const exercise = e.parameter.exercise;
      const day      = e.parameter.day;
      const group    = e.parameter.group || "Other";
      const sets     = e.parameter.sets;
      const repMin   = e.parameter.repMin;
      const repMax   = e.parameter.repMax;
      const weight   = e.parameter.weight;
      const reason   = e.parameter.reason || "";

      const history = recentExerciseHistory(ss, exercise, 5);

      const system = "You are a hypertrophy-training assistant embedded in IronLog, a workout tracker for an " +
        "intermediate-to-advanced lifter. All weights are in pounds. Training goal: " + TRAINING_GOAL + " " +
        EXERCISE_CONSTRAINTS + " A note containing \"[ladder-test]\" marks a set deliberately logged heavier and " +
        "lower-rep than the exercise's other sets that session — a one-set test of the next dumbbell size, not a " +
        "logging inconsistency. Given " +
        "the exercise the user wants reconsidered and their stated reason, propose ONE substitute exercise (can be a different " +
        "movement pattern, or the same exercise with adjusted parameters if that better fits the reason) with " +
        "adjusted sets/rep range/working weight, and a brief rationale (1-2 sentences). " +
        "Respond with ONLY a single valid JSON object and NOTHING else — no preamble, no explanation, no markdown fences, no closing remarks. Your entire response must start with { and end with }, matching exactly this shape: " +
        '{"substitute_exercise": string, "sets": number, "repMin": number, "repMax": number, "weight": number, "rationale": string}';

      const userText = "Exercise to reconsider: " + exercise + " (" + group + ", training day: " + day + ")\n" +
        "Current prescription: " + sets + " sets x " + repMin + "-" + repMax + " reps @ " + weight + "lb\n" +
        "User's stated reason: " + reason + "\n\n" +
        "Recent history for this exercise (most recent first):\n" + (history || "No prior logged sessions.");

      const raw = callClaude(system, userText, 1536);
      const suggestion = parseClaudeJson(raw);
      if (!suggestion || !suggestion.substitute_exercise) {
        return respond({ ok: false, msg: "Could not parse AI suggestion. Raw: " + String(raw).slice(0, 400) });
      }
      return respond({ ok: true, suggestion });
    }

    // ── AI: log an accepted exercise substitution ──────────────────────────────
    if (action === "log_swap") {
      const sheet = getOrCreateSheet(ss, SWAPS_SHEET,
        ["Timestamp", "Date", "Day", "ExerciseOriginal", "ExerciseSubstituted", "Reason", "Weight", "Sets", "Reps"]);
      sheet.appendRow([
        new Date().toISOString(), e.parameter.date, e.parameter.day,
        e.parameter.exerciseOriginal, e.parameter.exerciseSubstituted, e.parameter.reason || "",
        e.parameter.weight || "", e.parameter.sets || "", e.parameter.reps || ""
      ]);
      return respond({ ok: true, msg: "swap logged" });
    }

    // ── AI: end-of-session review ───────────────────────────────────────────────
    // Runs once per saved session. Summarizes the session just logged against
    // recent history for the same day, stores the summary, and returns it.
    if (action === "ai_review") {
      const sessionKey = e.parameter.sessionKey;
      const day        = e.parameter.day;
      const date       = e.parameter.date;

      const sheet   = ss.getSheetByName(SESSIONS_SHEET);
      const allRows = sheet.getDataRange().getValues();
      const sessionRows = [];
      for (let i = 1; i < allRows.length; i++) {
        if (String(allRows[i][7]) === String(sessionKey)) sessionRows.push(allRows[i]);
      }
      if (!sessionRows.length) return respond({ ok: false, msg: "session not found: " + sessionKey });

      const sessionLog = formatRowsForReview(sessionRows);
      // 5 prior sessions (not 3) — the deload call now explicitly requires
      // seeing a 3-4 session pattern across several exercises; 3 prior + the
      // just-completed one left no real margin to distinguish a genuine
      // trend from noise.
      const priorLog    = recentDayHistoryExcluding(ss, day, sessionKey, 5);
      const abCoreStatus = recentAbCoreCheck(ss, 14);

      const system = "You are a hypertrophy-training coach reviewing a just-completed workout logged in IronLog, " +
        "which auto-applies your recommendations (with the user notified, not asked to confirm each one) — so " +
        "only recommend a change you're genuinely confident about, not a passing observation. Training goal: " +
        TRAINING_GOAL + " A note containing \"[ladder-test]\" marks a set the app deliberately logged at a HEAVIER " +
        "weight and lower reps than the exercise's other sets that session — a one-set test of the next dumbbell " +
        "size, not a mistake or a sign of inconsistent logging. A missed ladder test is an expected, informative " +
        "outcome on its own, not evidence of decline or fatigue — do not cite it as a reason to hold or deload " +
        "unless the SAME exercise's other, non-tagged sets independently show a real problem. Write a short, " +
        "honest, encouraging coaching summary (3-5 sentences): call out notable trends (volume trending low/high " +
        "on a muscle group, RPE drift upward, a pattern of missed/incomplete sets), and if relevant, one concrete " +
        "suggestion for the next session on this day. Ab/core work is intentionally not part of the structured " +
        "program (no tracked exercise for it), but if it hasn't been done in the last 14 days, briefly mention " +
        "it's worth adding a couple sets somewhere — this is a plain-text suggestion only, never a structured " +
        "adjustment (never put it in \"adjustments\", which is for HOLDING an existing programmed exercise). " +
        "Separately, decide: (1) should training deload soon — a deload is a significant, disruptive intervention " +
        "applied across the ENTIRE program (cuts working weight, cuts volume, caps effort everywhere), so the bar " +
        "is high and it needs broad evidence, not a read on one exercise. You only see this one day's recent " +
        "history, so only recommend it when SEVERAL DIFFERENT exercises on this day each show a genuinely " +
        "sustained pattern over at least 3-4 sessions — RPE consistently pinned near failure, or e1RM/reps " +
        "actually trending down, not just flat. Two sessions of similar numbers on ONE exercise is normal " +
        "week-to-week variance (sleep, stress, a slightly different pump), not stagnation — do not recommend a " +
        "deload from that; if one exercise specifically needs to back off, that's a HOLD (below), not a deload. " +
        "When genuinely unsure whether the pattern is real or noise, default to NOT recommending it — a missed " +
        "deload costs nothing, an unwarranted one discards real progress across the whole program. (2) for any exercise " +
        "that should HOLD at its current weight/reps next time rather than progress (e.g. it's clearly grinding, " +
        "form is breaking down per the notes, or it just took a big jump and needs a session to stabilize) — most " +
        "exercises most sessions should NOT be flagged, only genuinely warranted ones. Never suggest Barbell Back " +
        "Squat or Barbell Deadlift. Respond with ONLY a single valid JSON object and NOTHING else — no preamble, no explanation, no markdown fences, no closing remarks. Your entire response must start with { and end with }, matching exactly this shape: " +
        '{"summary": string, "deload_recommended": boolean, "deload_reason": string|null, ' +
        '"adjustments": [{"exercise": string, "hold": boolean, "note": string}]}';

      const userText = "Training day: " + day + " (" + date + ")\n\nJust-logged session:\n" + sessionLog +
        "\n\nRecent sessions on this same day for comparison:\n" + (priorLog || "No prior sessions on record.") +
        "\n\nAb/core training logged anywhere in the last 14 days? " + abCoreStatus;

      const raw = callClaude(system, userText, 2048);
      const parsed = parseClaudeJson(raw);
      const summary = parsed && parsed.summary ? parsed.summary : raw;
      const deloadRecommended = !!(parsed && parsed.deload_recommended);
      const deloadReason = (parsed && parsed.deload_reason) || "";
      const adjustments = (parsed && Array.isArray(parsed.adjustments)) ? parsed.adjustments.filter(a => a && a.hold) : [];

      const summarySheet = getOrCreateSheet(ss, SUMMARIES_SHEET, ["SessionKey", "Date", "Day", "SummaryText", "Timestamp"]);
      clearByKey(summarySheet, sessionKey, 0);
      summarySheet.appendRow([sessionKey, date, day, summary, new Date().toISOString()]);

      return respond({ ok: true, summary, deloadRecommended, deloadReason, adjustments });
    }

    // ── AI: pre-session sanity check ───────────────────────────────────────────
    // Before a session starts. Takes the rule-engine's auto-generated exercise
    // list plus a free-text "how are you feeling" note, and asks Claude whether
    // to adjust weights/sets/reps or swap any exercises for today only. Always
    // returns the FULL exercise list back (unchanged entries included) so the
    // client can apply it wholesale.
    if (action === "ai_presession_check") {
      const day       = e.parameter.day;
      const date      = e.parameter.date;
      const feeling   = e.parameter.feeling || "";
      const inDeload  = e.parameter.inDeload === "true";
      const deloadReason = e.parameter.deloadReason || "";
      let exercises;
      try { exercises = JSON.parse(e.parameter.exercises); } catch (err) { exercises = []; }
      if (!exercises.length) return respond({ ok: false, msg: "no exercises to check" });

      const planLines = exercises.map(ex =>
        ex.name + " (" + (ex.group || "Other") + "): " + ex.sets + " sets x " + ex.repMin + "-" + ex.repMax +
        " reps @ " + (ex.weight || "BW") + (ex.weight ? "lb" : "")
      ).join("\n");
      const priorLog = recentDayHistoryExcluding(ss, day, "", 2);

      const system = "You are a hypertrophy-training assistant embedded in IronLog. Before the user starts " +
        "today's session, decide whether their stated feeling warrants adjusting it. All weights are in pounds. " +
        "Training goal: " + TRAINING_GOAL + " " + EXERCISE_CONSTRAINTS + " You may reduce weight/sets/reps on some or all " +
        "exercises (e.g. fatigue, soreness, low sleep), substitute an exercise (e.g. to avoid a sore joint), or " +
        "make no changes if the note doesn't warrant it — most notes should NOT change a well-designed session. " +
        "Keep \"note\" to ONE short sentence — do not explain your reasoning per exercise, just state the object. " +
        (inDeload ?
          "The app currently has this user in a deload week (reason: " + (deloadReason || "unspecified") + "). " +
          "If — and only if — the user's stated feeling clearly indicates they feel strong/recovered/ready and " +
          "explicitly don't want the deload (not just a neutral or ambiguous note), set deload_override to true " +
          "so the app cancels it and resumes normal progression. Default to leaving the deload in place; only " +
          "override on a clear, explicit signal from the user. " :
          "The user is not currently in a deload, so deload_override should always be false. ") +
        "Respond with ONLY a single valid JSON object and NOTHING else — no preamble, no explanation, no markdown fences, no closing remarks. Your entire response must start with { and end with }, matching exactly this shape: " +
        '{"adjusted": boolean, "exercises": [{"name": string, "sets": number, "repMin": number, "repMax": number, ' +
        '"weight": number, "substituted_from": string|null}], "note": string, "deload_override": boolean, ' +
        '"deload_override_note": string|null}. ' +
        "The exercises array MUST contain every exercise from the planned session, in the same order, whether " +
        "changed or not — set substituted_from to null for anything not substituted.";

      const userText = "Training day: " + day + " (" + date + ")\n\nPlanned session:\n" + planLines +
        "\n\nHow the user says they're feeling today: " + (feeling || "(nothing stated)") +
        "\n\nRecent sessions on this day for context:\n" + (priorLog || "No prior sessions on record.");

      const raw = callClaude(system, userText, 4096);
      const parsed = parseClaudeJson(raw);
      if (!parsed || !Array.isArray(parsed.exercises)) {
        return respond({ ok: false, msg: "Could not parse AI response. Raw: " + String(raw).slice(0, 500) });
      }
      return respond({
        ok: true, adjusted: !!parsed.adjusted, exercises: parsed.exercises, note: parsed.note || "",
        deloadOverride: inDeload && !!parsed.deload_override,
        deloadOverrideNote: parsed.deload_override_note || ""
      });
    }

    // ── AI: conversational full-day redesign ───────────────────────────────────
    // Proposes/redesigns an ENTIRE training day (exercise selection, order,
    // sets/reps/weight) — unlike ai_reconsider (one exercise) or
    // ai_presession_check (today-only tweaks), this is a permanent program
    // change, and it's a genuine back-and-forth: the client resends the full
    // conversation transcript each turn, the user can ask questions or push
    // back before deciding, and nothing is ever auto-applied here — the
    // client only writes the proposal to the program when the user approves.
    if (action === "ai_redesign_day") {
      const day = e.parameter.day;
      let currentExercises, transcript;
      try { currentExercises = JSON.parse(e.parameter.exercises); } catch (err) { currentExercises = []; }
      try { transcript = JSON.parse(e.parameter.transcript); } catch (err) { transcript = []; }
      if (!Array.isArray(transcript) || !transcript.length) {
        transcript = [{ role: "user", content: "Please propose a redesigned version of today's session." }];
      }

      const planLines = currentExercises.map(ex =>
        ex.name + ": " + ex.sets + " sets x " + ex.repMin + "-" + ex.repMax +
        " reps @ " + (ex.weight || "BW") + (ex.weight ? "lb" : "")
      ).join("\n");
      const priorLog = recentDayHistoryExcluding(ss, day, "", 3);
      const abCoreStatus = recentAbCoreCheck(ss, 14);

      const system = "You are a hypertrophy-training coach redesigning one full training day in IronLog, a " +
        "workout tracker. All weights are in pounds. Training goal: " + TRAINING_GOAL + " " + EXERCISE_CONSTRAINTS + " " +
        "Day being redesigned: " + day + ". Currently programmed:\n" + planLines +
        "\n\nRecent sessions on this day:\n" + (priorLog || "No prior sessions on record.") +
        "\n\nAb/core training logged anywhere in the last 14 days? " + abCoreStatus + " Ab/core work is " +
        "intentionally NOT part of the structured program — do not add an ab/core exercise to \"exercises\" on " +
        "your own initiative. If none has been done recently, you may mention it as a suggestion in \"message\", " +
        "and only add one to \"exercises\" if the user explicitly asks for it in the conversation. " +
        "\n\nDesign a well-ordered day: compound movements before isolation, a sensible exercise count (typically " +
        "5-8), balanced coverage of the muscles this day trains, and NEVER place two isolation exercises for the " +
        "same muscle/movement pattern back-to-back (e.g. two lateral raise variants in a row) — vary the angle or " +
        "separate them with something else. Use appropriate rep ranges per exercise type (compounds lower/heavier, " +
        "isolation higher/lighter) and a reasonable working weight informed by their recent history. " +
        "This is a CONVERSATION — the user may ask questions, push back, or give specific direction between " +
        "proposals. Answer conversationally in \"message\" and only change \"exercises\" when their input actually " +
        "warrants it — if they're just asking a question, return the exact same exercise list you last proposed, " +
        "unchanged. Respond with ONLY a single valid JSON object and NOTHING else — no preamble, no explanation, no markdown fences, no closing remarks. Your entire response must start with { and end with }, matching exactly this shape: " +
        '{"message": string, "exercises": [{"name": string, "sets": number, "repMin": number, "repMax": number, ' +
        '"weight": number|null, "unilateral": boolean}]}';

      const raw = callClaudeMessages(system, transcript, 3072);
      const parsed = parseClaudeJson(raw);
      if (!parsed || !Array.isArray(parsed.exercises) || !parsed.exercises.length) {
        return respond({ ok: false, msg: "Could not parse AI response. Raw: " + String(raw).slice(0, 500) });
      }
      return respond({ ok: true, message: parsed.message || "", exercises: parsed.exercises });
    }

    // ── AI: log a completed session from a free-text description ──────────────
    // For logging a workout after the fact (done offline, or just easier to type
    // as a paragraph than fill in every box by hand) — for ANY date, not just
    // today. Extracts actual per-set weight/reps; never writes to the sheet
    // itself, just returns structured data for the client to load into the
    // normal editable session view for review before Save.
    if (action === "ai_log_description") {
      const day         = e.parameter.day;
      const date        = e.parameter.date;
      const description = e.parameter.description || "";
      let dayExercises;
      try { dayExercises = JSON.parse(e.parameter.exercises); } catch (err) { dayExercises = []; }

      const planLines = dayExercises.map(ex =>
        ex.name + ": " + ex.repMin + "-" + ex.repMax + " reps @ " + (ex.weight || "BW") + (ex.weight ? "lb" : "")
      ).join("\n");

      const system = "You are a data-extraction assistant embedded in IronLog, a workout tracker. The user is " +
        "describing, in their own words, a workout they ALREADY COMPLETED (often logged after the fact, possibly " +
        "days later) — extract the actual weight and reps for each set of each exercise they mention, in order. " +
        "Match exercise names to the closest one from the day's programmed list below ONLY when it's clearly the " +
        "exact same tracked exercise described informally or with a typo (e.g. a mention of a 'lying' exercise " +
        "with curl-like numbers is probably the programmed Leg Curl). NEVER merge across different equipment or " +
        "machine variants even when the base movement matches — 'Smith Machine Hack Squat', 'Machine Hack " +
        "Squat', and 'Hack Squat' are DIFFERENT exercises with different loading characteristics and must stay " +
        "separate. If the user names a specific machine/equipment variant that differs from what's programmed, " +
        "use their exact stated name as its own new exercise rather than merging it into the programmed entry — " +
        "even if the weight looks like a big drop compared to that entry, that's expected when the equipment " +
        "changed, not a real regression, and merging them would corrupt future progression tracking for both. " +
        "Ignore any questions, asides, or commentary that aren't about what was actually done (e.g. " +
        "questions about form, weight conventions, or how to rate the session) — those are not yours to answer " +
        "here, extract logged numbers only. If something is genuinely ambiguous (unclear which exercise a number " +
        "belongs to, missing reps, contradictory info), leave that item out of \"exercises\" and describe it in " +
        "\"clarifications\" instead of guessing. All weights are in pounds. " +
        "Respond with ONLY a single valid JSON object and NOTHING else — no preamble, no explanation, no markdown fences, no closing remarks. Your entire response must start with { and end with }, matching exactly this shape: " +
        '{"exercises": [{"name": string, "sets": [{"weight": number, "reps": number}], "note": string|null}], "clarifications": string[]}';

      const userText = "Training day: " + day + " (" + date + ")\n\nProgrammed exercises for this day:\n" +
        (planLines || "(no program on record for this day)") +
        "\n\nUser's description of what they actually did:\n" + description;

      const raw = callClaude(system, userText, 3072);
      const parsed = parseClaudeJson(raw);
      if (!parsed || !Array.isArray(parsed.exercises)) {
        return respond({ ok: false, msg: "Could not parse AI response. Raw: " + String(raw).slice(0, 500) });
      }
      return respond({ ok: true, exercises: parsed.exercises, clarifications: parsed.clarifications || [] });
    }

    return respond({ ok: false, msg: "unknown action: " + action });

  } catch(err) {
    return respond({ ok: false, msg: err.toString() });
  }
}

// ── v3 data layer (JSON over POST) ──────────────────────────────────────────
// Body: text/plain JSON { action, token, ... } — text/plain keeps the browser
// from sending a CORS preflight, which Apps Script can't answer.
// v3 tables are key/value: one row per record, the record stored as JSON.
// That keeps the schema owned by the engine (COACH-ENGINE-SPEC.md §3) instead
// of by spreadsheet column order, and makes every table the same three calls.
const V3_TABLES = {
  Exercises:      ["Id", "UpdatedAt", "JSON"],
  ExerciseModels: ["Key", "UpdatedAt", "JSON"],
  GymProfiles:    ["Id", "UpdatedAt", "JSON"],
  Trials:         ["Id", "UpdatedAt", "JSON"],
  Review:         ["Name", "UpdatedAt", "JSON"],
  CoachMemory:    ["Id", "UpdatedAt", "JSON"],
  Constraints:    ["Id", "UpdatedAt", "JSON"],
};

// ── Coach (conversational agent) ───────────────────────────────────────────
// The coach reads everything the app knows (sent as context by the client),
// can remember things across conversations, and can PROPOSE changes to
// today's workout. It never sets weights or reps: the engine does that, and
// every proposal is shown to the lifter to approve.
const COACH_MODEL = "claude-sonnet-5-5";

const COACH_TOOLS = [
  {
    name: "propose_changes",
    description: "Propose changes to TODAY's workout. They're shown to the lifter as a card with Apply / Not now; nothing changes until they tap Apply. The app's engine recomputes exact weights and reps for anything you change, so never specify loads or reps.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One short sentence describing the change, in plain language." },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["switch_exercise", "skip_exercise", "set_count", "move_exercise", "change_day"] },
              exerciseIndex: { type: "integer", description: "Index in today's exercise list (0-based)." },
              toExerciseId: { type: "string", description: "For switch_exercise: an exercise id from the catalog list in context." },
              sets: { type: "integer", minimum: 1, maximum: 8, description: "For set_count." },
              toPosition: { type: "integer", description: "For move_exercise (0-based)." },
              dayKey: { type: "string", description: "For change_day: a key from the program days in context." }
            },
            required: ["type"]
          }
        }
      },
      required: ["summary", "changes"]
    }
  },
  {
    name: "add_rule",
    description: "Save a standing training rule the app's generator enforces on every future session: an exercise to never program, a joint to protect, or a preferred exercise. Use this (not remember) whenever the lifter says they don't want an exercise, something hurts, or they prefer one exercise over another. This is what makes \"noted\" true.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["avoid_exercise", "avoid_keyword", "joint_flag", "prefer_exercise"], description: "avoid_exercise / prefer_exercise: target is a catalog exercise id. avoid_keyword: target is a phrase (e.g. \"bent over row\"). joint_flag: target is a muscle such as lower-back, shoulder, knee, elbow." },
        target: { type: "string" },
        reason: { type: "string", description: "A few words, e.g. \"lower back\"." }
      },
      required: ["type", "target"]
    }
  },
  {
    name: "remove_rule",
    description: "Delete a standing training rule by its id from the rules list in context, when the lifter says it no longer applies.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
  },
  {
    name: "remember",
    description: "Save a durable fact about the lifter for future conversations (an injury, equipment their gym lacks, a preference). Keep it to one short sentence. Don't save one-off moods or things already in context.",
    input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] }
  },
  {
    name: "forget",
    description: "Delete a remembered note that's no longer true, by its id from the memory list in context.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
  }
];

function coachSystem(context, memory) {
  return [
    "You are the coach inside IronLog, a hypertrophy training app. You're talking with the lifter on their phone, often mid-workout, so be brief: a few short sentences, no headings, no bullet lists unless they ask for a plan. Plain, direct, friendly. Weights are in pounds.",
    "How the app works: a deterministic engine sets every weight and rep from the lifter's logged sets (a per-exercise strength estimate, a rep-range aim, and a reps-in-reserve target for the week). You don't pick numbers. When you explain a number, use the reason and estimate in context. If the lifter wants different numbers, tell them to log what they actually do; the engine adapts set to set.",
    "You can change today's workout only through propose_changes (switch, skip, set count, reorder, change day). Use it when the lifter asks for a change or clearly needs one (pain, missing equipment, short on time). For switches, choose toExerciseId from the catalog list in context, matching the movement pattern and muscles. Prefer exercises that load the muscle at long lengths when choices are equal.",
    "Evidence you can rely on: about 10+ hard sets per muscle per week, sets taken to roughly 0-3 reps from failure, rest of 90 seconds or more, deloads every 4-6 weeks or when performance drops, adding reps or load both build muscle. Never tell them to train through sharp or joint pain; suggest a pain-free alternative or skipping, and seeing a professional if it persists.",
    "Standing rules are in context.rules. The app enforces them itself: before any workout is shown, a validator swaps avoided exercises, drops near-duplicate exercises, caps sets per movement pattern (6) and per muscle, limits heavy lower-back work, and picks the day by recovery instead of list order. What it changed today is in context.today.checks, and why it chose the day is in context.today.selection. Use those to explain; don't redo their work.",
    "Be proactive: if you see redundant volume, a muscle trained before it recovered, or anything that conflicts with the rules or the goal, say so and propose the fix without waiting to be asked.",
    "When the lifter states a preference or limit about exercises or joints, call add_rule so it sticks. Never say you noted something unless you called add_rule or remember.",
    "Goal: balanced hypertrophy across every trained muscle. context.lastAssessment is how the most recent workout moved them toward it.",
    "Use remember for durable facts that aren't training rules (equipment, schedule). Don't mention the tools by name.",
    "",
    "Remembered notes (id: note):",
    memory.length ? memory.map(m => m.key + ": " + m.value.note).join("\n") : "(none yet)",
    "",
    "App context (JSON):",
    JSON.stringify(context)
  ].join("\n");
}

function callClaudeRaw(payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in Script Properties");
  const resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  return { code: resp.getResponseCode(), body: JSON.parse(resp.getContentText()) };
}

function runCoach(ss, body) {
  const memSheet = getOrCreateSheet(ss, "CoachMemory", V3_TABLES.CoachMemory);
  const memData = memSheet.getDataRange().getValues();
  const memory = [];
  for (let i = 1; i < memData.length; i++) {
    if (!memData[i][0]) continue;
    try { memory.push({ key: String(memData[i][0]), value: JSON.parse(memData[i][2]) }); } catch (e) {}
  }
  const messages = (body.messages || []).slice(-20).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") throw new Error("last message must be from the lifter");

  const proposals = [];
  const remembered = [];
  const rulesAdded = [];
  const rulesRemoved = [];
  const ruleSheet = getOrCreateSheet(ss, "Constraints", V3_TABLES.Constraints);
  let model = COACH_MODEL;
  let reply = "";
  for (let turn = 0; turn < 5; turn++) {
    let res = callClaudeRaw({ model, max_tokens: 1200, system: coachSystem(body.context || {}, memory), tools: COACH_TOOLS, messages });
    if (res.code === 404 && model !== CLAUDE_MODEL) { model = CLAUDE_MODEL; res = callClaudeRaw({ model, max_tokens: 1200, system: coachSystem(body.context || {}, memory), tools: COACH_TOOLS, messages }); }
    if (res.code !== 200) throw new Error("Claude API error " + res.code + ": " + (res.body.error ? res.body.error.message : "unknown"));
    const content = res.body.content || [];
    const text = content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    reply += text;
    const uses = content.filter(b => b.type === "tool_use");
    if (res.body.stop_reason !== "tool_use" || !uses.length) break;
    // The tools only record things, so when the coach has already said
    // something there's nothing to wait for: run them and answer now
    // (one API call instead of two keeps the phone from timing out).
    const finalNow = !!text;
    messages.push({ role: "assistant", content });
    const results = uses.map(u => {
      let out = "ok";
      if (u.name === "propose_changes") { proposals.push(u.input); out = "Shown to the lifter as a card with Apply / Not now. Don't repeat the details; one short line pointing to it is enough."; }
      else if (u.name === "add_rule" && u.input && u.input.type && u.input.target) {
        const rule = { id: "c" + new Date().getTime() + "-" + rulesAdded.length, type: String(u.input.type), target: String(u.input.target).slice(0, 80), reason: String(u.input.reason || "").slice(0, 120), addedAt: new Date().toISOString().slice(0, 10), source: "coach" };
        ruleSheet.appendRow([rule.id, new Date().toISOString(), JSON.stringify(rule)]);
        rulesAdded.push(rule); out = "Saved. The generator applies it from the next session built.";
      } else if (u.name === "remove_rule" && u.input && u.input.id) {
        const data = ruleSheet.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < data.length; i++) if (String(data[i][0]) === String(u.input.id)) {
          let v = {}; try { v = JSON.parse(data[i][2]); } catch (e) {}
          v.removed = true; ruleSheet.getRange(i + 1, 2, 1, 2).setValues([[new Date().toISOString(), JSON.stringify(v)]]); found = true;
        }
        rulesRemoved.push(String(u.input.id)); out = found ? "Removed." : "Removed (it was a built-in rule; the app drops it).";
      } else if (u.name === "remember" && u.input && u.input.note) {
        const id = "m" + new Date().getTime() + "-" + remembered.length;
        memSheet.appendRow([id, new Date().toISOString(), JSON.stringify({ note: String(u.input.note).slice(0, 300) })]);
        remembered.push(u.input.note); out = "Saved.";
      } else if (u.name === "forget" && u.input && u.input.id) {
        const data = memSheet.getDataRange().getValues();
        for (let i = data.length - 1; i >= 1; i--) if (String(data[i][0]) === String(u.input.id)) memSheet.deleteRow(i + 1);
        out = "Deleted.";
      }
      return { type: "tool_result", tool_use_id: u.id, content: out };
    });
    if (finalNow) break;
    messages.push({ role: "user", content: results });
    reply = reply ? reply + "\n" : "";
  }
  reply = reply.trim();
  if (!reply) reply = proposals.length ? "Here's what I'd change:" : (remembered.length || rulesAdded.length) ? "Noted." : "Sorry, I didn't get an answer back. Try asking again.";
  return { reply, proposals, remembered, rulesAdded, rulesRemoved, model };
}

function doPost(e) {
  try {
    let body = {};
    try { body = JSON.parse((e.postData && e.postData.contents) || "{}"); }
    catch (err) { return respond({ ok: false, msg: "bad json" }); }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = body.action;

    if (action === "ping") return respond({ ok: true, msg: "pong" });

    if (action === "coach") {
      const out = Object.assign({ ok: true }, runCoach(ss, body));
      // Phones drop long requests (iOS gives up after about a minute), so the
      // answer is also parked for the app to collect with coach_result.
      if (body.requestId) { try { CacheService.getScriptCache().put("coach:" + body.requestId, JSON.stringify(out), 3600); } catch (err) {} }
      return respond(out);
    }

    if (action === "coach_result") {
      const hit = CacheService.getScriptCache().get("coach:" + String(body.requestId || ""));
      return respond(hit ? JSON.parse(hit) : { ok: true, pending: true });
    }

    // Save one workout atomically: under a lock, drop every row with this
    // session key, then write the new rows in one go. Running it twice gives
    // the same result, so retries can't duplicate sets.
    if (action === "replace_session") {
      const key = String(body.sessionKey || "");
      const rows = body.rows || [];
      if (!key || !Array.isArray(rows) || rows.length > 300) return respond({ ok: false, msg: "need sessionKey and at most 300 rows" });
      if (rows.some(r => String(r[7]) !== key)) return respond({ ok: false, msg: "every row must carry the session key" });
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const sheet = ss.getSheetByName(SESSIONS_SHEET);
        const removed = deleteRowsWhere(sheet, r => String(r[7]) === key);
        if (rows.length) {
          const width = Math.max.apply(null, rows.map(r => r.length));
          if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
          const padded = rows.map(r => { const x = r.slice(); while (x.length < width) x.push(""); return x; });
          sheet.getRange(sheet.getLastRow() + 1, 1, padded.length, width).setValues(padded);
        }
        return respond({ ok: true, removed, written: rows.length });
      } finally { lock.releaseLock(); }
    }

    // One-off repair: remove repeated sets (same session, exercise and set
    // number), keeping the last copy of each.
    if (action === "dedupe_log") {
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const sheet = ss.getSheetByName(SESSIONS_SHEET);
        const data = sheet.getDataRange().getValues();
        const seen = {};
        const drop = {};
        for (let i = data.length - 1; i >= 1; i--) {
          const r = data[i];
          if (!r[7] || !r[2]) continue;
          const k = [r[7], r[2], r[3]].join("|");
          if (seen[k]) drop[i] = true; else seen[k] = true;
        }
        const removed = deleteRowsWhere(sheet, (r, i) => drop[i]);
        return respond({ ok: true, removed });
      } finally { lock.releaseLock(); }
    }

    if (action === "table_list" || action === "table_upsert" || action === "table_delete") {
      const headers = V3_TABLES[body.table];
      if (!headers) return respond({ ok: false, msg: "unknown table: " + body.table });
      const sheet = getOrCreateSheet(ss, body.table, headers);

      if (action === "table_list") {
        const data = sheet.getDataRange().getValues();
        const records = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          try { records.push({ key: String(data[i][0]), updatedAt: String(data[i][1]), value: JSON.parse(data[i][2]) }); }
          catch (err) { records.push({ key: String(data[i][0]), updatedAt: String(data[i][1]), error: "unreadable JSON" }); }
        }
        return respond({ ok: true, records });
      }

      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        const data = sheet.getDataRange().getValues();
        const rowOf = {};
        for (let i = 1; i < data.length; i++) if (data[i][0]) rowOf[String(data[i][0])] = i + 1;

        if (action === "table_upsert") {
          const records = body.records || [];
          if (!Array.isArray(records) || records.length > 500) return respond({ ok: false, msg: "records must be an array of at most 500" });
          const now = new Date().toISOString();
          const appends = [];
          const pending = {};
          records.forEach(rec => {
            const key = String(rec.key || "").trim();
            if (!key) return;
            const json = JSON.stringify(rec.value);
            if (json.length > 45000) throw new Error("record too large: " + key);
            if (rowOf[key]) sheet.getRange(rowOf[key], 1, 1, 3).setValues([[key, now, json]]);
            else if (pending[key] != null) appends[pending[key]] = [key, now, json];
            else { pending[key] = appends.length; appends.push([key, now, json]); }
          });
          if (appends.length) sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, 3).setValues(appends);
          return respond({ ok: true, upserted: records.length, updatedAt: now });
        }

        // table_delete
        const keys = (body.keys || []).map(String);
        const rows = keys.map(k => rowOf[k]).filter(r => r > 0).sort((a, b) => b - a);
        rows.forEach(r => sheet.deleteRow(r));
        return respond({ ok: true, deleted: rows.length });
      } finally {
        lock.releaseLock();
      }
    }

    return respond({ ok: false, msg: "unknown action: " + action });
  } catch (err) {
    return respond({ ok: false, msg: err.toString() });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Bootstrap-on-first-use: no token is set up in advance. The FIRST call to a
// token-gated action stores whatever token the client sent as the accepted
// one from then on; every later call must match it. Reasonable for a
// single-user deployment where the legitimate client is expected to be the
// first caller after each new deployment — not a substitute for real auth if
// this were ever multi-user.
function checkAuthToken(providedToken) {
  if (!providedToken) return false;
  const props  = PropertiesService.getScriptProperties();
  const stored = props.getProperty("PROGRAM_AUTH_TOKEN");
  if (!stored) {
    props.setProperty("PROGRAM_AUTH_TOKEN", providedToken);
    return true;
  }
  return stored === providedToken;
}

function clearByKey(sheet, keyValue, colIndex) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIndex]) === String(keyValue)) sheet.deleteRow(i + 1);
  }
}

// Delete matching data rows (never the header), bottom-up, in contiguous runs.
function deleteRowsWhere(sheet, pred) {
  const data = sheet.getDataRange().getValues();
  let removed = 0;
  let i = data.length - 1;
  while (i >= 1) {
    if (!pred(data[i], i)) { i--; continue; }
    let start = i;
    while (start - 1 >= 1 && pred(data[start - 1], start - 1)) start--;
    sheet.deleteRows(start + 1, i - start + 1);
    removed += i - start + 1;
    i = start - 1;
  }
  return removed;
}

function cleanDate(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("T")) return s.split("T")[0];
  if (s.length >= 10)  return s.slice(0, 10);
  return s.trim();
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headerRow) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headerRow) sheet.appendRow(headerRow);
  }
  return sheet;
}

// ── Claude API ────────────────────────────────────────────────────────────────
// API key lives only here, server-side (Project Settings > Script Properties),
// never in client JS or git.
// Shared HTTP call — takes a full messages array so a multi-turn conversation
// (the redesign-day feature) can send its actual back-and-forth, not just one
// user turn. callClaude() below wraps this for the single-shot actions.
function callClaudeMessages(system, messages, maxTokens) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in Script Properties");

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens || 1024,
    system: system,
    messages: messages
  };

  const resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  const body = JSON.parse(resp.getContentText());
  if (code !== 200) {
    throw new Error("Claude API error " + code + ": " + (body.error ? body.error.message : resp.getContentText()));
  }
  const textBlock = (body.content || []).filter(b => b.type === "text")[0];
  return textBlock ? textBlock.text : "";
}
function callClaude(system, userText, maxTokens) {
  return callClaudeMessages(system, [{ role: "user", content: userText }], maxTokens);
}

// Claude is asked to return raw JSON, but strip markdown fences defensively
// in case it wraps the object anyway.
function parseClaudeJson(raw) {
  if (!raw) return null;
  const text = raw.trim();

  // 1) Straight parse.
  try { return JSON.parse(text); } catch (err) {}

  // 2) Markdown-fenced JSON, in case Claude wrapped it despite instructions.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch (err) {}
  }

  // 3) Prose before/after the object — grab the outermost {...} substring.
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (err) {}
  }

  return null;
}

// Last N sessions (any day) that logged working sets for a given exercise name.
function recentExerciseHistory(ss, exerciseName, limit) {
  const allRows = ss.getSheetByName(SESSIONS_SHEET).getDataRange().getValues();
  const bySession = {};
  for (let i = 1; i < allRows.length; i++) {
    const [rawDate, day, exercise, set, weight, reps, notes, sessionKey, rpe, completed] = allRows[i];
    if (exercise !== exerciseName) continue;
    if (!bySession[sessionKey]) bySession[sessionKey] = { date: cleanDate(rawDate), rows: [] };
    bySession[sessionKey].rows.push({ set, weight, reps, rpe, completed, notes });
  }
  const sessions = Object.values(bySession).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit || 5);
  return sessions.map(s => {
    const sets = s.rows
      .sort((a, b) => a.set - b.set)
      .map(r => "S" + r.set + " " + r.weight + "x" + r.reps + (r.rpe ? " RPE" + r.rpe : "") + (String(r.completed) === "0" ? " (manual)" : ""))
      .join(", ");
    const note = s.rows.map(r => r.notes).find(n => n && String(n).trim());
    return s.date + ": " + sets + (note ? " — note: " + String(note).trim() : "");
  }).join("\n");
}

// Last N sessions for a training day, excluding one sessionKey (the one just saved).
function recentDayHistoryExcluding(ss, day, excludeKey, limit) {
  const overrideLabel = day + " (Override)";
  const allRows = ss.getSheetByName(SESSIONS_SHEET).getDataRange().getValues();
  const bySession = {};
  for (let i = 1; i < allRows.length; i++) {
    const [rawDate, rowDay, exercise, set, weight, reps, notes, sessionKey, rpe, completed] = allRows[i];
    if ((rowDay !== day && rowDay !== overrideLabel) || String(sessionKey) === String(excludeKey)) continue;
    if (!bySession[sessionKey]) bySession[sessionKey] = { date: cleanDate(rawDate), rows: [] };
    bySession[sessionKey].rows.push({ exercise, set, weight, reps, rpe, completed, notes });
  }
  const sessions = Object.values(bySession).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit || 3);
  return sessions.map(s => s.date + ":\n" + formatRowsForReview(null, s.rows)).join("\n\n");
}

// Ab/core work is deliberately NOT part of the structured program (no
// MUSCLE_GROUPS_MAP entry, no EXERCISE_REPO listing, never auto-inserted) —
// but the AI should still notice when none has been logged and say so as a
// plain-text suggestion. Scans ALL logged history (not just one day) for any
// exercise name matching a common ab/core keyword, across every training day,
// since core work doesn't belong to any single day in this program.
const AB_CORE_KEYWORDS = ["crunch","plank","sit-up","situp","leg raise","ab wheel","hanging knee",
  "russian twist","woodchop","dead bug","hollow hold","mountain climber","core","ab rollout"];
function recentAbCoreCheck(ss, windowDays) {
  const rows = ss.getSheetByName(SESSIONS_SHEET).getDataRange().getValues();
  let lastDate = null, lastName = null;
  for (let i = 1; i < rows.length; i++) {
    const exercise = rows[i][2];
    if (!exercise) continue;
    const lower = String(exercise).toLowerCase();
    if (!AB_CORE_KEYWORDS.some(k => lower.includes(k))) continue;
    const d = cleanDate(rows[i][0]);
    if (!lastDate || d > lastDate) { lastDate = d; lastName = exercise; }
  }
  if (!lastDate) return "No ab/core exercise has ever been logged.";
  const daysSince = Math.round((new Date() - new Date(lastDate)) / 86400000);
  if (daysSince <= windowDays) return `Yes — ${lastName} on ${lastDate} (${daysSince} day${daysSince===1?"":"s"} ago).`;
  return `Not recently — last was ${lastName} on ${lastDate} (${daysSince} days ago).`;
}

// Formats either raw sheet rows (from Sheet1) or {exercise,set,weight,reps,rpe,completed,notes}
// objects into a compact per-exercise text block for the AI prompt. A set logged
// without the "hit target" checkbox is tagged (manual) — a cheap signal for
// the review to notice a missed-sets pattern. Notes were previously destructured
// here and then silently dropped — the per-exercise notes field (form cues, how
// it felt) never actually reached any AI prompt despite being saved to the
// sheet every session and despite the ai_review prompt already assuming it had
// this ("form is breaking down per the notes"). Now included once per exercise.
function formatRowsForReview(rawRows, objRows) {
  const byExercise = {};
  if (rawRows) {
    rawRows.forEach(row => {
      const [rawDate, day, exercise, set, weight, reps, notes, sessionKey, rpe, completed] = row;
      if (!byExercise[exercise]) byExercise[exercise] = [];
      byExercise[exercise].push({ set, weight, reps, rpe, completed, notes });
    });
  } else {
    (objRows || []).forEach(r => {
      if (!byExercise[r.exercise]) byExercise[r.exercise] = [];
      byExercise[r.exercise].push(r);
    });
  }
  return Object.entries(byExercise).map(([name, sets]) => {
    const setsStr = sets
      .sort((a, b) => a.set - b.set)
      .map(s => "S" + s.set + " " + s.weight + "x" + s.reps + (s.rpe ? " RPE" + s.rpe : "") + (String(s.completed) === "0" ? " (manual)" : ""))
      .join(", ");
    const note = sets.map(s => s.notes).find(n => n && String(n).trim());
    return name + ": " + setsStr + (note ? " — note: " + String(note).trim() : "");
  }).join("\n");
}