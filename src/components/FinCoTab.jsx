// =============================================================================
// FINCO TAB — fourth admin tab (v3-180)
// -----------------------------------------------------------------------------
// The financing entity's own parameters, split out of the Product tab ahead of
// separating FinCo from OpCo into two companies.
//
// Section order:
//   1. Financing Limits  — minimum down payment (tiered) + maximum tenor
//                          ('financingTerms'; both left 'quoteLimits' in v3-180)
//   2. Interest Rates    — the three rate anchors, the tenor/DP weight, the rate
//                          step, the early-payoff NPV discount and the DST rate,
//                          plus the v3-172 rate + monthly-payment grids and
//                          their charts. Moved WHOLESALE off the Product tab;
//                          RateSurfacePreview below is that component verbatim.
//
// EDIT GATING. FinCo Admin and Super Admin can edit; every other admin role
// sees this tab read-only. Per Pat's decisions at the v3-180 split, Super Admin
// KEEPS its wildcard here — this is a separation of duties, not a lockout — and
// no visibility machinery was added: all roles see all four tabs exactly as
// they did under v3-54, and the sections gate themselves.
//
// NO ENGINE MATH CHANGED. The preview calls the same rtoRate()/PMT() the
// pricing engine calls, exactly as it did on the Product tab. This release
// moves who may edit these parameters and where they are rendered; it does not
// alter a single quote.
// =============================================================================

import React from 'react';
import { COLORS, fmt } from './ui.jsx';
import { rtoRate, PMT, directFromCogs } from '../lib/calculations.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Section, Param, TextParam, SelectParam, WeightSlider, MinDpTiersTable,
  niceAxis, rsStyles, PMT_TABLE_MIN,
} from './AdminShared.jsx';
import {
  canEditAdminSection, hasAnyEditAccess,
} from '../lib/permissions.js';
import {
  computeDuInflationReference, duInflationSentence, nearestDuStep,
} from '../lib/duInflation.js';
import { IRR_YEARS_OPTIONS } from '../data/adminParams.js';

