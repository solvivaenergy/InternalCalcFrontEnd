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

import { DEVICES, DAY_START_HOUR } from '../data/devices.js';
import { PANEL_SETTINGS, INVERTERS_SINGLE_PHASE, INVERTERS_THREE_PHASE } from '../data/inventory.js';
import { INCLUDED_DC_CABLE_METERS, INCLUDED_AC_CABLE_METERS } from '../config.js';
import { resolveBatteryPackage } from '../data/adminParams.js';

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
  return -(pmt * (1 + rate * type) * (pvif - 1) / rate + fv) / pvif;
}

/**
 * Excel NPER(rate, pmt, pv, fv=0, type=0)
 * Number of periods to pay off a loan / accumulate to fv.
 * Used for "Simple Payback Period" calculation.
 */
export function NPER(rate, pmt, pv, fv = 0, type = 0) {
  if (pmt === 0) return Infinity;
  if (rate === 0) return -(pv + fv) / pmt;
  const num = (pmt * (1 + rate * type) - fv * rate);
  const den = (pv * rate + pmt * (1 + rate * type));
  if (num / den <= 0) return Infinity;  // payback never happens
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
      dnpv -= t * cashflows[t] * v / (1 + rate);
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
  return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i + 1), 0);
}

// ─── Effective RTO interest rate (Admin C25) ─────────────────────────────────
// Admin C25 = baseRate + (panelCount < threshold ? premium : 0)
// Used as the discount rate for converting between 60-Mo RTO totals and
// equivalent direct-purchase prices throughout the calculator.

