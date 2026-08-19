// =============================================================================
// CALCULATIONS — pure functions mirroring every formula in the Excel CALCULATOR
// -----------------------------------------------------------------------------
// All functions here are PURE: same inputs → same outputs, no side effects.
// The UI calls `computeQuote(state)` once whenever any input changes; the
// result is then displayed across the Calculator / Summary / Schedule tabs.
//
// Cell-reference comments map each block to the original Excel cell so you
// can trace any number back to its source.
// =============================================================================

import { DEVICES, DAY_START_HOUR } from "../data/devices.js";
import {
  PANEL_SETTINGS,
  INVERTERS_SINGLE_PHASE,
  INVERTERS_THREE_PHASE,
} from "../data/inventory.js";
import {
  INCLUDED_DC_CABLE_METERS,
  INCLUDED_AC_CABLE_METERS,
  LUZON_FREE_TRAVEL_KM,
} from "../config.js";
import { resolveBatteryPackage } from "../data/adminParams.js";

// ─── Excel financial functions (PMT, PV) ──────────────────────────────────────
// These match Excel's behaviour including the optional `type` argument
// (0 = end of period, 1 = beginning of period). Excel's PMT and PV are
// negatively signed for cash outflows; we follow the convention used in the
// workbook where every PMT(...) call passes a NEGATIVE pv so the output is
// positive.

/**
 * Excel PMT(rate, nper, pv, fv=0, type=0)
 * Returns the periodic payment for a loan/annuity.
 */
export function PMT(rate, nper, pv, fv = 0, type = 0) {
  if (nper === 0) return 0;
  if (rate === 0) return -(pv + fv) / nper;
  const pvif = Math.pow(1 + rate, nper);
  let pmt = (-rate * (pv * pvif + fv)) / ((1 + rate * type) * (pvif - 1));
  return pmt;
}

/**
 * Excel PV(rate, nper, pmt, fv=0, type=0)
 * Returns the present value of an annuity.
 */
export function PV(rate, nper, pmt, fv = 0, type = 0) {
  if (rate === 0) return -(pmt * nper + fv);
  const pvif = Math.pow(1 + rate, nper);
  return -((pmt * (1 + rate * type) * (pvif - 1)) / rate + fv) / pvif;
}

/**
 * Excel NPER(rate, pmt, pv, fv=0, type=0)
 * Number of periods to pay off a loan / accumulate to fv.
 * Used for "Simple Payback Period" calculation.
 */
export function NPER(rate, pmt, pv, fv = 0, type = 0) {
  if (pmt === 0) return Infinity;
  if (rate === 0) return -(pv + fv) / pmt;
  const num = pmt * (1 + rate * type) - fv * rate;
  const den = pv * rate + pmt * (1 + rate * type);
  if (num / den <= 0) return Infinity; // payback never happens
  return Math.log(num / den) / Math.log(1 + rate);
}

/**
 * Excel IRR — Newton's method.
 * cashflows: array where cashflows[0] is the initial outflow (negative).
 * Returns the rate that makes the NPV zero. Returns null if no convergence.
 */
export function IRR(cashflows, guess = 0.1) {
  const MAX_ITER = 100;
  const TOL = 1e-7;
  let rate = guess;
  for (let i = 0; i < MAX_ITER; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const v = 1 / Math.pow(1 + rate, t);
      npv += cashflows[t] * v;
      dnpv -= (t * cashflows[t] * v) / (1 + rate);
    }
    if (Math.abs(npv) < TOL) return rate;
    if (dnpv === 0) return null;
    const next = rate - npv / dnpv;
    if (Math.abs(next - rate) < TOL) return next;
    rate = next;
    if (rate < -0.99) rate = -0.99;
  }
  return null;
}

/**
 * Excel NPV(rate, cashflows...). Note: Excel's NPV does NOT include the
 * initial investment — the first value in the array is treated as occurring
 * at the END of period 1. We replicate that.
 */
export function NPV(rate, cashflows) {
  return cashflows.reduce(
    (acc, cf, i) => acc + cf / Math.pow(1 + rate, i + 1),
    0,
  );
}

// ═══ COGS → DIRECT PURCHASE PRICE (v3-83) ════════════════════════════════════
// Engineering (Anjon) now enters COGS (pre-VAT). Every direct purchase price in
// the app is DERIVED from it. Product owns the two levers.
//
//     DP Price = CEILING( COGS × (1+VAT) / (1 − GM) / ((1+VAT)(1 − MDR) − VAT) )
//
// WHY PRE-VAT COGS IS THE RIGHT BASE: under Philippine VAT, input VAT paid to
// suppliers is CREDITABLE against output VAT collected on sales — it is
// recovered, not spent, so it is not a cost. Marking up a VAT-inclusive cost
// would mark up money you get refunded, and then charge output VAT on top of it.
//
// WHY THE DENOMINATOR IS NOT SIMPLY (1 − MDR): the acquirer takes its cut of the
// VAT-INCLUSIVE amount the customer is charged, while the full output VAT is
// still remitted to the BIR. So per ₱1 of ex-VAT price, Solviva actually keeps
//     (1+VAT)(1 − MDR) − VAT  =  1.12 × 0.85 − 0.12  =  0.832
// not 0.85. Anjon's original sheet divided by 0.85, which quietly realised a
// 24.4% margin against a 26% target. This form realises the margin you set.
// (Not tax advice — confirmed with the user, who chose this over the sheet's.)
const VAT_RATE = 0.12; // Philippine VAT. A constant, not a param, by instruction.

export function directFromCogs(cogs, adminParams, marginOverride) {
  // v3-84 — defensive. A missing adminParams used to throw, which took the ENTIRE
  // admin screen down (blank page) rather than showing one wrong number. A price
  // of ₱0 in an admin cell is visible and harmless; a ReferenceError is not.
  const ap = adminParams || {};
  // v3-92 — gross margin is now CAPACITY-DERIVED (a GENLINV curve over kWp).
  // Callers pricing a quote pass the resolved margin explicitly; with no override
  // the price is the ADMIN/REFERENCE price — grossMarginReference (v3-95: set
  // directly, default = the max anchor / ceiling), falling back to grossMarginMax.
  const gm =
    marginOverride ??
    ap.grossMarginReference ??
    ap.grossMarginMax ??
    ap.grossMargin ??
    0;
  const mdr = ap.merchantDiscountRate ?? 0;
  const c = Number(cogs);
  if (!Number.isFinite(c) || c <= 0) return 0;
  // Net retained per 1.00 of ex-VAT price, after the acquirer's cut and the VAT
  // remittance. Guarded: the server and client both refuse to save margins that
  // would drive this to zero or below, but a hand-edited blob must not divide by
  // zero and blank out every price in the app.
  const retained = (1 + VAT_RATE) * (1 - mdr) - VAT_RATE;
  if (!(retained > 0) || !(1 - gm > 0)) return 0;
  return Math.ceil((c * (1 + VAT_RATE)) / (1 - gm) / retained);
}

// The exact inverse of directFromCogs(). Used ONLY to rescue a SKU that an admin
// added to a pre-v3-83 blob and that therefore has a stored price but no COGS,
// and no matching entry in the code defaults to copy one from. Back-solving keeps
// its price where it was instead of zeroing it out.
export function cogsFromDirect(directPrice, adminParams, marginOverride) {
  const ap = adminParams || {};
  const gm =
    marginOverride ??
    ap.grossMarginReference ??
    ap.grossMarginMax ??
    ap.grossMargin ??
    0;
  const mdr = ap.merchantDiscountRate ?? 0;
  const px = Number(directPrice);
  if (!Number.isFinite(px) || px <= 0) return 0;
  const retained = (1 + VAT_RATE) * (1 - mdr) - VAT_RATE;
  if (!(retained > 0) || !(1 - gm > 0)) return 0;
  return Math.round((px * (1 - gm) * retained) / (1 + VAT_RATE));
}