export default function FinCoTab({ params, updateParam, accessLevel }) {
  const anyEdit = hasAnyEditAccess(accessLevel);
  const canEditSection = (k) => canEditAdminSection(accessLevel, k);

  return (
    <div>
      {/* ─── Ownership note ─────────────────────────────────────────────
          Admin-only copy; never rendered to a customer, so it needs no
          marketing review. */}
      <div style={fcStyles.ownerNote}>
        These parameters are owned by the financing entity. Changes here move
        every financed quote&rsquo;s monthly payment and the minimum down payment
        customers are offered. Equipment pricing and cost inputs are unaffected —
        those stay on the Inventory, Engineering and Product tabs.
      </div>

      {/* ─── Financing Limits (v3-180) ──────────────────────────────────
          minDpTiers + maxTenorMonths, lifted out of the Product tab's Quote
          Limits section. minSystemKwp stayed behind: it is an engineering
          floor on system size, not a financing term. */}
      <Section title="Financing Limits"
               canEdit={canEditSection('financingTerms')}
               anyEditRole={anyEdit}>
        <div style={{ margin: '4px 0 6px', fontSize: 13, fontWeight: 600 }}>
          Minimum down payment — by Net Price (before DP Discount)
        </div>
        <MinDpTiersTable tiers={params.minDpTiers}
                         onChange={v => updateParam('financingTerms', 'minDpTiers', v)}
                         canEdit={canEditSection('financingTerms')} />
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
               onChange={v => updateParam('financingTerms', 'maxTenorMonths', v)}
               canEdit={canEditSection('financingTerms')}
               min={1} max={60}
               hint="Hides longer Step 3B options. Live quotes above the cap snap down to the highest allowed option. Direct Purchase (tenor 0) is always available." />
      </Section>

      {/* ─── Interest Rates (v3-79 — tenor × DP surface) ────────────────
          Moved from the Product tab in v3-180. Contents unchanged. */}
      <Section title="Interest Rates"
               canEdit={canEditSection('interestRates')}
               anyEditRole={anyEdit}>
        {/* v3-172 — anchors ordered Min → Mid → Max to read in the same direction
            as the grid below, which now runs 1 month at the left through 60 at the
            right. The corner hints moved with it: Min is the bottom-LEFT cell now,
            Max the top-RIGHT. The validity rule is unchanged — min < mid < max. */}
        <Param label="Min rate — 1 mo, 50% down"   /* v3-133 — stale v3-97-era label; the surface re-anchored to tenor 1 at the v3-100 split (TENOR_AXIS_MIN = 1) and the grid outlines the 1-month cell */ isPct step={0.005} min={0} max={99}
               value={params.rateAnchorMin}
               onChange={v => updateParam('interestRates', 'rateAnchorMin', v)}
               canEdit={canEditSection('interestRates')}
               hint="Bottom-left corner of the grid — the shortest term at the largest down payment." />
        <Param label="Mid rate — 30 mo, 25% down" isPct step={0.005} min={0} max={99}
               value={params.rateAnchorMid}
               onChange={v => updateParam('interestRates', 'rateAnchorMid', v)}
               canEdit={canEditSection('interestRates')}
               hint="Sets the curvature. Below the midpoint of the two extremes bends the surface convex." />
        <Param label="Max rate — 60 mo, 0% down" isPct step={0.005} min={0} max={99}
               value={params.rateAnchorMax}
               onChange={v => updateParam('interestRates', 'rateAnchorMax', v)}
               canEdit={canEditSection('interestRates')}
               hint="Top-right corner of the grid. Also the list-price (catalogue) rate." />
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
        {/* v3-100 — Documentary Stamp Tax (PRODUCT!C3). Product-editable until
            v3-180 moved the whole Interest Rates section to FinCo. */}
        <Param label="Documentary Stamp Tax rate" isPct step={0.0005} min={0} max={99}
               value={params.documentaryStampTaxRate}
               onChange={v => updateParam('interestRates', 'documentaryStampTaxRate', v)}
               canEdit={canEditSection('interestRates')}
               hint="DST on the financed balance: rate × ₱200 per ₱200 or part thereof (0.750% = ₱1.50 per ₱200), prorated below 12 months. ₱0 on a Direct Purchase." />

        <RateSurfacePreview params={params} />
      </Section>

      {/* ─── Returns Assumptions (v3-181) ───────────────────────────────
          A third FinCo section. Holds the DEFAULT DU tariff inflation only —
          the customer sets their own rate per quote in Step 4 and the mobile
          returns view. */}
      <Section title="Returns Assumptions"
               canEdit={canEditSection('returnsAssumptions')}
               anyEditRole={anyEdit}>
        <SelectParam label="Default IRR & LCOE period"
               options={IRR_YEARS_OPTIONS}
               formatOption={y => `${y} years`}
               value={params.irrYearsDefault}
               onChange={v => updateParam('returnsAssumptions', 'irrYearsDefault', v)}
               canEdit={canEditSection('returnsAssumptions')}
               hint="The horizon Step 4 starts on for Internal Rate of Return, Levelized Cost of Energy and total DU savings — the same choices the customer's own dropdown offers. Customers can still change it per quote; the mobile flow uses this value throughout, as it exposes no selector. Payback and the monthly savings figure are unaffected: neither depends on the horizon." />
        <Param label="Default annual DU rate increase" isPct step={0.0025}
               min={0} max={10}
               value={params.duRateInflationDefault}
               onChange={v => updateParam('returnsAssumptions', 'duRateInflationDefault', v)}
               canEdit={canEditSection('returnsAssumptions')}
               hint="Pre-fills the customer-adjustable rate in Step 4 and the mobile returns view. Customers adjust it in 0.25% steps, from 0.00% up to 10.00%. Applies from year 2 onward and compounds against panel degradation, mirroring Schedule AB9:AB37 of the reference workbook. Levelized Cost of Energy is unaffected — it measures the cost of the energy the system produces, not the price of grid electricity." />
        {/* v3-190 — three parameters JOIN Returns Assumptions:
              lcoeNpvDiscountRate      — moved from Engineering scheduleConstants
              maintenanceInflationRate — moved from Engineering scheduleConstants
              grossMarginReference     — moved from Product margins, RENAMED in
                                         the UI (storage key kept: no blob
                                         migration, server validation untouched)
            All three are LCOE/IRR assumptions, which is FinCo's remit. The
            imputed-maintenance preview below recomputes from the DRAFT params
            object, so it tracks the margin field live before Save — for free,
            because directFromCogs falls back to ap.grossMarginReference. */}
        <Param label="LCOE / NPV Discount Rate" isPct step={0.005}
               value={params.lcoeNpvDiscountRate}
               onChange={v => updateParam('returnsAssumptions', 'lcoeNpvDiscountRate', v)}
               canEdit={canEditSection('returnsAssumptions')}
               hint="The cost-of-funds rate that discounts purchase payments and maintenance costs in the Levelized Cost of Energy." />
        <Param label="Maintenance Inflation Rate" isPct step={0.005}
               value={params.maintenanceInflationRate}
               onChange={v => updateParam('returnsAssumptions', 'maintenanceInflationRate', v)}
               canEdit={canEditSection('returnsAssumptions')}
               hint="Annual inflation applied to the preventive-maintenance cost stream inside payback, IRR and LCOE." />
        <Param label="Assumed gross margin for preventive maintenance cost (used to calculate LCOE and IRR)"
               isPct step={0.005} min={0} max={99}
               value={params.grossMarginReference}
               onChange={v => updateParam('returnsAssumptions', 'grossMarginReference', v)}
               canEdit={canEditSection('returnsAssumptions')}
               hint="Prices the per-panel and per-visit preventive-maintenance COGS (entered on the Engineering tab) into the annual maintenance cost stream inside LCOE and IRR. Does not affect any quote price. The imputed prices update live in the preview below as this margin changes." />
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8,
                      backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB',
                      fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: '#111827', marginBottom: 6 }}>
            Imputed maintenance prices (derived)
          </div>
          <table style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th style={fcStyles.pmTh} />
                <th style={{ ...fcStyles.pmTh, textAlign: 'right' }}>COGS (pre-VAT) — Engineering tab</th>
                <th style={{ ...fcStyles.pmTh, textAlign: 'right' }}>
                  Imputed price at {((params.grossMarginReference || 0) * 100).toFixed(1)}%
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={fcStyles.pmTd}>Per panel</td>
                <td style={{ ...fcStyles.pmTd, textAlign: 'right' }}>
                  {fmt.peso(Math.round(params.preventiveMaintenancePerPanelCogs || 0))}
                </td>
                <td style={{ ...fcStyles.pmTd, textAlign: 'right', fontWeight: 700 }}>
                  {fmt.peso(Math.round(directFromCogs(params.preventiveMaintenancePerPanelCogs || 0, params)))}
                </td>
              </tr>
              <tr>
                <td style={fcStyles.pmTd}>Per visit</td>
                <td style={{ ...fcStyles.pmTd, textAlign: 'right' }}>
                  {fmt.peso(Math.round(params.preventiveMaintenancePerVisitCogs || 0))}
                </td>
                <td style={{ ...fcStyles.pmTd, textAlign: 'right', fontWeight: 700 }}>
                  {fmt.peso(Math.round(directFromCogs(params.preventiveMaintenancePerVisitCogs || 0, params)))}
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}>
            These are the maintenance figures entering every quote&rsquo;s payback, IRR and
            Levelized Cost of Energy. COGS is entered on the Engineering tab; the margin above
            prices it. Quote prices are unaffected.
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8,
                      backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB',
                      fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            This default reprices the returns on every quote
          </div>
          At <strong>0.00%</strong> the calculator reproduces the flat-tariff figures it has always
          shown. Above zero, payback shortens and both IRR and total DU savings rise on every quote
          that has not had its own rate set — and the customer-facing note in Step 4 switches from
          &ldquo;rates remain flat&rdquo; to naming the assumed rate.
        </div>
      </Section>

      {/* ─── DU Rate Inflation Reference (v3-183) ───────────────────────
          Mirrors Meralco_Rate_Inflation.xlsx. ADVISORY ONLY — nothing here
          sets a quote value; it produces the guidance note shown beside the
          Step 4 adjuster. */}
      <Section title="DU Rate Inflation Reference"
               canEdit={canEditSection('duInflationReference')}
               anyEditRole={anyEdit}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6,
                      margin: '0 0 14px' }}>
          Derives a historical DU tariff inflation rate from two published rate
          points. This does <strong>not</strong> set the rate used in any quote &mdash;
          it produces the reference note customers see beside the Step&nbsp;4
          adjuster. The customer&rsquo;s own assumed rate still starts at the
          Returns Assumptions default above.
        </div>

        <TextParam label="Source name" wide
                   value={params.duInflationSourceName}
                   onChange={v => updateParam('duInflationReference', 'duInflationSourceName', v)}
                   canEdit={canEditSection('duInflationReference')}
                   hint="Named in the generated sentence, exactly as it appears in the reference file." />
        <TextParam label="Source URL" wide mono
                   value={params.duInflationSourceUrl}
                   onChange={v => updateParam('duInflationReference', 'duInflationSourceUrl', v)}
                   canEdit={canEditSection('duInflationReference')}
                   hint="Linked from the customer-facing note. Must start with http:// or https://." />
        <TextParam label="Consumption basis" wide
                   value={params.duInflationBasis}
                   onChange={v => updateParam('duInflationReference', 'duInflationBasis', v)}
                   canEdit={canEditSection('duInflationReference')}
                   hint="The consumption level the quoted rates are typical of." />
        <TextParam label="Earlier point — month" type="month"
                   value={params.duInflationDate1}
                   onChange={v => updateParam('duInflationReference', 'duInflationDate1', v)}
                   canEdit={canEditSection('duInflationReference')}
                   hint="Month of the earlier published rate." />
        <Param label="Earlier point — rate" isPeso decimals={4} step={0.0001} min={0}
               value={params.duInflationRate1}
               onChange={v => updateParam('duInflationReference', 'duInflationRate1', v)}
               canEdit={canEditSection('duInflationReference')}
               hint="Rate per kWh at the consumption basis, as published." />
        <TextParam label="Later point — month" type="month"
                   value={params.duInflationDate2}
                   onChange={v => updateParam('duInflationReference', 'duInflationDate2', v)}
                   canEdit={canEditSection('duInflationReference')}
                   hint="Must be after the earlier month." />
        <Param label="Later point — rate" isPeso decimals={4} step={0.0001} min={0}
               value={params.duInflationRate2}
               onChange={v => updateParam('duInflationReference', 'duInflationRate2', v)}
               canEdit={canEditSection('duInflationReference')}
               hint="Rate per kWh at the same consumption basis." />

        <DuInflationPreview params={params} />
      </Section>
    </div>
  );
}

