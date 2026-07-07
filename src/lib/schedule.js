// =============================================================================
// SCHEDULE — 24-hour energy simulation + investment metrics + payment annex
// -----------------------------------------------------------------------------
// Mirrors:
//   • Excel "Schedule" sheet rows 13–36 (the hourly simulation),
//   • Excel rows 40–47 (LCOE / IRR / DU savings),
//   • Excel "ANNEX" sheet (the 60-month payment schedule with early-payoff
//     amounts and savings-from-early-payoff).
//
// Math summary:
//   - The Excel uses a fixed daily radiance distribution at A55:A66 — 12 ratios
//     summing to 1.0, weighting hours 6 AM through 5 PM. We mirror it here.
//   - For each hour 0..23 we simulate consumption vs solar production. Excess
//     solar charges the battery; battery covers any uncovered consumption;
//     remaining excess (if net-metering enabled) banks credits at the
//     net-metering efficiency rate.
//   - The recommended battery size (Y25) = ROUNDUP(round(G37)/5)*5.
//   - Cash flow table (Y6..AC38) drives IRR, LCOE, and DU savings.
// =============================================================================

import { PV, NPER, IRR, NPV } from './calculations.js';
import { resolveBatteryPackage } from '../data/adminParams.js';

// ─── Payment due-date helper (Excel ANNEX H column) ──────────────────────────
// Excel formula:
//   IF(DAY(EDATE(installDate, n)) <= 15, DATE(year, month, 15),
//                                        IF(month=Feb, EOMONTH, DATE(year, month, 30)))
// i.e. payments fall on the 15th if the install date's day is ≤15, else end
// of month (Feb has no 30th, so use 28/29). Exported so App.jsx can use it to
// back-derive install date from a minimum-days-to-first-payment floor set by
// the Engineering Admin (ADMIN_PARAMS.minDaysToFirstPostInstallPayment).
export function dueDateForMonth(installationDate, n) {
  const d = new Date(installationDate);
  d.setMonth(d.getMonth() + n);
  const day = d.getDate();
  const result = new Date(d);
  if (day <= 15) {
    result.setDate(15);
  } else if (result.getMonth() === 1) { // February
    result.setMonth(2, 0);  // last day of February
  } else {
    result.setDate(30);
  }
  return result;
}

// Convenience: first post-installation payment due date (n=1).
export function firstPostInstallDueDate(installationDate) {
  return dueDateForMonth(installationDate, 1);
}

// ─── Daily radiance distribution (Schedule!A55:A66, B55:B66) ─────────────────
// 12 ratios for hours 6 AM through 5 PM. They sum to 1.0.
// production(hour) = ratio[hour-6] * kWhPerKwpPerDay * systemKwp

const RADIANCE_RATIOS = [
  0.017, 0.049, 0.078, 0.103, 0.121, 0.132,   // 6 AM – 11 AM
  0.132, 0.121, 0.103, 0.078, 0.049, 0.017,   // 12 PM – 5 PM
];

// Formats an hour 0..23 in 12-hour AM/PM style with Filipino conventions
// for the two endpoints, and no spaces:
//   0  → "12MN"  (midnight, not "12 AM")
//   12 → "12NN"  (noon, not "12 PM")
//   1..11  → "1AM"  .. "11AM"
//   13..23 → "1PM"  .. "11PM"
// Exported so other components (e.g. Step 1's device-time dropdown) reuse
// the same labeling and can't drift.
export function formatHour12(h) {
  if (h === 0) return '12MN';
  if (h === 12) return '12NN';
  if (h < 12) return `${h}AM`;
  return `${h - 12}PM`;
}

// ─── Per-device hourly consumption ───────────────────────────────────────────
// To populate the chart we need consumption broken out hour-by-hour, not just
// day-vs-night. Excel Schedule!O13:U36 has one column per device; each cell
// indicates whether device is ON during that hour. We replicate that.

function isOnAtHour(hour, onTime, offTime) {
  // onTime, offTime are fractions of a day (0..1). hour is integer 0..23.
  if (onTime == null || offTime == null) return 0;
  const tFrac = hour / 24;
  if (onTime === offTime) return 1;
  if (offTime > onTime) {
    return (tFrac >= onTime && tFrac < offTime) ? 1 : 0;
  } else {
    return (tFrac >= onTime || tFrac < offTime) ? 1 : 0;
  }
}