export function effectiveRtoRate(panelCount, adminParams) {
  const premium = panelCount < adminParams.smallPackagePanelThreshold
    ? adminParams.smallPackageRiskPremiumBps / 10000   // C24/10000
    : 0;
  return adminParams.baseRtoInterestRate + premium;
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
    dur = 1;  // runs continuously all day
  } else if (offTime > onTime) {
    dur = offTime - onTime;
  } else {
    dur = offTime + 1 - onTime;
  }

  // Shifted on-time: ((onTime - 6/24) MOD 1)
  const SHIFT = DAY_START_HOUR / 24;
  const onShifted = ((onTime - SHIFT) % 1 + 1) % 1;

  // Day window contribution (in fractional days, then *24 → hours)
  // Two pieces because the "shifted day" can wrap:
  //   piece1: window [0,   0.5]
  //   piece2: window [1.0, 1.5]
  const dayPiece1 = Math.max(0, Math.min(onShifted + dur, 0.5) - Math.max(onShifted, 0));
  const dayPiece2 = Math.max(0, Math.min(onShifted + dur, 1.5) - Math.max(onShifted, 1));
  const hoursDay = (dayPiece1 + dayPiece2) * 24;

  // Night window contribution
  //   piece1: window (0.5, 1.0]
  //   piece2: window (1.5, 2.0]
  const nightPiece1 = Math.max(0, Math.min(onShifted + dur, 1.0) - Math.max(onShifted, 0.5));
  const nightPiece2 = Math.max(0, Math.min(onShifted + dur, 2.0) - Math.max(onShifted, 1.5));
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
  let day = 0, night = 0;
  for (const row of deviceRows) {
    if (!row.deviceName) continue;
    const device = DEVICES.find(d => d.name === row.deviceName);
    if (!device) continue;
    const { dayKwh, nightKwh } = deviceMonthlyKwh(
      device, row.count, row.onTime, row.offTime, row.daysPerWeek
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
  const { monthlyBill, utilityRate, deviceRows, desiredSavingsPct, phase } = inputs;
  const Q25 = monthlyBill / utilityRate;
  const { totalDeviceDayKwh, totalDeviceNightKwh } = totalDeviceKwh(deviceRows);
  const Q26 = totalDeviceDayKwh + totalDeviceNightKwh;
  const Q27 = Q25 - Q26;                          // baseload (can be negative if user-listed > bill implies)
  const Q28 = Q27 / 2 + totalDeviceDayKwh;        // total day kWh/mo
  const Q29 = Q27 / 2 + totalDeviceNightKwh;      // total night kWh/mo
  const Q31 = Q29 / adminParams.batteryEfficiency / adminParams.batteryDepthOfDischarge;
  const Q32 = (Q28 + Q31) * 12 / 365;             // daily capacity needed (kWh/day)
  const panelWatts = phase === 'three' ? PANEL_SETTINGS.threePhase.panelWatts
                                       : PANEL_SETTINGS.singlePhase.panelWatts;
  const Q34 = desiredSavingsPct * Q32 * 1000 / panelWatts / adminParams.kWhPerKwpPerDay;
  // v3-68: Product-settable minimum system size. DELIBERATE DEVIATION from the
  // Excel mirror (the workbook has no equivalent knob): the recommendation is
  // floored at the panel-count equivalent of adminParams.minSystemKwp. Inert
  // at the shipped default of 0 (floor = 0 panels → Math.max is a no-op), so
  // the Excel-mirrored value W7 = ROUNDUP(Q34) is unchanged until Product
  // raises the limit. minPanelsFloor is exported for the Step 2A override
  // input, which clamps manual entries to the same floor (0 stays allowed for
  // standalone RSD/inverter retrofit orders).
  const minPanelsFloor = Math.ceil(((adminParams.minSystemKwp || 0) * 1000) / panelWatts);
  const W7 = Math.max(Math.ceil(Q34), minPanelsFloor); // recommended panel count

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
  const list = phase === 'three' ? INVERTERS_THREE_PHASE : INVERTERS_SINGLE_PHASE;
  // Every entry in the list is implicitly available — admins maintain the
  // list by adding/removing rows in the Inventory editor, not by toggling
  // a flag. Sort largest-first to mirror the Excel VLOOKUP behavior.
  return [...list].sort((a, b) => b.ratedKw - a.ratedKw);
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

  const maxRatio = phase === 'three' ? PANEL_SETTINGS.threePhase.maxDcAcRatio
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
    const picked = ascending.find(inv => inv.ratedKw >= target) || ascending[ascending.length - 1];
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
  const systemKwp = panelCount * panelWatts / 1000;
  const totalInverterKw = selectedInverters.reduce(
    (sum, inv) => sum + (inv ? inv.ratedKw : 0), 0
  );
  const dcAcRatio = totalInverterKw > 0 ? systemKwp / totalInverterKw : 0;
  const maxRatio = phase === 'three' ? PANEL_SETTINGS.threePhase.maxDcAcRatio
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
  minPanels: 1, dcCablePct: 0.27, acCablePct: 0.08,
  conduitsPct: 0.12, panelBoardPct: 0.09,
};

export function cablingTotalPct(panelCount, adminParams, phase) {
  // v3-62: phase-aware tier selection. Three-phase installations use their
  // own tier table (cablingTiersThreePhase); if it's missing or empty (e.g. a
  // stale blob predating the migration seed), fall back to the single-phase
  // table — the pre-v3-62 behavior — rather than the bare hardcoded tier.
  const singleTiers = adminParams && Array.isArray(adminParams.cablingTiers)
    ? adminParams.cablingTiers : [];
  const threeTiers = adminParams && Array.isArray(adminParams.cablingTiersThreePhase)
    ? adminParams.cablingTiersThreePhase : [];
  const tiers = (phase === 'three' && threeTiers.length > 0) ? threeTiers : singleTiers;
  if (tiers.length === 0) {
    if (typeof console !== 'undefined') {
      console.warn('[cablingTotalPct] No cabling tiers available; falling back to default tier.');
    }
    const t = FALLBACK_CABLING_TIER;
    return t.dcCablePct + t.acCablePct + t.conduitsPct + t.panelBoardPct;
  }
  let chosen = tiers[0];
  for (const tier of tiers) {
    if (tier.minPanels <= panelCount) chosen = tier;
    else break;
  }
  return chosen.dcCablePct + chosen.acCablePct + chosen.conduitsPct + chosen.panelBoardPct;
}

// ─── Single-phase panel direct-purchase price (Inventory D3) ─────────────────
// Excel D3 formula: =9008*70%/(1-A2) where A2 = Admin!A1.
// At runtime, the markup helper in adminParams.js computes:
//   directPrice = supplierCost * 0.7 / (1 - 0.26144542543429433) = ~0.948 * supplierCost
//
// Single-phase panel direct price is computed via that helper at module load
// time (PANEL_SETTINGS.singlePhase.panelDirectPrice). 3-phase is hardcoded.

export function panelDirectPrice(phase) {
  return phase === 'three'
    ? PANEL_SETTINGS.threePhase.panelDirectPrice
    : PANEL_SETTINGS.singlePhase.panelDirectPrice;
}

// =============================================================================
// PACKAGE PRICING — produces every line item for the Summary sheet
// -----------------------------------------------------------------------------
// Returns a list of line items, each with:
//   { description, directPrice, rto60Price, isShown }
// "isShown" = whether this line is in the visible Summary FILTER (B<>0).
// =============================================================================

export function buildPackageLineItems(state, adminParams, schedule) {
  const {
    phase, panelCount, mountingSupportOverride,
    // v3-18 rename: these now hold the TOTAL meters required (panels-to-
    // inverter for DC, inverter-to-CB-panel for AC), not just the meters
    // beyond the included baseline. The math below subtracts the baseline
    // before billing so the customer is only charged for excess.
    dcCableMeters, acCableMeters,
    rsdEnabled, rsdStandalonePanelCount,
    selectedInverters,
    batteryKwh,
    roofMaterial,         // NEW v3: 'metal' | 'asphalt' | 'concrete'
    location,             // NEW v3: 'luzon' | 'cebu' | 'siargao'
    locationKm,           // NEW v3: distance from Rizal Park (Luzon only)
    miscMaterials, // [{ description, count, unitPrice }, ...]
  } = state;

  const rtoRate = effectiveRtoRate(panelCount, adminParams);
  const monthlyRate = rtoRate / 12;
  const toRto = (direct) => direct ? PMT(monthlyRate, 60, -direct, 0, 1) * 60 : 0;

  const panelWatts = phase === 'three' ? PANEL_SETTINGS.threePhase.panelWatts
                                       : PANEL_SETTINGS.singlePhase.panelWatts;
  const systemKwp = panelCount * panelWatts / 1000;
  const panelPriceEa = panelDirectPrice(phase);

  const items = [];

  // 1. Solar panels
  const panelsTotal = panelCount * panelPriceEa;
  items.push({
    key: 'panels',
    description: `${panelCount} units ${panelWatts}W Solar Panels`,
    directPrice: panelsTotal,
    rto60Price: toRto(panelsTotal),
  });

  // 2. Mounting support — max(floor, 13% of panels) [skip if no panels]
  const mountingDirect = panelsTotal === 0
    ? 0
    : Math.max(adminParams.mountingSupportFloorPrice, panelsTotal * adminParams.mountingSupportPctOfPanels);
  items.push({
    key: 'mounting',
    description: 'Mounting Support',
    directPrice: mountingDirect,
    rto60Price: toRto(mountingDirect),
  });

  // 3. Cables, conduits, fittings, panel board & other devices
  // v3-62: phase-aware — 3-phase installs use cablingTiersThreePhase.
  const cablingPct = cablingTotalPct(panelCount, adminParams, phase);
  const cablingDirect = panelsTotal === 0 ? 0 : cablingPct * panelsTotal;
  items.push({
    key: 'cabling',
    description: 'Cables, Conduits, Fittings, Panel Board & Other Devices',
    directPrice: cablingDirect,
    rto60Price: toRto(cablingDirect),
  });

  // 4. Additional DC cable — only meters beyond the included baseline are
  // billed. v3-18 changed the customer-facing input from "additional meters"
  // to "total meters", so the calc now subtracts the included baseline
  // before multiplying by the per-meter rate. At the default (30m total =
  // 30m included) the line item is ₱0 and no charge appears.
  const dcExtraMeters = Math.max(0, (dcCableMeters || 0) - INCLUDED_DC_CABLE_METERS);
  const dcExtraDirect = panelsTotal === 0 ? 0
    : dcExtraMeters * adminParams.additionalDcCablePerMeter;
  items.push({
    key: 'dcExtra',
    description: `${dcExtraMeters}m of Add'l. DC Cable`,
    directPrice: dcExtraDirect,
    rto60Price: toRto(dcExtraDirect),
  });

  // 5. Additional AC cable — same pattern as DC.
  const acExtraMeters = Math.max(0, (acCableMeters || 0) - INCLUDED_AC_CABLE_METERS);
  const acExtraDirect = panelsTotal === 0 ? 0
    : acExtraMeters * adminParams.additionalAcCablePerMeter;
  items.push({
    key: 'acExtra',
    description: `${acExtraMeters}m of Add'l. AC Cable`,
    directPrice: acExtraDirect,
    rto60Price: toRto(acExtraDirect),
  });

  // 6. Solar Labor & Installation (variable per kWp + fixed overhead bundle)
  const fixedOverheadDirect = adminParams.fixedOverheadDeliveryLogistics
                            + adminParams.fixedOverheadWarehouse
                            + adminParams.fixedOverheadCustoms
                            + adminParams.fixedOverheadSafetySupervision
                            + adminParams.fixedOverheadTesting;
  const laborDirect = systemKwp * adminParams.laborInstallationPerKwp
                    + (panelsTotal === 0 ? 0 : fixedOverheadDirect);
  items.push({
    key: 'labor',
    description: 'Solar Labor & Installation',
    directPrice: laborDirect,
    rto60Price: toRto(laborDirect),
  });

  // 7. RSD bundled with solar package
  // Excel: AA14 = (panelCount * Admin!E56 + Admin!E57) * H11
  //   where E56/E57 are the 60-Mo.RTO prices, but the line uses RTO totals.
  //   Working in DIRECT, this equals:
  //     RsdBundle direct = panelCount * D56 + D57
  let rsdDirect = 0;
  if (rsdEnabled && panelsTotal > 0) {
    rsdDirect = panelCount * adminParams.rsdVariablePerPanel + adminParams.rsdFixedTransmitter;
  }
  // 8. RSD as standalone (when no solar package is being purchased)
  let rsdStandaloneDirect = 0;
  if (rsdEnabled && panelsTotal === 0 && (rsdStandalonePanelCount || 0) > 0) {
    rsdStandaloneDirect = rsdStandalonePanelCount * adminParams.rsdVariablePerPanel
                        + adminParams.rsdFixedTransmitter;
  }
  // RSD Labor for standalone
  let rsdStandaloneLaborDirect = 0;
  if (rsdStandaloneDirect > 0) {
    rsdStandaloneLaborDirect = rsdStandalonePanelCount * adminParams.rsdStandaloneLaborPerPanel
                             + adminParams.rsdStandaloneLaborMobilization;
  }
  const rsdPanelsForLabel = Math.max(panelCount, rsdStandalonePanelCount || 0);
  const rsdAnyDirect = rsdDirect + rsdStandaloneDirect;
  items.push({
    key: 'rsd',
    description: `Rapid Shutdown Device (RSD) for ${rsdPanelsForLabel} Solar Panels`,
    directPrice: rsdAnyDirect,
    rto60Price: toRto(rsdAnyDirect),
  });
  items.push({
    key: 'rsdLabor',
    description: 'Labor & Installation for Standalone RSD order',
    directPrice: rsdStandaloneLaborDirect,
    rto60Price: toRto(rsdStandaloneLaborDirect),
  });

  // 9. Inverters (each slot)
  selectedInverters.forEach((inv, i) => {
    const invDirect = inv ? inv.directPrice : 0;
    const desc = inv ? `${inv.ratedKw.toFixed(2)} kW Inverter` : 'None';
    items.push({
      key: `inverter${i}`,
      description: desc,
      directPrice: invDirect,
      rto60Price: toRto(invDirect),
    });
  });

  // 10. Battery package (v3-54 — package-driven)
  // The active battery package is resolved from state.batteryPackageId via
  // adminParams.batteryPackages[]. Each package carries its own unit size,
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
  const pkg = resolveBatteryPackage(adminParams, state.batteryPackageId);
  const batteryCount = (batteryKwh || 0) > 0
    ? Math.ceil((batteryKwh || 0) / pkg.batteryUnitKwh)
    : 0;
  const rackCount = batteryCount > 0
    ? Math.ceil(batteryCount / pkg.batteryRackCapacity)
    : 0;
  const batteryDirect = batteryCount * pkg.batteryUnitPrice;
  const rackDirect = rackCount * pkg.batteryRackPrice;
  const atsDirect = batteryKwh > 0 ? pkg.atsPrice : 0;
  const critLoadDirect = batteryKwh > 0 ? pkg.criticalLoadsMaterials : 0;

  // Labor with solar OR standalone
  const hasSolar = panelsTotal > 0;
  const battLaborDirect = batteryKwh > 0
    ? (hasSolar ? pkg.laborWithSolarInstall : pkg.standaloneLabor)
    : 0;
  const battLaborLabel = hasSolar
    ? 'Battery Labor & Installation w/ Solar Package Installation'
    : 'Battery Standalone Labor & Installation';

  items.push({
    key: 'battery',
    description: `${batteryCount} unit/s ${pkg.batteryUnitKwh}kWh Battery w/ Cables & Lugs`,
    directPrice: batteryDirect,
    rto60Price: toRto(batteryDirect),
  });
  items.push({
    key: 'rack',
    description: `${rackCount} unit/s Battery Rack`,
    directPrice: rackDirect,
    rto60Price: toRto(rackDirect),
  });
  items.push({
    key: 'ats',
    description: 'Automatic Transfer Switch (ATS)',
    directPrice: atsDirect,
    rto60Price: toRto(atsDirect),
  });
  items.push({
    key: 'critLoads',
    description: 'Materials for Critical Loads',
    directPrice: critLoadDirect,
    rto60Price: toRto(critLoadDirect),
  });
  items.push({
    key: 'batteryLabor',
    description: battLaborLabel,
    directPrice: battLaborDirect,
    rto60Price: toRto(battLaborDirect),
  });

  // 11. Standalone-inverter mobilization
  // Excel AA23: when no solar, but inverters selected, charge mobilization fee
  let invMobDirect = 0;
  const invCount = selectedInverters.filter(i => i).length;
  if (panelsTotal === 0 && invCount > 0) {
    invMobDirect = adminParams.inverterStandaloneLaborPerUnit * invCount
                 + adminParams.inverterStandaloneMobilization;
  }
  items.push({
    key: 'invMob',
    description: 'Mobilization for StandAlone Inverter Order',
    directPrice: invMobDirect,
    rto60Price: toRto(invMobDirect),
  });

  // 12. Roof Material (v3 — Excel CALCULATOR AA34)
  // Charge depends on which surface the panels mount to.
  //   metal     → ₱0       (no roof prep needed)  ← DEFAULT
  //   asphalt   → kWp × roofAsphaltPerKwp
  //   concrete  → kWp × roofConcretePerKwp
  let roofDirect = 0;
  let roofLabel = 'Roof Preparation (Metal — no prep needed)';
  if (panelsTotal > 0) {
    if (roofMaterial === 'asphalt') {
      roofDirect = systemKwp * adminParams.roofAsphaltPerKwp;
      roofLabel = 'Roof Preparation — Asphalt / Shingles / Tiled';
    } else if (roofMaterial === 'concrete') {
      roofDirect = systemKwp * adminParams.roofConcretePerKwp;
      roofLabel = 'Roof Preparation — Concrete';
    }
  }
  items.push({
    key: 'roof',
    description: roofLabel,
    directPrice: roofDirect,
    rto60Price: toRto(roofDirect),
  });

  // 13. Location / Delivery (v3 — Excel CALCULATOR AA38)
  //   luzon  + km≤30 → ₱0                                            ← DEFAULT
  //   luzon  + km>30 → luzonOver30FixedFee + km × luzonOver30PerKm
  //   cebu           → cebuFixedFee + panels × cebuPerPanel
  //   siargao        → siargaoFixedFee + panels × siargaoPerPanel
  let locationDirect = 0;
  let locationLabel = 'Location / Delivery — Luzon (within 30km)';
  if (panelsTotal > 0) {
    if (location === 'cebu') {
      locationDirect = adminParams.cebuFixedFee + panelCount * adminParams.cebuPerPanel;
      locationLabel = 'Location / Delivery — Cebu';
    } else if (location === 'siargao') {
      locationDirect = adminParams.siargaoFixedFee + panelCount * adminParams.siargaoPerPanel;
      locationLabel = 'Location / Delivery — Siargao';
    } else if (location === 'luzon' && (locationKm || 0) > 30) {
      locationDirect = adminParams.luzonOver30FixedFee + (locationKm || 0) * adminParams.luzonOver30PerKm;
      locationLabel = `Location / Delivery — Luzon (${locationKm} km from Rizal Park)`;
    }
  }
  items.push({
    key: 'location',
    description: locationLabel,
    directPrice: locationDirect,
    rto60Price: toRto(locationDirect),
  });

  // 12. Misc materials (V35:Y36 — up to 6 free-form lines, dynamic)
  (miscMaterials || []).forEach((row, i) => {
    if (!row.description || !row.count || !row.unitPrice) {
      items.push({ key: `misc${i}`, description: '', directPrice: 0, rto60Price: 0 });
      return;
    }
    const dir = row.count * row.unitPrice;
    items.push({
      key: `misc${i}`,
      description: `${row.count} Unit/s ${row.description}`,
      directPrice: dir,
      rto60Price: toRto(dir),
    });
  });

  // Totals
  const totalDirect = items.reduce((s, i) => s + i.directPrice, 0);
  const totalRto60 = items.reduce((s, i) => s + i.rto60Price, 0);

  return {
    items,
    totalDirect,
    totalRto60,
    rtoRate,
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
// "Net Price (before DP Discount)" (AI9 = terms.totalPaymentsOverTenor).
// The applicable tier is the LAST row whose fromNetPrice ≤ netPrice.
// Pure function — no pricing impact; it only gates which Step 3A options the
// UI offers. Defensive: sorts a copy (server enforces ascending order, but a
// hand-edited blob shouldn't break the floor), tolerates a missing/empty
// array (→ 0, no floor), and clamps each tier's fraction to [0, 0.5] to match
// the server-side validation bounds.
export function resolveMinDpPct(minDpTiers, netPrice) {
  if (!Array.isArray(minDpTiers) || minDpTiers.length === 0) return 0;
  const sorted = [...minDpTiers].sort(
    (a, b) => (a.fromNetPrice || 0) - (b.fromNetPrice || 0)
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
  const { totalRto60, rtoRate } = packageData;
  const monthlyRate = rtoRate / 12;

  // Promo discount lookup
  const promo = adminParams.promoCodes.find(p => p.code === (promoCode || '').trim().toUpperCase());
  const promoDiscount = promo ? promo.discount : 0;
  const discountAmount = -promoDiscount * totalRto60;
  const stepTwoTotalLessDiscount = totalRto60 + discountAmount;  // M7

  // M8 — direct purchase price equivalent of the (discounted) RTO total
  const directPurchasePrice = PV(monthlyRate, 60, -stepTwoTotalLessDiscount / 60, 0, 1);
  // M9 — monthly payment if customer pays direct purchase over `tenor` months
  const monthlyForFullPv = PMT(monthlyRate, tenor, -directPurchasePrice, 0, 1);

  // M12 — DP as 1-month FV: AI12 * (1 + monthlyRate)
  // AI12 = downPaymentPct * stepTwoTotalLessDiscount(60Mo) — wait, Excel uses AI9
  //
  // Re-reading: AI9 = M9 * AH7 (i.e. the total of monthly payments).
  // AI12 = AH11 * AI9 = downPaymentPct * (total payments over chosen tenor)
  // AH14 = AI12   (DP charge total)
  // v3-60: the credit-card surcharge (AI13) was removed — surcharging card
  // payments is not permitted — so the DP total charge is now simply the DP
  // amount. The DP-via-credit-card option and its fee no longer exist.
  const totalPaymentsOverTenor = monthlyForFullPv * tenor;       // AI9
  const dpAmount = downPaymentPct * totalPaymentsOverTenor;       // AI12
  const dpTotalCharge = dpAmount;                                  // AH14

  // Now post-DP balance, and the "additional savings from down payment"
  // Excel: M14 = M8 - M12  (PV after DP, in direct-purchase terms)
  //   where M12 = AI12 * (1 + monthlyRate) — this lifts AI12 to 1-month FV
  //   so the PV at month 0 of "money paid at month 1" is removed.
  const dpFvOneMonth = dpAmount * (1 + monthlyRate);   // M12
  const postDpPv = directPurchasePrice - dpFvOneMonth; // M14
  // M15 = monthly payment for postDpPv over `tenor` months
  const monthlyAfterDp = PMT(monthlyRate, tenor, -postDpPv, 0, 1);

  // AI16 = AI9 - AI12 — RTO post-installation balance before any CC
  const postInstallBalance = totalPaymentsOverTenor - dpAmount;     // AI16
  // AI18 = M15 * tenor — total payments using the after-DP monthly
  const netBalanceOverTenor = monthlyAfterDp * tenor;               // AI18
  // AI17 = AI18 - AI16 — savings from making the down payment
  const savingsFromDp = netBalanceOverTenor - postInstallBalance;   // AI17 (negative — savings)

  // v3-60: the post-installation balance is always paid via PDCs over the
  // chosen tenor. The "pay balance via credit card" option, its 5% surcharge,
  // and the CC-eligible-tenor gating (which collapsed the schedule to a single
  // lump payment) were all removed because surcharging card payments is not
  // permitted. The monthly payment and final balance therefore carry no fee.
  const customerMonthlyPmt = monthlyAfterDp;                       // AI22
  const finalPostInstallBalance = netBalanceOverTenor;             // AH21
  // AH35 = AH21 + AH14 — total amount due
  const totalAmountDue = finalPostInstallBalance + dpTotalCharge;

  return {
    rtoRate,
    promo,
    promoDiscountAmount: discountAmount,
    stepTwoTotalLessDiscount,
    directPurchasePrice,
    monthlyForFullPv,
    // AI9 — "Net Price (before DP Discount & Credit Card Fees)" in the
    // SUMMARY sheet. This is `monthlyForFullPv × tenor` — the total of
    // monthly payments over the chosen tenor. At tenor=60 it equals
    // stepTwoTotalLessDiscount; at lower tenors it's smaller (because the
    // monthly is sized to amortise directPurchasePrice in fewer months,
    // saving the customer the back-end finance cost). v3-19's Summary
    // mistakenly displayed `directPurchasePrice` for this row, which is a
    // different number entirely (the present value, not the total
    // payments). Fixed in v3-20.
    totalPaymentsOverTenor,
    // AI8 — "<tenor>-Month RTO Early Payment Discount". Excel formula:
    //   AI8 = AI9 - SUM(AI5:AI6) = totalPaymentsOverTenor - stepTwoTotalLessDiscount
    // This is negative (or zero at tenor=60). The SUMMARY shows it as
    // "Less: <pct>% Early Payment Discount (EPD)" — the value is negative,
    // and the "Less:" prefix + the negative value together produce the
    // visual subtraction.
    epdAmount: totalPaymentsOverTenor - stepTwoTotalLessDiscount,
    dpAmount,
    dpTotalCharge,
    postDpPv,
    monthlyAfterDp,
    customerMonthlyPmt,
    postInstallBalance,
    netBalanceOverTenor,
    savingsFromDp,
    finalPostInstallBalance,
    totalAmountDue,
    // v3-56 — true when the discount from a large DP at a long tenor exceeds
    // the post-installation balance, producing a negative `netBalanceOverTenor`
    // (the customer would be paying negative monthlies, which is nonsensical
    // to display). Step 3 shows a yellow callout in 3C suggesting the customer
    // either lower the DP or shorten the tenor; the Summary and Schedule of
    // Payments tabs are hidden until the inputs are resolved, and the PDF
    // button is disabled. Math is otherwise unchanged — all downstream
    // consumers still see the raw (negative) numbers; they just don't render.
    negativeBalance: netBalanceOverTenor < 0,
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

export function popularTenorsTable(state, adminParams, packageData) {
  const tenors = [1, 6, 12, 24, 36, 48, 60];
  return tenors.map(t => {
    const altState = { ...state, tenor: t };
    const terms = computePaymentTerms(altState, adminParams, packageData);
    return {
      tenor: t,
      dpAmount: terms.dpTotalCharge,
      monthlyPmt: terms.customerMonthlyPmt,
    };
  });
}