// Writes every derived price back onto the live objects. Called by paramsService
// on boot AND after any admin save, so nothing downstream in calculations.js has
// to know COGS exists — it still reads `mountingSupportFloorPrice`, `directPrice`,
// `batteryUnitPrice` etc. exactly as before. That is the whole point of doing it
// this way: the pricing engine is UNCHANGED.
export function deriveDirectPrices(
  ap,
  panelSettings,
  invertersSP,
  invertersTP,
  margin,
) {
  // v3-92 — `margin` is the basis to price at. Boot/admin pass the REFERENCE
  // margin (grossMarginReference); a per-quote re-price passes
  // the quote's capacity margin. Omitted → directFromCogs falls back to the
  // grossMarginMax ceiling.
  const d = (c) => directFromCogs(c, ap, margin);

  if (panelSettings?.singlePhase)
    panelSettings.singlePhase.panelDirectPrice = d(
      panelSettings.singlePhase.panelCogs,
    );
  if (panelSettings?.threePhase)
    panelSettings.threePhase.panelDirectPrice = d(
      panelSettings.threePhase.panelCogs,
    );
  for (const inv of invertersSP || []) inv.directPrice = d(inv.cogs);
  for (const inv of invertersTP || []) inv.directPrice = d(inv.cogs);

  // adminParams scalars — key: derived price field, value: its COGS field.
  const MAP = {
    mountingSupportFloorPrice: "mountingSupportFloorCogs",
    additionalDcCablePerMeter: "additionalDcCablePerMeterCogs",
    additionalAcCablePerMeter: "additionalAcCablePerMeterCogs",
    laborInstallationPerKwp: "laborInstallationPerKwpCogs",
    rsdVariablePerPanel: "rsdVariablePerPanelCogs",
    rsdFixedTransmitter: "rsdFixedTransmitterCogs",
    roofAsphaltPerKwp: "roofAsphaltPerKwpCogs",
    roofConcretePerKwp: "roofConcretePerKwpCogs",
    luzonOver30FixedFee: "luzonOver30FixedFeeCogs",
    luzonOver30PerKm: "luzonOver30PerKmCogs",
    rsdStandaloneLaborPerPanel: "rsdStandaloneLaborPerPanelCogs",
    rsdStandaloneLaborMobilization: "rsdStandaloneLaborMobilizationCogs",
    inverterStandaloneLaborPerUnit: "inverterStandaloneLaborPerUnitCogs",
    inverterStandaloneMobilization: "inverterStandaloneMobilizationCogs",
    fixedOverheadDeliveryLogistics: "fixedOverheadDeliveryLogisticsCogs",
    fixedOverheadWarehouse: "fixedOverheadWarehouseCogs",
    fixedOverheadCustoms: "fixedOverheadCustomsCogs",
    fixedOverheadSafetySupervision: "fixedOverheadSafetySupervisionCogs",
    fixedOverheadTesting: "fixedOverheadTestingCogs",
    preventiveMaintenancePerPanel: "preventiveMaintenancePerPanelCogs",
    preventiveMaintenancePerVisit: "preventiveMaintenancePerVisitCogs",
  };
  for (const [priceKey, cogsKey] of Object.entries(MAP)) {
    if (cogsKey in ap) ap[priceKey] = d(ap[cogsKey]);
  }

  // Battery packages — six derived prices each.
  const B = {
    batteryUnitPrice: "batteryUnitCogs",
    batteryRackPrice: "batteryRackCogs",
    atsPrice: "atsCogs",
    criticalLoadsMaterials: "criticalLoadsMaterialsCogs",
    laborWithSolarInstall: "laborWithSolarInstallCogs",
    standaloneLabor: "standaloneLaborCogs",
  };
  // v3-116 — delivery locations: two derived prices per row (was the four
  // cebu/siargao scalars in the map above).
  for (const loc of ap.deliveryLocations || []) {
    loc.fixedFee = d(loc.fixedFeeCogs);
    loc.perPanel = d(loc.perPanelCogs);
  }
  // v3-138 — misc catalog: one derived unit price per row. Written
  // unconditionally (v3-85 rationale) so a row whose COGS was edited never
  // keeps a stale price.
  for (const m of ap.miscCatalog || []) {
    m.price = d(m.cogs);
  }
  for (const pkg of ap.batteryPackages || []) {
    for (const [priceKey, cogsKey] of Object.entries(B)) {
      // v3-85: was `if (cogsKey in pkg)` — which meant a COGS-less package (a
      // pre-v3-83 blob) silently KEPT its stale stored price while its COGS cell
      // rendered blank. Write unconditionally; backfillCogs() guarantees the COGS
      // is there by the time we get here.
      pkg[priceKey] = d(pkg[cogsKey]);
    }
  }
  return ap;
}

// ─── RTO INTEREST RATE SURFACE (v3-79) ───────────────────────────────────────
// Replaces the flat `effectiveRtoRate(panelCount)` (base rate + a 400bps
// small-package premium). The premium is GONE — panel count no longer affects
// the rate at all.
//
// The rate is now a function of tenor and down payment, fitted through three
// admin anchors using Myerson's generalized-lognormal quantile function — the
// same curve SimTools' GENLINV(p, q1, q2, q3) implements:
//
//     b = (q3 - q2) / (q2 - q1)                     the skew ratio
//     z = NORMSINV(p) / NORMSINV(0.75)
//     rate(p) = q2 + (q3 - q2) * (b^z - 1) / (b - 1)
//
// which reproduces q1, q2, q3 exactly at p = 0.25, 0.50, 0.75. GENLINV is
// one-dimensional, so the two axes are first collapsed into a single risk
// index u in [0,1], then mapped onto p = 0.25 + 0.50*u. That places the two
// corner anchors on the 25th and 75th percentiles and the mid anchor on the
// 50th — so every grid cell interpolates BETWEEN the anchors and none of them
// extrapolates into the distribution's tails.
//
//     uT  = ((T - 1) / (60 - 1)) ^ kT       1 at 60 mo,  0 at 1 mo
//     uDP = ((0.5 - DP) / 0.5)  ^ kD        1 at 0% DP,  0 at 50% DP
//     u   = w*uT + (1 - w)*uDP
//
// kT and kD are solved so the MID anchor's cell lands exactly on u = 0.5.
// kD works out to 1 (25% is the midpoint of 0–50%); kT is a hair under 1
// because 30 months is not quite the midpoint of 1–60.
//
// The weight w cannot disturb the anchors: at each of them uT and uDP agree,
// so any blend of them returns the same value. It reshapes only the interior.

// The 0-point of the surface's DP axis. NOTE (v3-82): the SELECTABLE down
// payment now runs to 100%, but the RATE AXIS deliberately still ends here.
// Down payments above 50% are CLAMPED to the 50% rate — i.e. 50% down already
// earns the best rate on the card, and putting down more earns no further
// discount. That is intentional: re-anchoring the axis to 0–100% would have
// silently repriced every existing quote (50%/60mo would jump 12.750% → 13.750%).
// It also barely matters — at 75% down you are financing a quarter of the
// system, so the rate is doing very little work. Change this to 1.0 only if you
// also intend to re-tune the anchors.
const DP_AXIS_MAX = 0.5;
// v3-99 — restored to 1, matching Solviva_Calc_v_B_5_1.xlsm's rate surface,
// whose tenor axis spans 1..60 (PRODUCT!D54=1, D55=60; normalization
// (tenor−1)/59, kT=0.9759…). v3-97 had narrowed this to 2 while the app was on
// the v4.8 curve; that skewed every interior interpolation vs v5.1.
// v3-100 — Direct Purchase is now TENOR 0 (a distinct option, mirroring v5.1's
// "Direct Purch" column via the AG12 sentinel); the numeric tenor 1 is a real
// interest-bearing 1-month term priced by this axis's endpoint (the N-column).
const TENOR_AXIS_MIN = 1;
const TENOR_AXIS_MAX = 60;
const ANCHOR_MID_TENOR = 30;
const ANCHOR_MID_DP = 0.25;

// Acklam's inverse normal CDF. Accurate to ~1e-9 — far beyond what a rate card
// snapped to 1/8 of a point could ever need.
function normSInv(p) {
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269,
    -30.66479806614716, 2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= 1 - pLow) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

const Z75 = normSInv(0.75); // 0.6744897…

// The rate a customer actually pays, given their tenor and down payment.
// Tenor is clamped to [1,60] and DP to [0,0.5] so an out-of-range value can
// never push the curve outside its anchors.
export function rtoRate(tenor, downPaymentPct, adminParams) {
  // v3-100 — DIRECT PURCHASE IS TENOR 0, NOT TENOR 1. v5.1's tenor axis is
  // 60…2, 1, "Direct Purch": the numeric 1-month term is a REAL financed month
  // priced by the curve's N-column (21.75% at 0% DP → 16.0% at 50%), while
  // "Direct Purch" is its own distinct 0%-interest option. The app mirrors the
  // AG12 sentinel with tenor 0. Returned before the surface so an interior
  // curve rate can never leak onto a Direct Purchase; PMT is bypassed entirely
  // for tenor 0 in computePaymentTerms (single balance payment, AH15's IFERROR
  // fallback to AH10).
  if (tenor < 1) return 0;

  const q1 = adminParams.rateAnchorMin;
  const q2 = adminParams.rateAnchorMid;
  const q3 = adminParams.rateAnchorMax;
  const w = adminParams.rateTenorWeight;
  const step = adminParams.rateStepPct;

  const T = Math.min(TENOR_AXIS_MAX, Math.max(TENOR_AXIS_MIN, tenor));
  const DP = Math.min(DP_AXIS_MAX, Math.max(0, downPaymentPct));

  const kT =
    Math.log(0.5) /
    Math.log(
      (ANCHOR_MID_TENOR - TENOR_AXIS_MIN) / (TENOR_AXIS_MAX - TENOR_AXIS_MIN),
    );
  const kD =
    Math.log(0.5) / Math.log((DP_AXIS_MAX - ANCHOR_MID_DP) / DP_AXIS_MAX);

  const uT = Math.pow(
    (T - TENOR_AXIS_MIN) / (TENOR_AXIS_MAX - TENOR_AXIS_MIN),
    kT,
  );
  const uD = Math.pow((DP_AXIS_MAX - DP) / DP_AXIS_MAX, kD);
  const p = 0.25 + 0.5 * (w * uT + (1 - w) * uD);

  const b = (q3 - q2) / (q2 - q1);
  let raw;
  if (Math.abs(b - 1) < 1e-9) {
    // Symmetric anchors — the generalized-lognormal degenerates to a normal.
    // Without this branch the (b - 1) denominator below divides by zero.
    raw = q2 + ((q3 - q1) / (2 * Z75)) * normSInv(p);
  } else {
    raw = q2 + ((q3 - q2) * (Math.pow(b, normSInv(p) / Z75) - 1)) / (b - 1);
  }
  return step > 0 ? Math.round(raw / step) * step : raw;
}

// ─── GROSS MARGIN SURFACE (v3-92) ────────────────────────────────────────────
// Gross margin is no longer a flat scalar — it rides a GENLINV curve over the
// solar array's rated capacity (kWp), exactly like the RTO rate surface rides a
// curve over tenor/DP. Same generalized-lognormal quantile function (SimTools'
// GENLINV, native closed form). Three admin anchors, placed at the 25th / 50th /
// 75th percentiles so the two ends act as the true min/max and nothing
// extrapolates into the tails:
//   grossMarginMin @ grossMarginMinKwp   — 25th pctile (small systems, floor)
//   grossMarginMid @ grossMarginMidKwp   — 50th pctile (curvature)
//   grossMarginMax @ grossMarginMaxKwp   — 75th pctile (large systems, ceiling)
// kWp is clamped to [minKwp, maxKwp], so the output is bounded in [min, max].
// Mirrors PRODUCT!D10:D22 of Solviva_Calc_v_B_4_8.xlsm to the digit.
export function grossMarginCurve(systemKwp, adminParams) {
  const ap = adminParams || {};
  return grossMarginCurveFromAnchors(
    systemKwp,
    ap.grossMarginMinKwp,
    ap.grossMarginMidKwp,
    ap.grossMarginMaxKwp,
    ap.grossMarginMin,
    ap.grossMarginMid,
    ap.grossMarginMax,
    ap.grossMargin,
  );
}

