const SESSIONS_SHEET   = "Sheet1";
const DRAFTS_SHEET     = "Drafts";
const BODYWEIGHT_SHEET = "Bodyweight";
const SWAPS_SHEET       = "ExerciseSwaps";
const SUMMARIES_SHEET   = "SessionSummaries";
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
        EXERCISE_CONSTRAINTS + " Given " +
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
      const priorLog    = recentDayHistoryExcluding(ss, day, sessionKey, 3);
      const abCoreStatus = recentAbCoreCheck(ss, 14);

      const system = "You are a hypertrophy-training coach reviewing a just-completed workout logged in IronLog, " +
        "which auto-applies your recommendations (with the user notified, not asked to confirm each one) — so " +
        "only recommend a change you're genuinely confident about, not a passing observation. Training goal: " +
        TRAINING_GOAL + " Write a short, " +
        "honest, encouraging coaching summary (3-5 sentences): call out notable trends (volume trending low/high " +
        "on a muscle group, RPE drift upward, a pattern of missed/incomplete sets), and if relevant, one concrete " +
        "suggestion for the next session on this day. Ab/core work is intentionally not part of the structured " +
        "program (no tracked exercise for it), but if it hasn't been done in the last 14 days, briefly mention " +
        "it's worth adding a couple sets somewhere — this is a plain-text suggestion only, never a structured " +
        "adjustment (never put it in \"adjustments\", which is for HOLDING an existing programmed exercise). " +
        "Separately, decide: (1) should training deload soon — only " +
        "recommend this for a clear, sustained pattern (RPE pinned near failure across multiple sessions, " +
        "stalling/declining performance on multiple exercises), not from one hard session; (2) for any exercise " +
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function clearByKey(sheet, keyValue, colIndex) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIndex]) === String(keyValue)) sheet.deleteRow(i + 1);
  }
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