// ─── Live preview of the derived rate + sentence (v3-183) ────────────────────
// Calls the same functions Step 4 calls, so what an admin approves here is
// exactly what a customer reads. A null result is shown as an explicit warning
// rather than an empty box: the customer surface resolves null to NO NOTE, and
// an admin needs to know they have silently removed it.
function DuInflationPreview({ params }) {
  const ref = computeDuInflationReference(params);
  const sentence = duInflationSentence(params, ref);

  if (!ref || !sentence) {
    return (
      <div style={fcStyles.refBad}>
        <strong>No reference note will be shown to customers.</strong>{' '}
        {!ref
          ? 'The two months and rates must form a valid, forward-going period with both rates above zero.'
          : 'The source name and consumption basis must both be filled in for the sentence to be generated.'}
      </div>
    );
  }

  const step = nearestDuStep(ref.nominal);
  const cell = (k, v) => (
    <div key={k}>
      <div style={fcStyles.refKey}>{k}</div>
      <div style={fcStyles.refVal}>{v}</div>
    </div>
  );

  return (
    <div style={fcStyles.refBox}>
      <div style={fcStyles.refTop}>
        <div>
          <div style={fcStyles.refLabel}>Rate Inflation</div>
          <div style={{ fontSize: 11, color: '#4B7360', marginTop: 3 }}>
            Compound growth between the two points, annualised.
          </div>
        </div>
        <div style={fcStyles.refBig}>{(ref.nominal * 100).toFixed(2)}%</div>
      </div>
      <div style={fcStyles.refGrid}>
        {cell('Period', `${ref.nper} months`)}
        {cell('Monthly', `${(ref.monthly * 100).toFixed(4)}%`)}
        {cell('Total change', `+${(ref.totalChange * 100).toFixed(2)}%`)}
        {cell('Nearest 0.25% step', `${(step * 100).toFixed(2)}%`)}
      </div>
      <div style={fcStyles.refSentence}>{sentence}</div>
      {params.duInflationSourceUrl && (
        <div style={fcStyles.refSrc}>Source: {params.duInflationSourceUrl}</div>
      )}
    </div>
  );
}