/**
 * Build the 24-hour load + production curve.
 * Returns an array of 24 rows, each:
 *   { hour, hourLabel, baseLoad, devicesLoad, totalLoad, solar, excessSolar,
 *     batteryStored, batteryUsed, afterBattery,
 *     creditsStored, creditsUsed, afterCreditsAndBattery }
 *
 * `baseload` is the hourly baseload (kWh) — distributed evenly across 24 hours.
 * `devicesLoad` sums each device's hourly contribution weighted by daysPerWeek.
 */
export function buildHourlyCurve(inputs, adminParams, recommended) {
  const { deviceRows, batteryKwh, netMeteringEnabled } = inputs;

  // ─── Average hourly device consumption (kWh per hour, weighted) ───────────
  // Excel formulas at C13:C36 sum across columns O..U for each hour.
  // Per-device-per-hour kWh = onAtHour * avgKw * (daysPerWeek/7) * count
  //
  // We're computing "average daily" kWh for each hour — this is the value
  // shown in the chart and used to drive the energy-balance simulation.
  const hourlyDevicesLoad = Array(24).fill(0);
  for (const row of deviceRows) {
    if (!row.deviceName || !row.count || row.onTime == null || row.offTime == null) continue;
    const device = inputs.deviceLibrary.find(d => d.name === row.deviceName);
    if (!device) continue;
    const avgKw = device.peakKw * device.dutyFactor;
    const dwFrac = (row.daysPerWeek || 0) / 7;

    // Per-hour avg consumption (kWh) for this device:
    // = isOnAtHour * avgKw * (daysPerWeek/7) * count   (if avgKw is in kW
    //   and we're integrating over 1 hour, kWh = kW * 1 hr)
    for (let h = 0; h < 24; h++) {
      hourlyDevicesLoad[h] += isOnAtHour(h, row.onTime, row.offTime) * avgKw * dwFrac * row.count;
    }
  }

  // ─── Baseload: split CALCULATOR!Q27 evenly across 24 hours ───────────────
  // Excel: B13:B36 = Q27 * 12/365/24  (constant across hours — see B14 = $B$13)
  // i.e. baseload monthly kWh → daily kWh / 24
  const baseloadKwh = recommended.baseloadKwh;
  const baseloadPerHour = baseloadKwh * 12 / 365 / 24;

  // ─── Solar production curve ──────────────────────────────────────────────
  // production at hour h = ratio[h-6] * kWhPerKwpPerDay * systemKwp
  // production at non-daylight hours = 0
  const solarProductionPerHour = Array(24).fill(0);
  const dailyKwhPerKwp = adminParams.kWhPerKwpPerDay;
  for (let h = 6; h <= 17; h++) {
    solarProductionPerHour[h] = RADIANCE_RATIOS[h - 6] * dailyKwhPerKwp * recommended.systemKwp;
  }

  // ─── Energy balance simulation (Schedule!H,I,J,K,L,M columns) ────────────
  // H = battery storage carried over (decrements as it discharges)
  // I = battery used this hour
  // J = grid (distribution utility) consumption after solar+battery
  // K = net-metering credits store
  // L = NM credits used this hour
  // M = grid consumption after solar+battery+NM
  //
  // Excel pattern:
  //   batteryEnergyAvailable (H12) = MIN(totalDailyExcess, batteryCapacity * eff) * dod
  //   creditsAvailable        (K12) = (totalDailyExcess - usableBatteryStored) * netMetEff * netMeteringFlag
  //
  // Then row by row:
  //   H_t = MAX(0, H_{t-1} - (D_t - F_t))           # battery carryover after discharge
  //   I_t = H_{t-1} - H_t                           # battery used this hour
  //   J_t = D_t - F_t - I_t                         # grid use this hour
  //   K_t = MAX(0, K_{t-1} - J_t)
  //   L_t = K_{t-1} - K_t
  //   M_t = J_t - L_t

  const totalLoad = Array(24).fill(0);              // D
  const solarUsed = Array(24).fill(0);              // F = MIN(D, E)
  const excessSolar = Array(24).fill(0);            // G = E - F

  for (let h = 0; h < 24; h++) {
    totalLoad[h] = baseloadPerHour + hourlyDevicesLoad[h];
    solarUsed[h] = Math.min(totalLoad[h], solarProductionPerHour[h]);
    excessSolar[h] = solarProductionPerHour[h] - solarUsed[h];
  }
  const dailyExcessSolar = excessSolar.reduce((s, v) => s + v, 0);

  // Battery configuration
  // Schedule!H12 = MIN(G37, batteryKwh * batteryEfficiency) * batteryDOD
  //   (the usable energy stored each day, capped at daily excess and battery cap)
  const usableBatteryStorage = Math.min(
    dailyExcessSolar,
    (batteryKwh || 0) * adminParams.batteryEfficiency
  ) * adminParams.batteryDepthOfDischarge;

  // Credits: Schedule!K12 = (G37 - H12 / DOD) * netMetEff * netMeteringFlag
  const usableNmCredits = (dailyExcessSolar - usableBatteryStorage / adminParams.batteryDepthOfDischarge)
                        * adminParams.netMeteringEfficiency
                        * (netMeteringEnabled ? 1 : 0);

  // Iterate hours
  const battStored = Array(24).fill(0);
  const battUsed = Array(24).fill(0);
  const afterBatt = Array(24).fill(0);
  const creditsStored = Array(24).fill(0);
  const creditsUsed = Array(24).fill(0);
  const afterCredits = Array(24).fill(0);

  let prevBatt = usableBatteryStorage;
  let prevCredits = usableNmCredits;
  for (let h = 0; h < 24; h++) {
    const uncovered = totalLoad[h] - solarUsed[h];
    const newBatt = Math.max(0, prevBatt - uncovered);
    battStored[h] = newBatt;
    battUsed[h] = prevBatt - newBatt;
    afterBatt[h] = totalLoad[h] - solarUsed[h] - battUsed[h];

    const newCredits = Math.max(0, prevCredits - afterBatt[h]);
    creditsStored[h] = newCredits;
    creditsUsed[h] = prevCredits - newCredits;
    afterCredits[h] = afterBatt[h] - creditsUsed[h];

    prevBatt = newBatt;
    prevCredits = newCredits;
  }

  // Build the 24-row output for the chart
  const rows = [];
  for (let h = 0; h < 24; h++) {
    rows.push({
      hour: h,
      hourLabel: formatHour12(h),
      baseLoad: baseloadPerHour,
      devicesLoad: hourlyDevicesLoad[h],
      totalLoad: totalLoad[h],
      solar: solarProductionPerHour[h],
      solarUsed: solarUsed[h],
      excessSolar: excessSolar[h],
      battStored: battStored[h],
      battUsed: battUsed[h],
      afterBatt: afterBatt[h],
      creditsStored: creditsStored[h],
      creditsUsed: creditsUsed[h],
      afterCredits: afterCredits[h],
    });
  }

  // Daily totals (Schedule!*37)
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);
  const totals = {
    baseload: baseloadPerHour * 24,
    devicesLoad: sum(hourlyDevicesLoad),
    totalLoad: sum(totalLoad),
    solar: sum(solarProductionPerHour),
    solarUsed: sum(solarUsed),
    excessSolar: dailyExcessSolar,
    battUsed: sum(battUsed),
    afterBatt: sum(afterBatt),
    creditsUsed: sum(creditsUsed),
    afterCredits: sum(afterCredits),
  };

  // Coverage percentages (Schedule!F38, I38, L38, F40)
  const solarCoveragePctOfProduction = totals.solar > 0 ? totals.solarUsed / totals.solar : 0;
  const solarCoveragePctOfUse = totals.totalLoad > 0 ? totals.solarUsed / totals.totalLoad : 0;
  const battCoveragePctOfProduction = totals.solar > 0 ? totals.battUsed / totals.solar : 0;
  const creditsCoveragePctOfProduction = totals.solar > 0 ? totals.creditsUsed / totals.solar : 0;

  // Energy use coverage breakdown (Schedule!G57:J61) — for the stacked bar chart
  // Each column is a scenario; rows sum to 1.0:
  //   G = No Solar         [grid=1, solar=0, batt=0, NM=0]
  //   H = Solar Only       [grid=1-F40, solar=F40, batt=0, NM=0]
  //   I = w/ Batteries     [grid=1-F51, solar=F40, batt=F51-F40, NM=0]
  //   J = w/ Batt & NM     [grid=1-F52, solar=F40, batt=F51-F40, NM=F52-F51]
  //
  // F40 = totals.solarUsed / totals.totalLoad = solarCoveragePctOfUse
  // F51 = 1 - (J37 / D37) = 1 - (totals.afterBatt / totals.totalLoad)
  // F52 = 1 - (M37 / D37) = 1 - (totals.afterCredits / totals.totalLoad)
  const F40 = solarCoveragePctOfUse;
  const F51 = totals.totalLoad > 0 ? 1 - totals.afterBatt / totals.totalLoad : 0;
  const F52 = totals.totalLoad > 0 ? 1 - totals.afterCredits / totals.totalLoad : 0;

  const coverageBars = [
    { name: 'No Solar',                  grid: 1,         solar: 0,    battery: 0,            netMetering: 0 },
    { name: 'Solar Only',                grid: 1 - F40,   solar: F40,  battery: 0,            netMetering: 0 },
    { name: 'Solar w/ Batteries',        grid: 1 - F51,   solar: F40,  battery: F51 - F40,    netMetering: 0 },
    { name: 'Solar w/ Batt. & Net Met.', grid: 1 - F52,   solar: F40,  battery: F51 - F40,    netMetering: F52 - F51 },
  ];

  // Daily savings (Schedule!J43, M47, J45, M49)
  // J43 = D37 - J37 = solar+battery savings per day (kWh)
  // J44 = J43 * 365/12 = monthly
  // J45 = ROUND(J44 * utilityRate, -2) = monthly peso savings, rounded to nearest 100
  const dailyKwhSavingsBatt = totals.totalLoad - totals.afterBatt;
  const monthlyKwhSavingsBatt = dailyKwhSavingsBatt * 365 / 12;
  const monthlyPesoSavingsBatt = Math.round(monthlyKwhSavingsBatt * inputs.utilityRate / 100) * 100;

  const dailyKwhSavingsBattNm = totals.totalLoad - totals.afterCredits;
  const monthlyKwhSavingsBattNm = dailyKwhSavingsBattNm * 365 / 12;
  const monthlyPesoSavingsBattNm = Math.round(monthlyKwhSavingsBattNm * inputs.utilityRate / 100) * 100;

  return {
    rows,
    totals,
    solarCoveragePctOfProduction,
    solarCoveragePctOfUse,
    battCoveragePctOfProduction,
    creditsCoveragePctOfProduction,
    coverageBars,
    monthlyPesoSavingsBatt,
    monthlyKwhSavingsBatt,
    monthlyPesoSavingsBattNm,
    monthlyKwhSavingsBattNm,
    incrementalNmSavings: monthlyPesoSavingsBattNm - monthlyPesoSavingsBatt,
  };
}

