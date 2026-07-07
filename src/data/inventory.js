// =============================================================================
// INVENTORY — Solar panels and inverters
// -----------------------------------------------------------------------------
// Mirrors the Excel "Inventory" sheet:
//   • Single-phase panel + inverters (cols A–J)
//   • 3-phase panel + inverters     (cols M–U)
//
// The inverter list IS the available stock — admins maintain it by
// adding/removing rows in the Inventory editor. The Excel sheet had a
// per-row availability checkbox (column E single-phase / P 3-phase); we
// dropped it in favor of the simpler add/remove model.
//
// Sorting: lib/calculations.js sorts these largest-first to mirror the
// original Excel VLOOKUP behavior when picking inverter sizes.
//
// v3.2 Excel switch: panel direct price is now a literal value in
// Inventory!D3 (₱8,600 single-phase), no longer a markup-formula derived
// from a supplier cost. Old web app used `markup(9008) ≈ 8,538` — replaced
// with the literal Excel value to keep the math identical.
// =============================================================================

// ─── Panel & DC/AC ratio settings ────────────────────────────────────────────
// Inventory!C3, C5 (single-phase) / N3, N5 (3-phase).

export const PANEL_SETTINGS = {
  singlePhase: {
    panelWatts: 630,                      // C3
    panelDirectPrice: 8600,               // D3 — direct purchase price (PHP)
    maxDcAcRatio: 1.3,                    // C5
  },
  threePhase: {
    panelWatts: 650,                      // N3
    panelDirectPrice: 9000,               // O3 — direct purchase price (PHP)
    maxDcAcRatio: 1.6,                    // N5  (v3: was 1.3)
  },
};

// ─── Inverter catalog — single-phase ─────────────────────────────────────────
// The list IS the available stock — if it's listed, customers can pick it.
// Admins manage this list by adding/removing rows in the Inventory editor.
// Sorted ascending by kW for tidy display.
export const INVERTERS_SINGLE_PHASE = [
  { ratedKw: 5,   directPrice: 58384  },
  { ratedKw: 6,   directPrice: 65967  },
  { ratedKw: 8,   directPrice: 87197  },
  { ratedKw: 12,  directPrice: 122076 },
  { ratedKw: 16,  directPrice: 166054 },
];

// ─── Inverter catalog — 3-phase ──────────────────────────────────────────────
// The list IS the available stock — if it's listed, customers can pick it.
// Admins manage this list by adding/removing rows in the Inventory editor.
// Sorted ascending by kW for tidy display.
export const INVERTERS_THREE_PHASE = [
  { ratedKw: 5,   directPrice: 67142  },
  { ratedKw: 10,  directPrice: 125346 },
  { ratedKw: 16,  directPrice: 190962 },
  { ratedKw: 20,  directPrice: 214832 },
  { ratedKw: 30,  directPrice: 322249 },
  { ratedKw: 50,  directPrice: 537081 },
];
