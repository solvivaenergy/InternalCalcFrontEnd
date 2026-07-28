// =============================================================================
// PRODUCT TAB — third of three admin tabs (v3-54)
// -----------------------------------------------------------------------------
// Section order (per spec):
//   1. Quote Validity
//   2. Interest Rates
//   3. CC Post-Install Tenors
//   4. Promo Codes
//
// All edits flow through props from AdminShell. Edit gating per section is
// read from permissions.js — Product + Super Admin can edit; Engineering +
// Audit see read-only.
// =============================================================================

import React from 'react';
import { COLORS } from './ui.jsx';
import { rtoRate, grossMarginCurve } from '../lib/calculations.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot,
} from 'recharts';
import {
  Section, Param, MarginAnchorRow, WeightSlider, PromoCodesTable, MinDpTiersTable, adminStyles,
} from './AdminShared.jsx';
import {
  canEditAdminSection, hasAnyEditAccess,
} from '../lib/permissions.js';

export default function ProductTab({
  params, updateParam, accessLevel, validityDays,
}) {
  const anyEdit = hasAnyEditAccess(accessLevel);
  const canEditSection = (k) => canEditAdminSection(accessLevel, k);

  const validUntilPreview = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (validityDays || 0));
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  })();

  return (
    <div>
      {/* ─── Quote Validity ─────────────────────────────────────────── */}
      <Section title="Quote Validity"
               canEdit={canEditSection('quoteValidity')}
               anyEditRole={anyEdit}>
        <Param label="Quote validity period" suffix="days" step={1}
               value={params.quoteValidityDays}
               onChange={v => updateParam('quoteValidity', 'quoteValidityDays', v)}
               canEdit={canEditSection('quoteValidity')}
               min={1} max={365}
               hint={`A quote generated today would be valid until ${validUntilPreview}.`} />
      </Section>

      {/* ─── Quote Limits (v3-68) ───────────────────────────────────── */}
      <Section title="Quote Limits"
               canEdit={canEditSection('quoteLimits')}
               anyEditRole={anyEdit}>
        <Param label="Minimum system size" suffix="kWp" step={0.5}
               value={params.minSystemKwp}
               onChange={v => updateParam('quoteLimits', 'minSystemKwp', v)}
               canEdit={canEditSection('quoteLimits')}
               min={0} max={50}
               hint="Floors the Step 2A recommendation and the Selected-panels override. 0 = no minimum. Retrofit-only orders (0 panels) are unaffected." />
        {/* v3-75: tiered minimum DP replaces the v3-68 scalar. */}
        <div style={{ margin: '14px 0 6px', fontSize: 13, fontWeight: 600 }}>
          Minimum down payment — by Net Price (before DP Discount)
        </div>
        <MinDpTiersTable tiers={params.minDpTiers}
                         onChange={v => updateParam('quoteLimits', 'minDpTiers', v)}
                         canEdit={canEditSection('quoteLimits')} />
        <div style={{
          fontSize: 11.5, color: COLORS.textMuted, fontStyle: 'italic',
          margin: '10px 0 4px',
        }}>
          Each quote uses the tier matching its Net Price (before DP Discount).
          Lower Step 3A percentages are hidden; live quotes below the floor snap
          up to the lowest allowed option. Because the net price moves with the
          tenor, lengthening a tenor can cross a tier boundary and raise the
          minimum mid-quote — Step 3A always shows the active minimum in its
          title.
        </div>
        <Param label="Maximum tenor" suffix="months" step={1}
               value={params.maxTenorMonths}
               onChange={v => updateParam('quoteLimits', 'maxTenorMonths', v)}
               canEdit={canEditSection('quoteLimits')}
               min={1} max={60}
               hint="Hides longer Step 3B options. Live quotes above the cap snap down to the highest allowed option. Direct Purchase (tenor 0) is always available." />
      </Section>

      {/* ─── Step 1 Defaults (v3-70) ────────────────────────────────── */}
      <Section title="Step 1 Defaults"
               canEdit={canEditSection('step1Defaults')}
               anyEditRole={anyEdit}>
        <Param label="Default utility rate (1B)" suffix="₱/kWh" step={0.1}
               value={params.defaultUtilityRate}
               onChange={v => updateParam('step1Defaults', 'defaultUtilityRate', v)}
               canEdit={canEditSection('step1Defaults')}
               min={1} max={100}
               hint="Pre-filled ₱/kWh in Step 1B for new sessions and after Reset. Never overwrites a value the user has already typed." />
        <Param label="Default monthly bill (1C)" isPeso step={500}
               value={params.defaultMonthlyBill}
               onChange={v => updateParam('step1Defaults', 'defaultMonthlyBill', v)}
               canEdit={canEditSection('step1Defaults')}
               min={100} max={10000000}
               hint="Pre-filled monthly utility bill in Step 1C for new sessions and after Reset. Never overwrites a value the user has already typed." />
      </Section>

      {/* ─── Gross Margin & Merchant Discount (v3-83) ──────────────────── */}
      <Section title="Gross Margin & Merchant Discount"
               canEdit={canEditSection('margins')}
               anyEditRole={anyEdit}>
        {/* v3-88 — the loud amber block is gone. Financing is IN-HOUSE today, which
            is the ordinary case and needs no warning. The warning fires only if
            someone flips `financingEntityIsSeparate` — i.e. if financing is ever
            outsourced or spun into its own company, which is when the legal
            picture actually changes. */}
        {params.financingEntityIsSeparate ? (
          <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 8,
                        backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5',
                        fontSize: 12, color: '#991B1B', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Financing has been separated from the seller — read this
            </div>
            Credit is now shown as extended by <strong>{params.financingEntityName}</strong>, a party
            other than the seller. That changes the legal position materially:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>A company whose business is extending credit to others generally needs SEC authority
                  (RA 8556 financing company / RA 9474 lending company). Selling your <em>own</em> goods on
                  installment does not.</li>
              <li>Its interest income is taxed differently from a seller&rsquo;s &mdash; and the calculator
                  models neither. Confirm with the accountant.</li>
              <li>The customer-facing Terms &amp; Conditions switch to third-party financing wording.</li>
            </ul>
            Confirm the entity is registered and counsel has cleared the terms before quoting.
          </div>
        ) : (
          <div style={{ marginBottom: 14, fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
            Financing is currently extended by <strong>{params.financingEntityName}</strong> &mdash; the
            seller finances its own installment sales. If financing is ever outsourced or moved to a
            separate company, update the financing entity so the Terms &amp; Conditions and the PDF
            disclosure name the correct party.
          </div>
        )}

        {/* v3-92 — margin is a GENLINV curve over the array's rated capacity (kWp),
            same curve family as the interest-rate surface. Three anchors + a
            reference capacity for admin price display. */}
        <div style={{ marginBottom: 12, fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>
          Gross margin rides a curve over the system&rsquo;s <strong>rated capacity (kWp)</strong> — small
          arrays earn a lower margin, large arrays a higher one — fitted through three anchors. An order
          with <strong>no solar panels</strong> (battery / RSD / inverter&#8209;only) is priced at the
          {' '}<strong>maximum</strong> margin.
        </div>
        <MarginAnchorRow label="Min gross margin (small systems)"
               hint="Margin floor (25th-percentile anchor), applied at and below its capacity."
               marginValue={params.grossMarginMin} onMargin={v => updateParam('margins', 'grossMarginMin', v)}
               kwpValue={params.grossMarginMinKwp} onKwp={v => updateParam('margins', 'grossMarginMinKwp', v)}
               canEdit={canEditSection('margins')} />
        <MarginAnchorRow label="Med gross margin (mid systems)"
               hint="The 50th-percentile anchor — sets the curvature between min and max."
               marginValue={params.grossMarginMid} onMargin={v => updateParam('margins', 'grossMarginMid', v)}
               kwpValue={params.grossMarginMidKwp} onKwp={v => updateParam('margins', 'grossMarginMidKwp', v)}
               canEdit={canEditSection('margins')} />
        <MarginAnchorRow label="Max gross margin (large / no-panels)"
               hint="Margin ceiling (75th-percentile anchor), applied at/above its capacity AND to any no-solar order."
               marginValue={params.grossMarginMax} onMargin={v => updateParam('margins', 'grossMarginMax', v)}
               kwpValue={params.grossMarginMaxKwp} onKwp={v => updateParam('margins', 'grossMarginMaxKwp', v)}
               canEdit={canEditSection('margins')} />
        <Param label="Reference gross margin for admin price display" isPct step={0.005} min={0} max={99}
               value={params.grossMarginReference}
               onChange={v => updateParam('margins', 'grossMarginReference', v)}
               canEdit={canEditSection('margins')}
               hint="The margin the Inventory / Engineering 'DP Price' columns and the boot price list are computed at. Does NOT affect quotes — those use each system's own capacity-resolved margin. Default = the max anchor (ceiling price)." />
        <Param label="Merchant Discount Rate" isPct step={0.01} min={0} max={89}
               value={params.merchantDiscountRate}
               onChange={v => updateParam('margins', 'merchantDiscountRate', v)}
               canEdit={canEditSection('margins')}
               hint="The acquirer's cut. Taken from the VAT-inclusive amount the customer is charged, while the full output VAT is still remitted — so the effective retention is 1.12 × (1 − MDR) − 0.12, not (1 − MDR)." />
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8,
                      backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB',
                      fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            Margin by capacity (preview)
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11.5, marginBottom: 4 }}>
            {[5, 10, 15, 20, 30].map(k => `${k} kWp → ${(grossMarginCurve(k, params) * 100).toFixed(1)}%`).join('    ·    ')}
          </div>
          <div style={{ marginBottom: 6 }}>
            No panels → <strong>{(params.grossMarginMax * 100).toFixed(1)}%</strong>
            {' '}·{' '} Admin price list shown at
            {' '}<strong>{(params.grossMarginReference * 100).toFixed(1)}%</strong>
          </div>
          Direct Purchase Price = ⌈ COGS × 1.12 ÷ (1 − margin) ÷ {(1.12 * (1 - params.merchantDiscountRate) - 0.12).toFixed(4)} ⌉.
          COGS is entered pre-VAT because input VAT is creditable — recovered, not spent. Each quote resolves
          its own margin from actual capacity, so a change here moves the whole price list.
        </div>
        <GrossMarginPreview params={params} />
      </Section>

      {/* ─── Interest Rates (v3-79 — tenor × DP surface) ────────────── */}
      <Section title="Interest Rates"
               canEdit={canEditSection('interestRates')}
               anyEditRole={anyEdit}>
        <Param label="Max rate — 60 mo, 0% down" isPct step={0.005} min={0} max={99}
               value={params.rateAnchorMax}
               onChange={v => updateParam('interestRates', 'rateAnchorMax', v)}
               canEdit={canEditSection('interestRates')}
               hint="Top-left corner of the grid. Also the list-price (catalogue) rate." />
        <Param label="Mid rate — 30 mo, 25% down" isPct step={0.005} min={0} max={99}
               value={params.rateAnchorMid}
               onChange={v => updateParam('interestRates', 'rateAnchorMid', v)}
               canEdit={canEditSection('interestRates')}
               hint="Sets the curvature. Below the midpoint of the two extremes bends the surface convex." />
        <Param label="Min rate — 1 mo, 50% down"   /* v3-133 — stale v3-97-era label; the surface re-anchored to tenor 1 at the v3-100 split (TENOR_AXIS_MIN = 1) and the grid outlines the 1-month cell */ isPct step={0.005} min={0} max={99}
               value={params.rateAnchorMin}
               onChange={v => updateParam('interestRates', 'rateAnchorMin', v)}
               canEdit={canEditSection('interestRates')}
               hint="Bottom-right corner of the grid." />
        <WeightSlider tenorWeight={params.rateTenorWeight}
               onChange={v => updateParam('interestRates', 'rateTenorWeight', v)}
               canEdit={canEditSection('interestRates')} />
        <Param label="Rate step" isPct step={0.00125} min={0} max={5}
               value={params.rateStepPct}
               onChange={v => updateParam('interestRates', 'rateStepPct', v)}
               canEdit={canEditSection('interestRates')}
               hint="Every rate snaps to the nearest multiple. 0.125% = one eighth of a point." />
        <Param label="Early Payoff NPV Discount Rate" isPct step={0.005}
               value={params.earlyPayoffDiscountRate}
               onChange={v => updateParam('interestRates', 'earlyPayoffDiscountRate', v)}
               canEdit={canEditSection('interestRates')}
               hint="NPV discount applied to the ANNEX early-payoff column" />
        {/* v3-100 — Documentary Stamp Tax (PRODUCT!C3). Now Product-editable. */}
        <Param label="Documentary Stamp Tax rate" isPct step={0.0005} min={0} max={99}
               value={params.documentaryStampTaxRate}
               onChange={v => updateParam('interestRates', 'documentaryStampTaxRate', v)}
               canEdit={canEditSection('interestRates')}
               hint="DST on the financed balance: rate × ₱200 per ₱200 or part thereof (0.750% = ₱1.50 per ₱200), prorated below 12 months. ₱0 on a Direct Purchase." />

        <RateSurfacePreview params={params} />
      </Section>

      {/* ─── Promo Codes ────────────────────────────────────────────── */}
      <Section title="Promo Codes"
               canEdit={canEditSection('promoCodes')}
               anyEditRole={anyEdit}>
        <PromoCodesTable codes={params.promoCodes || []}
                         onChange={v => updateParam('promoCodes', 'promoCodes', v)}
                         canEdit={canEditSection('promoCodes')} />
      </Section>
    </div>
  );
}

// ─── Rate surface preview (v3-79) ────────────────────────────────────────────
// Renders the resulting rate for every (tenor, DP) cell, plus the same surface
// as a chart. Calls the SAME `rtoRate()` the pricing engine calls, so the grid
// an admin sees can never drift from what a customer is actually charged.
// v3-109 — mirrors the v3-100 tenor axis (60…2, 1, "Direct Purch"). TENOR 1 is a
// REAL interest-bearing month priced by the curve's endpoint (min anchor at
// tenor 1 / 50% DP), NOT the interest-free option. DIRECT PURCHASE IS TENOR 0 —
// its own rightmost column, rendered "Free" rather than a rate. The v3-97 grid
// had collapsed tenor 1 into Direct Purchase and pinned the min anchor at tenor
// 2; both were left stale through the v3-100 engine split until this release.
const PREVIEW_TENORS = [60, 48, 36, 30, 24, 18, 12, 6, 3, 2, 1, 0];
const PREVIEW_DPS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
const CHART_DPS = [0, 0.10, 0.20, 0.30, 0.40, 0.50];
const CHART_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948'];

function RateSurfacePreview({ params }) {
  const ok = [params.rateAnchorMin, params.rateAnchorMid, params.rateAnchorMax,
              params.rateTenorWeight].every(v => Number.isFinite(v))
    && params.rateAnchorMin < params.rateAnchorMid
    && params.rateAnchorMid < params.rateAnchorMax;

  if (!ok) {
    return (
      <div style={rsStyles.warn}>
        Anchors must satisfy <strong>min &lt; mid &lt; max</strong> for the curve to be defined.
        Fix the three rates above to see the resulting grid.
      </div>
    );
  }

  const lo = params.rateAnchorMin, hi = params.rateAnchorMax;
  const cell = (T, D) => rtoRate(T, D, params);
  const isAnchor = (T, D) =>
    (T === 60 && D === 0) || (T === 30 && D === 0.25) || (T === 1 && D === 0.5);

  // Chart spans the interest-bearing range, tenor 1…60. Tenor 0 (Direct Purchase)
  // is 0% and off the axis — plotting it would drop every line to a false cliff.
  const chartData = [1, 2, 3, 6, 12, 18, 24, 30, 36, 48, 60].map(T => {
    const row = { tenor: T };
    CHART_DPS.forEach(D => { row[`${Math.round(D * 100)}% down`] = +(cell(T, D) * 100).toFixed(2); });
    return row;
  });

  return (
    <div style={rsStyles.wrap}>
      <div style={rsStyles.caption}>
        Resulting rate — tenor (months) &times; down payment.
        Derived from the anchors above; nothing here is stored.
        The three <span style={rsStyles.anchorNote}>outlined</span> cells are the anchors.
      </div>

      <div style={rsStyles.scroll}>
        <table style={rsStyles.table}>
          <thead>
            <tr>
              <th style={rsStyles.thCorner}>DP</th>
              {PREVIEW_TENORS.map(T => <th key={T} style={rsStyles.th}>{T === 0 ? 'Direct Purch' : T}</th>)}
            </tr>
          </thead>
          <tbody>
            {PREVIEW_DPS.map(D => (
              <tr key={D}>
                <td style={rsStyles.rowLabel}>{(D * 100).toFixed(0)}%</td>
                {PREVIEW_TENORS.map(T => {
                  if (T < 1) {
                    // Direct Purchase (tenor 0) — interest-free, no rate to shade.
                    // Tenor 1 falls through to the surface below (a real rate).
                    return (
                      <td key={T} style={{
                        ...rsStyles.td,
                        backgroundColor: '#E1F5EE', color: '#0F6E56', fontWeight: 500,
                        border: `0.5px solid ${COLORS.divider}`,
                      }}>
                        Free
                      </td>
                    );
                  }
                  const r = cell(T, D);
                  const f = hi > lo ? (r - lo) / (hi - lo) : 0;
                  return (
                    <td key={T} style={{
                      ...rsStyles.td,
                      backgroundColor: `rgba(226, 75, 74, ${(0.04 + f * 0.42).toFixed(3)})`,
                      border: isAnchor(T, D) ? '1.5px solid #BA7517' : `0.5px solid ${COLORS.divider}`,
                    }}>
                      {(r * 100).toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={rsStyles.caption}>Same surface, graphically.</div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} />
            <XAxis dataKey="tenor" tick={{ fontSize: 11 }}
                   label={{ value: 'Tenor (months)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} width={44} />
            <Tooltip formatter={v => `${v}%`} labelFormatter={l => `${l} months`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {CHART_DPS.map((D, i) => (
              <Line key={D} type="monotone" dataKey={`${Math.round(D * 100)}% down`}
                    stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// v3-93 — "nice" axis bounds: round [lo, hi] outward to a clean step so the
// chart frames the curve tightly with readable ticks. Returns [min, max, step].
function niceAxis(lo, hi, targetTicks) {
  const span = Math.max(hi - lo, 1e-6);
  const raw  = span / Math.max(targetTicks, 1);
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step, step];
}

// v3-92/93 — Gross margin vs solar array capacity (kWp). The GENLINV curve the
// pricing engine actually calls (grossMarginCurve), with the three anchors
// marked. Axes auto-scale to the current anchors so the curve always reads
// cleanly, whatever Product sets them to.
function GrossMarginPreview({ params }) {
  const q1 = params.grossMarginMin, q2 = params.grossMarginMid, q3 = params.grossMarginMax;
  const x1 = params.grossMarginMinKwp, x2 = params.grossMarginMidKwp, x3 = params.grossMarginMaxKwp;
  const ok = [q1, q2, q3, x1, x2, x3].every(Number.isFinite)
    && q1 < q2 && q2 < q3 && x1 < x2 && x2 < x3;

  if (!ok) {
    return (
      <div style={rsStyles.warn}>
        Anchors must satisfy <strong>Min &lt; Mid &lt; Max</strong> — for both the margins and the
        capacities — for the curve to be defined. Fix the anchors above to see it.
      </div>
    );
  }

  // X: 0 up to a clean value just past the max-kWp anchor (shows the ceiling clamp).
  const [xMin, xMax] = niceAxis(0, x3 + (x3 - x1) * 0.12, 7);
  // Y: tight around [min, max] margin with a little headroom, rounded to a clean step.
  const yPad = (q3 - q1) * 100 * 0.10;
  const [yMin, yMax, yStep] = niceAxis(q1 * 100 - yPad, q3 * 100 + yPad, 6);
  const yTicks = [];
  for (let t = yMin; t <= yMax + 1e-9; t += yStep) yTicks.push(+t.toFixed(2));

  const N = 60;
  const data = Array.from({ length: N + 1 }, (_, i) => {
    const kwp = xMin + (xMax - xMin) * i / N;
    return { kwp: +kwp.toFixed(3), margin: +(grossMarginCurve(kwp, params) * 100).toFixed(3) };
  });

  return (
    <div style={rsStyles.wrap}>
      <div style={rsStyles.caption}>
        Gross margin vs solar array capacity. Derived from the anchors above; nothing here is stored.
        The three <span style={rsStyles.anchorNote}>outlined</span> points are the anchors; the curve is
        flat at the floor below {(+x1).toFixed(0)} kWp and at the ceiling above {(+x3).toFixed(0)} kWp.
        Orders with <strong>no solar panels</strong> are priced at the max ({(q3 * 100).toFixed(0)}%).
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, left: 0, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} />
            <XAxis dataKey="kwp" type="number" domain={[xMin, xMax]} allowDecimals={false}
                   tick={{ fontSize: 11 }}
                   label={{ value: 'Solar array capacity (kWp)', position: 'insideBottom', offset: -4, fontSize: 11 }} />
            <YAxis type="number" domain={[yMin, yMax]} ticks={yTicks} tick={{ fontSize: 11 }}
                   tickFormatter={v => `${v}%`} width={44} />
            <Tooltip formatter={v => `${(+v).toFixed(2)}%`} labelFormatter={l => `${(+l).toFixed(2)} kWp`} />
            <Line type="monotone" dataKey="margin" stroke="#1b8a5a" strokeWidth={2} dot={false} isAnimationActive={false} />
            <ReferenceDot x={x1} y={+(q1 * 100).toFixed(2)} r={4.5} fill="#BA7517" stroke="#fff" strokeWidth={1.5} />
            <ReferenceDot x={x2} y={+(q2 * 100).toFixed(2)} r={4.5} fill="#BA7517" stroke="#fff" strokeWidth={1.5} />
            <ReferenceDot x={x3} y={+(q3 * 100).toFixed(2)} r={4.5} fill="#BA7517" stroke="#fff" strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const rsStyles = {
  wrap:       { marginTop: 20, paddingTop: 16, borderTop: `1px solid ${COLORS.divider}` },
  caption:    { fontSize: 12, color: COLORS.textMuted, marginBottom: 8, marginTop: 16 },
  anchorNote: { border: '1.5px solid #BA7517', borderRadius: 3, padding: '0 4px' },
  scroll:     { overflowX: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 11,
                fontVariantNumeric: 'tabular-nums', minWidth: 520 },
  th:         { padding: '4px 2px', fontWeight: 600, color: COLORS.textMuted, textAlign: 'center', whiteSpace: 'nowrap' },
  thCorner:   { padding: '4px 6px', fontWeight: 600, color: COLORS.textMuted, textAlign: 'left' },
  rowLabel:   { padding: '3px 6px', fontWeight: 600, color: COLORS.textMuted, whiteSpace: 'nowrap' },
  td:         { padding: '3px 2px', textAlign: 'center', color: COLORS.text },
  warn:       { marginTop: 20, padding: '12px 14px', borderRadius: 8,
                backgroundColor: '#FEF3C7', color: '#92400E', fontSize: 13 },
};