// Core GENLINV curve over kWp for an explicit anchor triple. Shared by the
// legacy whole-quote curve and the v3-142 per-package curves so all of them use
// identical math and only the anchor values differ.
export function grossMarginCurveFromAnchors(
  systemKwp,
  x1,
  x2,
  x3,
  q1,
  q2,
  q3,
  fallback,
) {
  // Defensive: a hand-edited blob with a degenerate axis must not throw.
  if (
    ![x1, x2, x3, q1, q2, q3].every(Number.isFinite) ||
    x3 <= x1 ||
    x2 <= x1 ||
    x2 >= x3
  ) {
    return Number.isFinite(q3) ? q3 : Number.isFinite(fallback) ? fallback : 0;
  }
  const kwp = Number.isFinite(systemKwp) ? systemKwp : x3; // bad kWp → max anchor → q3
  const x = Math.min(x3, Math.max(x1, kwp));
  const kN = Math.log(0.5) / Math.log((x2 - x1) / (x3 - x1));
  const u = Math.pow((x - x1) / (x3 - x1), kN);
  const p = 0.25 + 0.5 * u;
  const z = normSInv(p) / Z75;
  const dLow = q2 - q1;
  const dHigh = q3 - q2;
  // Degenerate margin anchors (flat, e.g. 32/32/32, or a single equal side)
  // make the GENLINV b-ratio 0/0 → NaN. Fall back to a plain piecewise-linear
  // blend so a flat triple returns q2 and a half-flat triple stays monotone.
  if (!(dLow > 0) || !(dHigh > 0)) {
    return q2 + (z >= 0 ? dHigh : dLow) * z;
  }
  const b = dHigh / dLow;
  return Math.abs(b - 1) < 1e-9
    ? q2 + (q3 - q2) * z
    : q2 + ((q3 - q2) * (Math.pow(b, z) - 1)) / (b - 1);
}

// v3-142 — per-package margin anchor keys. Each package rides the SAME kWp
// breakpoints (grossMarginMin/Mid/MaxKwp) but through its own margin anchors.
// A package whose anchors are absent (older payload) falls back to the legacy
// grossMarginMin/Mid/Max curve.
const PACKAGE_MARGIN_ANCHOR_KEYS = {
  solar: ["grossMarginSolarMin", "grossMarginSolarMid", "grossMarginSolarMax"],
  battery: [
    "grossMarginBatteryMin",
    "grossMarginBatteryMid",
    "grossMarginBatteryMax",
  ],
  misc: ["grossMarginMiscMin", "grossMarginMiscMid", "grossMarginMiscMax"],
};

// Resolve a package's three margin anchors, falling back to the legacy anchors
// when the package-specific ones are missing.
export function resolvePackageMarginAnchors(adminParams, pkg) {
  const ap = adminParams || {};
  const keys = PACKAGE_MARGIN_ANCHOR_KEYS[pkg];
  const pick = (k, legacy) => (Number.isFinite(ap[k]) ? ap[k] : ap[legacy]);
  return {
    q1: pick(keys[0], "grossMarginMin"),
    q2: pick(keys[1], "grossMarginMid"),
    q3: pick(keys[2], "grossMarginMax"),
  };
}

// The margin actually APPLIED to a quote. v4.6 rule (PRODUCT!D24):
//   IF(panelCount > 0, curve(kWp), maxMargin)
// An order with NO solar array — battery-only, RSD-only, inverter-only retrofit
// — defaults to the MAXIMUM margin (the ceiling), not the curve's value at 0 kWp.
export function grossMarginForCapacity(systemKwp, panelCount, adminParams) {
  const ap = adminParams || {};
  if (!(panelCount > 0)) return ap.grossMarginMax ?? ap.grossMargin ?? 0;
  return grossMarginCurve(systemKwp, ap);
}

// v3-142 — the margin applied to a specific PACKAGE (solar/battery/misc) for a
// quote. Same no-panels ceiling rule as grossMarginForCapacity, but per package.
export function packageMarginForCapacity(
  systemKwp,
  panelCount,
  adminParams,
  pkg,
) {
  const ap = adminParams || {};
  const { q1, q2, q3 } = resolvePackageMarginAnchors(ap, pkg);
  if (!(panelCount > 0)) {
    return Number.isFinite(q3)
      ? q3
      : (ap.grossMarginMax ?? ap.grossMargin ?? 0);
  }
  return grossMarginCurveFromAnchors(
    systemKwp,
    ap.grossMarginMinKwp,
    ap.grossMarginMidKwp,
    ap.grossMarginMaxKwp,
    q1,
    q2,
    q3,
    ap.grossMargin,
  );
}

// ─── Day vs Night kWh allocation ─────────────────────────────────────────────
// Excel CALCULATOR!A10:D16 (one row per device) computes how many
// hours/month each device runs in the DAY window (6 AM – 6 PM) vs the NIGHT
// window. The Excel formula is dense; here it is unpacked:
//
// Inputs per device row:
//   onTime  (0..1 fraction of day, e.g. 09:00 = 0.375)
//   offTime (0..1 fraction of day)
//   daysPerWeek
//   count   (how many of this device)
//   avgKw   (looked up from device library: peakKw * dutyFactor)
//
// The Excel uses a "shifted" frame where t=0 is 6 AM (subtract 6/24).
//   Day window in shifted frame: [0,   0.5] AND [1, 1.5]   (12h total)
//   Night window in shifted frame: (0.5, 1) AND (1.5, 2)   (12h total)
//
// We compute: hoursInDayPerCycle, hoursInNightPerCycle, then scale to monthly:
//   monthlyHours = hoursPerCycle * (daysPerWeek/7) * (365/12)

export function deviceMonthlyKwh(device, count, onTime, offTime, daysPerWeek) {
  // null/empty inputs → contributes nothing
  if (onTime == null || offTime == null || count == null || count <= 0) {
    return { dayKwh: 0, nightKwh: 0 };
  }

  // Replicate the Excel formula structure exactly.
  // The "duration" of the device's ON cycle, mapped to [0..1):
  let dur;
  if (onTime === offTime) {
    dur = 1; // runs continuously all day
  } else if (offTime > onTime) {
    dur = offTime - onTime;
  } else {
    dur = offTime + 1 - onTime;
  }

  // Shifted on-time: ((onTime - 6/24) MOD 1)
  const SHIFT = DAY_START_HOUR / 24;
  const onShifted = (((onTime - SHIFT) % 1) + 1) % 1;

  // Day window contribution (in fractional days, then *24 → hours)
  // Two pieces because the "shifted day" can wrap:
  //   piece1: window [0,   0.5]
  //   piece2: window [1.0, 1.5]
  const dayPiece1 = Math.max(
    0,
    Math.min(onShifted + dur, 0.5) - Math.max(onShifted, 0),
  );
  const dayPiece2 = Math.max(
    0,
    Math.min(onShifted + dur, 1.5) - Math.max(onShifted, 1),
  );
  const hoursDay = (dayPiece1 + dayPiece2) * 24;

  // Night window contribution
  //   piece1: window (0.5, 1.0]
  //   piece2: window (1.5, 2.0]
  const nightPiece1 = Math.max(
    0,
    Math.min(onShifted + dur, 1.0) - Math.max(onShifted, 0.5),
  );
  const nightPiece2 = Math.max(
    0,
    Math.min(onShifted + dur, 2.0) - Math.max(onShifted, 1.5),
  );
  const hoursNight = (nightPiece1 + nightPiece2) * 24;

  // Monthly hours: per-cycle hours * (daysPerWeek/7) * (365/12)
  const monthlyMultiplier = (daysPerWeek / 7) * (365 / 12);
  const dayHoursPerMo = hoursDay * monthlyMultiplier;
  const nightHoursPerMo = hoursNight * monthlyMultiplier;

  // Find avg kW for the device
  const avgKw = device ? device.peakKw * device.dutyFactor : 0;

  return {
    dayKwh: dayHoursPerMo * avgKw * count,
    nightKwh: nightHoursPerMo * avgKw * count,
  };
}

/**
 * Sum the per-device contributions across the customer's device table.
 * deviceRows: [{ deviceName, count, onTime, offTime, daysPerWeek }, ...]
 */
export function totalDeviceKwh(deviceRows) {
  let day = 0,
    night = 0;
  for (const row of deviceRows) {
    if (!row.deviceName) continue;
    const device = DEVICES.find((d) => d.name === row.deviceName);
    if (!device) continue;
    const { dayKwh, nightKwh } = deviceMonthlyKwh(
      device,
      row.count,
      row.onTime,
      row.offTime,
      row.daysPerWeek,
    );
    day += dayKwh;
    night += nightKwh;
  }
  return { totalDeviceDayKwh: day, totalDeviceNightKwh: night };
}

// ─── Recommended panel count (CALCULATOR Q34, W7) ────────────────────────────
// CALCULATOR Q25 = monthlyBill / utilityRate  (estimated kWh consumption)
// CALCULATOR Q26 = totalDeviceDayKwh + totalDeviceNightKwh (from listed devices)
// CALCULATOR Q27 = Q25 - Q26  (baseload — what the device list doesn't account for)
// CALCULATOR Q28 = Q27/2 + deviceDayKwh    (total day-time kWh)
// CALCULATOR Q29 = Q27/2 + deviceNightKwh  (total night-time kWh)
// CALCULATOR Q31 = Q29 / batteryEfficiency / batteryDepthOfDischarge (battery sizing)
// CALCULATOR Q32 = (Q28 + Q31) * 12 / 365  (daily capacity needed)
// CALCULATOR Q33 = panelWatts (lookup based on phase)
// CALCULATOR Q34 = desiredSavings * Q32 * 1000 / Q33 / kWhPerKwpPerDay
// CALCULATOR W7 (recommended panel count) = ROUNDUP(Q34, 0)

