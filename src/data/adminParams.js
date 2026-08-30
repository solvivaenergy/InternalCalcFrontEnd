// =============================================================================
// ADMIN PARAMETERS — every constant from the Excel Admin sheet (v3)
// -----------------------------------------------------------------------------
// All of these are admin-editable in the password-protected Admin panel.
// Default values match the v3.2 .xlsm:
//   Solviva_Calc_v_B_3_2.xlsm  (uploaded May 7, 2026)
//
// IMPORTANT — v3.2 Excel switch from supplier-cost markup to direct prices:
//
//   Earlier Excel versions (and this codebase up through v3-20) derived
//   resale prices from supplier costs via:
//     adminPrice = supplierCost × 0.70 / (1 − BASELINE_RATE)
//   where BASELINE_RATE = Admin!A1 = 0.26144542543429433.
//
//   In v3.2, the Excel Admin sheet column D now holds DIRECT-PURCHASE PRICES
//   (rounded PHP, e.g. ₱1,137 instead of markup(1200) ≈ ₱1,137.36). The
//   markup-divisor formula is no longer applied per cell. To keep the web
//   app's math identical to the Excel, every `markup(supplierCost)` call site
//   below has been replaced with the literal Excel D-column value.
//
//   The `markup()` helper and `BASELINE_RATE` are kept exported (and
//   re-exported by paramsService.js) for backward compatibility — but no
//   longer called inside this file. If a future Excel version reintroduces
//   the supplier-cost-then-markup pattern, the helper is still here.
// =============================================================================

// Baseline markup rate. Excel: Admin!A1.
// No longer used by any prices in this file (all are direct values from the
// v3.2 Excel D-column). Kept exported in case future code needs it.
export const BASELINE_RATE = 0.26144542543429433;

// markup(supplierCost) → admin's selling-price (matches the older Excel
// formula `=cost*70%/(1-A1)`). Kept exported but no longer called below.
export const markup = (supplierCost) =>
  (supplierCost * 0.7) / (1 - BASELINE_RATE);

// ─── Three-phase cabling uplift factors (NEW in v3-62) ───────────────────────
// Multipliers applied to the SINGLE-PHASE cabling tier percentages to derive
// the default THREE-PHASE tier table. Engineering rationale:
//   • DC cabling  ×1.0 — panel-to-inverter string wiring is upstream of the
//     AC phase configuration; identical for a given array size.
//   • AC cabling  ×1.5 — 3 lines + neutral vs 2 conductors: heavier
//     multi-core cable and more terminations.
//   • Conduits    ×1.2 — larger conduit trade size + extra fittings to carry
//     the additional conductors.
//   • Panel board ×1.5 — three-phase load center and 3-pole breakers /
//     disconnects cost noticeably more than 1-/2-pole equivalents.
// Used in two places: (a) the bundled cablingTiersThreePhase default below,
// and (b) paramsService.js migration seeding for saved blobs that predate the
// key (derived from the LIVE single-phase tiers so the seed tracks any admin
// customizations). Engineering can override any 3-phase cell independently
// afterward via the Inventory tab.
export const THREE_PHASE_CABLING_UPLIFT = {
  dcCablePct: 1.0,
  acCablePct: 1.5,
  conduitsPct: 1.2,
  panelBoardPct: 1.5,
};

// Derive a three-phase tier table from a single-phase one by applying the
// uplift factors, rounding each field to whole percentage points (matching
// the whole-percent granularity the CablingTierTable editor works in).
export const deriveThreePhaseCablingTiers = (singlePhaseTiers) =>
  (singlePhaseTiers || []).map((t) => ({
    minPanels: t.minPanels,
    dcCablePct:
      Math.round(t.dcCablePct * THREE_PHASE_CABLING_UPLIFT.dcCablePct * 100) /
      100,
    acCablePct:
      Math.round(t.acCablePct * THREE_PHASE_CABLING_UPLIFT.acCablePct * 100) /
      100,
    conduitsPct:
      Math.round(t.conduitsPct * THREE_PHASE_CABLING_UPLIFT.conduitsPct * 100) /
      100,
    panelBoardPct:
      Math.round(
        t.panelBoardPct * THREE_PHASE_CABLING_UPLIFT.panelBoardPct * 100,
      ) / 100,
  }));

// Bundled single-phase cabling tier defaults — declared outside ADMIN_PARAMS
// so the three-phase default can be derived from the same source. Cloned into
// the ADMIN_PARAMS literal (never referenced directly) so in-place mutation
// by paramsService can't corrupt this constant.
// v3-91 RE-SEED — tiers 1–31 mirror Solviva_Calc_v_B_4_5.xlsm Admin!B33:G40
// (single-phase) exactly. The Excel table is 8 rows; its VLOOKUP holds the
// 31-row rate for any count >31. The 62/103/155/206 rows below are app-only
// commercial tiers (finer resolution for large arrays) with no Excel
// equivalent — PRESERVED on re-seed rather than dropped, so >31-panel quotes
// keep their existing behavior. Drop these four rows for an exact 8-tier
// Excel mirror if commercial resolution is not wanted.
const SINGLE_PHASE_CABLING_TIERS_DEFAULT = [
  {
    minPanels: 1,
    dcCablePct: 0.3,
    acCablePct: 0.2,
    conduitsPct: 0.6,
    panelBoardPct: 0.25,
  },
  {
    minPanels: 8,
    dcCablePct: 0.29,
    acCablePct: 0.16,
    conduitsPct: 0.57,
    panelBoardPct: 0.23,
  },
  {
    minPanels: 10,
    dcCablePct: 0.29,
    acCablePct: 0.13,
    conduitsPct: 0.46,
    panelBoardPct: 0.19,
  },
  {
    minPanels: 13,
    dcCablePct: 0.29,
    acCablePct: 0.13,
    conduitsPct: 0.38,
    panelBoardPct: 0.17,
  },
  {
    minPanels: 16,
    dcCablePct: 0.25,
    acCablePct: 0.11,
    conduitsPct: 0.31,
    panelBoardPct: 0.17,
  },
  {
    minPanels: 19,
    dcCablePct: 0.21,
    acCablePct: 0.11,
    conduitsPct: 0.25,
    panelBoardPct: 0.14,
  },
  {
    minPanels: 24,
    dcCablePct: 0.17,
    acCablePct: 0.09,
    conduitsPct: 0.2,
    panelBoardPct: 0.11,
  },
  {
    minPanels: 31,
    dcCablePct: 0.15,
    acCablePct: 0.09,
    conduitsPct: 0.2,
    panelBoardPct: 0.07,
  },
  // App-only commercial tiers (>31 panels) — no Excel equivalent; preserved.
  {
    minPanels: 62,
    dcCablePct: 0.12,
    acCablePct: 0.04,
    conduitsPct: 0.06,
    panelBoardPct: 0.03,
  },
  {
    minPanels: 103,
    dcCablePct: 0.11,
    acCablePct: 0.04,
    conduitsPct: 0.06,
    panelBoardPct: 0.03,
  },
  {
    minPanels: 155,
    dcCablePct: 0.1,
    acCablePct: 0.04,
    conduitsPct: 0.06,
    panelBoardPct: 0.03,
  },
  {
    minPanels: 206,
    dcCablePct: 0.09,
    acCablePct: 0.04,
    conduitsPct: 0.06,
    panelBoardPct: 0.03,
  },
];