const fcStyles = {
  // v3-190 — imputed-maintenance preview table (Returns Assumptions)
  pmTh: {
    fontSize: 11, color: '#6B7280', fontWeight: 700, textAlign: 'left',
    padding: '2px 0 4px 0', paddingRight: 18, borderBottom: '1px solid #E5E7EB',
  },
  pmTd: {
    fontSize: 12.5, padding: '5px 0', paddingRight: 18,
    borderBottom: '1px solid #F3F4F6',
  },
  refBox: {
    marginTop: 16, padding: '16px 18px', borderRadius: 10,
    backgroundColor: '#F0F7F3', border: '1px solid #C9DED3',
  },
  refBad: {
    marginTop: 16, padding: '12px 14px', borderRadius: 8,
    backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5',
    fontSize: 12, color: '#991B1B', lineHeight: 1.6,
  },
  refTop: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap',
  },
  refLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#2F5D45',
    textTransform: 'uppercase',
  },
  refBig: {
    fontSize: 30, fontWeight: 700, color: COLORS.brandGreen,
    fontVariantNumeric: 'tabular-nums',
  },
  refGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid #C9DED3',
  },
  refKey: {
    fontSize: 10.5, color: '#4B7360', textTransform: 'uppercase',
    letterSpacing: 0.4, fontWeight: 700,
  },
  refVal: {
    fontSize: 15, fontWeight: 700, color: '#1F3D2E',
    fontVariantNumeric: 'tabular-nums', marginTop: 2,
  },
  refSentence: {
    marginTop: 14, paddingTop: 12, borderTop: '1px solid #C9DED3',
    fontSize: 12.5, lineHeight: 1.65, color: '#22402F', fontStyle: 'italic',
  },
  refSrc: { marginTop: 8, fontSize: 11, color: '#4B7360', wordBreak: 'break-all' },
  ownerNote: {
    marginBottom: 18, padding: '12px 14px', borderRadius: 8,
    backgroundColor: '#F0F7F3', border: '1px solid #C9DED3',
    fontSize: 12, color: '#2F5D45', lineHeight: 1.6,
  },
};