export function computeRecommendedPanels(inputs, adminParams) {
  const { monthlyBill, utilityRate, deviceRows, desiredSavingsPct, phase } =
    inputs;
  const Q25 = monthlyBill / utilityRate;
  const { totalDeviceDayKwh, totalDeviceNightKwh } = totalDeviceKwh(deviceRows);
  const Q26 = totalDeviceDayKwh + totalDeviceNightKwh;
  const Q27 = Q25 - Q26; // baseload (can be negative if user-listed > bill implies)
  const Q28 = Q27 / 2 + totalDeviceDayKwh; // total day kWh/mo
  const Q29 = Q27 / 2 + totalDeviceNightKwh; // total night kWh/mo
  const Q31 =
    Q29 / adminParams.batteryEfficiency / adminParams.batteryDepthOfDischarge;
  const Q32 = ((Q28 + Q31) * 12) / 365; // daily capacity needed (kWh/day)
  const panelWatts =
    phase === "three"
      ? PANEL_SETTINGS.threePhase.panelWatts
      : PANEL_SETTINGS.singlePhase.panelWatts;
  const Q34 =
    (desiredSavingsPct * Q32 * 1000) / panelWatts / adminParams.kWhPerKwpPerDay;
  // v3-68: Product-settable minimum system size. DELIBERATE DEVIATION from the
  // Excel mirror (the workbook has no equivalent knob): the recommendation is
  // floored at the panel-count equivalent of adminParams.minSystemKwp. Inert
  // at the shipped default of 0 (floor = 0 panels → Math.max is a no-op), so
  // the Excel-mirrored value W7 = ROUNDUP(Q34) is unchanged until Product
  // raises the limit. minPanelsFloor is exported for the Step 2A override
  // input, which clamps manual entries to the same floor (0 stays allowed for
  // standalone RSD/inverter retrofit orders).
  const minPanelsFloor = Math.ceil(
    ((adminParams.minSystemKwp || 0) * 1000) / panelWatts,
  );
  // v3-106 — panel stock flag. When the active phase's panel is out of stock
  // the recommendation is forced to ZERO panels (overriding the min-system
  // floor too — you can't floor an order to panels that don't exist). The
  // quote itself proceeds: batteries / inverters / RSD retrofits for existing
  // installations are all still orderable (the standalone pricing paths).
  // Absent flag = available, so pre-v3-106 blobs need no migration.
  const panelsAvailable =
    (phase === "three"
      ? PANEL_SETTINGS.threePhase.available
      : PANEL_SETTINGS.singlePhase.available) !== false;
  const W7 = panelsAvailable
    ? Math.max(Math.ceil(Q34), minPanelsFloor) // recommended panel count
    : 0;

  // Validity warning: if Q27 < 0, user's device list claims more kWh than the
  // bill suggests — Excel shows "Something doesn't add up."
  const inconsistent = Q27 < 0;

  return {
    estMonthlyKwh: Q25,
    deviceDayKwh: totalDeviceDayKwh,
    deviceNightKwh: totalDeviceNightKwh,
    deviceTotalKwh: Q26,
    baseloadKwh: Q27,
    dayTimeKwh: Q28,
    nightTimeKwh: Q29,
    batteryNightTimeKwh: Q31,
    dailyCapacityNeeded: Q32,
    rawRecommendation: Q34,
    recommendedPanelCount: W7,
    minPanelsFloor,
    panelWatts,
    panelsAvailable, // v3-106 — false ⇒ W7 forced to 0; UI shows out-of-stock notice
    inconsistent,
  };
}

// ─── Recommended battery size (CALCULATOR Y25) ───────────────────────────────
// Excel: Y25 = ROUNDUP(ROUND(Schedule!G37, 0) / 5, 0) * 5
// This requires running the 24-hour schedule (which depends on panel count).
// We call this from the schedule module instead, after the day-curve is built.
// See: lib/schedule.js → batteryDailyExcess() + roundBatteryKwhToPackage()

// ─── Filter available inverters and sort descending ──────────────────────────
// Excel Inventory!G8:J40 = SORT(C8:F40, 4, 1) — sort by Available descending.
// We additionally filter to ONLY available rows for the dropdown source.
// The recommended-inverter logic uses these in order, picking the largest
// available size first.

export function availableInverters(phase) {
  const list =
    phase === "three" ? INVERTERS_THREE_PHASE : INVERTERS_SINGLE_PHASE;
  // v3-106 — rows carry an `available` stock flag (absent = available, so
  // pre-v3-106 blobs need no migration). Out-of-stock SKUs keep their row in
  // the admin editor but are excluded HERE — the single chokepoint both the
  // recommendation engine (recommendInverters) and the Step 2C dropdown read
  // from, so one filter covers every consumer. Sort largest-first to mirror
  // the Excel VLOOKUP behavior.
  return list
    .filter((inv) => inv.available !== false)
    .sort((a, b) => b.ratedKw - a.ratedKw);
}

// ─── Recommended inverter split (CALCULATOR G19, G20, G21) ───────────────────
// Excel logic:
//   Total inverter AC kW required: H17 = sum of selected
//   Required total: G18 = systemKwp / maxDcAcRatio
//                       (e.g. 5.04 kWp / 1.3 = 3.88 kW required)
//   G19 = MIN(G18, MAX(available inverters))   ← largest first
//   G20 = MIN(G18-G19, MAX(available inverters))
//   G21 = MIN(G18-G19-G20, MAX(available inverters))
// Then VLOOKUP picks the smallest available inverter >= G19 (etc.).
//
// Our function returns up to 3 recommended inverter sizes (kW). Each is the
// smallest AVAILABLE inverter whose rated kW >= the remaining required kW.
// If we run out of remaining requirement → returns null for that slot.

export function recommendInverters(systemKwp, phase) {
  const available = availableInverters(phase);
  if (available.length === 0) return [null, null, null];

  const maxRatio =
    phase === "three"
      ? PANEL_SETTINGS.threePhase.maxDcAcRatio
      : PANEL_SETTINGS.singlePhase.maxDcAcRatio;
  const totalAcKwRequired = systemKwp / maxRatio;
  const largestAvailable = available[0].ratedKw;

  const slots = [null, null, null];
  let remaining = totalAcKwRequired;

  for (let i = 0; i < 3; i++) {
    if (remaining <= 0.001) break;
    const target = Math.min(remaining, largestAvailable);
    // Find smallest available inverter whose ratedKw >= target.
    // (Sorted ascending here so we pick the smallest sufficient one.)
    const ascending = [...available].sort((a, b) => a.ratedKw - b.ratedKw);
    const picked =
      ascending.find((inv) => inv.ratedKw >= target) ||
      ascending[ascending.length - 1];
    slots[i] = picked;
    remaining -= picked.ratedKw;
  }

  return slots;
}

// ─── System sizing summary (CALCULATOR Y6, H17, G17) ─────────────────────────
// Y6 = panelCount * panelWatts / 1000  (system kWp)
// H17 = sum of selected inverter rated kW
// G17 = Y6 / H17  (actual DC/AC ratio)
// Warning if G17 > F17 (max ratio)

export function systemSizing(panelCount, panelWatts, selectedInverters, phase) {
  const systemKwp = (panelCount * panelWatts) / 1000;
  const totalInverterKw = selectedInverters.reduce(
    (sum, inv) => sum + (inv ? inv.ratedKw : 0),
    0,
  );
  const dcAcRatio = totalInverterKw > 0 ? systemKwp / totalInverterKw : 0;
  const maxRatio =
    phase === "three"
      ? PANEL_SETTINGS.threePhase.maxDcAcRatio
      : PANEL_SETTINGS.singlePhase.maxDcAcRatio;
  const ratioExceeded = dcAcRatio > maxRatio;
  return { systemKwp, totalInverterKw, dcAcRatio, maxRatio, ratioExceeded };
}

// ─── Cabling tier lookup (Admin VLOOKUP, B37:G44, 6, TRUE) ────────────────────
// VLOOKUP with approximate match returns the row where panelCount >= minPanels
// — i.e. the LAST row whose minPanels is still <= panelCount.

// Conservative baseline matching the smallest-panel-count default tier.
// Used as a last-resort fallback if cablingTiers is missing or empty so
// the calculator never crashes — the alternative is a blank page.
const FALLBACK_CABLING_TIER = {
  minPanels: 1,
  dcCablePct: 0.27,
  acCablePct: 0.08,
  conduitsPct: 0.12,
  panelBoardPct: 0.09,
};

export function cablingTotalPct(panelCount, adminParams, phase) {
  // v3-62: phase-aware tier selection. Three-phase installations use their
  // own tier table (cablingTiersThreePhase); if it's missing or empty (e.g. a
  // stale blob predating the migration seed), fall back to the single-phase
  // table — the pre-v3-62 behavior — rather than the bare hardcoded tier.
  const singleTiers =
    adminParams && Array.isArray(adminParams.cablingTiers)
      ? adminParams.cablingTiers
      : [];
  const threeTiers =
    adminParams && Array.isArray(adminParams.cablingTiersThreePhase)
      ? adminParams.cablingTiersThreePhase
      : [];
  const tiers =
    phase === "three" && threeTiers.length > 0 ? threeTiers : singleTiers;
  if (tiers.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[cablingTotalPct] No cabling tiers available; falling back to default tier.",
      );
    }
    const t = FALLBACK_CABLING_TIER;
    return t.dcCablePct + t.acCablePct + t.conduitsPct + t.panelBoardPct;
  }
  let chosen = tiers[0];
  for (const tier of tiers) {
    if (tier.minPanels <= panelCount) chosen = tier;
    else break;
  }
  return (
    chosen.dcCablePct +
    chosen.acCablePct +
    chosen.conduitsPct +
    chosen.panelBoardPct
  );
}

// ─── Single-phase panel direct-purchase price (Inventory D3) ─────────────────
// Excel D3 formula: =9008*70%/(1-A2) where A2 = Admin!A1.
// At runtime, the markup helper in adminParams.js computes:
//   directPrice = supplierCost * 0.7 / (1 - 0.26144542543429433) = ~0.948 * supplierCost
//
// Single-phase panel direct price is computed via that helper at module load
// time (PANEL_SETTINGS.singlePhase.panelDirectPrice). 3-phase is hardcoded.

export function panelDirectPrice(phase) {
  return phase === "three"
    ? PANEL_SETTINGS.threePhase.panelDirectPrice
    : PANEL_SETTINGS.singlePhase.panelDirectPrice;
}

// =============================================================================
// PACKAGE PRICING — produces every line item for the Summary sheet
// -----------------------------------------------------------------------------
// Returns a list of line items, each with:
//   { description, directPrice, isShown }
// "isShown" = whether this line is in the visible Summary FILTER (B<>0).
// =============================================================================