// v3-91 RE-SEED — tiers 1–31 mirror Solviva_Calc_v_B_4_5.xlsm Admin!B44:G51
// (three-phase) EXACTLY. These are hand-tuned in the workbook and DIFFER from
// the uplift-derived values in 12 cells, so they are seeded explicitly rather
// than via deriveThreePhaseCablingTiers(). The >31 commercial tiers keep the
// prior uplift-derived behavior (from the single-phase commercial tiers).
const THREE_PHASE_CABLING_TIERS_DEFAULT = [
  {
    minPanels: 1,
    dcCablePct: 0.3,
    acCablePct: 0.3,
    conduitsPct: 0.72,
    panelBoardPct: 0.37,
  },
  {
    minPanels: 8,
    dcCablePct: 0.29,
    acCablePct: 0.24,
    conduitsPct: 0.68,
    panelBoardPct: 0.34,
  },
  {
    minPanels: 10,
    dcCablePct: 0.29,
    acCablePct: 0.19,
    conduitsPct: 0.55,
    panelBoardPct: 0.28,
  },
  {
    minPanels: 13,
    dcCablePct: 0.29,
    acCablePct: 0.19,
    conduitsPct: 0.45,
    panelBoardPct: 0.25,
  },
  {
    minPanels: 16,
    dcCablePct: 0.24,
    acCablePct: 0.16,
    conduitsPct: 0.37,
    panelBoardPct: 0.24,
  },
  {
    minPanels: 19,
    dcCablePct: 0.21,
    acCablePct: 0.16,
    conduitsPct: 0.3,
    panelBoardPct: 0.21,
  },
  {
    minPanels: 24,
    dcCablePct: 0.17,
    acCablePct: 0.14,
    conduitsPct: 0.24,
    panelBoardPct: 0.15,
  },
  {
    minPanels: 31,
    dcCablePct: 0.15,
    acCablePct: 0.14,
    conduitsPct: 0.24,
    panelBoardPct: 0.11,
  },
  // App-only commercial tiers (>31 panels) — uplift-derived from the
  // single-phase commercial tiers, preserving prior behavior.
  ...deriveThreePhaseCablingTiers(SINGLE_PHASE_CABLING_TIERS_DEFAULT.slice(8)),
];

