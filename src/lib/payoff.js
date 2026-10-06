// Moved out of this repo (2026-09-27): the sizing/pricing engine is the
// @solviva/calc-engine package, released from InternalCalcBackEnd/packages/
// calc-engine so the backend and this app run the identical code. This file
// only re-exports so existing imports keep working; new code should import
// from "@solviva/calc-engine/payoff.js" directly.
export * from "@solviva/calc-engine/payoff.js";