export function buildPackageLineItems(state, adminParams, schedule) {
  const {
    phase,
    panelCount,
    mountingSupportOverride,
    // v3-18 rename: these now hold the TOTAL meters required (panels-to-
    // inverter for DC, inverter-to-CB-panel for AC), not just the meters
    // beyond the included baseline. The math below subtracts the baseline
    // before billing so the customer is only charged for excess.
    dcCableMeters,
    acCableMeters,
    rsdEnabled,
    rsdStandalonePanelCount,
    selectedInverters,
    batteryKwh,
    // v3-143 — battery component unbundling. Default true = include (prior
    // behavior). Only gate line-item emission; sizing/recommendation untouched.
    batteryIncludeRack = true,
    batteryIncludeAts = true,
    batteryIncludeCriticalLoads = true,
    roofMaterial, // NEW v3: 'metal' | 'asphalt' | 'concrete'
    location, // NEW v3: 'luzon' | 'cebu' | 'siargao'
    locationKm, // NEW v3: road-km from the Parañaque logistics hub (v3-114; was Rizal Park)
    miscMaterials, // [{ description, count, unitPrice }, ...]
  } = state;

  // v3-80 — the RTO catalogue is gone. There is no longer a "60-Mo RTO price"
  // for a line item: OpCo sells at the Direct Purchase Price, and AssetCo
  // finances whatever balance remains after the down payment. Line items carry
  // a direct price and nothing else.

  const panelWatts =
    phase === "three"
      ? PANEL_SETTINGS.threePhase.panelWatts
      : PANEL_SETTINGS.singlePhase.panelWatts;
  const systemKwp = (panelCount * panelWatts) / 1000;

  // v3-142 — per-package margin CURVES (A/B/C). The per-system-size (kWp) curve
  // is retained: each package rides its own curve through the shared kWp
  // breakpoints. No-panels orders price at each package's max anchor (ceiling).
  const solarMargin = packageMarginForCapacity(
    systemKwp,
    panelCount,
    adminParams,
    "solar",
  );
  const batteryMargin = packageMarginForCapacity(
    systemKwp,
    panelCount,
    adminParams,
    "battery",
  );
  const miscMargin = packageMarginForCapacity(
    systemKwp,
    panelCount,
    adminParams,
    "misc",
  );

  // Re-price solar-scope derived fields at the solar package margin.
  const ap = {
    ...adminParams,
    batteryPackages: (adminParams.batteryPackages || []).map((p) => ({ ...p })),
  };
  deriveDirectPrices(ap, null, null, null, solarMargin);

  const panelCogsEa =
    phase === "three"
      ? PANEL_SETTINGS.threePhase.panelCogs
      : PANEL_SETTINGS.singlePhase.panelCogs;
  const panelPriceEa = directFromCogs(panelCogsEa, ap, solarMargin);

  // v3-134 — every line item also carries `cogs`: the SAME composition as its
  // directPrice but on the ENTERED pre-VAT COGS keys (Anjon's numbers, exact —
  // NOT reverse-derived from the ceilinged DP). Rep-entered misc lines have no
  // COGS → null. Surfaced in the Summary's admin price-reveal beside DP.

  const items = [];

  // 1. Solar panels
  const panelsTotal = panelCount * panelPriceEa;
  const panelsCogsTotal = panelCount * panelCogsEa;
  items.push({
    key: "panels",
    description: `${panelCount} units ${panelWatts}W Solar Panels`,
    directPrice: panelsTotal,
    cogs: panelsCogsTotal,
  });

  // 2. Mounting support — max(floor, 13% of panels) [skip if no panels]
  const mountingDirect =
    panelsTotal === 0
      ? 0
      : Math.max(
          ap.mountingSupportFloorPrice,
          panelsTotal * ap.mountingSupportPctOfPanels,
        );
  items.push({
    key: "mounting",
    description: "Mounting Support",
    directPrice: mountingDirect,
    cogs:
      panelsTotal === 0
        ? 0
        : Math.max(
            ap.mountingSupportFloorCogs,
            panelsCogsTotal * ap.mountingSupportPctOfPanels,
          ),
  });

  // 3. Cables, conduits, fittings, panel board & other devices
  // v3-62: phase-aware — 3-phase installs use cablingTiersThreePhase.
  const cablingPct = cablingTotalPct(panelCount, ap, phase);
  const cablingDirect = panelsTotal === 0 ? 0 : cablingPct * panelsTotal;
  items.push({
    key: "cabling",
    description: "Cables, Conduits, Fittings, Panel Board & Other Devices",
    directPrice: cablingDirect,
    cogs: panelsTotal === 0 ? 0 : cablingPct * panelsCogsTotal,
  });

  // 4. Additional DC cable — only meters beyond the included baseline are
  // billed. v3-18 changed the customer-facing input from "additional meters"
  // to "total meters", so the calc now subtracts the included baseline
  // before multiplying by the per-meter rate. At the default (30m total =
  // 30m included) the line item is ₱0 and no charge appears.
  const dcExtraMeters = Math.max(
    0,
    (dcCableMeters || 0) - INCLUDED_DC_CABLE_METERS,
  );
  const dcExtraDirect =
    panelsTotal === 0 ? 0 : dcExtraMeters * ap.additionalDcCablePerMeter;
  items.push({
    key: "dcExtra",
    description: `${dcExtraMeters}m of Add'l. DC Cable`,
    directPrice: dcExtraDirect,
    cogs:
      panelsTotal === 0 ? 0 : dcExtraMeters * ap.additionalDcCablePerMeterCogs,
  });

  // 5. Additional AC cable — same pattern as DC.
  const acExtraMeters = Math.max(
    0,
    (acCableMeters || 0) - INCLUDED_AC_CABLE_METERS,
  );
  const acExtraDirect =
    panelsTotal === 0 ? 0 : acExtraMeters * ap.additionalAcCablePerMeter;
  items.push({
    key: "acExtra",
    description: `${acExtraMeters}m of Add'l. AC Cable`,
    directPrice: acExtraDirect,
    cogs:
      panelsTotal === 0 ? 0 : acExtraMeters * ap.additionalAcCablePerMeterCogs,
  });

  // 6. Solar Labor & Installation (variable per kWp + fixed overhead bundle)
  const fixedOverheadDirect =
    ap.fixedOverheadDeliveryLogistics +
    ap.fixedOverheadWarehouse +
    ap.fixedOverheadCustoms +
    ap.fixedOverheadSafetySupervision +
    ap.fixedOverheadTesting;
  const laborDirect =
    systemKwp * ap.laborInstallationPerKwp +
    (panelsTotal === 0 ? 0 : fixedOverheadDirect);
  items.push({
    key: "labor",
    description: "Solar Labor & Installation",
    directPrice: laborDirect,
    cogs:
      systemKwp * ap.laborInstallationPerKwpCogs +
      (panelsTotal === 0
        ? 0
        : ap.fixedOverheadDeliveryLogisticsCogs +
          ap.fixedOverheadWarehouseCogs +
          ap.fixedOverheadCustomsCogs +
          ap.fixedOverheadSafetySupervisionCogs +
          ap.fixedOverheadTestingCogs),
  });

  // 7. RSD bundled with solar package
  // Excel: AA14 = (panelCount * Admin!E56 + Admin!E57) * H11
  //   where E56/E57 are the 60-Mo.RTO prices, but the line uses RTO totals.
  //   Working in DIRECT, this equals:
  //     RsdBundle direct = panelCount * D56 + D57
  let rsdDirect = 0;
  if (rsdEnabled && panelsTotal > 0) {
    rsdDirect = panelCount * ap.rsdVariablePerPanel + ap.rsdFixedTransmitter;
  }
  // 8. RSD as standalone (when no solar package is being purchased)
  let rsdStandaloneDirect = 0;
  if (rsdEnabled && panelsTotal === 0 && (rsdStandalonePanelCount || 0) > 0) {
    rsdStandaloneDirect =
      rsdStandalonePanelCount * ap.rsdVariablePerPanel + ap.rsdFixedTransmitter;
  }
  // RSD Labor for standalone
  let rsdStandaloneLaborDirect = 0;
  if (rsdStandaloneDirect > 0) {
    rsdStandaloneLaborDirect =
      rsdStandalonePanelCount * ap.rsdStandaloneLaborPerPanel +
      ap.rsdStandaloneLaborMobilization;
  }
  const rsdPanelsForLabel = Math.max(panelCount, rsdStandalonePanelCount || 0);
  const rsdAnyDirect = rsdDirect + rsdStandaloneDirect;
  // Notional RSD price = what the RSD would cost if availed, computed even when
  // declined so the proposal can show the amount while excluding it from totals.
  const rsdNotionalDirect =
    panelsTotal > 0
      ? panelCount * ap.rsdVariablePerPanel + ap.rsdFixedTransmitter
      : (rsdStandalonePanelCount || 0) > 0
        ? rsdStandalonePanelCount * ap.rsdVariablePerPanel +
          ap.rsdFixedTransmitter
        : 0;
  items.push({
    key: "rsd",
    description: `Rapid Shutdown Device (RSD) for ${rsdPanelsForLabel} Solar Panels`,
    directPrice: rsdAnyDirect,
    notionalPrice: rsdNotionalDirect,
    declined: !rsdEnabled,
    cogs:
      (rsdEnabled && panelsTotal > 0
        ? panelCount * ap.rsdVariablePerPanelCogs + ap.rsdFixedTransmitterCogs
        : 0) +
      (rsdEnabled && panelsTotal === 0 && (rsdStandalonePanelCount || 0) > 0
        ? rsdStandalonePanelCount * ap.rsdVariablePerPanelCogs +
          ap.rsdFixedTransmitterCogs
        : 0),
  });
  items.push({
    key: "rsdLabor",
    description: "Labor & Installation for Standalone RSD order",
    directPrice: rsdStandaloneLaborDirect,
    cogs:
      rsdStandaloneLaborDirect > 0
        ? rsdStandalonePanelCount * ap.rsdStandaloneLaborPerPanelCogs +
          ap.rsdStandaloneLaborMobilizationCogs
        : 0,
  });

  // 9. Inverters (each slot)
  selectedInverters.forEach((inv, i) => {
    const invDirect = inv ? directFromCogs(inv.cogs, ap, solarMargin) : 0;
    const desc = inv ? `${inv.ratedKw.toFixed(2)} kW Inverter` : "None";
    items.push({
      key: `inverter${i}`,
      description: desc,
      directPrice: invDirect,
      cogs: inv ? inv.cogs : 0,
    });
  });

  // 10. Battery package (v3-54 — package-driven)
  // The active battery package is resolved from state.batteryPackageId via
  // ap.batteryPackages[]. Each package carries its own unit size,
  // rack capacity, and pricing. For a default-state customer who hasn't
  // touched the package selector (no batteryPackageId in state), packages[0]
  // is used — which by design preserves v3-53's "5 kWh / 3-cap" defaults
  // exactly. So a default-state quote produces bit-exact identical numbers
  // to v3-53.
  //
  // Math:
  //   batteryCount = ceil(batteryKwh / pkg.batteryUnitKwh)
  //   rackCount    = ceil(batteryCount / pkg.batteryRackCapacity)
  //   batteryDirect = batteryCount * pkg.batteryUnitPrice
  //   rackDirect    = rackCount    * pkg.batteryRackPrice
  //   ATS / critical loads / labor — same as v3-53, but pulled from pkg
  //   instead of flat ADMIN_PARAMS keys.
  //
  // The kWh dropdown in Step 2 steps in multiples of pkg.batteryUnitKwh
  // (5's for the 5 kWh pack; 16's for the 16 kWh pack), so batteryKwh
  // should always be a clean integer multiple of pkg.batteryUnitKwh at
  // call time. The ceil() is defensive: any legacy session that captured
  // an off-grid value (e.g. 25 kWh under a 16 kWh pack) still produces a
  // sane cost — it rounds up to the next physical pack count.
  const pkg = resolveBatteryPackage(ap, state.batteryPackageId);
  const batteryCount =
    (batteryKwh || 0) > 0
      ? Math.ceil((batteryKwh || 0) / pkg.batteryUnitKwh)
      : 0;
  const rackCount =
    batteryCount > 0 ? Math.ceil(batteryCount / pkg.batteryRackCapacity) : 0;
  const batteryUnitPrice = directFromCogs(
    pkg.batteryUnitCogs,
    ap,
    batteryMargin,
  );
  const batteryRackPrice = directFromCogs(
    pkg.batteryRackCogs,
    ap,
    batteryMargin,
  );
  const atsPrice = directFromCogs(pkg.atsCogs, ap, batteryMargin);
  const critLoadsPrice = directFromCogs(
    pkg.criticalLoadsMaterialsCogs,
    ap,
    batteryMargin,
  );
  const batteryLaborWithSolarPrice = directFromCogs(
    pkg.laborWithSolarInstallCogs,
    ap,
    batteryMargin,
  );
  const batteryStandaloneLaborPrice = directFromCogs(
    pkg.standaloneLaborCogs,
    ap,
    batteryMargin,
  );

  const batteryDirect = batteryCount * batteryUnitPrice;
  const rackDirect = batteryIncludeRack ? rackCount * batteryRackPrice : 0;
  const atsDirect = batteryKwh > 0 && batteryIncludeAts ? atsPrice : 0;
  const critLoadDirect =
    batteryKwh > 0 && batteryIncludeCriticalLoads ? critLoadsPrice : 0;

  // Labor with solar OR standalone
  const hasSolar = panelsTotal > 0;
  const battLaborDirect =
    batteryKwh > 0
      ? hasSolar
        ? batteryLaborWithSolarPrice
        : batteryStandaloneLaborPrice
      : 0;
  const battLaborLabel = hasSolar
    ? "Battery Labor & Installation w/ Solar Package Installation"
    : "Battery Standalone Labor & Installation";

  items.push({
    key: "battery",
    description: `${batteryCount} unit/s ${pkg.batteryUnitKwh}kWh Battery w/ Cables & Lugs`,
    directPrice: batteryDirect,
    cogs: batteryCount * pkg.batteryUnitCogs,
  });
  // v3-143 — rack / ATS / critical loads: when a battery is present but the rep
  // has unbundled the component (client-supplied), emit a ₱0 informational line
  // so the omission is explicit on the quote instead of silently vanishing.
  if (batteryKwh > 0 && !batteryIncludeRack) {
    items.push({
      key: "rack",
      description: "Battery Rack — not included (client-supplied)",
      directPrice: 0,
      cogs: 0,
      informational: true,
    });
  } else {
    items.push({
      key: "rack",
      description: `${rackCount} unit/s Battery Rack`,
      directPrice: rackDirect,
      cogs: batteryIncludeRack ? rackCount * pkg.batteryRackCogs : 0,
    });
  }
  if (batteryKwh > 0 && !batteryIncludeAts) {
    items.push({
      key: "ats",
      description:
        "Automatic Transfer Switch (ATS) — not included (client-supplied)",
      directPrice: 0,
      cogs: 0,
      informational: true,
    });
  } else {
    items.push({
      key: "ats",
      description: "Automatic Transfer Switch (ATS)",
      directPrice: atsDirect,
      cogs: batteryKwh > 0 && batteryIncludeAts ? pkg.atsCogs : 0,
    });
  }
  if (batteryKwh > 0 && !batteryIncludeCriticalLoads) {
    items.push({
      key: "critLoads",
      description:
        "Materials for Critical Loads — not included (client-supplied)",
      directPrice: 0,
      cogs: 0,
      informational: true,
    });
  } else {
    items.push({
      key: "critLoads",
      description: "Materials for Critical Loads",
      directPrice: critLoadDirect,
      cogs:
        batteryKwh > 0 && batteryIncludeCriticalLoads
          ? pkg.criticalLoadsMaterialsCogs
          : 0,
    });
  }
  items.push({
    key: "batteryLabor",
    description: battLaborLabel,
    directPrice: battLaborDirect,
    cogs:
      batteryKwh > 0
        ? hasSolar
          ? pkg.laborWithSolarInstallCogs
          : pkg.standaloneLaborCogs
        : 0,
  });

  // 11. Standalone-inverter mobilization
  // Excel AA23: when no solar, but inverters selected, charge mobilization fee
  let invMobDirect = 0;
  const invCount = selectedInverters.filter((i) => i).length;
  if (panelsTotal === 0 && invCount > 0) {
    invMobDirect =
      ap.inverterStandaloneLaborPerUnit * invCount +
      ap.inverterStandaloneMobilization;
  }
  items.push({
    key: "invMob",
    description: "Mobilization for StandAlone Inverter Order",
    directPrice: invMobDirect,
    cogs:
      invMobDirect > 0
        ? ap.inverterStandaloneLaborPerUnitCogs * invCount +
          ap.inverterStandaloneMobilizationCogs
        : 0,
  });

  // 12. Roof Material (v3 — Excel CALCULATOR AA34)
  // Charge depends on which surface the panels mount to.
  //   metal     → ₱0       (no roof prep needed)  ← DEFAULT
  //   asphalt   → kWp × roofAsphaltPerKwp
  //   concrete  → kWp × roofConcretePerKwp
  let roofDirect = 0;
  let roofLabel = "Roof Preparation (Metal — no prep needed)";
  if (panelsTotal > 0) {
    if (roofMaterial === "asphalt") {
      roofDirect = systemKwp * ap.roofAsphaltPerKwp;
      roofLabel = "Roof Preparation — Asphalt / Shingles / Tiled";
    } else if (roofMaterial === "concrete") {
      roofDirect = systemKwp * ap.roofConcretePerKwp;
      roofLabel = "Roof Preparation — Concrete";
    }
  }
  items.push({
    key: "roof",
    description: roofLabel,
    directPrice: roofDirect,
    cogs:
      roofDirect === 0
        ? 0
        : systemKwp *
          (roofMaterial === "asphalt"
            ? ap.roofAsphaltPerKwpCogs
            : ap.roofConcretePerKwpCogs),
  });

  // 13. Location / Delivery (v3 — Excel CALCULATOR AA38)
  //   luzon  + km≤33 → ₱0                                            ← DEFAULT
  //   luzon  + km>33 → luzonOver30FixedFee + MAX(0, km−33) × luzonOver30PerKm   (AA38, v3-115 fix)
  //   dynamic row    → row.fixedFee + panels × row.perPanel   (v3-116)
  let locationDirect = 0;
  let locationLabel = `Location / Delivery — Luzon (within ${LUZON_FREE_TRAVEL_KM}km)`;
  if (panelsTotal > 0) {
    // v3-116 — dynamic delivery locations. Any non-luzon/non-other location
    // id resolves against ap.deliveryLocations (derived per-row at quote
    // margin above); a missing/deleted id defensively prices ₱0 here —
    // App.jsx already falls a stale pick back to 'luzon' before pricing, so
    // this branch is a belt-and-braces guard, not the enforcement point.
    const dynamicLoc =
      location !== "luzon" && location !== "other"
        ? (ap.deliveryLocations || []).find((l) => l.id === location)
        : null;
    if (dynamicLoc) {
      locationDirect = dynamicLoc.fixedFee + panelCount * dynamicLoc.perPanel;
      locationLabel = `Location / Delivery — ${dynamicLoc.label}`;
    } else if (
      location === "luzon" &&
      (locationKm || 0) > LUZON_FREE_TRAVEL_KM
    ) {
      // v3-115 PARITY FIX — workbook AA38 is MAX(0, Y39-33) × D41 + D40: the
      // per-km rate applies ONLY to the EXCESS beyond the free zone
      // (LUZON_FREE_TRAVEL_KM). The app had charged the FULL distance since
      // Luzon location pricing was introduced, overbilling every billable
      // Luzon quote and contradicting the proposal's own Logistics Add-On
      // T&C ("any excess distance beyond the first N kilometers").
      // User-reported v3-114; verified against Solviva_Calc_v_B_5_1.xlsm
      // CALCULATOR!AA38.
      locationDirect =
        ap.luzonOver30FixedFee +
        Math.max(0, (locationKm || 0) - LUZON_FREE_TRAVEL_KM) *
          ap.luzonOver30PerKm;
      locationLabel = `Location / Delivery — Luzon (${locationKm} km from Parañaque hub)`; // v3-114 origin rebase
    }
  }
  // v3-134 — location COGS mirror: dynamic row → fixedFeeCogs + panels ×
  // perPanelCogs; Luzon >33 km → luzonOver30FixedFeeCogs + excess-km ×
  // luzonOver30PerKmCogs (same AA38 shape on Anjon's entered values).
  let locationCogs = 0;
  if (panelsTotal > 0) {
    const dynRow =
      location !== "luzon" && location !== "other"
        ? (ap.deliveryLocations || []).find((l) => l.id === location)
        : null;
    if (dynRow) {
      locationCogs =
        (dynRow.fixedFeeCogs || 0) + panelCount * (dynRow.perPanelCogs || 0);
    } else if (
      location === "luzon" &&
      (locationKm || 0) > LUZON_FREE_TRAVEL_KM
    ) {
      locationCogs =
        ap.luzonOver30FixedFeeCogs +
        Math.max(0, (locationKm || 0) - LUZON_FREE_TRAVEL_KM) *
          ap.luzonOver30PerKmCogs;
    }
  }
  items.push({
    key: "location",
    description: locationLabel,
    directPrice: locationDirect,
    cogs: locationCogs,
  });

  // 12. Misc materials (V35:Y36 — up to 12 lines, dynamic)
  // v3-138 — two kinds of row now share this loop:
  //
  //   CATALOG row (catalogId resolves): price is read LIVE off `ap.miscCatalog`
  //     — already re-derived above at THIS quote's capacity margin — not off
  //     whatever unitPrice the session happens to be holding. An Anjon price
  //     change therefore reprices open sessions, matching how batteries and
  //     delivery locations already behave. The row carries a real COGS, so it
  //     contributes to totalCogs in the admin price reveal (user-directed).
  //     A catalogId that no longer resolves (deleted, or marked out of stock)
  //     prices at ZERO rather than falling back to a stale stored number —
  //     Step 2F flags it in amber so the rep can't miss it.
  //
  //   FREE-FORM row (no catalogId, or the 'other' sentinel — which is also
  //     every row restored from a pre-v3-138 session): unchanged from v3-137.
  //     Rep-entered description and price, cogs null, excluded from totalCogs.
  (miscMaterials || []).forEach((row, i) => {
    const empty = {
      key: `misc${i}`,
      description: "",
      directPrice: 0,
      cogs: null,
    };
    if (!row || !row.count) {
      items.push(empty);
      return;
    }

    const catId = row.catalogId;
    const isCatalog = catId && catId !== "other";
    if (isCatalog) {
      const item = (ap.miscCatalog || []).find((m) => m && m.id === catId);
      if (!item || item.available === false) {
        items.push(empty);
        return;
      }
      const miscUnitPrice = directFromCogs(item.cogs, ap, miscMargin);
      items.push({
        key: `misc${i}`,
        description: `${row.count} Unit/s ${item.label}`,
        directPrice: row.count * miscUnitPrice,
        cogs: row.count * (Number(item.cogs) || 0),
      });
      return;
    }

    if (!row.description || !row.unitPrice) {
      items.push(empty);
      return;
    }
    items.push({
      key: `misc${i}`,
      description: `${row.count} Unit/s ${row.description}`,
      directPrice: row.count * row.unitPrice,
      cogs: null, // rep-entered PRICE — no COGS basis (shown as — in the reveal)
    });
  });

  // Totals
  const totalDirect = items.reduce((s, i) => s + i.directPrice, 0);
  // v3-134 — total entered COGS across lines that HAVE a COGS basis (misc
  // excluded via null). Admin price-reveal shows it under the COGS column.
  const totalCogs = items.reduce((s, i) => s + (i.cogs ?? 0), 0);

  return {
    items,
    totalDirect,
    totalCogs,
    systemKwp,
    panelPriceEa,
  };
}