export const ADMIN_PARAMS = {
  // ─── Interest rates ────────────────────────────────────────────────────────
  // Admin C22, C23, C24, C27, C28, C25
  // ─── MARGINS (v3-83) ──────────────────────────────────────────────────────
  // The two Product levers that turn Engineering's COGS into every direct
  // purchase price in the app. See directFromCogs() in calculations.js.
  //   DP = CEILING( COGS × 1.12 / (1 − grossMargin) / (1.12 × (1 − MDR) − 0.12) )
  // Changing either moves EVERY price at once.
  // ─── FINANCING ENTITY (v3-87) ────────────────────────────────────────────
  // WHO extends the credit. Named in the customer-facing T&Cs and on the PDF's
  // payment-disclosure page.
  //
  // TODAY THIS IS SOLVIVA ENERGY INCORPORATED ITSELF — the seller finances its
  // own installment sales. An OpCo / financing-co split is contemplated but NO
  // SUCH COMPANY EXISTS YET and its name is NOT SETTLED, so naming one in a
  // customer contract would name a non-existent party. Parameterised precisely so
  // that if/when financing is separated this is a ONE-FIELD change, not a release.
  //
  // The MATH is identical either way (same cash flows). What changes is the legal
  // narrative — see the T&C block below and HANDOFF v3-87.
  financingEntityName: "Solviva Energy Incorporated",
  // Set true once the financier is a SEPARATE entity from the seller. Flips the
  // T&C wording from seller-financed installment sale to third-party financing.
  financingEntityIsSeparate: false,

  // ─── GROSS MARGIN SURFACE (v3-92) ─────────────────────────────────────────
  // Gross margin is no longer a flat scalar — it rides a GENLINV curve over the
  // solar array's rated capacity (kWp), fitted through three anchors, exactly as
  // the RTO rate surface rides a curve over tenor/DP. See grossMarginCurve() /
  // grossMarginForCapacity() in calculations.js. Mirrors PRODUCT sheet of
  // Solviva_Calc_v_B_4_8.xlsm:
  //   grossMarginMin @ grossMarginMinKwp — 25th pctile (small systems, floor)
  //   grossMarginMid @ grossMarginMidKwp — 50th pctile (curvature)
  //   grossMarginMax @ grossMarginMaxKwp — 75th pctile (large systems, ceiling)
  // An order with NO solar panels (battery/RSD/inverter-only) is priced at
  // grossMarginMax (the ceiling) — see grossMarginForCapacity().
  grossMarginMinKwp: 1, // kWp of the min-margin anchor
  grossMarginMidKwp: 15, // kWp of the mid-margin anchor (curvature)
  grossMarginMaxKwp: 30, // kWp of the max-margin anchor
  grossMarginMin: 0.2, // 20% — small systems / floor  (legacy fallback)
  grossMarginMid: 0.22, // 22% — mid systems (curvature) (legacy fallback)
  grossMarginMax: 0.3, // 30% — large / ceiling / no-panels default (legacy fallback)
  // v3-142 — package-level gross margin CURVES (CEO request). The per-system-size
  // (kWp) curve is RETAINED, but each package now rides its own curve fitted
  // through the SAME kWp breakpoints above (min/mid/max @ 1/15/30 kWp):
  //   A. Solar package   (panels, inverters, solar labor/install, cabling, roof, location, RSD)
  //   B. Battery package  (battery units, rack, ATS, critical loads, battery labor)
  //   C. Misc package     (misc catalog lines in Step 2F)
  // A no-panels order (battery/RSD/inverter-only) prices at that package's MAX
  // anchor (ceiling), mirroring the legacy no-panels rule. If a package's
  // anchors are absent in an older saved payload, calculations.js falls back to
  // the legacy grossMarginMin/Mid/Max curve.
  grossMarginSolarMin: 0.2, // Solar @ 1 kWp
  grossMarginSolarMid: 0.25, // Solar @ 15 kWp
  grossMarginSolarMax: 0.3, // Solar @ 30 kWp / no-panels
  grossMarginBatteryMin: 0.2, // Battery @ 1 kWp
  grossMarginBatteryMid: 0.26, // Battery @ 15 kWp
  grossMarginBatteryMax: 0.34, // Battery @ 30 kWp / no-panels
  grossMarginMiscMin: 0.2, // Misc @ 1 kWp
  grossMarginMiscMid: 0.27, // Misc @ 15 kWp
  grossMarginMiscMax: 0.35, // Misc @ 30 kWp / no-panels
  // The margin used for the ADMIN Inventory/Engineering "DP Price" columns and the
  // boot price derivation — set DIRECTLY (v3-95) rather than via a reference kWp.
  // Default = the max anchor (ceiling price). Does NOT affect quotes; those resolve
  // their own margin from actual capacity.
  grossMarginReference: 0.3,
  // The acquirer's cut. NOTE: it is deducted from the VAT-INCLUSIVE amount the
  // customer is charged, while the full output VAT is still remitted — which is
  // why the denominator is 0.832, not 0.85. Anjon's original sheet used 0.85 and
  // quietly realised 24.4% against a 26% target; this form realises 26%.
  merchantDiscountRate: 0.15,

  // ─── RTO INTEREST RATE SURFACE (v3-79) ────────────────────────────────────
  // REPLACES the v3-78 flat `baseRtoInterestRate` + small-package risk premium.
  //
  // The rate is now a function of BOTH tenor and down payment, fitted through
  // three anchors with Myerson's generalized-lognormal quantile function (the
  // same curve SimTools' GENLINV() implements). See `rtoRate()` in
  // calculations.js for the full derivation.
  //
  //   rateAnchorMax  @ 60 mo /  0% DP   — the riskiest cell, top-left
  //   rateAnchorMid  @ 30 mo / 25% DP   — sets the CURVATURE of the surface
  //   rateAnchorMin  @  1 mo / 50% DP   — the safest CHARGED cell (Direct Purchase
  //                                       is tenor 0 and interest-free; the surface
  //                                       spans the interest-bearing range 1..60,
  //                                       per the v3-100 tenor-axis split)
  //
  // Placing the mid anchor BELOW the arithmetic mean of the two extremes bends
  // the surface convex — rates stay low across most of the grid and climb
  // steeply only in the long-tenor / low-DP corner, where the credit risk is.
  //
  // rateAnchorMax doubles as the CATALOGUE rate: it is the rate at 60 mo / 0% DP,
  // which is exactly what the "Std. 60-Mo. Term Package Price" means. Using it
  // for the price list keeps the PMT/PV round-trip in computePaymentTerms exact.
  rateAnchorMax: 0.48, // 48% — 60 mo / 0% DP  (also the catalogue rate)
  rateAnchorMid: 0.18, // 18% — 30 mo / 25% DP (curvature)  [v3-99: was 0.15]
  rateAnchorMin: 0.16, // 16% —  1 mo / 50% DP               [v3-99: was 0.12]
  // Blend weight between the two axes: u = w*uTenor + (1-w)*uDownPayment.
  // 0 = down payment alone sets the rate; 1 = tenor alone. At 0.25 the down
  // payment carries three quarters of the weight. This knob provably CANNOT
  // move the three anchors (at each of them uTenor and uDownPayment agree), so
  // it reshapes only the interior of the grid.
  rateTenorWeight: 0.3, // v3-99: was 0.25 — matches v5.1 PRODUCT!C61
  // Every rate snaps to the nearest multiple of this — a rate card, not a
  // continuum. 0.00125 = one eighth of a percentage point.
  rateStepPct: 0.00125,

  earlyPayoffDiscountRate: 0.08, // C28 — 8% NPV discount for ANNEX early payoffs

  // v3-99 — Documentary Stamp Tax rate: ₱1.50 per ₱200 (or part) of the financed
  // amount = 0.0075 (Solviva_Calc_v_B_5_1.xlsm PRODUCT!C3). Charged on financed
  // deals only, prorated by loan-year fraction. Feeds CALCULATOR!AH13 →
  // year-1 IRR outflow + the ANNEX signing payment. Fixed seed for now — NOT in
  // PARAM_KEY_TO_SECTION, so it is not yet admin-editable (keeps the 61-key
  // permissions maps and their sync gate unchanged); surface it as a Product
  // knob in a later release if editability is wanted.
  documentaryStampTaxRate: 0.0075,

  // ─── Mounting support (Admin D32, C33) ─────────────────────────────────────
  // Customer pays max(floor, 13% of panel price). Panel pricing lives on the
  // Inventory page; only the mounting numbers are here.
  mountingSupportFloorCogs: 9019.7, // D32
  mountingSupportFloorPrice: 0, // DERIVED from mountingSupportFloorCogs — see deriveDirectPrices()
  mountingSupportPctOfPanels: 0.13, // C33 — 13% of panel price

  // ─── SINGLE-PHASE AC/DC cabling tier table (Admin B36:G48) ──────────────────
  // Indexed by minimum panel count. Each tier gives the percentage of panel
  // price that the cabling/conduit/panel-board package costs. Excel uses
  // VLOOKUP(panelCount, B37:G44, 6, TRUE) — meaning approximate match, finds
  // the row where panelCount >= B-column threshold.
  // Applies when Step 1A service type = Single-phase.
  cablingTiers: SINGLE_PHASE_CABLING_TIERS_DEFAULT.map((t) => ({ ...t })),

  // ─── THREE-PHASE AC/DC cabling tier table (NEW in v3-62) ────────────────────
  // Same structure and VLOOKUP semantics as cablingTiers, but applies when
  // Step 1A service type = 3-phase. Default is derived from the single-phase
  // table via THREE_PHASE_CABLING_UPLIFT (DC ×1.0, AC ×1.5, Conduits ×1.2,
  // Panel board ×1.5); engineering edits each tier independently thereafter.
  // Not in the Excel reference workbook yet — Excel mirror update deferred.
  cablingTiersThreePhase: THREE_PHASE_CABLING_TIERS_DEFAULT.map((t) => ({
    ...t,
  })),

  // ─── Variable & per-unit charges (Admin D51:D53) ───────────────────────────
  // Direct-purchase prices straight from v3.2 Admin sheet column D.
  additionalDcCablePerMeterCogs: 750, // D51 — extra DC cable beyond 30m
  additionalDcCablePerMeter: 0, // DERIVED from additionalDcCablePerMeterCogs — see deriveDirectPrices()
  additionalAcCablePerMeterCogs: 1600, // D52 — extra AC cable beyond 10m
  additionalAcCablePerMeter: 0, // DERIVED from additionalAcCablePerMeterCogs — see deriveDirectPrices()
  laborInstallationPerKwpCogs: 5500, // D53 — variable solar labor per kWp
  laborInstallationPerKwp: 0, // DERIVED from laborInstallationPerKwpCogs — see deriveDirectPrices()

  // ─── Roof Material (Admin D54:D55) ─────────────────────────────────────────
  // Three options for the customer (Step 2E in web GUI):
  //   metal     → ₱0 (no roof prep needed) — DEFAULT
  //   asphalt   → kWp × roofAsphaltPerKwp
  //   concrete  → kWp × roofConcretePerKwp
  // (These map to Excel M36 values 2, 1, 3 respectively — Excel's
  //  ordering happens to differ, but the math is identical.)
  roofAsphaltPerKwpCogs: 6500, // D54 — Asphalt/Shingles/Tiled per kWp
  roofAsphaltPerKwp: 0, // DERIVED from roofAsphaltPerKwpCogs — see deriveDirectPrices()
  roofConcretePerKwpCogs: 12000, // D55 — Concrete per kWp
  roofConcretePerKwp: 0, // DERIVED from roofConcretePerKwpCogs — see deriveDirectPrices()

  // ─── Location / Delivery (Admin D56:D61) ───────────────────────────────────
  // Three options for the customer (Step 2F in web GUI):
  //   luzon (DEFAULT)
  //        ≤ 30 km from the Parañaque logistics hub (v3-114) → ₱0
  //        > 30 km → luzonOver30FixedFee + (km × luzonOver30PerKm)
  //   dynamic location row → row.fixedFee + (panels × row.perPanel)
  // v3-116 — the four Cebu/Siargao scalars became a DYNAMIC deliveryLocations
  // array (Inventory-tab stock-toggle idiom + add/delete, user-directed).
  // Each row: { id, label, fixedFeeCogs, perPanelCogs, available } with
  // fixedFee/perPanel DERIVED per-row in deriveDirectPrices() at quote margin
  // (battery-packages pattern). Luzon main island (per-km, AA38) and "Other"
  // are STRUCTURAL — not rows here, never deletable. Seed ids 'cebu' /
  // 'siargao' deliberately match the legacy state.location values so existing
  // sessions restore untouched (no STATE_RECORD_VERSION bump).
  // available:false hides the row from the Step 2E dropdown (both modes); a
  // live session holding a hidden/deleted id falls back to Luzon main island
  // (v3-106 "availability never blocks the flow").
  deliveryLocations: [
    {
      id: "cebu",
      label: "Cebu",
      fixedFeeCogs: 37736,
      perPanelCogs: 3740, // D56/D57
      fixedFee: 0,
      perPanel: 0,
      available: true,
    }, // fixedFee/perPanel DERIVED
    {
      id: "siargao",
      label: "Siargao",
      fixedFeeCogs: 327053,
      perPanelCogs: 5748, // D58/D59
      fixedFee: 0,
      perPanel: 0,
      available: true,
    },
  ],
  // ─── Misc materials / labor / services catalog (v3-138) ────────────────────
  // Step 2F used to be six wholly free-form rows: the rep typed a description
  // AND a price, and the line carried `cogs: null` — no COGS basis, no margin
  // discipline, no way to know what any of it actually cost. This catalog is
  // Anjon's BOM Q3 list, maintained on the Engineering tab exactly like
  // deliveryLocations (add / delete / In-stock checkbox), so a rep picks from
  // priced standards instead of inventing numbers.
  //
  // `cogs` is PRE-VAT COST — the workbook's "Cost (VAT Exc)" column, same
  // basis as every other Anjon-entered figure. `price` is DERIVED per row in
  // deriveDirectPrices() at the QUOTE's capacity margin (battery-packages /
  // deliveryLocations pattern), which means the unit price a rep sees in 2F
  // moves with panel count — a ₱4,650 breaker bills at ₱7,825 on a 1 kWp job
  // and ₱8,943 at the 30% ceiling. That is the margin curve working as
  // specified (v3-92), not a bug; user-confirmed before build.
  //
  // COGS carries CENTAVOS here (four rows are ₱4,089.12), unlike the integer
  // COGS scalars elsewhere. directFromCogs() already CEILINGs to whole pesos,
  // so the derived price is unaffected — but rounding the INPUT would silently
  // drift Anjon's sheet, so the editor preserves 2dp.
  //
  // available:false keeps the row (and its price history) but drops it from
  // the 2F dropdown — v3-106 stock idiom. A live session holding a hidden or
  // deleted id prices at ZERO and shows an amber notice in 2F, mirroring
  // "availability never blocks the flow".
  miscCatalog: [
    {
      id: "mc-acb125",
      label: "AC Breaker, 125AT, 2-pole",
      cogs: 4650.0,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb100",
      label: "AC Breaker, 100AT, 2-pole",
      cogs: 4350.0,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb80",
      label: "AC Breaker, 80AT, 2-pole",
      cogs: 4089.12,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb75",
      label: "AC Breaker, 75AT, 2-pole",
      cogs: 4089.12,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb70",
      label: "AC Breaker, 70AT, 2-pole",
      cogs: 4089.12,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb60",
      label: "AC Breaker, 60AT, 2-pole",
      cogs: 4089.12,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb50",
      label: "AC Breaker, 50AT, 2-pole",
      cogs: 4089.12,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb40",
      label: "AC Breaker, 40AT, 2-pole",
      cogs: 4089.12,
      price: 0,
      available: true,
    },
    {
      id: "mc-acb30",
      label: "AC Breaker, 30AT, 2-pole",
      cogs: 4089.12,
      price: 0,
      available: true,
    },
    {
      id: "mc-canopy",
      label: "Canopy",
      cogs: 17920.0,
      price: 0,
      available: true,
    },
    {
      id: "mc-trench",
      label: "Trenching (per Meter)",
      cogs: 6400.0,
      price: 0,
      available: true,
    },
    {
      id: "mc-serem",
      label: "Service Entry Remodelling",
      cogs: 23600.0,
      price: 0,
      available: true,
    },
    { id: "mc-cfei", label: "CFEI", cogs: 15000.0, price: 0, available: true },
    {
      id: "mc-rtpi",
      label: "Request for Temporary Power Interruption",
      cogs: 10000.0,
      price: 0,
      available: true,
    },
    {
      id: "mc-signse",
      label: "Sign and seal of the plan",
      cogs: 10000.0,
      price: 0,
      available: true,
    },
  ],

  luzonOver30FixedFeeCogs: 4625, // D60 — fixed delivery surcharge for Luzon >30km
  luzonOver30FixedFee: 0, // DERIVED from luzonOver30FixedFeeCogs — see deriveDirectPrices()
  luzonOver30PerKmCogs: 132, // D61 — per-km charge for Luzon >30km
  luzonOver30PerKm: 0, // DERIVED from luzonOver30PerKmCogs — see deriveDirectPrices()

  // ─── RSD pricing (Admin D62:D65) ───────────────────────────────────────────
  // Direct prices from v3.2 D-column.
  // v3-106 — rsdAvailable: stock flag for the RSD hardware itself. When false,
  // the Step 2B "Include RSD" checkbox is replaced by an out-of-stock note and
  // App.jsx forces rsdEnabled off in the pricing inputs (so a stale session
  // can't price an unavailable device). Editable in the Inventory tab's
  // Variable Charges section (moved there from Engineering in v3-106); gated
  // by the 'variableCharges' section like the RSD prices beside it.
  rsdAvailable: true,
  rsdVariablePerPanelCogs: 1850, // D62
  rsdVariablePerPanel: 0, // DERIVED from rsdVariablePerPanelCogs — see deriveDirectPrices()
  rsdFixedTransmitterCogs: 9506, // D63
  rsdFixedTransmitter: 0, // DERIVED from rsdFixedTransmitterCogs — see deriveDirectPrices()
  rsdStandaloneLaborPerPanelCogs: 330, // D64
  rsdStandaloneLaborPerPanel: 0, // DERIVED from rsdStandaloneLaborPerPanelCogs — see deriveDirectPrices()
  rsdStandaloneLaborMobilizationCogs: 6607, // D65
  rsdStandaloneLaborMobilization: 0, // DERIVED from rsdStandaloneLaborMobilizationCogs — see deriveDirectPrices()

  // ─── Inverter labor (Admin D68, D69) ───────────────────────────────────────
  inverterStandaloneLaborPerUnitCogs: 2500, // D68
  inverterStandaloneLaborPerUnit: 0, // DERIVED from inverterStandaloneLaborPerUnitCogs — see deriveDirectPrices()
  inverterStandaloneMobilizationCogs: 6607, // D69
  inverterStandaloneMobilization: 0, // DERIVED from inverterStandaloneMobilizationCogs — see deriveDirectPrices()

  // ─── Fixed overhead (Admin D109:D113) ──────────────────────────────────────
  // Total auto-calculated as the sum of the five lines below.
  fixedOverheadDeliveryLogisticsCogs: 19381, // D109
  fixedOverheadDeliveryLogistics: 0, // DERIVED from fixedOverheadDeliveryLogisticsCogs — see deriveDirectPrices()
  fixedOverheadWarehouseCogs: 832, // D110
  fixedOverheadWarehouse: 0, // DERIVED from fixedOverheadWarehouseCogs — see deriveDirectPrices()
  fixedOverheadCustomsCogs: 0, // D111
  fixedOverheadCustoms: 0, // DERIVED from fixedOverheadCustomsCogs — see deriveDirectPrices()
  fixedOverheadSafetySupervisionCogs: 3000, // D112
  fixedOverheadSafetySupervision: 0, // DERIVED from fixedOverheadSafetySupervisionCogs — see deriveDirectPrices()
  fixedOverheadTestingCogs: 3000, // D113
  fixedOverheadTesting: 0, // DERIVED from fixedOverheadTestingCogs — see deriveDirectPrices()

  // ─── Battery packages (v3-54 NEW: array of packages) ──────────────────────
  // Up to v3-53 there was a single hardcoded 5 kWh / 3-cap pack pricing block
  // (six flat scalar keys). v3-54 parameterizes this into an array of N
  // packages where each pack has its own unit size, rack capacity, prices,
  // and a human-readable label. Reps choose the active pack via a Step 2
  // dropdown; customers always get the first pack (index 0).
  //
  // Identity: each pack carries a synthetic 8-char `id` field used as the
  // session-state reference (stable across renames, reorders, and
  // duplicate labels — important when Solviva stocks two same-capacity
  // batteries from different brands like BYD vs. another vendor).
  //
  // v3-71: seed values re-synced to the LIVE admin blob (per user direction,
  // screenshots supplied). The old "legacy D117..." v3-53-parity values are
  // gone — fresh-blob environments now boot with the same Pylontech pricing
  // production runs on. NOTE this deliberately breaks the historical
  // "bit-exact to v3-53" property of default-state quotes; the smoke harness
  // goldens were re-baselined in the same release (see HANDOFF v3-71).
  //
  // Defaults must always contain at least 1 pack. Admin UI in Inventory
  // enforces the floor (× Delete button disabled when only 1 pack remains).
  //
  // Schema for each pack:
  //   id                     — synthetic uuid (string)
  //   label                  — display label, e.g. "5 kWh", "5 kWh BYD"
  //   batteryUnitKwh         — capacity per battery unit (kWh)
  //   batteryUnitPrice       — direct price per battery unit (peso, integer)
  //   batteryRackCapacity    — # of batteries that fit on one rack (integer)
  //   batteryRackPrice       — direct price per rack (peso, integer)
  //   atsPrice               — Automatic Transfer Switch flat charge (peso)
  //   criticalLoadsMaterials — critical-loads sub-panel materials (peso)
  //   laborWithSolarInstall  — labor when bundled w/ solar install (peso)
  //   standaloneLabor        — labor when installed w/o concurrent solar (peso)
  batteryPackages: [
    {
      id: "pkg5kwh01",
      label: "5 kWh Pylontech",
      available: true, // v3-106 — stock flag; false = excluded from the optimizer, the Step 2 dropdown, and fallbacks
      batteryUnitKwh: 5,
      batteryRackCapacity: 3,
      // v3-83 — COGS (pre-VAT), Engineering-entered. Prices below are DERIVED.
      batteryUnitCogs: 50600,
      batteryRackCogs: 10000,
      atsCogs: 6000,
      criticalLoadsMaterialsCogs: 21000,
      laborWithSolarInstallCogs: 18500,
      standaloneLaborCogs: 25000,
      batteryUnitPrice: 0,
      batteryRackPrice: 0,
      atsPrice: 0,
      criticalLoadsMaterials: 0,
      laborWithSolarInstall: 0,
      standaloneLabor: 0,
    },
    {
      // v3-83 — NEW. Anjon's sheet carries a full COGS set for a 16 kWh
      // Pylontech; the app had no such package. Added as a second option (purely
      // additive — no existing quote changes). Battery unit COGS is the sheet's
      // 110,000 + 10,600 = 120,600 (unit + cables & lugs), and the rack COGS is
      // ZERO: the 16 kWh unit is free-standing and needs no rack.
      id: "pkg16kwh01",
      label: "16 kWh Pylontech",
      available: true, // v3-106 — stock flag (see pkg5kwh01)
      batteryUnitKwh: 16,
      batteryRackCapacity: 1,
      batteryUnitCogs: 120600,
      batteryRackCogs: 0,
      atsCogs: 6000,
      criticalLoadsMaterialsCogs: 21000,
      laborWithSolarInstallCogs: 18500,
      standaloneLaborCogs: 25000,
      batteryUnitPrice: 0,
      batteryRackPrice: 0,
      atsPrice: 0,
      criticalLoadsMaterials: 0,
      laborWithSolarInstall: 0,
      standaloneLabor: 0,
    },
  ],

  // ─── Schedule constants (Admin C125:C134) ──────────────────────────────────
  kWhPerKwpPerDay: 3.8, // C125 — daily yield assumption (PH, ~18° tilt)
  batteryEfficiency: 0.92, // C126 — round-trip
  // v3-132 — Mode-1 ("Fewest panels & least solar production wasted") spill
  // tolerance: the recommended battery may leave AT MOST this much raw daily
  // excess unabsorbed (kWh/day). 0 = strict absorb-all (the v3-131 policy).
  // v3-136 — SEED CHANGED 1.0 → 0 (user-directed, alongside the peaks-and-
  // valleys feature): strict absorb-all is the seed baseline again, restoring
  // the v3-131 economics AT SEEDS — the flagship default steps 1×5 → 2×5
  // (Std ₱537,168.04 → ₱622,732.04). ⚠️ The LIVE BLOB likely still holds the
  // v3-132-era 1.0 from a post-deploy save; a seed change does not touch the
  // blob — Engineering must set the live param to 0 and Save for the deployed
  // site to follow. Engineering-editable; NO workbook counterpart (Mode-1
  // policy knob, deferred Excel-sync list).
  maxDailySpillKwh: 0,
  batteryDepthOfDischarge: 0.95, // C127 — usable fraction
  panelAnnualDegradation: 0.005, // C128 — 0.5%/yr loss (also used in NPER for payback)
  lcoeNpvDiscountRate: 0.06, // C129 / C134 — both refer to 6%
  maintenanceInflationRate: 0.03, // C130 — annual inflation on maintenance
  netMeteringEfficiency: 0.5, // C131 — credit value vs full retail rate
  preventiveMaintenancePerPanelCogs: 330, // C132
  preventiveMaintenancePerPanel: 0, // DERIVED from preventiveMaintenancePerPanelCogs — see deriveDirectPrices()
  preventiveMaintenancePerVisitCogs: 3303, // C133
  preventiveMaintenancePerVisit: 0, // DERIVED from preventiveMaintenancePerVisitCogs — see deriveDirectPrices()

  // ─── Promo code discounts (Admin A137:C140) ────────────────────────────────
  // v3-91 RE-SEED — mirrors Solviva_Calc_v_B_4_5.xlsm Admin!A112:C115.
  promoCodes: [
    { code: "SENIOR", label: "Senior Citizen", discount: 0.03 },
    { code: "SOLV", label: "Solviva Partner", discount: 0.15 },
    {
      code: "CASH",
      label: "Cash / Check / Direct Deposit Payment Method",
      discount: 0.12,
    },
    { code: "SEMP", label: "Solviva Employee", discount: 0.2 },
  ],

  // ─── Quote validity ───────────────────────────────────────────────────────
  // Number of days a generated quote remains valid. The "Valid until" date
  // shown on the calculator header and summary is computed as today + this
  // many days. Editable in the admin panel by Product Team and Super Admin;
  // persisted globally via the parameters API so it takes effect across all
  // users on their next page load. Bundled fallback in DEFAULTS.quoteValidityDays
  // is used until paramsService finishes loading on boot.
  quoteValidityDays: 30,

  // ─── Quote limits (NEW v3-68) ──────────────────────────────────────────────
  // Product-settable floors/caps on what reps and customers can select.
  // Defaults are deliberately non-restrictive (no limit at all) so behavior is
  // byte-identical to pre-v3-68 until Product edits them in Admin → Product
  // tab → "Quote Limits". Persisted via the parameters API like all keys.
  //   minSystemKwp      — floors the Step 2A recommendation AND the Selected-
  //                       panels override at ceil(minSystemKwp × 1000 /
  //                       panelWatts) panels. 0 = no minimum. panelCount === 0
  //                       (standalone RSD / inverter-only retrofit orders) is
  //                       deliberately exempt from the floor.
  //   minDpTiers        — (v3-75, replaces the v3-68 scalar minDownPaymentPct)
  //                       TIERED minimum down payment keyed on the quote's
  //                       "Net Price (before DP Discount)" — i.e. AI9 =
  //                       terms.netDirectPrice (v3-80; tenor-independent), which depends on the
  //                       package/promo/tenor but NOT on the DP% itself, so
  //                       there is no circularity. Array of
  //                       { fromNetPrice, minDpPct } rows sorted strictly
  //                       ascending by fromNetPrice; row 0 is ALWAYS the base
  //                       tier at fromNetPrice 0. The applicable tier is the
  //                       last row whose fromNetPrice ≤ the quote's net price;
  //                       its minDpPct (fraction, 0.10 = 10%) hides lower
  //                       Step 3A options, and live/restored quotes below the
  //                       floor snap up to the lowest allowed option. Because
  //                       the net price moves with tenor, lengthening a tenor
  //                       can cross a tier boundary and snap the DP up.
  //                       Legacy blobs carrying the old scalar are migrated
  //                       to a single-row tier in paramsService.applyOverrides
  //                       (client) and parameters.js PUT (server) — the v3-54
  //                       battery-keys pattern.
  //   maxTenorMonths    — hides Step 3B tenor options above this cap;
  //                       live/restored quotes above it snap down to the
  //                       highest allowed option. Tenor 1 (Direct Purchase)
  //                       is always available.
  minSystemKwp: 0,
  minDpTiers: [
    // v3-99: seeded from Solviva_Calc_v_B_5_1.xlsm PRODUCT!B7:C9
    { fromNetPrice: 0, minDpPct: 0.1 }, // ₱0 – ₱499,999        → 10% floor
    { fromNetPrice: 500000, minDpPct: 0.15 }, // ₱500,000 – ₱999,999  → 15% floor
    { fromNetPrice: 1000000, minDpPct: 0.2 }, // ₱1,000,000 and above → 20% floor
  ],
  maxTenorMonths: 60,

  // ─── Step 1 defaults (NEW v3-70) ───────────────────────────────────────────
  // Product-settable starting values for Step 1B (utility rate, ₱/kWh) and
  // Step 1C (monthly bill, ₱). Consumed by makeInitialState (App.jsx), which
  // reads this object LIVE — paramsService mutates it in place on boot — so
  // fresh sessions and the Step 1 Reset button pick up the server values
  // automatically once loaded. A snap in App's load().then() covers the boot
  // race for brand-new sessions (first render happens before the fetch
  // resolves): a field is snapped ONLY while it still equals the bundled
  // default captured at module-import time; anything a user typed is never
  // overwritten. v3-70 also changed the shipped rate default itself:
  // 14.5 → 15 ₱/kWh per user direction. Excel T10/T12 are plain inputs in the
  // workbook — no equivalent knob there (deferred Excel-sync list).
  defaultUtilityRate: 15,
  defaultMonthlyBill: 15000,

  // ─── Contact-gate password / Maintenance Mode ─────────────────────────────
  // When TRUE, the contact gate shows an "Under Maintenance" notice and a
  // password screen after the customer submits their contact details. The
  // password value itself is read from the Netlify env var
  // VITE_MAINTENANCE_PASSWORD — this admin flag is just the operational on/off
  // lever for "maintenance mode."
  //
  // When FALSE, the password screen is skipped regardless of the env var,
  // so the admin can flip the calculator open to the public without
  // redeploying. Useful for short maintenance windows, beta gating, or any
  // time access needs to be restricted briefly. To permanently remove the
  // password from the JS bundle, also unset VITE_MAINTENANCE_PASSWORD on
  // Netlify and redeploy.
  gateAuthEnabled: true,

  // ─── Schedule of Payments: install lead time ─────────────────────────────
  // Minimum number of days between the quote's generation date (today) and
  // the FIRST POST-INSTALLATION payment due date shown on the Schedule of
  // Payments tab. The installation date is back-derived from this floor: we
  // walk install date forward until dueDateForMonth(1) — which applies the
  // existing 15th/30th calendar rounding rule — falls at or after
  // (generatedDate + minDaysToFirstPostInstallPayment).
  //
  // Editable by Engineering Team (in the Schedule Constants admin section)
  // and Super Admin. The Engineering Admin should set this based on Solviva's
  // current installation queue and capacity — the first post-installation
  // payment due date must fall AFTER a realistic installation completion
  // date, or the customer would receive a payment notice before their
  // system is ready to generate savings.
  //
  // Persisted globally via the parameters API; default 44 is a reasonable
  // baseline (~6-week lead time) and admin tunes from there. Bounds enforced
  // in the Admin UI: 14–180 days.
  minDaysToFirstPostInstallPayment: 44,
};

