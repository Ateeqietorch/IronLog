// Loads the full exercise catalog: the lifter's own entries from the sheet
// (manual adds, AI lookups) first, then curated seed, then free-exercise-db.
import { indexCatalog, mergeCatalogs, validateExercise } from "../engine/catalog.js";
import { CURATED } from "../engine/seed/curated.js";
import { tables } from "./sheets.js";

let fedbPromise = null;
const loadFedb = () => (fedbPromise ??= import("../engine/seed/free-exercise-db.js").then((m) => m.FREE_EXERCISE_DB));

export async function loadCatalog({ includeFreeDb = true, opts } = {}) {
  let own = [];
  try {
    own = (await tables.list("Exercises", opts))
      .map((r) => r.value)
      .filter((ex) => ex && validateExercise(ex).length === 0);
  } catch (err) {
    console.warn("Couldn't load your saved exercises; using the built-in catalog.", err);
  }
  const fedb = includeFreeDb ? await loadFedb() : [];
  return indexCatalog(mergeCatalogs(own, CURATED, fedb));
}

export async function saveExercise(ex, opts) {
  const problems = validateExercise(ex);
  if (problems.length) throw new Error("Exercise is incomplete: " + problems.join("; "));
  return tables.upsert("Exercises", [{ key: ex.id, value: ex }], opts);
}