// ─── Recommended battery size (CALCULATOR Y25) ────────────────────────────────
// Excel: =ROUNDUP(ROUND(Schedule!G37, 0) / unitKwh, 0) * unitKwh
// where G37 = total daily excess solar = the largest battery that's worth
// installing (any bigger and you can't fully charge it from excess).
//
// We need to call buildHourlyCurve with batteryKwh=Infinity (or 0 — same
// result, since usableBatteryStorage just caps at dailyExcessSolar) to get
// the unconstrained daily excess.
//
// v3-54: rounding step is the ACTIVE BATTERY PACKAGE'S unit size, not a
// hardcoded 5. So a customer on the 5 kWh pack sees recommendations like
// 20 / 25 / 30 kWh (5's); a customer on the 16 kWh pack sees 16 / 32 / 48 kWh
// (16's). The recommendation is meaningless if it can't be assembled from
// physical packs of the chosen size.

export function recommendedBatteryKwh(inputs, adminParams, recommended) {
  // Run with no battery to get raw daily excess
  const probeInputs = { ...inputs, batteryKwh: 0, netMeteringEnabled: false };
  const probe = buildHourlyCurve(probeInputs, adminParams, recommended);
  const dailyExcess = Math.round(probe.totals.excessSolar);
  // Active battery package determines the rounding step. resolveBatteryPackage
  // imported via adminParams.js; falls back to packages[0] when state has no
  // batteryPackageId (default customer view), which by design preserves the
  // legacy 5-kWh step.
  const pkg = resolveBatteryPackage(adminParams, inputs.batteryPackageId);
  const step = pkg.batteryUnitKwh || 5;
  return Math.ceil(dailyExcess / step) * step;
}