// ─── Battery-package availability helper (v3-106) ──────────────────────────
// Absent flag = available, so pre-v3-106 blobs need no migration.
export function availableBatteryPackages(adminParams) {
  return (adminParams?.batteryPackages || []).filter(
    (p) => p?.available !== false,
  );
}

// ─── Battery-package resolution helper ─────────────────────────────────────
// Given a state.batteryPackageId (synthetic uuid) and the live admin params,
// return the matching package object. Falls back to the first AVAILABLE
// package if the id isn't found or is out of stock (e.g. admin deleted or
// de-stocked the previously-selected package, or the state was persisted in
// a session that predates the package). Always returns a valid package
// because adminParams.batteryPackages is guaranteed non-empty (server +
// client floor at 1) — if EVERY package is out of stock, packages[0] is
// returned as a pricing-safe placeholder: App.jsx forces batteryKwh to 0 in
// that case, so the placeholder's prices never reach a line item.
export function resolveBatteryPackage(adminParams, batteryPackageId) {
  const list = adminParams?.batteryPackages || [];
  if (list.length === 0) {
    // Defensive fallback — should never happen in practice (default seed has
    // 2 packages; admin UI + server-side validation both refuse to save an
    // empty list). Synthesize a no-op package so calculations don't crash.
    return {
      id: "fallback",
      label: "—",
      batteryUnitKwh: 5,
      batteryUnitPrice: 0,
      batteryRackCapacity: 3,
      batteryRackPrice: 0,
      atsPrice: 0,
      criticalLoadsMaterials: 0,
      laborWithSolarInstall: 0,
      standaloneLabor: 0,
    };
  }
  // v3-106 — an explicit pick must still be IN STOCK to win; otherwise fall
  // through to the first available package (then packages[0] as last resort).
  if (batteryPackageId) {
    const match = list.find(
      (p) => p.id === batteryPackageId && p.available !== false,
    );
    if (match) return match;
  }
  return list.find((p) => p.available !== false) || list[0];
}