// ─── Rate surface preview (v3-79) ────────────────────────────────────────────
// Renders the resulting rate for every (tenor, DP) cell, plus the same surface
// as a chart. Calls the SAME `rtoRate()` the pricing engine calls, so the grid
// an admin sees can never drift from what a customer is actually charged.
// v3-109 — mirrors the v3-100 tenor axis. TENOR 1 is a REAL interest-bearing
// month priced by the curve's endpoint (min anchor at tenor 1 / 50% DP), NOT the
// interest-free option. The v3-97 grid had collapsed tenor 1 into Direct
// Purchase and pinned the min anchor at tenor 2; both were left stale through
// the v3-100 engine split until that release.
//
// v3-172 — TWO PANELS, SIDE BY SIDE. The rate grid now sits beside a MONTHLY
// PAYMENT grid per ₱100,000 of Direct Purchase price, each with its own chart
// below it. WHY: a rate is not a price. The question an admin actually has to
// answer when moving the anchors is whether a longer term still costs the
// customer less per month — and past some max-anchor the rate curve out-runs
// the term and it stops being true. That inversion is invisible in a rate grid
// and obvious in a payment grid, so the payment grid flags it (amber) wherever
// a longer tenor's monthly EXCEEDS the next shorter tenor's.
//
// NO NEW ENGINE MATH. The payment is the same call computePaymentTerms makes:
//   PMT(rtoRate(T, DP)/12, T, -(100000 × (1 - DP)))
// — an ordinary annuity (type 0) on the financed balance, per v3-99/CALCULATOR
// AH15. Payments scale linearly in price, so a ₱850,000 order is 8.5× the grid.
// Promo discount, DST and the DP tier floor are deliberately OUT: this is a
// rate-shape instrument, not a quote. DST especially must stay off it — it is a
// tax line, not a golden-ratio pricing metric.
//
// v3-172 TENOR AXIS — 2 months REMOVED, 9 months ADDED (per Pat). This aligns
// the preview with the tenors a customer can actually be sold: Step3's
// TENOR_OPTIONS carries 9 and has never carried 2, so the grid had been
// previewing a term nobody could buy while hiding one they could. Direct
// Purchase (tenor 0) is dropped from BOTH grids — it is interest-free and paid
// as one balance, so it is neither a rate nor a monthly, and the column width
// it freed is what lets the two grids sit side by side.
//
// v3-172 AXIS DIRECTION — ASCENDING, 1 month at the left through 60 at the
// right (per Pat). Every grid from v3-79 to v3-171 ran longest-first, which put
// the tables in the OPPOSITE direction to the charts sitting directly beneath
// them: an admin read a rate rising left-to-right in one and falling in the
// other. One direction now, tables and charts alike. This also flips the
// inversion test — the longer term of each adjacent pair is now the cell on the
// RIGHT, so the flag moves with it (see the payment grid below).
const PREVIEW_TENORS = [1, 3, 6, 9, 12, 18, 24, 30, 36, 48, 60];
const PREVIEW_DPS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
const CHART_DPS = [0, 0.10, 0.20, 0.30, 0.40, 0.50];
const CHART_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948'];
// Rate chart spans the whole interest-bearing axis, 1…60. Tenor 0 (Direct
// Purchase) is 0% and off the axis — plotting it would drop every line to a
// false cliff.
const RATE_CHART_TENORS = [1, 3, 6, 9, 12, 18, 24, 30, 36, 48, 60];
// v3-172 — the PAYMENT chart stops at 12 months. At 0% down the 1-month payment
// is ~₱102,300 against ~₱3,600 at 60 months: on one linear axis the long end —
// the only place an inversion can occur — collapses into a flat line. The grid
// beside it still carries every tenor; this is a chart-legibility bound only.
const PMT_CHART_TENORS = [12, 18, 24, 30, 36, 48, 60];
// The reference order the payment grid is quoted against. Payments are linear in
// price, so this is a unit, not an assumption about deal size.
const PMT_REFERENCE_PRICE = 100000;