// ─── Cash flow & investment metrics (Schedule!X8:AC38) ────────────────────────
// Year 0: -dpTotalCharge (the down payment is paid up front)
// Year n (n≥1):
//   InvPayments = -monthlyAmount * 12 if year is within tenor, else 0
//                  (with prorated handling for the last partial year)
//   MaintCost   = -(C127 + C126 * panelCount) * (1 + C124)^(n-1)   inflation
//   TotalCost   = InvPayments + MaintCost
//   DuSavings   = (monthlyPesoSavingsBatt * 12) * (1 - C122)^(n-1)  degradation
//   NetCF       = TotalCost + DuSavings

export function computeCashFlows(state, adminParams, schedule, terms, recommended, irrYears) {
  const tenor = state.tenor;
  const customerMonthlyPmt = terms.customerMonthlyPmt;
  const dpTotalCharge = terms.dpTotalCharge;
  const panelCount = state.panelCount;
  const monthlyDuSavings = schedule.monthlyPesoSavingsBatt;

  const maxYears = 31; // Schedule rows 8–38 = 31 rows (year 0 + years 1–30)
  const cashflows = [];

  // Year 0
  cashflows.push({
    year: 0,
    invPmts: -dpTotalCharge,
    maintCost: 0,
    totalCost: -dpTotalCharge,
    duSavings: 0,
    netCf: -dpTotalCharge,
  });

  for (let y = 1; y <= maxYears; y++) {
    // InvPayments — same logic as Excel Y9 etc.:
    // = -IF(y*12 <= tenor, monthly*12, MAX(0, (tenor - (y-1)*12)) * monthly)
    let invPmts;
    if (y * 12 <= tenor) {
      invPmts = -customerMonthlyPmt * 12;
    } else {
      const remainingMonths = Math.max(0, tenor - (y - 1) * 12);
      invPmts = -remainingMonths * customerMonthlyPmt;
    }
    // Maintenance: Z9 = -(C127 + C126 * panelCount); Z10 = Z9 * (1 + C124); ...
    const maintCost = -(adminParams.preventiveMaintenancePerVisit
                       + adminParams.preventiveMaintenancePerPanel * panelCount)
                      * Math.pow(1 + adminParams.maintenanceInflationRate, y - 1);
    const totalCost = invPmts + maintCost;
    // DU savings: AB9 = J45 * 12; AB10 = AB9 * (1 - C122); ...
    const duSavings = monthlyDuSavings * 12 * Math.pow(1 - adminParams.panelAnnualDegradation, y - 1);
    const netCf = totalCost + duSavings;
    cashflows.push({ year: y, invPmts, maintCost, totalCost, duSavings, netCf });
  }

  // ─── Simple Payback Period (CALCULATOR AH52) ─────────────────────────────
  // Excel: ROUND(NPER(panelDegradationRate/12, J45, Y6, , 1), 0) — rounds
  // months. Then converts to years & months.
  //
  // The Excel inputs are:
  //   rate = annual degradation / 12 (months)
  //   pmt  = J45 = monthly peso savings (positive)
  //   pv   = Y6  = SUM(Y8:Y38) = TOTAL INV PMTS over all 31 simulated years
  //                (the lump-sum debt-equivalent that savings pay down)
  //
  // Y6 is the sum of Y8 (= -dpTotalCharge) plus Y9..Y38 (= -monthlyPmt*12 for
  // years inside the tenor, prorated for partial years). Without partial years
  // it equals -(dpTotalCharge + monthlyPmt * tenor) = -(AH35 in Excel).
  // We compute it identically by summing the cashflow `invPmts` column.
  const totalInvPmts = cashflows.reduce((s, cf) => s + cf.invPmts, 0);  // matches Y6 (NEGATIVE)
  const paybackMonths = Math.round(NPER(
    adminParams.panelAnnualDegradation / 12,
    monthlyDuSavings,                  // pmt = monthly savings (positive)
    totalInvPmts,                      // pv  = total inv pmts (negative)
    0,
    1
  ));
  const paybackYears = Math.floor(paybackMonths / 12);
  const paybackRemMonths = paybackMonths - paybackYears * 12;
  // Use non-breaking hyphens (\u2011) inside "{N}-Year(s)" and "{N}-Month(s)"
  // and a non-breaking space (\u00A0) between "&" and "{N}-Month..." — so when
  // the tile narrows enough to wrap, the ONLY legal break point is before the
  // "&", producing "{N}-Years" / "& {N}-Months" as two unbreakable chunks.
  // A regular hyphen is a valid soft-wrap point in CSS, so without \u2011 the
  // browser would break inside "10-Months" → "10-" / "Months". Visually the
  // \u2011 is indistinguishable from "-". "Years" spelled out (was "Yrs.") for
  // readability in the large-display tile. Singular branches handle "1-Year"
  // vs "N-Years" and "1-Month" vs "N-Months". See HANDOFF v3-36.
  const paybackLabel = !isFinite(paybackMonths)
    ? 'Never breaks even'
    : `${paybackYears}\u2011Year${paybackYears === 1 ? '' : 's'}${paybackRemMonths === 0 ? '' :
        ` &\u00A0${paybackRemMonths}\u2011Month${paybackRemMonths === 1 ? '' : 's'}`}`;

  // ─── IRR over `irrYears` years ────────────────────────────────────────────
  // Excel: AC6 = IRR(OFFSET(AC8, 0, 0, AG54))
  //   where AC8 starts at year 0 and we take `irrYears` rows.
  const irrCashflows = cashflows.slice(0, irrYears).map(cf => cf.netCf);
  const irr = IRR(irrCashflows);

  // ─── LCOE (Schedule!Z45) ────────────────────────────────────────────────
  // Z43 = -(NPV(rate, AA9..AA{8+years}) + AA8)
  //     = -(NPV of {totalCost year 1..N} + totalCost year 0)
  //   (cost is negative, so Z43 ends up positive — total NPV of costs)
  // Z44 = PV(degradation, years, -dailyKwhPerKwp * panelCount-equivalent... )
  //       basically PV of degraded annual energy production
  //   Excel: =PV(C122, Z41, -C53*C119*365)
  //   where C53 = systemKwp, C119 = kWhPerKwpPerDay, Z41 = years
  // Z45 = Z43 / Z44

  const totalCostsForLcoe = cashflows.slice(1, 1 + irrYears).map(cf => cf.totalCost);
  const npvOfCosts = NPV(adminParams.lcoeNpvDiscountRate, totalCostsForLcoe);
  const totalCostNpv = -(npvOfCosts + cashflows[0].totalCost);

  // PV of energy produced over the period, discounted by panel degradation
  const annualProduction = recommended.systemKwp * adminParams.kWhPerKwpPerDay * 365;
  // Excel uses PV(rate, n, -annualProd) which in Excel returns a positive PV
  // because the payment is negative. In our PV() helper this is the same.
  const energyPv = PV(adminParams.panelAnnualDegradation, irrYears, -annualProduction);

  const lcoe = energyPv > 0 ? totalCostNpv / energyPv : 0;

  // ─── Total DU Savings over period (Schedule!Z47) ─────────────────────────
  const totalDuSavings = cashflows.slice(1, 1 + irrYears).reduce((s, cf) => s + cf.duSavings, 0);

  return {
    cashflows,
    paybackMonths,
    paybackLabel,
    irr,
    lcoe,
    totalDuSavings,
  };
}