// ─── Battery package auto-optimizer (v3-71) ─────────────────────────────────
// Given the raw daily excess solar (kWh, already integer-rounded by the
// probe in schedule.js), pick the battery package that stores ALL of it at
// the lowest TOTAL cost. Priority order per user direction:
//   1. Minimize solar wastage — every candidate's capacity is the excess
//      rounded UP to its unit size, so all of them capture the full excess.
//      This priority therefore filters nothing; it's satisfied by
//      construction.
//   2. Minimize cost — compare the FULL battery subsystem direct price:
//      units + racks + ATS + critical-loads materials + labor. ATS/crit/
//      labor are currently identical across packages and mathematically
//      cancel, but they're included deliberately (user direction) so the
//      comparison stays correct if those line items diverge later.
//      The labor term follows the same branch the quote itself will take:
//      laborWithSolarInstall when solar is in the quote, standaloneLabor
//      otherwise.
// Tie-breakers: smaller total capacity (less stranded kWh the excess can
// never fill), then fewer units, then earlier position in the admin list.
//
// dailyExcessKwh <= 0 (no battery recommended) degenerates every candidate
// to zero cost; the tie-breakers then return the first package, which is
// harmless — a 0-kWh recommendation stays 0 on any package, and the UI
// shows an em dash instead of a package name.
//
// The comparison is on DIRECT prices. The RTO uplift is a uniform
// multiplier on the package subtotal, so the direct-price winner is also
// the RTO winner.
// v3-116 — in-stock delivery locations (absent flag = available, v3-106
// semantics). Feeds the Step 2E dropdown and App.jsx's stale-pick fallback.
export function availableDeliveryLocations(adminParams) {
  return (adminParams?.deliveryLocations || []).filter(
    (l) => l && l.available !== false,
  );
}