// =============================================================================
// PAYMENT SCHEDULE — Step 3 calculations
// -----------------------------------------------------------------------------
// Inputs: tenor (months), down payment %, promo code
// Returns: monthly payment, DP amount, total balance, all the fields shown in
// Step 3 of the Calculator.
// =============================================================================

// ─── v3-75: tiered minimum-DP resolution ─────────────────────────────────────
// Resolves the effective minimum down-payment fraction for a quote from the
// Product-configured adminParams.minDpTiers table, keyed on the quote's
// Net Price (v3-80: terms.netDirectPrice — the Direct Purchase Price less any
// promo. Tenor-INDEPENDENT, so a longer tenor can no longer cross a tier
// boundary and silently raise the customer's minimum DP mid-quote).
// The applicable tier is the LAST row whose fromNetPrice ≤ netPrice.
// Pure function — no pricing impact; it only gates which Step 3A options the
// UI offers. Defensive: sorts a copy (server enforces ascending order, but a
// hand-edited blob shouldn't break the floor), tolerates a missing/empty
// array (→ 0, no floor), and clamps each tier's fraction to [0, 0.5] to match
// the server-side validation bounds.
export function resolveMinDpPct(minDpTiers, netPrice) {
  if (!Array.isArray(minDpTiers) || minDpTiers.length === 0) return 0;
  const sorted = [...minDpTiers].sort(
    (a, b) => (a.fromNetPrice || 0) - (b.fromNetPrice || 0),
  );
  let pct = 0;
  for (const t of sorted) {
    const from = Number(t.fromNetPrice) || 0;
    if ((Number(netPrice) || 0) >= from) {
      pct = Math.max(0, Math.min(0.5, Number(t.minDpPct) || 0));
    } else {
      break;
    }
  }
  return pct;
}

