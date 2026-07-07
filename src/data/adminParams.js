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
  (supplierCost * 0.70) / (1 - BASELINE_RATE);

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
  (singlePhaseTiers || []).map(t => ({
    minPanels: t.minPanels,
    dcCablePct:    Math.round(t.dcCablePct    * THREE_PHASE_CABLING_UPLIFT.dcCablePct    * 100) / 100,
    acCablePct:    Math.round(t.acCablePct    * THREE_PHASE_CABLING_UPLIFT.acCablePct    * 100) / 100,
    conduitsPct:   Math.round(t.conduitsPct   * THREE_PHASE_CABLING_UPLIFT.conduitsPct   * 100) / 100,
    panelBoardPct: Math.round(t.panelBoardPct * THREE_PHASE_CABLING_UPLIFT.panelBoardPct * 100) / 100,
  }));

// Bundled single-phase cabling tier defaults — declared outside ADMIN_PARAMS
// so the three-phase default can be derived from the same source. Cloned into
// the ADMIN_PARAMS literal (never referenced directly) so in-place mutation
// by paramsService can't corrupt this constant.
const SINGLE_PHASE_CABLING_TIERS_DEFAULT = [
  { minPanels: 1,   dcCablePct: 0.27, acCablePct: 0.08, conduitsPct: 0.12, panelBoardPct: 0.09 },
  { minPanels: 8,   dcCablePct: 0.27, acCablePct: 0.08, conduitsPct: 0.12, panelBoardPct: 0.09 },
  { minPanels: 10,  dcCablePct: 0.27, acCablePct: 0.07, conduitsPct: 0.10, panelBoardPct: 0.08 },
  { minPanels: 13,  dcCablePct: 0.27, acCablePct: 0.06, conduitsPct: 0.10, panelBoardPct: 0.08 },
  { minPanels: 16,  dcCablePct: 0.22, acCablePct: 0.06, conduitsPct: 0.10, panelBoardPct: 0.07 },
  { minPanels: 19,  dcCablePct: 0.19, acCablePct: 0.06, conduitsPct: 0.09, panelBoardPct: 0.06 },
  { minPanels: 24,  dcCablePct: 0.15, acCablePct: 0.05, conduitsPct: 0.07, panelBoardPct: 0.05 },
  { minPanels: 31,  dcCablePct: 0.13, acCablePct: 0.05, conduitsPct: 0.07, panelBoardPct: 0.04 },
  { minPanels: 62,  dcCablePct: 0.12, acCablePct: 0.04, conduitsPct: 0.06, panelBoardPct: 0.03 },
  { minPanels: 103, dcCablePct: 0.11, acCablePct: 0.04, conduitsPct: 0.06, panelBoardPct: 0.03 },
  { minPanels: 155, dcCablePct: 0.10, acCablePct: 0.04, conduitsPct: 0.06, panelBoardPct: 0.03 },
  { minPanels: 206, dcCablePct: 0.09, acCablePct: 0.04, conduitsPct: 0.06, panelBoardPct: 0.03 },
];