// v3-138 — in-stock misc catalog items (absent flag = available, v3-106
// semantics). Feeds the Step 2F description dropdown.
export function availableMiscCatalog(adminParams) {
  return (adminParams?.miscCatalog || []).filter(
    (m) => m && m.available !== false,
  );
}

// v3-138 — resolve a stored catalogId against the FULL catalog, in stock or
// not. Deliberately NOT filtered: Step 2F needs to tell "this row's item went
// out of stock / was deleted" apart from "this row is free-form", and pricing
// needs the same distinction. Returns null for both an unknown id and the
// free-form sentinel.
export function findMiscCatalogItem(adminParams, catalogId) {
  if (!catalogId || catalogId === MISC_CATALOG_OTHER) return null;
  return (
    (adminParams?.miscCatalog || []).find((m) => m && m.id === catalogId) ||
    null
  );
}

// The 2F dropdown's free-form sentinel. Stored in state.miscMaterials[i]
// .catalogId when the rep picks "Other (please specify)"; a row restored from
// a pre-v3-138 session has NO catalogId at all and is read as free-form too,
// which is why the falsy case and this sentinel behave identically everywhere.
export const MISC_CATALOG_OTHER = "other";

export function optimizeBatteryPackage(adminParams, dailyExcessKwh, hasSolar) {
  // v3-106 — only IN-STOCK packages compete. If every package is out of
  // stock, delegate to resolveBatteryPackage's placeholder fallback (App.jsx
  // forces batteryKwh to 0 in that case, so the winner is never priced).
  const list = availableBatteryPackages(adminParams);
  if (list.length === 0) return resolveBatteryPackage(adminParams, null);
  const excess = Math.max(0, dailyExcessKwh || 0);
  let best = null;
  for (const p of list) {
    const unit = p.batteryUnitKwh || 1;
    const units = excess > 0 ? Math.ceil(excess / unit) : 0;
    const racks =
      units > 0 ? Math.ceil(units / (p.batteryRackCapacity || 1)) : 0;
    const labor = hasSolar
      ? p.laborWithSolarInstall || 0
      : p.standaloneLabor || 0;
    const cost =
      units > 0
        ? units * (p.batteryUnitPrice || 0) +
          racks * (p.batteryRackPrice || 0) +
          (p.atsPrice || 0) +
          (p.criticalLoadsMaterials || 0) +
          labor
        : 0;
    const capacity = units * unit;
    const cand = { pkg: p, cost, capacity, units };
    if (
      !best ||
      cand.cost < best.cost ||
      (cand.cost === best.cost && cand.capacity < best.capacity) ||
      (cand.cost === best.cost &&
        cand.capacity === best.capacity &&
        cand.units < best.units)
    ) {
      best = cand;
    }
  }
  return best.pkg;
}