// ─── ANNEX — payment schedule with early-payoff savings ──────────────────────
// 60 rows. For each month n:
//   Min Amount Due = monthly payment if n <= effectiveTenor, else 0
//   Early Payoff Amount = sum from month n+1 to 60, each discounted back to
//                         month n at the early-payoff discount rate (Admin C28 = 8%).
//   Savings from Early Payoff = (sum of remaining min payments) - early payoff amount
//
// Excel formula at G_n: SUM(K_n:BR_n) where K_n = OFFSET($F_n, K$12, 0) / (1+J$12/12)^K$12
//                         and J$12 = 8% (Admin C28).
// In effect: G_n = present value at month n of payments F_(n+1) through F_60, using
// monthly compounding at C28/12. We replicate that.

export function buildAnnex(state, adminParams, terms, installationDate) {
  const { tenor } = state;
  const monthlyPmt = terms.customerMonthlyPmt;
  const epdRate = adminParams.earlyPayoffDiscountRate;  // C28 = 8%
  const monthlyEpd = epdRate / 12;
  // v3-60: the "pay balance via credit card" option (which collapsed the
  // schedule to a single post-install lump payment) was removed, so the
  // effective tenor is always the chosen tenor.
  const effectiveTenor = tenor;

  // v3-60: credit-card description suffixes removed along with the CC options.
  const dpDescription = 'Upfront Down Payment';
  const directPurchaseDescription = 'Direct Purchase Balance';

  // First, build the 60-row min-amount-due column F
  const minDue = [];
  for (let n = 1; n <= 60; n++) {
    // F = if n <= tenor, monthly payment, else 0
    minDue.push(n <= effectiveTenor ? monthlyPmt : 0);
  }

  // For each row n, compute the early-payoff amount as PV (at month n) of
  // payments minDue[n+1..60], discounted at monthlyEpd per month from each
  // future payment's offset.
  const rows = [];
  // ANNEX row 11 = Down Payment (special — no payoff math)
  rows.push({
    payment: 'Down Payment',
    dueDate: 'Upon Contract Signing',
    description: dpDescription,
    minDue: terms.dpTotalCharge,
    earlyPayoff: null,
    savings: null,
  });

  // Compute due date via the module-level helper (exported for use by App.jsx
  // when back-deriving install date from the admin-tunable
  // minDaysToFirstPostInstallPayment floor).
  const dueDateForMonthLocal = (n) => dueDateForMonth(installationDate, n);

  for (let n = 1; n <= 60; n++) {
    let description = '';
    if (effectiveTenor === 1 && n === 1) description = directPurchaseDescription;
    else if (n < effectiveTenor) description = 'RTO Monthly Payment';
    else if (n === effectiveTenor) description = 'Final RTO Payment';
    else description = '';

    const min = minDue[n - 1];

    // Early payoff: PV at month n of all future payments minDue[n+1 .. 60]
    let payoff = 0;
    for (let k = n; k < 60; k++) {  // k is offset; original Excel runs K..BR (offsets 0..59 of remaining)
      const offset = k - n + 1;
      payoff += minDue[k] / Math.pow(1 + monthlyEpd, offset);
    }

    // Savings = (sum of remaining min dues from this row through 60) - payoff
    // Note Excel uses H_n = SUM(F_n:F_71) - G_n  — so it includes the current
    // row's F_n. We mirror that: savings shown on row n is the cumulative
    // savings if you pay off NOW (at row n's due date), versus continuing.
    const remainingTotal = minDue.slice(n - 1).reduce((s, v) => s + v, 0);
    const savings = remainingTotal - payoff - min;
    // After-row-n payoff: outstanding balance net of the just-paid min. The
    // "Early Payoff Amt on Due Date" in Excel adds the min to payoff (because
    // you pay both this row's min AND the discounted future). Let's match
    // exactly what Excel shows — G_n = SUM(K_n:BR_n), which is PV of
    // F_{n+1}..F_71 (the offsets in K..BR are 0,1,...,59 against F_n).

    rows.push({
      payment: n,
      dueDate: dueDateForMonthLocal(n),
      description,
      minDue: min,
      earlyPayoff: min > 0 ? min + payoff : null,
      savings: min > 0 ? savings : null,
    });
  }

  return {
    rows,
  };
}