export function computePaymentTerms(state, adminParams, packageData) {
  const { tenor, downPaymentPct, promoCode } = state;
  const { totalDirect } = packageData;

  // ═══ v3-80 — OpCo / AssetCo LOAN MODEL ═══════════════════════════════════
  // Solviva is separating OpCo (builds and sells the system) from AssetCo
  // (finances it). The pricing model now mirrors that split exactly:
  //
  //   OpCo's revenue    = the Direct Purchase Price. Full stop.
  //   AssetCo lends     = Net Price − Down Payment, and collects the monthly
  //                       payments. Its revenue is the interest.
  //
  // That is a plain amortising loan, and it DELETES the entire Rent-to-Own
  // apparatus that preceded it: the 60-Mo RTO catalogue, `catalogueRate`, the
  // PV/PMT round-trip that recovered `directPurchasePrice`, the Early Payment
  // Discount, "Additional Savings from your Down Payment", and
  // `totalPaymentsOverTenor`. None of them have a referent any more.
  //
  // WHY THAT MATTERS BEYOND TIDINESS: under the old model the down payment was
  // a percentage of an interest-inflated total, so "50% down" cost 86% of the
  // system's cash price at 60 months and only 50% at 1 month — the same label
  // meaning wildly different things, and at a 48% catalogue rate it broke
  // outright (the DP exceeded the asset and the balance went negative). Here
  // the DP is a percentage of the Net Price. 40% down means 40% down, at every
  // tenor, and `amountForFinancing = Net × (1 − dp)` cannot go negative — so
  // the v3-56 guard is now unreachable by construction.
  //
  // Mirrors CALCULATOR!AH5:AH15 and SUMMARY!G8:H19 of Solviva_Calc_v_B_4_2.

  // AH5 → AH7. Promo is a straight percentage off the direct price.
  const promo = adminParams.promoCodes.find(
    (p) => p.code === (promoCode || "").trim().toUpperCase(),
  );
  const promoDiscount = promo ? promo.discount : 0;
  const discountAmount = -promoDiscount * totalDirect; // AH6 (≤ 0)
  const netDirectPrice = totalDirect + discountAmount; // AH7

  // The rate comes from the tenor × DP surface (Admin!C22 in the workbook is an
  // XLOOKUP into the Rate Grid sheet; `rtoRate` IS that grid, in closed form).
  const rate = rtoRate(tenor, downPaymentPct, adminParams);
  const monthlyRate = rate / 12;

  // AH9 → AH11
  const dpTotalCharge = downPaymentPct * netDirectPrice; // AH9
  const amountForFinancing = netDirectPrice - dpTotalCharge; // AH11

  // AH14 — ANNUITY-DUE (type 1): payments fall at month START, matching the
  // workbook's PMT(Admin!C22/12, tenor, -AH11, , 1) (v4.7). This is a real
  // change to every monthly payment vs the v3-80→v3-95 ordinary-annuity (type
  // 0) model, not a rounding difference — the whole payment ladder shifts DOWN.
  // WHY: paying at the start of each period means the FIRST payment retires
  // principal before any interest accrues, so at tenor 1 the single payment
  // equals the financed amount EXACTLY (zero interest) — a Direct Purchase is
  // now genuinely interest-free, which is the alignment this change is for. The
  // diminishing-balance IRR of the customer's own cash flows is still exactly
  // rtoRate/12 per month (an annuity-due is an ordinary annuity shifted one
  // period earlier; its IRR is unchanged), so the RA 3765 effective-rate
  // disclosure still holds — only the finance-charge figures re-baseline.
  //
  // v3-99 — PMT reverts to ORDINARY ANNUITY (type 0), matching
  // Solviva_Calc_v_B_5_1.xlsm AH15 `=PMT(PRODUCT!C2/12, AG12, -AH10)` (no type
  // arg). This UNDOES the v3-96 annuity-due (type 1) switch: v5.0/v5.1 collect
  // each payment at month END. Every financed monthly rises by a factor of
  // (1 + rate/12) vs type 1, lifting the total due and finance charge.
  //
  // v3-100 — DIRECT PURCHASE (tenor 0). v5.1's AH15 is
  // IFERROR(PMT(rate/12, AG12, -AH10), AH10): with AG12 = "Direct Purch" the
  // PMT errors and falls back to AH10 — the WHOLE balance, due in one payment
  // upon installation, at 0% interest. Mirrored here without the IFERROR
  // theatrics. The numeric tenor 1 now goes through PMT like any other term
  // and bears one month of interest at the curve's N-column rate.
  const isDirectPurchase = tenor < 1;
  const customerMonthlyPmt = isDirectPurchase
    ? amountForFinancing
    : PMT(monthlyRate, tenor, -amountForFinancing);

  // AH16 = IF("Direct Purch", AH10, AH15·AG12) — the balance itself for a
  // Direct Purchase, monthly × tenor otherwise.
  const finalPostInstallBalance = isDirectPurchase
    ? amountForFinancing
    : customerMonthlyPmt * tenor; // AH16
  const totalAmountDue = dpTotalCharge + finalPostInstallBalance; // AG29

  // v3-99 — DOCUMENTARY STAMP TAX (CALCULATOR!AH13). ₱1.50 per ₱200 (or part)
  // of the financed amount, prorated by the loan's fraction of a year and
  // capped at 1. Zero for a Direct Purchase (tenor 0, v3-100) — no loan, no
  // DST. The numeric 1-month term IS a loan now and pays DST at 1/12 proration.
  //   AH13 = IF(Direct Purch, 0,
  //             ROUNDUP(AH10/200,0) · PRODUCT!D3 · MIN(1, loanDays/365))
  // The workbook prorates on the ACTUAL last-payment due date; here we use
  // MIN(1, tenor/12), which is exact for tenor ≥ 12 (proration = 1) and for
  // Direct Purchase (0), and differs only by a rounding for 1–11 month financed
  // deals — a negligible amount on a small tax line. `documentaryStampTaxRate`
  // (0.0075, Product-editable as of v3-100) × 200 = the ₱1.50 per-₱200 charge.
  const dstPerTwoHundred = 200 * (adminParams.documentaryStampTaxRate ?? 0);
  const dst = isDirectPurchase
    ? 0
    : Math.ceil(amountForFinancing / 200) *
      dstPerTwoHundred *
      Math.min(1, tenor / 12);

  // v3-100 — the DST-INCLUSIVE grand total: SUMMARY!H20 = H18 + H14 + H11
  // (balance + DST + DP) = ANNEX!E8. Deliberately a NEW field: totalAmountDue
  // keeps its AG29 (DST-exclusive) definition so the pinned goldens and the
  // tenor-comparison tables (Excel AH20:AH27, which also exclude DST) are
  // untouched. Everything customer-facing that says "TOTAL AMOUNT DUE" prints
  // THIS number (per user decision — one label, one value; the workbook itself
  // shows two different totals under the same label, AG29 vs H20).
  const summaryTotalDue = totalAmountDue + dst;
  // AssetCo's revenue. Internal — the workbook's SUMMARY does not show it and
  // neither do we.
  const totalInterest = totalAmountDue - netDirectPrice; // AH19

  // v3-82 — a 100% down payment leaves nothing to finance. PMT() returns a clean
  // 0 here (no NaN), but the TENOR then means nothing: without this flag the
  // ANNEX would print up to 60 rows of ₱0 into the customer's PDF, and Step 3B
  // would offer a term for a loan that doesn't exist. Consumers use this to
  // collapse to a pure cash purchase.
  const isFullyPaid = amountForFinancing < 0.005;

  // ─── v3-86 — RA 3765 (Truth in Lending Act) DISCLOSURE FIGURES ────────────
  // The statute requires the creditor to disclose, before the credit transaction
  // is consummated: the cash price, the down payment, the AMOUNT FINANCED, the
  // FINANCE CHARGE, the total payable, and the effective interest rate.
  //
  // WE ALREADY CHARGE THE EFFECTIVE RATE. `customerMonthlyPmt` is PMT() on the
  // DIMINISHING BALANCE, so the IRR of the customer's own cash flows comes back
  // to exactly rtoRate/12 per month — verified in smoke. The rate disclosure that
  // RA 3765 exists to force is aimed at ADD-ON lenders, who compute interest on
  // the ORIGINAL principal for the whole term: at a headline 14.375% over 36
  // months that would charge ₱18,900/mo instead of ₱16,335 and a true rate near
  // 25%. PMT on a declining balance structurally cannot do that. So the rate we
  // print IS the effective rate, and the correct phrasing — the term of art that
  // distinguishes us from add-on lenders — is "per annum on the diminishing
  // balance". No second "effective" number is disclosed: one rate, one convention.
  //
  // The one thing that was genuinely missing is the FINANCE CHARGE. v3-80 kept
  // `totalInterest` out of the customer view (matching the workbook's SUMMARY).
  // The statute puts it back. It is the same number, now surfaced.
  const disclosure = {
    cashPrice: netDirectPrice,
    downPayment: dpTotalCharge,
    amountFinanced: amountForFinancing,
    financeCharge: totalInterest, // <- REQUIRED. Was hidden pre-v3-86.
    totalPayable: totalAmountDue,
    nominalAnnualRate: rate, // disclosed as "% p.a., diminishing balance"
    monthlyRate,
    monthlyPayment: customerMonthlyPmt,
    tenor,
  };

  return {
    rtoRate: rate,
    promo,
    promoDiscount,
    discountAmount,
    netDirectPrice,
    dpTotalCharge,
    amountForFinancing,
    customerMonthlyPmt,
    finalPostInstallBalance,
    totalAmountDue,
    summaryTotalDue,
    totalInterest,
    dst,
    isDirectPurchase,
    isFullyPaid,
    disclosure,
    // v3-80 — the DP is now a share of a price that cannot be exceeded, so this
    // can never be true. Kept (always false) so App.jsx's v3-56 tab-gating and
    // PDF-disabling logic stays intact rather than being surgically removed.
    negativeBalance: false,
  };
}