// ─── Disclaimers (CALCULATOR O60, O64) ───────────────────────────────────────
// Verbatim from the Excel sheet. Editable in the admin panel.
export const DISCLAIMERS = {
  // The IRR disclaimer is split into three parts because the middle paragraph
  // (the "consumption patterns may change after install" caveat) is rendered
  // with bold+red styling in Step4Returns.jsx to draw the customer's eye to a
  // material assumption behind the projected savings. Keep these three keys
  // in sync — they're concatenated end-to-end at render time with no spacing
  // adjustments other than the spaces already at the start of -Highlight and
  // -After.
  irrDisclaimerBefore:
    "DISCLAIMER: The chart above and estimated Internal Rate of Return (IRR) " +
    "are based on projected energy cost savings from the installation of a " +
    "solar photovoltaic system under current electricity tariffs, consumption " +
    "patterns, and regulatory conditions in the Philippines. ",

  irrDisclaimerHighlight:
    "The expected savings calculated above assume that your consumption " +
    "patterns remain the same after solar installation. In practice, usage " +
    "patterns often change once a solar system is in place \u2014 for " +
    "example, customers may run appliances more freely during daylight " +
    "hours \u2014 which can affect actual savings versus the projection.",

  irrDisclaimerAfter:
    " Actual results may also vary due to changes in electricity rates, " +
    "system performance, weather conditions, maintenance costs, government " +
    "policies, and other factors beyond control. This estimate is for " +
    "illustrative purposes only and does not constitute a guarantee of " +
    "future financial performance.",

  cfeiDisclaimer:
    "CFEI Applications and Net Metering Conversions\n\n" +
    "Solviva Energy does not provide facilitation, processing, or " +
    "representation services for Certificate of Final Electrical Inspection " +
    "(CFEI) applications or Net Metering conversions. The Client acknowledges " +
    "that issuance of the CFEI is a prerequisite to the processing and " +
    "approval of Net Metering applications.\n\n" +
    "Any referral by Solviva Energy to third-party service providers is made " +
    "solely as a courtesy and shall not be construed as an endorsement, " +
    "representation, or warranty of such providers\u2019 qualifications, " +
    "performance, or results.\n\n" +
    "The Client acknowledges that any engagement with third-party providers " +
    "shall be at the Client\u2019s sole risk and expense. Solviva Energy " +
    "shall have no liability for any act, omission, delay, deficiency, or " +
    "failure of such third parties. Any resulting delays, costs, or " +
    "unsuccessful outcomes shall not relieve the Client of its obligation to " +
    "make full and timely payments under this Agreement, nor shall they " +
    "constitute grounds for withholding, offsetting, or disputing any " +
    "amounts due.\n\n" +
    "The Client further acknowledges that all timelines, requirements, and " +
    "costs associated with CFEI applications are determined by the relevant " +
    "Local Government Units (LGUs), and those associated with Net Metering " +
    "conversions are determined by the applicable electric utility provider. " +
    "Solviva Energy makes no representations or warranties, express or " +
    "implied, regarding the duration, outcome, or cost of such processes.",

  // Each paragraph leads with the term being defined (rendered bold;
  // last entry is italic per design — it's a hedge note, not a definition).
  // Step4Returns.jsx maps over this array; the legacy '\n\n' split is gone.
  paybackNote: [
    {
      term: "Simple Payback Period",
      rest:
        " excludes Time Value of Money discounting, which means future " +
        "payments are not discounted to present value \u2014 resulting in a " +
        "longer, more conservative payback period. It factors in the " +
        "expected inflation rate on preventive maintenance costs and the " +
        "annual reduction in solar yield from panel degradation.",
    },
    {
      term: "Solar Investment IRR (Internal Rate of Return)",
      rest:
        " is the annualized return on your solar investment \u2014 useful " +
        "for benchmarking against other instruments such as Time Deposits " +
        "or equities.",
    },
    {
      term: "Levelized Cost of Energy (LCOE)",
      rest:
        " applies a cost of funds discount rate and accounts for both " +
        "purchase payments and expected maintenance costs over the selected " +
        "period. Energy output is adjusted for the annual yield reduction " +
        "due to panel degradation.",
    },
    {
      term: "Distribution Utility (DU) Savings",
      rest:
        " reflect cumulative savings against grid electricity costs over " +
        "the selected period, adjusted for the annual reduction in solar " +
        "yield due to panel degradation.",
    },
    {
      term: "A note on DU tariff assumptions:",
      italic: true,
      rest:
        " All figures above assume DU electricity tariff rates remain flat " +
        "over the selected period. This is a conservative assumption \u2014 " +
        "actual payback, IRR, and savings may be more favorable if rates " +
        "increase, as they have historically.",
    },
  ],
};

