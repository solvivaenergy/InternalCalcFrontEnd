// ─── Lead capture (v3-97) ────────────────────────────────────────────────────
// Assembles the "talk to a Solviva rep" submission and posts it to the
// submit-lead Netlify Function. This module is intentionally framework-free
// (pure payload builder + a thin fetch wrapper) so the payload shape is covered
// by the smoke harness.
//
// ⚠️ DELIVERY: the Netlify Function it posts to is currently a STUB that does
// NOT deliver to Solviva — see netlify/functions/submit-lead.js and
// ALDEN-LEAD-DELIVERY.md. The channel must be wired before this ships to real
// customers.

import { LUZON_REGIONS } from '../config.js';   // v3-125 — location labels

export const LEAD_ENDPOINT = '/.netlify/functions/submit-lead';

// The consent recorded with every submission (Data Privacy Act, RA 10173).
// Shown to the customer as a required checkbox and stored in the payload.
export const LEAD_CONSENT_TEXT =
  'I agree that Solviva Energy Incorporated may use my contact details and the ' +
  'information above to respond to my inquiry, in line with the Data Privacy Act (RA 10173).';

function round(x, n) {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

// Reference id for the lead. Same shape as the PDF proposal's quote ref
// (SV-YYYY-NNNN) so a rep can tie a lead to a generated proposal, but kept
// self-contained here to avoid importing the heavy pdfGenerator module.
export function makeLeadRef(date, contact) {
  const name = (contact?.name || 'X').toLowerCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const dayOfYear = Math.floor(
    (date - new Date(date.getFullYear(), 0, 0)) / 86400000
  );
  const suffix = String(Math.abs(h ^ dayOfYear) % 10000).padStart(4, '0');
  return `SV-${date.getFullYear()}-${suffix}`;
}

// Build the record Solviva receives. `model` is the App's computed model
// (resolved panel count, kWp, battery, inverters, terms); `state` carries the
// customer's raw inputs; `contact` carries name/email/mobile/installAddress.
// v3-125 — helpers for the widened payload.
const invLabels = (arr) => (arr || [])
  .filter(Boolean)
  .map(inv => (inv.ratedKw != null ? `${inv.ratedKw} kW` : (inv.label || 'Inverter')));
const hhmm = (frac) => {
  if (!Number.isFinite(frac)) return null;
  const mins = Math.round(frac * 24 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

export function buildLeadPayload({ state, model, contact, submittedAt, reference, adminParams }) {
  const terms = model?.terms || {};
  // The battery package label already includes the size (e.g. "5 kWh Pylontech"),
  // so prefer it; fall back to a bare kWh string, or "None".
  const battery = !model?.batteryKwh
    ? 'None'
    : (model?.activeBatteryPackage?.label || `${model.batteryKwh} kWh`);

  // v3-125 — location IS customer-set since v3-114 (Region → City cascade;
  // dynamic delivery locations v3-116) and it changes the price the customer
  // saw, so the lead now carries the pick. The free-text install address
  // remains the authoritative street "where"; this is the pricing "where".
  const loc = (() => {
    if (state?.location === 'other') return { label: 'Other' };
    if (state?.location === 'luzon') {
      const region = LUZON_REGIONS.find(r => r.code === state?.locationRegion) || null;
      return {
        label: 'Luzon main island',
        region: region ? region.label : state?.locationRegion || null,
        city: state?.locationCity || null,
        roadKm: state?.locationKm ?? null,
      };
    }
    const row = (adminParams?.deliveryLocations || []).find(l => l.id === state?.location);
    return { label: row ? row.label : state?.location || null };
  })();

  // v3-125 — day/night consumption profile: the split that sized the system
  // plus the device rows exactly as the customer entered them.
  const rec = model?.recommended || {};
  const totalKwh = (rec.dayTimeKwh || 0) + (rec.nightTimeKwh || 0);
  const deviceRows = (state?.deviceRows || [])
    .filter(r => r && r.deviceName)
    .map(r => ({
      device: r.deviceName,
      count: r.count,
      on: hhmm(r.onTime),
      off: hhmm(r.offTime),
      daysPerWeek: r.daysPerWeek,
    }));

  return {
    quoteReference: reference,
    submittedAt,
    source: 'public-calculator',
    customer: {
      name: contact?.name || '',
      email: contact?.email || '',
      mobile: contact?.mobile || '',
      installationAddress: contact?.installAddress || '',
    },
    system: {
      monthlyBill: state?.monthlyBill,
      utilityRate: state?.utilityRate,                       // v3-125
      phase: state?.phase === 'three' ? '3-phase' : 'single-phase',   // v3-125
      targetSavingsPct: state?.desiredSavingsPct,
      // v3-110 — which Step 2A objective sized this quote.
      optimizationMode: state?.optimizationMode || 'panels',
      // v3-136 — peaks-and-valleys sizing basis. EFFECTIVE value (includes
      // the forced-on state at a 100% target with sub-7-day devices —
      // Variant B). false = average-week sizing; absent on pre-v3-136
      // payloads means false.
      conservativeSizing: model?.conservativeSizing === true,
      location: loc,                                          // v3-125
      dayNightProfile: {                                      // v3-125
        dayPct: totalKwh > 0 ? round(rec.dayTimeKwh / totalKwh, 3) : null,
        nightPct: totalKwh > 0 ? round(rec.nightTimeKwh / totalKwh, 3) : null,
        devices: deviceRows,
      },
      // v3-125 — RECOMMENDED vs SELECTED (user-directed): the system the
      // calculator proposed alongside what the customer actually chose, so a
      // rep sees every deviation at a glance. 'selected' carries the fields
      // the pre-v3-125 payload had at the system level.
      recommended: {
        panelCount: model?.recPanelCount,
        systemKwp: round((model?.recPanelCount || 0) * (rec.panelWatts || 0) / 1000, 2),
        batteryKwh: model?.recBatteryKwh,
        batteryPackage: model?.autoBatteryPackage?.label || null,
        inverters: invLabels(model?.recInverters),
      },
      selected: {
        panelCount: model?.panelCount,
        systemKwp: round(model?.systemKwp, 2),
        battery,
        batteryKwh: model?.batteryKwh,
        inverters: invLabels(model?.effectiveInverters),
        rsdIncluded: !!state?.rsdEnabled,
        roofMaterial: state?.roofMaterial,
        netMetering: !!state?.netMeteringEnabled,
      },
    },
    quote: {
      netPrice: round(terms.netDirectPrice, 2),
      downPaymentPct: state?.downPaymentPct,
      tenorMonths: state?.tenor,   // v3-100: 0 = Direct Purchase (v5.1 "Direct Purch")
      interestRatePa: terms.rtoRate,
      monthlyPayment: round(terms.customerMonthlyPmt, 2),
      totalAmountDue: round(terms.totalAmountDue, 2),
      // v3-100 — additive fields (delivery channel still a stub, so no
      // consumer breaks): the DST line and the DST-inclusive total the
      // customer actually saw on screen (SUMMARY!H20).
      documentaryStampTax: round(terms.dst ?? 0, 2),
      totalAmountDueInclDst: round(terms.summaryTotalDue ?? terms.totalAmountDue, 2),
      promoCode: state?.promoCode || '',
    },
    consent: {
      given: true,
      text: LEAD_CONSENT_TEXT,
      timestamp: submittedAt,
    },
  };
}

// POST the payload to the submit-lead Function. Resolves to the parsed JSON
// (which includes `{ mock: true }` while the delivery channel is unconfigured).
// Throws on a non-2xx so the caller can surface a retry.
export async function submitLead(payload, endpoint = LEAD_ENDPOINT) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`submit-lead responded ${res.status}`);
  return res.json().catch(() => ({ ok: true }));
}