// =============================================================================
// DATA TABLE — Step 3 "Most popular tenors" mini-table
// -----------------------------------------------------------------------------
// Excel CALCULATOR!AF27:AI33 is a 1-variable Excel data table that recomputes
// the model with AH7 substituted by each value in {1, 6, 12, 24, 36, 48, 60}.
// We re-derive that here. It's a small extra cost — recompute the payment
// terms at each tenor.
// =============================================================================

// v3-102 — PROPOSAL_BASE_TENORS / proposalTenorSet / proposalTenorRows deleted:
// their only consumer (the PDF payment-options milestone matrix) was replaced
// by the popularTenorsTable below, so the PDF and the Summary now share one
// comparison with one set of (DST-inclusive) totals.
// v3-118 — Monthly Add-On Rate for the Compare-your-payment-terms table
// (Summary + PDF share this; smoke-asserted). User-CORRECTED formula
// (supersedes the v3-117 TAD-vs-baseline version, which folded DST into the
// rate):
//   ((Monthly_Payment × Tenor − Amount_for_Financing) / Tenor) / Amount_for_Financing
// Monthly_Payment × Tenor = total installments; minus the financed amount =
// pure interest; per month, over the financed principal — the classic
// add-on-rate definition on the LOAN itself. Amount_for_Financing is
// tenor-invariant, so one base serves every row. Direct Purchase (tenor 0)
// is ZERO (user decision C); the guard also covers a 100%-DP quote where
// nothing is financed.
// v3-135 — per-line Direct-Purchase waterfall for the Summary price reveal
// (user-directed five-column view): COGS + Gross Margin + MDR allowance +
// VAT = Direct Purchase Price, EXACTLY. Definitions per the pricing formula:
//   net revenue = DP × (1.12 × (1 − MDR) − 0.12) / 1.12
//   GM ₱        = net revenue − COGS      MDR ₱ = MDR × DP      VAT ₱ = DP × 12/112
// (algebraic identity: the four sum to DP). Display values are rounded to
// whole pesos with the RESIDUAL absorbed by the GM cell, so the printed
// columns also sum exactly. cogs == null (misc lines, rep-entered prices with
// no COGS basis) books the entire net revenue as margin — flagged by
// `cogsKnown: false` so the UI can dash the COGS cell.
export function decomposeDirectPrice(directPrice, cogs, merchantDiscountRate) {
  const dp = Number(directPrice) || 0;
  const m = Number(merchantDiscountRate) || 0;
  const vat = Math.round((dp * VAT_RATE) / (1 + VAT_RATE));
  const mdrAmt = Math.round(dp * m);
  const cogsR = Math.round(cogs ?? 0);
  const dpR = Math.round(dp);
  const gm = dpR - cogsR - mdrAmt - vat; // residual → exact identity
  return { cogs: cogsR, gm, mdrAmt, vat, dp: dpR, cogsKnown: cogs != null };
}

export function monthlyAddOnRate(monthlyPmt, amountForFinancing, tenor) {
  if (!tenor || tenor <= 0) return 0;
  const amt = Number(amountForFinancing);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  return (monthlyPmt * tenor - amt) / tenor / amt;
}

export function popularTenorsTable(state, adminParams, packageData) {
  // v3-80 — mirrors the Excel data table at CALCULATOR!AE20:AH26. For the
  // customer's CHOSEN down payment, recompute the loan at each tenor.
  //
  // Was {tenor, dpAmount, monthlyPmt}. The dpAmount column is dropped: under the
  // loan model the down payment is a share of the Net Price, so it is IDENTICAL
  // at every tenor — a constant column earns no space. `rate` replaces it, and
  // is the more useful number anyway: it is *why* the total climbs with tenor.
  //
  // v3-101 — three user-directed changes vs the workbook's data table:
  //   1. The 1-month row is OUT and Direct Purchase (tenor 0) is IN — the
  //      interest-free option is the comparison that matters, not the oddball
  //      1-month loan.
  //   2. The customer's SELECTED tenor is spliced in (sorted) when it isn't a
  //      base row, so the highlighted "your selection" row always exists.
  //   3. `totalDue` is DST-INCLUSIVE (summaryTotalDue) — the selected row's
  //      total must equal the Summary's TOTAL AMOUNT DUE printed just above
  //      this table (one label, one number). Deliberate deviation from Excel's
  //      AH20:AH27, which exclude DST. DST prorates by tenor, so each row
  //      carries its own figure.
  const tenors = [0, 6, 12, 24, 36, 48, 60];
  const sel = state.tenor ?? 0;
  if (!tenors.includes(sel)) tenors.push(sel);
  tenors.sort((a, b) => a - b);
  return tenors.map((t) => {
    const terms = computePaymentTerms(
      { ...state, tenor: t },
      adminParams,
      packageData,
    );
    return {
      tenor: t,
      rate: terms.rtoRate,
      monthlyPmt: terms.customerMonthlyPmt,
      totalDue: terms.summaryTotalDue,
    };
  });
}