export const ADMIN_PARAMS = {

  // ─── Interest rates ────────────────────────────────────────────────────────
  // Admin C22, C23, C24, C27, C28, C25
  baseRtoInterestRate: 0.28,             // C22 — 28% base RTO rate
  smallPackagePanelThreshold: 8,         // C23 — packages below this many panels
                                         //       get a risk premium
  smallPackageRiskPremiumBps: 400,       // C24 — basis points to ADD to RTO rate
                                         //       when below threshold (4.00% added)
                                         //       Excel formula: C24/10000 = 0.04
  earlyPayoffDiscountRate: 0.08,         // C28 — 8% NPV discount for ANNEX early payoffs

  // Note: the "calculator RTO interest rate" used everywhere is computed at
  // runtime as: baseRtoInterestRate + (panelCount < threshold ? premium : 0)
  // See calculations.js → `effectiveRtoRate(panelCount)`.

  // ─── Mounting support (Admin D32, C33) ─────────────────────────────────────
  // Customer pays max(floor, 13% of panel price). Panel pricing lives on the
  // Inventory page; only the mounting numbers are here.
  mountingSupportFloorPrice: 8579,       // D32
  mountingSupportPctOfPanels: 0.13,      // C33 — 13% of panel price

  // ─── SINGLE-PHASE AC/DC cabling tier table (Admin B36:G48) ──────────────────
  // Indexed by minimum panel count. Each tier gives the percentage of panel
  // price that the cabling/conduit/panel-board package costs. Excel uses
  // VLOOKUP(panelCount, B37:G44, 6, TRUE) — meaning approximate match, finds
  // the row where panelCount >= B-column threshold.
  // Applies when Step 1A service type = Single-phase.
  cablingTiers: SINGLE_PHASE_CABLING_TIERS_DEFAULT.map(t => ({ ...t })),

  // ─── THREE-PHASE AC/DC cabling tier table (NEW in v3-62) ────────────────────
  // Same structure and VLOOKUP semantics as cablingTiers, but applies when
  // Step 1A service type = 3-phase. Default is derived from the single-phase
  // table via THREE_PHASE_CABLING_UPLIFT (DC ×1.0, AC ×1.5, Conduits ×1.2,
  // Panel board ×1.5); engineering edits each tier independently thereafter.
  // Not in the Excel reference workbook yet — Excel mirror update deferred.
  cablingTiersThreePhase: deriveThreePhaseCablingTiers(SINGLE_PHASE_CABLING_TIERS_DEFAULT),

  // ─── Variable & per-unit charges (Admin D51:D53) ───────────────────────────
  // Direct-purchase prices straight from v3.2 Admin sheet column D.
  additionalDcCablePerMeter: 1137,       // D51 — extra DC cable beyond 30m
  additionalAcCablePerMeter: 2426,       // D52 — extra AC cable beyond 10m
  laborInstallationPerKwp: 8341,         // D53 — variable solar labor per kWp

  // ─── Roof Material (Admin D54:D55) ─────────────────────────────────────────
  // Three options for the customer (Step 2E in web GUI):
  //   metal     → ₱0 (no roof prep needed) — DEFAULT
  //   asphalt   → kWp × roofAsphaltPerKwp
  //   concrete  → kWp × roofConcretePerKwp
  // (These map to Excel M36 values 2, 1, 3 respectively — Excel's
  //  ordering happens to differ, but the math is identical.)
  roofAsphaltPerKwp: 9200,               // D54 — Asphalt/Shingles/Tiled per kWp
  roofConcretePerKwp: 17000,             // D55 — Concrete per kWp

  // ─── Location / Delivery (Admin D56:D61) ───────────────────────────────────
  // Three options for the customer (Step 2F in web GUI):
  //   luzon (DEFAULT)
  //        ≤ 30 km from Rizal Park → ₱0
  //        > 30 km → luzonOver30FixedFee + (km × luzonOver30PerKm)
  //   cebu     → cebuFixedFee + (panels × cebuPerPanel)
  //   siargao  → siargaoFixedFee + (panels × siargaoPerPanel)
  cebuFixedFee: 57114,                   // D56
  cebuPerPanel: 5660,                    // D57
  siargaoFixedFee: 495000,               // D58
  siargaoPerPanel: 8700,                 // D59
  luzonOver30FixedFee: 7000,             // D60 — fixed delivery surcharge for Luzon >30km
  luzonOver30PerKm: 200,                 // D61 — per-km charge for Luzon >30km

  // ─── RSD pricing (Admin D62:D65) ───────────────────────────────────────────
  // Direct prices from v3.2 D-column.
  rsdVariablePerPanel: 3161,             // D62
  rsdFixedTransmitter: 10615,            // D63
  rsdStandaloneLaborPerPanel: 500,       // D64
  rsdStandaloneLaborMobilization: 10000, // D65

  // ─── Inverter labor (Admin D68, D69) ───────────────────────────────────────
  inverterStandaloneLaborPerUnit: 1500,  // D68
  inverterStandaloneMobilization: 10000, // D69

  // ─── Fixed overhead (Admin D109:D113) ──────────────────────────────────────
  // Total auto-calculated as the sum of the five lines below.
  fixedOverheadDeliveryLogistics: 2943,  // D109
  fixedOverheadWarehouse: 2066,          // D110
  fixedOverheadCustoms: 0,               // D111
  fixedOverheadSafetySupervision: 7582,  // D112
  fixedOverheadTesting: 4549,            // D113

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
  // Math parity: the first pack here ("5 kWh") preserves v3-53's exact
  // values — a default-state customer quote will produce identical numbers
  // to v3-53 (bit-exact). The "16 kWh" pack is genuinely new pricing.
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
      id: 'pkg5kwh01',
      label: '5 kWh',
      batteryUnitKwh: 5,
      batteryUnitPrice: 91898,           // legacy D117
      batteryRackCapacity: 3,
      batteryRackPrice: 7582,            // legacy D118
      atsPrice: 9099,                    // legacy D119
      criticalLoadsMaterials: 3336,      // legacy D120
      laborWithSolarInstall: 15923,      // legacy D121
      standaloneLabor: 71200,            // legacy D122
    },
    {
      id: 'pkg16kw01',
      label: '16 kWh',
      batteryUnitKwh: 16,
      batteryUnitPrice: 295000,
      batteryRackCapacity: 4,
      batteryRackPrice: 23000,
      atsPrice: 9099,
      criticalLoadsMaterials: 3336,
      laborWithSolarInstall: 15923,
      standaloneLabor: 71200,
    },
  ],

  // ─── Schedule constants (Admin C125:C134) ──────────────────────────────────
  kWhPerKwpPerDay: 3.6,                  // C125 — daily yield assumption (PH, ~18° tilt)
  batteryEfficiency: 0.92,               // C126 — round-trip
  batteryDepthOfDischarge: 0.95,         // C127 — usable fraction
  panelAnnualDegradation: 0.005,         // C128 — 0.5%/yr loss (also used in NPER for payback)
  lcoeNpvDiscountRate: 0.06,             // C129 / C134 — both refer to 6%
  maintenanceInflationRate: 0.03,        // C130 — annual inflation on maintenance
  netMeteringEfficiency: 0.5,            // C131 — credit value vs full retail rate
  preventiveMaintenancePerPanel: 500,    // C132
  preventiveMaintenancePerVisit: 5000,   // C133

  // ─── Promo code discounts (Admin A137:C140) ────────────────────────────────
  promoCodes: [
    { code: 'SENIOR', label: 'Senior Citizen',  discount: 0.01 },
    { code: 'SOLV',   label: 'Solviva Partner',  discount: 0.10 },
    { code: 'CASH',   label: 'Cash Discount',    discount: 0.05 },
  ],

  // ─── Quote validity ───────────────────────────────────────────────────────
  // Number of days a generated quote remains valid. The "Valid until" date
  // shown on the calculator header and summary is computed as today + this
  // many days. Editable in the admin panel by Product Team and Super Admin;
  // persisted globally via the parameters API so it takes effect across all
  // users on their next page load. Bundled fallback in DEFAULTS.quoteValidityDays
  // is used until paramsService finishes loading on boot.
  quoteValidityDays: 30,

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

