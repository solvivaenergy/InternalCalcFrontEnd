// Moved to src/engine/payoff.js (2026-09-27): the sizing/pricing engine lives in
// src/engine/ so the same files can run outside the browser (see
// src/engine/README.md). This file only re-exports so existing imports keep
// working; new code should import from ../engine/payoff.js directly.
export * from "../engine/payoff.js";
