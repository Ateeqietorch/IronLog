const SESSIONS_SHEET   = "Sheet1";
const DRAFTS_SHEET     = "Drafts";
const BODYWEIGHT_SHEET = "Bodyweight";
const SWAPS_SHEET       = "ExerciseSwaps";
const SUMMARIES_SHEET   = "SessionSummaries";
const CLAUDE_MODEL       = "claude-sonnet-5";

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
        "intermediate-to-advanced lifter. All weights are in pounds. Never suggest Barbell Back Squat or Barbell " +
        "Deadlift as a substitute (use Hack Squat / Romanian Deadlift patterns instead). Given the exercise the " +
        "user wants reconsidered and their stated reason, propose ONE substitute exercise (can be a different " +
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

      const system = "You are a hypertrophy-training coach reviewing a just-completed workout logged in IronLog. " +
        "Write a short, honest, encouraging coaching summary (3-5 sentences): call out notable trends (volume " +
        "trending low/high on a muscle group, RPE drift upward, a pattern of missed/incomplete sets), and if " +
        "relevant, one concrete suggestion for the next session on this day. Never suggest Barbell Back Squat or " +
        "Barbell Deadlift. Respond with ONLY a single valid JSON object and NOTHING else — no preamble, no explanation, no markdown fences, no closing remarks. Your entire response must start with { and end with }, matching exactly this shape: " +
        '{"summary": string}';

      const userText = "Training day: " + day + " (" + date + ")\n\nJust-logged session:\n" + sessionLog +
        "\n\nRecent sessions on this same day for comparison:\n" + (priorLog || "No prior sessions on record.");

      const raw = callClaude(system, userText, 1536);
      const parsed = parseClaudeJson(raw);
      const summary = parsed && parsed.summary ? parsed.summary : raw;

      const summarySheet = getOrCreateSheet(ss, SUMMARIES_SHEET, ["SessionKey", "Date", "Day", "SummaryText", "Timestamp"]);
      clearByKey(summarySheet, sessionKey, 0);
      summarySheet.appendRow([sessionKey, date, day, summary, new Date().toISOString()]);

      return respond({ ok: true, summary });
    }

    // ── AI: pre-session sanity check ───────────────────────────────────────────
    // Before a session starts. Takes the rule-engine's auto-generated exercise
    // list plus a free-text "how are you feeling" note, and asks Claude whether
    // to adjust weights/sets/reps or swap any exercises for today only. Always
    // returns the FULL exercise list back (unchanged entries included) so the
    // client can apply it wholesale.
    if (action === "ai_presession_check") {
      const day      = e.parameter.day;
      const date     = e.parameter.date;
      const feeling  = e.parameter.feeling || "";
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
        "Never suggest Barbell Back Squat or Barbell Deadlift. You may reduce weight/sets/reps on some or all " +
        "exercises (e.g. fatigue, soreness, low sleep), substitute an exercise (e.g. to avoid a sore joint), or " +
        "make no changes if the note doesn't warrant it — most notes should NOT change a well-designed session. " +
        "Keep \"note\" to ONE short sentence — do not explain your reasoning per exercise, just state the object. " +
        "Respond with ONLY a single valid JSON object and NOTHING else — no preamble, no explanation, no markdown fences, no closing remarks. Your entire response must start with { and end with }, matching exactly this shape: " +
        '{"adjusted": boolean, "exercises": [{"name": string, "sets": number, "repMin": number, "repMax": number, ' +
        '"weight": number, "substituted_from": string|null}], "note": string}. ' +
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
      return respond({ ok: true, adjusted: !!parsed.adjusted, exercises: parsed.exercises, note: parsed.note || "" });
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
        "Match exercise names to the closest one from the day's programmed list below when it's clearly the same " +
        "movement (fix typos and informal names — e.g. a mention of a 'lying' exercise with curl-like numbers is " +
        "probably the programmed Leg Curl, not something else), otherwise use the exercise name as the user " +
        "stated it. Ignore any questions, asides, or commentary that aren't about what was actually done (e.g. " +
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
function callClaude(system, userText, maxTokens) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in Script Properties");

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens || 1024,
    system: system,
    messages: [{ role: "user", content: userText }]
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
    bySession[sessionKey].rows.push({ set, weight, reps, rpe, completed });
  }
  const sessions = Object.values(bySession).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit || 5);
  return sessions.map(s => {
    const sets = s.rows
      .sort((a, b) => a.set - b.set)
      .map(r => "S" + r.set + " " + r.weight + "x" + r.reps + (r.rpe ? " RPE" + r.rpe : "") + (String(r.completed) === "0" ? " (manual)" : ""))
      .join(", ");
    return s.date + ": " + sets;
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
    bySession[sessionKey].rows.push({ exercise, set, weight, reps, rpe, completed });
  }
  const sessions = Object.values(bySession).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit || 3);
  return sessions.map(s => s.date + ":\n" + formatRowsForReview(null, s.rows)).join("\n\n");
}

// Formats either raw sheet rows (from Sheet1) or {exercise,set,weight,reps,rpe,completed}
// objects into a compact per-exercise text block for the AI prompt. A set logged
// without the "hit target" checkbox is tagged (manual) — a cheap signal for
// the review to notice a missed-sets pattern.
function formatRowsForReview(rawRows, objRows) {
  const byExercise = {};
  if (rawRows) {
    rawRows.forEach(row => {
      const [rawDate, day, exercise, set, weight, reps, notes, sessionKey, rpe, completed] = row;
      if (!byExercise[exercise]) byExercise[exercise] = [];
      byExercise[exercise].push({ set, weight, reps, rpe, completed });
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
    return name + ": " + setsStr;
  }).join("\n");
}