const pesoWhole = (n) =>
  Math.round(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });

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
  // Same PMT the engine calls, on the same ordinary-annuity convention.
  const pmtCell = (T, D) =>
    PMT(cell(T, D) / 12, T, -(PMT_REFERENCE_PRICE * (1 - D)));
  const isAnchor = (T, D) =>
    (T === 60 && D === 0) || (T === 30 && D === 0.25) || (T === 1 && D === 0.5);

  // ── observed extremes across the GRIDS (both axes are specified off the
  // table, not off the plotted subset, so the two always agree) ──────────────
  let rateLo = Infinity, rateHi = -Infinity, pmtLo = Infinity;
  PREVIEW_DPS.forEach(D => PREVIEW_TENORS.forEach(T => {
    const r = cell(T, D) * 100, m = pmtCell(T, D);
    if (r < rateLo) rateLo = r;
    if (r > rateHi) rateHi = r;
    if (m < pmtLo) pmtLo = m;
  }));

  // Y-AXIS FLOORS (v3-172, per Pat): rate floors to a 5% multiple, payment to
  // ₱500. Ceilings mirror them, then widen to a clean tick step.
  const rateYMin = Math.floor(rateLo / 5) * 5;
  const rateYMax = Math.ceil(rateHi / 5) * 5;
  const rateTicks = [];
  for (let t = rateYMin; t <= rateYMax + 1e-9; t += 5) rateTicks.push(+t.toFixed(2));

  const rateChartData = RATE_CHART_TENORS.map(T => {
    const row = { tenor: T };
    CHART_DPS.forEach(D => { row[`${Math.round(D * 100)}% down`] = +(cell(T, D) * 100).toFixed(2); });
    return row;
  });

  let pmtChartHi = -Infinity;
  const pmtChartData = PMT_CHART_TENORS.map(T => {
    const row = { tenor: T };
    CHART_DPS.forEach(D => {
      const m = Math.round(pmtCell(T, D));
      row[`${Math.round(D * 100)}% down`] = m;
      if (m > pmtChartHi) pmtChartHi = m;
    });
    return row;
  });

  const pmtYMin = Math.floor(pmtLo / 500) * 500;
  const pmtCeil = Math.ceil(pmtChartHi / 500) * 500;
  const pmtStep = Math.max(500, niceAxis(pmtYMin, pmtCeil, 6)[2]);
  const pmtYMax = pmtYMin + Math.max(1, Math.ceil((pmtCeil - pmtYMin) / pmtStep)) * pmtStep;
  const pmtTicks = [];
  for (let t = pmtYMin; t <= pmtYMax + 1e-6; t += pmtStep) pmtTicks.push(t);

  const headRow = (
    <tr>
      <th style={rsStyles.thCorner}>DP</th>
      {PREVIEW_TENORS.map(T => <th key={T} style={rsStyles.th}>{T}</th>)}
    </tr>
  );

  return (
    <div style={rsStyles.wrap}>
      <div style={rsStyles.panels}>

        {/* ── LEFT: resulting rate ───────────────────────────────────────── */}
        <div style={rsStyles.panelRate}>
          <div style={rsStyles.caption}>
            <strong>Resulting rate (%)</strong> — tenor (months) &times; down payment.
            Derived from the anchors above; nothing here is stored.
            The three <span style={rsStyles.anchorNote}>outlined</span> cells are the anchors.
            A Direct Purchase is interest-free and is not a column here.
          </div>

          <div style={rsStyles.scroll}>
            <table style={rsStyles.table}>
              <thead>{headRow}</thead>
              <tbody>
                {PREVIEW_DPS.map(D => (
                  <tr key={D}>
                    <td style={rsStyles.rowLabel}>{(D * 100).toFixed(0)}%</td>
                    {PREVIEW_TENORS.map(T => {
                      const r = cell(T, D);
                      const f = hi > lo ? (r - lo) / (hi - lo) : 0;
                      return (
                        <td key={T} style={{
                          ...rsStyles.td,
                          backgroundColor: `rgba(226, 75, 74, ${(0.04 + f * 0.42).toFixed(3)})`,
                          /* v3-143 — anchors get a 2.5px inset ring (boxShadow, not
                             border) so they stand out clearly without changing cell
                             geometry in the collapsed table. */
                          border: `0.5px solid ${COLORS.divider}`,
                          boxShadow: isAnchor(T, D) ? 'inset 0 0 0 2.5px #854F0B' : undefined,
                          fontWeight: isAnchor(T, D) ? 700 : undefined,
                        }}>
                          {/* v3-196 — three decimals: the 0.25% step lands on
                              .125 boundaries that 2dp rounded away. */}
                          {(r * 100).toFixed(3)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={rsStyles.chartCaption}>
            Same surface, graphically. The axis starts at {rateYMin}% — the lowest rate in the
            grid, rounded down to a 5% multiple.
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rateChartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} />
                <XAxis dataKey="tenor" tick={{ fontSize: 11 }}
                       label={{ value: 'Tenor (months)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                <YAxis type="number" domain={[rateYMin, rateYMax]} ticks={rateTicks}
                       tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} width={44} />
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

        {/* ── RIGHT: monthly payment per ₱100,000 ────────────────────────── */}
        <div style={rsStyles.panelPmt}>
          <div style={rsStyles.caption}>
            <strong>Monthly payment (₱) per ₱100,000 of Direct Purchase price</strong> — the rates
            at left, priced. Linear in the order: an ₱850,000 order is 8.5&times; these figures.
            Excludes promo, DST and the DP tier floor. An{' '}
            <span style={rsStyles.invNote}>amber</span> cell is a longer tenor whose monthly
            EXCEEDS the shorter tenor before it — the rate curve has out-run the term.
          </div>

          <div style={rsStyles.scroll}>
            <table style={{ ...rsStyles.table, minWidth: PMT_TABLE_MIN }}>
              <thead>{headRow}</thead>
              <tbody>
                {PREVIEW_DPS.map(D => {
                  const row = PREVIEW_TENORS.map(T => pmtCell(T, D));
                  return (
                    <tr key={D}>
                      <td style={rsStyles.rowLabel}>{(D * 100).toFixed(0)}%</td>
                      {PREVIEW_TENORS.map((T, i) => {
                        // v3-172 — columns run SHORTEST → LONGEST, so column i is the
                        // longer term of the pair (i-1, i). Flag it when it costs more
                        // than the shorter term immediately before it.
                        const inverted = i > 0 && row[i] > row[i - 1] + 0.005;
                        return (
                          <td key={T}
                              title={inverted
                                ? `${T} months costs more per month than ${PREVIEW_TENORS[i - 1]} months`
                                : undefined}
                              style={{
                                ...rsStyles.td,
                                border: `0.5px solid ${COLORS.divider}`,
                                backgroundColor: inverted ? '#FDE68A' : undefined,
                                boxShadow: inverted ? 'inset 0 0 0 2px #B45309' : undefined,
                                color: inverted ? '#78350F' : COLORS.textBody,
                                fontWeight: inverted ? 700 : undefined,
                              }}>
                            {pesoWhole(row[i])}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={rsStyles.chartCaption}>
            Same surface, graphically, over 12–60 months — the short terms are an order of
            magnitude larger and would flatten the range where an inversion can appear. The axis
            starts at ₱{pesoWhole(pmtYMin)} — the lowest payment in the grid, rounded down to ₱500.
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pmtChartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} />
                <XAxis dataKey="tenor" tick={{ fontSize: 11 }}
                       label={{ value: 'Tenor (months)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                <YAxis type="number" domain={[pmtYMin, pmtYMax]} ticks={pmtTicks}
                       tick={{ fontSize: 11 }} tickFormatter={v => `₱${pesoWhole(v)}`} width={62} />
                <Tooltip formatter={v => `₱${pesoWhole(v)}`} labelFormatter={l => `${l} months`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {CHART_DPS.map((D, i) => (
                  <Line key={D} type="monotone" dataKey={`${Math.round(D * 100)}% down`}
                        stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