// ─── Proposal PDF content (Terms & Conditions, Warranties, Conforme) ─────────
// v3-43 introduced the "Generate PDF" feature in the rep-mode tab bar that
// compiles the Calculator + Summary + Schedule tabs into a single A4 PDF
// proposal. The PDF appends three additional pages: Terms & Conditions
// (verbatim from the office's standard proposal), a Warranties and Coverage
// table, and a Conforme acceptance page.
//
// Content lives here (rather than hardcoded in pdfGenerator.js) for two
// reasons: (1) consistent with where DISCLAIMERS lives, so any future "make
// PDF copy editable from Admin" feature can reuse the same paramsService
// pipeline; (2) keeps the PDF generator focused on layout and data, not on
// memorizing the office's preferred legal copy.
//
// Structure note: each section is a list of `block` objects with a `kind`
// discriminator (heading | paragraph | bullets | warrantyTable). The PDF
// generator iterates over blocks and emits the right rendering primitive
// per kind, which keeps this constant readable while still being structured
// enough to drive layout deterministically.
//
// Verbatim from the office's standard proposal pages 6-7 supplied by the
// user. Trailing/leading whitespace and parenthetical notes preserved.

export const PROPOSAL_CONTENT = {
  termsAndConditions: [
    {
      kind: "heading",
      text: "Permitting Requirements to be Provided by the Client",
    },
    {
      kind: "bullets",
      items: [
        "Electricity bill (should be under the name of the client)",
        "Valid ID of the person in the electricity bill",
        "Tax Declaration",
        "OCT/TCT (Land/Property title)",
        "Official Receipt of latest Real Property Tax (Land & Building)",
        "Building Permit",
        "Certificate of Occupancy",
      ],
    },
    {
      kind: "heading",
      text: "Some LGUs may also require:",
    },
    {
      kind: "bullets",
      items: [
        "Electrical Plan / Load Schedule signed and sealed by a Professional Electrical Engineer (Can be provided by Solviva if client avails)",
        "Electrical Design Analysis (Can be provided by Solviva if client avails)",
        "Structural Roof Plan (Can be provided by Solviva if client avails)",
        "Structural Analysis (Can be provided by Solviva if client avails)",
        "Barangay Clearance for Solar Installation",
        "Homeowners Association Clearance",
      ],
    },
    {
      kind: "heading",
      text: "The following shall apply to the pricing and scope of the installation project:",
    },
    {
      kind: "paragraph",
      text: "Any additional length beyond the initial 30 meters (m) of Direct Current (DC) cable and the initial 10 meters (m) of Alternating Current (AC) cable will be charged per meter at a specified rate.",
    },
    {
      kind: "heading",
      text: "Logistics Add-On Cost",
    },
    {
      kind: "paragraph",
      text: "Any excess distance beyond the first 33 kilometers (km) from Parañaque City will be charged per kilometer at a specified rate.",
    },
    {
      kind: "heading",
      text: "Price Validity",
    },
    {
      kind: "paragraph",
      text: "The prices provided in this Proposal are valid for a period of thirty (30) days from the date of issuance. After this period, the prices are subject to change without prior notice.",
    },
    {
      kind: "heading",
      text: "Exclusions",
    },
    {
      kind: "paragraph",
      text: "Any items or service not explicitly mentioned or detailed in this Proposal such as but not limited to Service entrance remodeling, building permit, occupancy certificate, house plans, and any other fees not related to the Solar Photovoltaic System itself shall be considered excluded from the scope of work and will not be provided unless otherwise agreed upon through a variation order or a revision in the proposal.",
    },
    {
      kind: "heading",
      text: "Site Assessment",
    },
    {
      kind: "bullets",
      items: [
        {
          term: "Technical Assessment:",
          rest: " We first conduct a thorough technical site assessment, including roof evaluation and sunlight analysis, to assess suitability for a rooftop solar system.",
        },
        {
          term: "Suitability Refund:",
          rest: " If you have paid a reservation fee and if our assessment shows that your property is not suitable, we will refund your reservation fee within thirty (30) days from such determination.",
        },
      ],
    },
    {
      kind: "heading",
      text: "Installation",
    },
    {
      kind: "paragraph",
      text: "You shall provide reasonable assistance to Solviva and its designated representatives in the latter's preparation of the system design, and shall provide documents and information relating to the Premises, such as, but not limited to blueprints and/or building plans, as may be requested by Solviva. You shall be responsible for the correctness and accuracy of any data and information provided.",
    },
    {
      kind: "heading",
      text: "Validity",
    },
    {
      kind: "bullets",
      items: [
        {
          term: "Quotation Validity:",
          rest: " The special quotation we've provided is valid for thirty (30) days from the date it was issued. We are committed to being transparent about pricing and will endeavor to inform you of any necessary adjustments as soon as possible.",
        },
        {
          term: "Price Adjustments:",
          rest: " Please be aware that prices may change due to factors beyond our control, like fluctuations in material costs. We will always keep you informed and discuss any necessary adjustments",
        },
        {
          term: "Inclusions:",
          rest: " Labor costs are included in our quotation unless pre-existing wiring, systems, obstructions, or structures are found which were either not disclosed or require additional work. We will assess the site during the visit and inform you of any potential extra costs.",
        },
        {
          term: "Additional Costs:",
          rest: " If additional costs arise, we will notify you right away and proceed only with your written consent. We believe in full transparency, so there will be no surprises.",
        },
      ],
    },
    {
      kind: "paragraph",
      text: "Your satisfaction is our priority, and we will manage the entire process diligently from start to finish.",
    },
    {
      kind: "heading",
      text: "Definitive Agreement",
    },
    {
      kind: "paragraph",
      text: 'This Proposal shall be subject to the execution of a separate Solar Photovoltaic System Contract and Standard Terms and Conditions ("Definitive Agreements") which shall be executed between you and the Company. Failure to execute the Solar Photovoltaic System within seven (7) days from the date of this Proposal (or such longer period as may be allowed by Solviva in writing) shall entitle Solviva to treat this Proposal as invalid without any liability to you and without any obligation to reimburse or return any payments already made. Should Solviva not be able to proceed with the completion of the installation, and consequent turnover of the Solar facility due to an action or decision of the client such as, but not limited to, the unsuitability of the structure on which the Solar facility will be installed then Solviva shall turn over any and installed portions of the facility, and the client shall be liable for the payments commensurate to the portions that have been turned over. Any additional materials required to install the solar facility shall be subject to another order form.',
    },
    {
      kind: "paragraph",
      bold: true,
      text: "We look forward to helping you make the switch to clean, renewable energy.",
    },
  ],

  warranties: [
    { component: "Solar Panels Performance", term: "30 years" },
    { component: "Solar Panels Product Warranty", term: "12 years" },
    { component: "Inverter", term: "5 years" },
    { component: "Battery", term: "5 years" },
    { component: "Workmanship", term: "1 year" },
  ],
};
