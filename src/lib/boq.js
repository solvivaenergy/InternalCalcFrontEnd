// Moved out of this repo (2026-09-27): the sizing/pricing engine is the
// @solviva/calc-engine package, released from InternalCalcBackEnd/packages/
// calc-engine so the backend and this app run the identical code. This file
// re-exports so existing imports keep working; new code should import from
// "@solviva/calc-engine/boq.js" directly.
export * from "@solviva/calc-engine/boq.js";

// ─── Odoo "Prod Description" column (v3-222) ─────────────────────────────────
// The engine's row.description is the proposal's own line text, which leads
// with the count ("8 units 630W Solar Panels", "2 unit/s 5kWh Battery …",
// "15m of Add'l. DC Cable", "1 Unit/s Canopy"). Odoo's Bill of Quantities
// already has Quantity and Unit columns, so the count is dropped from the
// description there (user decision, 2026-10-01). Only a LEADING count is
// removed — "Rapid Shutdown Device (RSD) for 8 Solar Panels" explains what
// its quantity covers and stays as printed; "5.00 kW Inverter" has no unit
// word after the number and is untouched. A description that is nothing but
// a count keeps its original text rather than going blank.
const LEADING_COUNT_RE = /^\s*\d+(?:[.,]\d+)?\s*(?:units?\/s|units?|pcs?|pieces?|lots?|m(?:eters?)?)\b\.?\s*(?:of\s+)?/i;

export function odooProdDescription(description) {
  const text = String(description ?? "").trim();
  const stripped = text.replace(LEADING_COUNT_RE, "").trim();
  return stripped || text;
}