// ─── Battery-package resolution helper ─────────────────────────────────────
// Given a state.batteryPackageId (synthetic uuid) and the live admin params,
// return the matching package object. Falls back to packages[0] if the id
// isn't found (e.g. admin deleted the previously-selected package, or the
// state was persisted in a session that predates the package). Always returns
// a valid package because adminParams.batteryPackages is guaranteed non-empty
// (server + client floor at 1).
export function resolveBatteryPackage(adminParams, batteryPackageId) {
  const list = adminParams?.batteryPackages || [];
  if (list.length === 0) {
    // Defensive fallback — should never happen in practice (default seed has
    // 2 packages; admin UI + server-side validation both refuse to save an
    // empty list). Synthesize a no-op package so calculations don't crash.
    return {
      id: 'fallback',
      label: '—',
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
  if (batteryPackageId) {
    const match = list.find(p => p.id === batteryPackageId);
    if (match) return match;
  }
  return list[0];
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
    'DISCLAIMER: The chart above and estimated Internal Rate of Return (IRR) ' +
    'are based on projected energy cost savings from the installation of a ' +
    'solar photovoltaic system under current electricity tariffs, consumption ' +
    'patterns, and regulatory conditions in the Philippines. ',

  irrDisclaimerHighlight:
    'The expected savings calculated above assume that your consumption ' +
    'patterns remain the same after solar installation. In practice, usage ' +
    'patterns often change once a solar system is in place \u2014 for ' +
    'example, customers may run appliances more freely during daylight ' +
    'hours \u2014 which can affect actual savings versus the projection.',

  irrDisclaimerAfter:
    ' Actual results may also vary due to changes in electricity rates, ' +
    'system performance, weather conditions, maintenance costs, government ' +
    'policies, and other factors beyond control. This estimate is for ' +
    'illustrative purposes only and does not constitute a guarantee of ' +
    'future financial performance.',

  cfeiDisclaimer:
    'CFEI Applications and Net Metering Conversions\n\n' +
    'Solviva Energy does not provide facilitation, processing, or ' +
    'representation services for Certificate of Final Electrical Inspection ' +
    '(CFEI) applications or Net Metering conversions. The Client acknowledges ' +
    'that issuance of the CFEI is a prerequisite to the processing and ' +
    'approval of Net Metering applications.\n\n' +
    'Any referral by Solviva Energy to third-party service providers is made ' +
    'solely as a courtesy and shall not be construed as an endorsement, ' +
    'representation, or warranty of such providers\u2019 qualifications, ' +
    'performance, or results.\n\n' +
    'The Client acknowledges that any engagement with third-party providers ' +
    'shall be at the Client\u2019s sole risk and expense. Solviva Energy ' +
    'shall have no liability for any act, omission, delay, deficiency, or ' +
    'failure of such third parties. Any resulting delays, costs, or ' +
    'unsuccessful outcomes shall not relieve the Client of its obligation to ' +
    'make full and timely payments under this Agreement, nor shall they ' +
    'constitute grounds for withholding, offsetting, or disputing any ' +
    'amounts due.\n\n' +
    'The Client further acknowledges that all timelines, requirements, and ' +
    'costs associated with CFEI applications are determined by the relevant ' +
    'Local Government Units (LGUs), and those associated with Net Metering ' +
    'conversions are determined by the applicable electric utility provider. ' +
    'Solviva Energy makes no representations or warranties, express or ' +
    'implied, regarding the duration, outcome, or cost of such processes.',

  // Each paragraph leads with the term being defined (rendered bold;
  // last entry is italic per design — it's a hedge note, not a definition).
  // Step4Returns.jsx maps over this array; the legacy '\n\n' split is gone.
  paybackNote: [
    {
      term: 'Simple Payback Period',
      rest:
        ' excludes Time Value of Money discounting, which means future ' +
        'payments are not discounted to present value \u2014 resulting in a ' +
        'longer, more conservative payback period. It factors in the ' +
        'expected inflation rate on preventive maintenance costs and the ' +
        'annual reduction in solar yield from panel degradation.',
    },
    {
      term: 'Solar Investment IRR (Internal Rate of Return)',
      rest:
        ' is the annualized return on your solar investment \u2014 useful ' +
        'for benchmarking against other instruments such as Time Deposits ' +
        'or equities.',
    },
    {
      term: 'Levelized Cost of Energy (LCOE)',
      rest:
        ' applies a cost of funds discount rate and accounts for both ' +
        'purchase payments and expected maintenance costs over the selected ' +
        'period. Energy output is adjusted for the annual yield reduction ' +
        'due to panel degradation.',
    },
    {
      term: 'Distribution Utility (DU) Savings',
      rest:
        ' reflect cumulative savings against grid electricity costs over ' +
        'the selected period, adjusted for the annual reduction in solar ' +
        'yield due to panel degradation.',
    },
    {
      term: 'A note on DU tariff assumptions:',
      italic: true,
      rest:
        ' All figures above assume DU electricity tariff rates remain flat ' +
        'over the selected period. This is a conservative assumption \u2014 ' +
        'actual payback, IRR, and savings may be more favorable if rates ' +
        'increase, as they have historically.',
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
      kind: 'heading',
      text: 'PERMITTING REQUIREMENTS PROVIDED BY THE CLIENT',
    },
    {
      kind: 'bullets',
      items: [
        'Electricity bill (should be under the name of the client)',
        'Valid ID of the person in the electricity bill',
        'Tax Declaration',
        'OCT/TCT (Land/Property title)',
        'Official Receipt of the latest payment of Real Property Tax (Land & Building)',
        'Building Permit',
        'Certificate of Occupancy',
      ],
    },
    {
      kind: 'heading',
      text: 'Some LGUs may also require the following documents (varies per LGU)',
    },
    {
      kind: 'bullets',
      items: [
        'Electrical Plan / Load Schedule signed and sealed by a Professional Electrical Engineer (Can be provided by Solviva if client avails)',
        'Electrical Design Analysis (Can be provided by Solviva if client avails)',
        'Structural Roof Plan (Can be provided by Solviva if client avails)',
        'Structural Analysis (Can be provided by Solviva if client avails)',
        'Barangay Clearance for Solar Installation',
        'Homeowners Association Clearance',
      ],
    },
    {
      kind: 'heading',
      text: 'The following shall apply to the pricing and scope of the installation project:',
    },
    {
      kind: 'paragraph',
      text:
        'Any additional length beyond the initial 30 meters (m) of Direct ' +
        'Current (DCI) cable and the initial 10 meters (m) of Alternating ' +
        'Current (ACI) cable will be charged per meter at a specified rate.',
    },
    { kind: 'heading', text: 'Logistics Add-On Cost' },
    {
      kind: 'paragraph',
      text:
        'Any excess distance beyond the first 30 kilometers (km) from ' +
        'Kilometer 0 (Rizal Park) will be charged per kilometer at a ' +
        'specified rate.',
    },
    { kind: 'heading', text: 'Price Validity' },
    {
      kind: 'paragraph',
      text:
        'The prices provided in this proposal are valid for a period of ' +
        'thirty (30) days from the date of issuance. After this period, ' +
        'the prices are subject to change without prior notice.',
    },
    { kind: 'heading', text: 'Exclusions' },
    {
      kind: 'paragraph',
      text:
        'Any items or service not explicitly mentioned or detailed in this ' +
        'proposal such as but not limited to Service entrance remodelling ' +
        'building permit, occupancy certificate, house plans, and any other ' +
        'fees not related to the Solar Photovoltaic System itself shall be ' +
        'considered excluded from the scope of work and will not be ' +
        'provided unless otherwise agreed upon through a variation order ' +
        'or a revision in the proposal.',
    },
    { kind: 'heading', text: 'Site Assessment' },
    {
      kind: 'bullets',
      items: [
        {
          term: 'Technical Assessment:',
          rest:
            ' We first conduct a thorough technical site assessment, ' +
            'including roof evaluation and sunlight analysis, to assess ' +
            'suitability for a rooftop solar system.',
        },
        {
          term: 'Suitability Refund:',
          rest:
            ' If you have paid a reservation fee and if our assessment ' +
            'shows that your property is not suitable, we will refund ' +
            'your reservation fee within thirty (30) days from such ' +
            'determination.',
        },
      ],
    },
    { kind: 'heading', text: 'Installation' },
    {
      kind: 'paragraph',
      text:
        'You shall provide reasonable assistance to Solviva and its ' +
        'designated representatives in the latter\u2019s preparation of ' +
        'the system design, and shall provide documents and information ' +
        'relating to the Premises, such as, but not limited to blueprints ' +
        'and/or building plans, as may be requested by the Supplier. You ' +
        'shall be responsible for the correctness and accuracy of any ' +
        'data and information provided to us.',
    },
    { kind: 'heading', text: 'Validity' },
    {
      kind: 'bullets',
      items: [
        {
          term: 'Quotation Validity:',
          rest:
            ' The special quotation we\u2019ve provided is valid for ' +
            'thirty (30) days from the date it was issued. We are ' +
            'committed to being transparent about pricing and will inform ' +
            'you of any necessary adjustments as soon as possible.',
        },
        {
          term: 'Price Adjustments:',
          rest:
            ' Please be aware that prices may change due to factors ' +
            'beyond our control, like fluctuations in material costs. We ' +
            'will always keep you informed and discuss any necessary ' +
            'adjustments.',
        },
        {
          term: 'Inclusions:',
          rest:
            ' Labor costs are included in our quotation unless ' +
            'pre-existing wiring or systems are found that require ' +
            'additional work. We will assess the site during the visit ' +
            'and inform you of any potential extra costs.',
        },
        {
          term: 'Additional Costs:',
          rest:
            ' If additional costs arise, we will notify you right away ' +
            'and proceed only with your written consent. We believe in ' +
            'full transparency, so there will be no surprises.',
        },
      ],
    },
    { kind: 'heading', text: 'Payment Obligation' },
    {
      kind: 'paragraph',
      text:
        'Your satisfaction is our priority, and we will manage the entire ' +
        'process diligently from start to finish.',
    },
    { kind: 'heading', text: 'Definitive Agreement' },
    {
      kind: 'paragraph',
      text:
        'These Terms and Conditions shall be subject to the execution of ' +
        'a separate Solar Photovoltaic System Contract which shall be ' +
        'executed between you and the Company. Failure to execute the ' +
        'Solar Photovoltaic System within seven (7) days from the date ' +
        'of these Terms and Conditions (or such longer period as may be ' +
        'allowed by Solviva) shall entitle Solviva to terminate the ' +
        'Terms and Conditions without any liability to you and without ' +
        'any obligation to reimburse or return any payments already made.',
    },
    {
      kind: 'paragraph',
      text:
        'Should Solviva not be able to proceed with the completion of ' +
        'the installation, and consequent turnover of the Solar facility ' +
        'due to an action or decision of the client such as, but not ' +
        'limited to, the unavailability of the structure on which the ' +
        'Solar facility will be installed then Solviva shall turn over ' +
        'any and installed portions of the facility, and the client ' +
        'shall be liable for the payments commensurate to the portions ' +
        'that have been turned over. Any additional materials required ' +
        'to install the solar facility shall be subject to another order ' +
        'form.',
    },
    { kind: 'warrantyTable' },
    {
      kind: 'paragraph',
      bold: true,
      text:
        'We appreciate your understanding that the net metering status ' +
        'does not impact the payment terms outlined in this proposal. ' +
        'Thank you for choosing Solviva. We look forward to helping you ' +
        'make the switch to clean, renewable energy.',
    },
  ],

  // Warranties and Coverage table — rendered where the {kind: 'warrantyTable'}
  // marker appears in `termsAndConditions` above. Office-supplied schedule.
  warranties: [
    { component: 'Solar Panels Performance', term: '30 years' },
    { component: 'Product Warranty', term: '12 years' },
    { component: 'Inverter and Batteries', term: '5 years' },
    { component: 'Workmanship', term: '1 year' },
  ],

};
