// Moved to src/engine/calculations.js (2026-09-27): the sizing/pricing engine lives in
// src/engine/ so the same files can run outside the browser (see
// src/engine/README.md). This file only re-exports so existing imports keep
// working; new code should import from ../engine/calculations.js directly.
export * from "../engine/calculations.js";
