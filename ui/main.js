// v3 frontend entry point (ES module).
// During the migration the v2 UI in app.js still runs as a classic script.
// This module loads the v3 engine and exposes it on window.IronLogV3 so the
// v2 code can call into it behind the "Engine: v2 / v3" toggle until the
// Phase 3 redesign replaces the UI entirely.
import * as engine from "../engine/index.js";

window.IronLogV3 = Object.freeze({ engine, version: engine.ENGINE_VERSION });
