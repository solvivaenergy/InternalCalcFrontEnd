// =============================================================================
// PRODUCT TAB — third of four admin tabs (v3-54; fourth tab added v3-180)
// -----------------------------------------------------------------------------
// Section order:
//   1. Quote Validity
//   2. Quote Limits            (minSystemKwp ONLY since v3-180)
//   3. Step 1 Defaults
//   4. Step 3 Default
//   5. Gross Margin & Merchant Discount
//   6. Promo Codes
//
// v3-180 — WHAT LEFT THIS FILE. Ahead of the FinCo/OpCo entity separation, the
// financing entity's parameters moved to FinCoTab.jsx:
//   • the ENTIRE Interest Rates section, and RateSurfacePreview with it
//   • minDpTiers + maxTenorMonths, out of Quote Limits into 'financingTerms'
// minSystemKwp deliberately STAYED — it floors system size, an engineering
// concern, not a financing term — so Quote Limits survives holding one control.
// defaultDownPaymentPct also stayed (Pat: it is a pre-fill, not a floor), even
// though it snaps up to FinCo's minimum at quote time.
// `niceAxis` and `rsStyles` moved to AdminShared.jsx: GrossMarginPreview below
// still needs them and so does the relocated RateSurfacePreview, and one shared
// definition cannot drift where two copies would.
//
// All edits flow through props from AdminShell. Edit gating per section is
// read from permissions.js — Product + Super Admin can edit; Engineering,
// FinCo + Audit see read-only.
// =============================================================================

import React from 'react';
import { COLORS, NumberInput, Select } from './ui.jsx';
import {
  grossMarginCurve, grossMarginNoInverter, componentMarginFor, directFromCogs,
  cablingTotalPct, availableInverters, recommendInverters, COMPONENT_MARGIN_IDS,
} from '../lib/calculations.js';
import { PANEL_SETTINGS } from '../data/inventory.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, Legend,
} from 'recharts';
import {
  Section, Param, MarginAnchorRow, PromoCodesTable, niceAxis, rsStyles, adminStyles,
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

      {/* ─── Quote Limits (v3-68; minSystemKwp only since v3-180) ───────
          The tiered minimum down payment and the maximum tenor moved to the
          FinCo tab's Financing Limits section at the entity split. What is
          left is a system-SIZE floor, which is an engineering constraint on
          what may be quoted at all, not a term of the financing. */}
      <Section title="Quote Limits"
               canEdit={canEditSection('quoteLimits')}
               anyEditRole={anyEdit}>
        <Param label="Minimum system size" suffix="kWp" step={0.5}
               value={params.minSystemKwp}
               onChange={v => updateParam('quoteLimits', 'minSystemKwp', v)}
               canEdit={canEditSection('quoteLimits')}
               min={0} max={50}
               hint="Floors the Step 2A recommendation and the Selected-panels override. 0 = no minimum. Retrofit-only orders (0 panels) are unaffected." />
        <div style={{
          fontSize: 11.5, color: COLORS.textMuted, fontStyle: 'italic',
          margin: '10px 0 4px',
        }}>
          Minimum down payment and maximum tenor are set by the financing
          entity — see the FinCo tab.
        </div>
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

      {/* ─── Step 3 Default (v3-159) ────────────────────────────────── */}
      <Section title="Step 3 Default"
               canEdit={canEditSection('step3Defaults')}
               anyEditRole={anyEdit}>
        <Param label="Default down payment (3A)" isPct step={0.05}
               value={params.defaultDownPaymentPct}
               onChange={v => updateParam('step3Defaults', 'defaultDownPaymentPct', v)}
               canEdit={canEditSection('step3Defaults')}
               min={0} max={100}
               hint="Pre-filled DP share in Step 3A and the mobile flow for new sessions and after Reset, on the 5% grid. If a quote's minimum-DP tier is higher, the session snaps up to the tier floor. Never overwrites a value the user has already chosen." />
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

        {/* v3-191 — PER-PHASE curves + PER-COMPONENT margins (user-directed,
            Pat). The curve applies ONLY to the Solar Panels line, and ONLY
            when panels are purchased with at least one inverter; Follow/Fixed
            for every other component applies on that same full-system shape
            only, with `otherwise` covering every order missing either leg. */}
        <div style={{ marginBottom: 12, fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>
          Each phase has its own gross-margin curve over rated capacity (kWp), fitted through its
          Min / Med / Max anchors. A curve applies <strong>only to the Solar Panels line, and only
          when the panels are purchased with at least one inverter</strong>. A panels-only order —
          extra panels with no inverter — never rides the curve: it prices at the
          panels-without-inverter margin below. Every other component carries its own setting in
          the table: on an order with <strong>both panels and an inverter</strong> it either
          follows the panels&rsquo; curve (of the order&rsquo;s phase) or uses its own fixed
          margin; in every other case it uses its Otherwise margin.
        </div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#374151',
                      textTransform: 'uppercase', letterSpacing: '0.03em', margin: '14px 0 2px' }}>
          Single-phase panels curve
        </div>
        <MarginAnchorRow label="Min gross margin (small systems)"
               hint="Margin floor, applied at and below its capacity."
               marginValue={params.grossMarginMin} onMargin={v => updateParam('margins', 'grossMarginMin', v)}
               kwpValue={params.grossMarginMinKwp} onKwp={v => updateParam('margins', 'grossMarginMinKwp', v)}
               canEdit={canEditSection('margins')} />
        <MarginAnchorRow label="Med gross margin (mid systems)"
               hint="Sets the curvature between min and max."
               marginValue={params.grossMarginMid} onMargin={v => updateParam('margins', 'grossMarginMid', v)}
               kwpValue={params.grossMarginMidKwp} onKwp={v => updateParam('margins', 'grossMarginMidKwp', v)}
               canEdit={canEditSection('margins')} />
        <MarginAnchorRow label="Max gross margin (large systems)"
               hint="Margin ceiling, applied at and above its capacity."
               marginValue={params.grossMarginMax} onMargin={v => updateParam('margins', 'grossMarginMax', v)}
               kwpValue={params.grossMarginMaxKwp} onKwp={v => updateParam('margins', 'grossMarginMaxKwp', v)}
               canEdit={canEditSection('margins')} />
        <div style={{ fontWeight: 700, fontSize: 12, color: '#374151',
                      textTransform: 'uppercase', letterSpacing: '0.03em', margin: '14px 0 2px' }}>
          Three-phase panels curve
        </div>
        <MarginAnchorRow label="Min gross margin (small systems)"
               hint="Margin floor, applied at and below its capacity."
               marginValue={params.grossMarginMinTp} onMargin={v => updateParam('margins', 'grossMarginMinTp', v)}
               kwpValue={params.grossMarginMinKwpTp} onKwp={v => updateParam('margins', 'grossMarginMinKwpTp', v)}
               canEdit={canEditSection('margins')} />
        <MarginAnchorRow label="Med gross margin (mid systems)"
               hint="Sets the curvature between min and max."
               marginValue={params.grossMarginMidTp} onMargin={v => updateParam('margins', 'grossMarginMidTp', v)}
               kwpValue={params.grossMarginMidKwpTp} onKwp={v => updateParam('margins', 'grossMarginMidKwpTp', v)}
               canEdit={canEditSection('margins')} />
        <MarginAnchorRow label="Max gross margin (large systems)"
               hint="Margin ceiling, applied at and above its capacity."
               marginValue={params.grossMarginMaxTp} onMargin={v => updateParam('margins', 'grossMarginMaxTp', v)}
               kwpValue={params.grossMarginMaxKwpTp} onKwp={v => updateParam('margins', 'grossMarginMaxKwpTp', v)}
               canEdit={canEditSection('margins')} />
        <Param label="Single-phase panels without an inverter" isPct step={0.5} min={0} max={99}
               value={params.grossMarginNoInverterSp}
               onChange={v => updateParam('margins', 'grossMarginNoInverterSp', v)}
               canEdit={canEditSection('margins')}
               hint="Margin for the single-phase Solar Panels line whenever the order carries no inverter — extra-panels-only purchases, panels-only expansions, panels quoted during an inverter stock-out. The curve never applies to these orders." />
        <Param label="Three-phase panels without an inverter" isPct step={0.5} min={0} max={99}
               value={params.grossMarginNoInverterTp}
               onChange={v => updateParam('margins', 'grossMarginNoInverterTp', v)}
               canEdit={canEditSection('margins')}
               hint="Same rule for the three-phase Solar Panels line." />
        <Param label="Allowance for Merchant Discount Rate" isPct step={0.01} min={0} max={89}
               value={params.merchantDiscountRate}
               onChange={v => updateParam('margins', 'merchantDiscountRate', v)}
               canEdit={canEditSection('margins')}
               hint="The acquirer's cut. Taken from the VAT-inclusive amount the customer is charged, while the full output VAT is still remitted — so the effective retention is 1.12 × (1 − MDR) − 0.12, not (1 − MDR)." />
        <ComponentMarginsTable componentMargins={params.componentMargins}
                               canEdit={canEditSection('margins')}
                               mdr={params.merchantDiscountRate}
                               onChange={next => updateParam('margins', 'componentMargins', next)} />
        <GrossMarginPreview params={params} />
        <FullSystemPerKwpChart params={params} phase="single" />
        <FullSystemPerKwpChart params={params} phase="three" />
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


// v3-92/93 → v3-191 — Gross margin vs solar array capacity (kWp), BOTH phases.
// The GENLINV curves the pricing engine actually calls (grossMarginCurve with
// each phase), anchors marked per phase. Axes auto-scale to whichever anchor
// sets are valid; an invalid set hides its curve and says so rather than
// blanking the whole chart.
function GrossMarginPreview({ params }) {
  const setOf = (tp) => tp
    ? { q1: params.grossMarginMinTp, q2: params.grossMarginMidTp, q3: params.grossMarginMaxTp,
        x1: params.grossMarginMinKwpTp, x2: params.grossMarginMidKwpTp, x3: params.grossMarginMaxKwpTp }
    : { q1: params.grossMarginMin, q2: params.grossMarginMid, q3: params.grossMarginMax,
        x1: params.grossMarginMinKwp, x2: params.grossMarginMidKwp, x3: params.grossMarginMaxKwp };
  const okOf = (s) => [s.q1, s.q2, s.q3, s.x1, s.x2, s.x3].every(Number.isFinite)
    && s.q1 < s.q2 && s.q2 < s.q3 && s.x1 < s.x2 && s.x2 < s.x3;
  const sp = setOf(false), tp = setOf(true);
  const spOk = okOf(sp), tpOk = okOf(tp);

  if (!spOk && !tpOk) {
    return (
      <div style={rsStyles.warn}>
        Anchors must satisfy <strong>Min &lt; Mid &lt; Max</strong> — for both the margins and the
        capacities — for a curve to be defined. Fix the anchors above to see it.
      </div>
    );
  }

  const xHi = Math.max(spOk ? sp.x3 + (sp.x3 - sp.x1) * 0.12 : 0,
                       tpOk ? tp.x3 + (tp.x3 - tp.x1) * 0.12 : 0);
  const [xMin, xMax] = niceAxis(0, xHi, 7);
  const qLo = Math.min(spOk ? sp.q1 : Infinity, tpOk ? tp.q1 : Infinity);
  const qHi = Math.max(spOk ? sp.q3 : -Infinity, tpOk ? tp.q3 : -Infinity);
  const yPad = (qHi - qLo) * 100 * 0.10 || 1;
  const [yMin, yMax, yStep] = niceAxis(qLo * 100 - yPad, qHi * 100 + yPad, 6);
  const yTicks = [];
  for (let t = yMin; t <= yMax + 1e-9; t += yStep) yTicks.push(+t.toFixed(2));

  const N = 80;
  const data = Array.from({ length: N + 1 }, (_, i) => {
    const kwp = xMin + (xMax - xMin) * i / N;
    const pt = { kwp: +kwp.toFixed(3) };
    if (spOk) pt.sp = +(grossMarginCurve(kwp, params, 'single') * 100).toFixed(3);
    if (tpOk) pt.tp = +(grossMarginCurve(kwp, params, 'three') * 100).toFixed(3);
    return pt;
  });
  const noInvSp = grossMarginNoInverter(params, 'single');
  const noInvTp = grossMarginNoInverter(params, 'three');

  return (
    <div style={rsStyles.wrap}>
      <div style={rsStyles.caption}>
        Gross margin vs solar array capacity, per phase. Derived from the anchors above; nothing
        here is stored. Outlined points are each phase&rsquo;s anchors; each curve is flat at its
        floor and ceiling. The curve prices the Solar Panels line <strong>only when panels ship
        with an inverter</strong>; components set to &ldquo;Follow panels curve&rdquo; ride the
        curve of the order&rsquo;s phase on those orders only. A panels-only order prices at its
        phase&rsquo;s no-inverter margin ({(noInvSp * 100).toFixed(1)}% single-phase,
        {' '}{(noInvTp * 100).toFixed(1)}% three-phase); every order missing panels or an inverter
        uses each component&rsquo;s Otherwise margin.
        {!spOk && ' (Single-phase anchors invalid — that curve is hidden.)'}
        {!tpOk && ' (Three-phase anchors invalid — that curve is hidden.)'}
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, left: 0, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} />
            <XAxis dataKey="kwp" type="number" domain={[xMin, xMax]} allowDecimals={false}
                   tick={{ fontSize: 11 }}
                   label={{ value: 'Solar array capacity (kWp)', position: 'insideBottom', offset: -4, fontSize: 11 }} />
            <YAxis type="number" domain={[yMin, yMax]} ticks={yTicks} tick={{ fontSize: 11 }}
                   tickFormatter={v => `${v}%`} width={44} />
            <Tooltip formatter={(v, name) => [`${(+v).toFixed(2)}%`, name === 'sp' ? 'Single-phase' : 'Three-phase']}
                     labelFormatter={l => `${(+l).toFixed(2)} kWp`} />
            <Legend formatter={v => (v === 'sp' ? 'Single-phase' : 'Three-phase')} />
            {spOk && <Line type="monotone" dataKey="sp" stroke="#1b8a5a" strokeWidth={2} dot={false} isAnimationActive={false} />}
            {tpOk && <Line type="monotone" dataKey="tp" stroke="#B45309" strokeWidth={2} dot={false} isAnimationActive={false} />}
            {spOk && [[sp.x1, sp.q1], [sp.x2, sp.q2], [sp.x3, sp.q3]].map(([x, q], i) => (
              <ReferenceDot key={`sp${i}`} x={x} y={+(q * 100).toFixed(2)} r={4.5}
                            fill="#1b8a5a" stroke="#fff" strokeWidth={1.5} />
            ))}
            {tpOk && [[tp.x1, tp.q1], [tp.x2, tp.q2], [tp.x3, tp.q3]].map(([x, q], i) => (
              <ReferenceDot key={`tp${i}`} x={x} y={+(q * 100).toFixed(2)} r={4.5}
                            fill="#B45309" stroke="#fff" strokeWidth={1.5} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── v3-191 · Component gross-margin table (B–Q) ─────────────────────────────
// Edits ONE structured param (componentMargins). Follow/Fixed applies on
// full-system orders only (panels + inverter); Otherwise covers every order
// missing either leg. N never prices on a full system, so it carries a single
// margin and shows no mode control. Margins are stored as fractions and edited
// in whole/half percent, clamped to [0, 99] — the [0,1) save rule is enforced
// by the pre-save validator and the server, this clamp is the input layer.
const COMPONENT_LABELS = {
  B: ['Single-Phase Cabling Bundle', '% of panels — notional COGS = tier pct × panels COGS'],
  C: ['Three-Phase Cabling Bundle',  '% of panels — notional COGS = tier pct × panels COGS'],
  D: ['Additional DC Cable',         'per metre beyond the included 30 m'],
  E: ['Additional AC Cable',         'per metre beyond the included 10 m'],
  F: ['Labor & Installation',        'per kWp'],
  G: ['RSD — Variable Charge',       'per panel; standalone RSD orders price at Otherwise'],
  H: ['RSD — Fixed Transmitter',     'standalone RSD orders price at Otherwise'],
  I: ['Single-Phase Inverters',      'inverter-only orders price at Otherwise'],
  J: ['Three-Phase Inverters',       'inverter-only orders price at Otherwise'],
  K: ['Battery Package',             'all six package prices incl. both labor variants'],
  L: ['Misc Catalog',                'one margin for every row; reversals stay sign-symmetric'],
  M: ['Location / Delivery',         'Luzon >30 km pair and every dynamic row'],
  N: ['Standalone Retrofit Charges', 'only prices in no-panel orders — single margin'],
  O: ['Fixed Overhead',              'all five overhead lines'],
  P: ['Mounting Support',            'max(floor, 13% of panels) — decided in COGS space, then priced'],
  Q: ['Roof Preparation',            'asphalt / concrete per kWp'],
};

function ComponentMarginsTable({ componentMargins, canEdit, onChange, mdr }) {
  const cm = componentMargins || {};
  const setRow = (id, patch) => {
    if (!canEdit) return;
    onChange({ ...cm, [id]: { ...(cm[id] || {}), ...patch } });
  };
  const pct = (v) => Number.isFinite(v) ? Number((v * 100).toFixed(4)) : 0;
  const clampPct = (v) => Math.max(0, Math.min(99, v)) / 100;
  const th = { textAlign: 'left', padding: '7px 8px', borderBottom: `2px solid ${COLORS.divider}`,
               fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em',
               color: COLORS.textMuted, whiteSpace: 'nowrap' };
  const td = { padding: '7px 8px', borderBottom: `1px solid ${COLORS.divider}`, verticalAlign: 'top' };
  const retained = (1.12 * (1 - (mdr || 0)) - 0.12);

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 4 }}>
        Component gross margins
      </div>
      <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.6, marginBottom: 10 }}>
        <strong>Full system</strong> — the order includes both solar panels and at least one
        inverter — is the only case where Follow / Fixed applies; &ldquo;Follow&rdquo; rides the
        curve of the order&rsquo;s phase. <strong>Otherwise</strong> applies whenever either leg
        is missing: panels without an inverter, inverter-only, battery / RSD standalone. Direct
        Purchase Price for every line: ⌈ COGS × 1.12 ÷ (1 − margin) ÷ {retained.toFixed(4)} ⌉;
        for B, C, and P the COGS is <em>notional</em> — the percentage applied to the
        panels&rsquo; COGS.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 30 }}></th>
              <th style={th}>Component</th>
              <th style={{ ...th, width: 180 }}>Full system (panels + inverter)</th>
              <th style={{ ...th, width: 110 }}>Fixed margin</th>
              <th style={{ ...th, width: 110 }}>Otherwise</th>
            </tr>
          </thead>
          <tbody>
            {COMPONENT_MARGIN_IDS.map(id => {
              const [label, hint] = COMPONENT_LABELS[id] || [id, ''];
              const r = cm[id] || {};
              const single = id === 'N';
              const isFixed = r.mode === 'fixed';
              return (
                <tr key={id}>
                  <td style={{ ...td, fontWeight: 700, color: COLORS.textMuted }}>{id}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{label}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.5 }}>{hint}</div>
                  </td>
                  {single ? (
                    <td style={{ ...td, fontSize: 11.5, color: '#9CA3AF' }} colSpan={2}>
                      — never prices on a full system —
                    </td>
                  ) : (
                    <React.Fragment>
                      <td style={td}>
                        {canEdit ? (
                          <Select value={r.mode === 'fixed' ? 'fixed' : 'follow'}
                                  onChange={v => setRow(id, { mode: v })}
                                  width={168}
                                  options={[
                                    { value: 'follow', label: 'Follow panels curve' },
                                    { value: 'fixed',  label: 'Fixed margin' },
                                  ]} />
                        ) : (
                          <span>{isFixed ? 'Fixed margin' : 'Follow panels curve'}</span>
                        )}
                      </td>
                      <td style={td}>
                        {canEdit && isFixed ? (
                          <NumberInput value={pct(r.fixed)} onChange={v => v != null && setRow(id, { fixed: clampPct(v) })}
                                       step={0.5} min={0} max={99} suffix="%" width={92} />
                        ) : (
                          <span style={{ color: isFixed ? '#111827' : '#C4C8CF' }}>
                            {pct(r.fixed).toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </React.Fragment>
                  )}
                  <td style={td}>
                    {canEdit ? (
                      <NumberInput value={pct(r.otherwise)} onChange={v => v != null && setRow(id, { otherwise: clampPct(v) })}
                                   step={0.5} min={0} max={99} suffix="%" width={92} />
                    ) : (
                      <span>{pct(r.otherwise).toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── v3-191 · Full-system DP-per-kWp chart (one per phase) ───────────────────
// Plots the Direct Purchase Price PER kWp of the full-system bundle —
// Panels + Cabling (B/C) + Labor (F) + Fixed Overhead (O) + Mounting (P) +
// recommended in-stock Inverters (I/J) — one point per whole panel count, so
// Product can see whether per-kWp pricing runs flat, rising, or falling as
// systems grow. Everything is computed through the SHIPPED engine functions
// (grossMarginCurve, componentMarginFor, directFromCogs, cablingTotalPct,
// recommendInverters) against the LIVE params/inventory, so the chart is a
// view of the engine, not a reimplementation (v3-172/178 grid precedent).
//
// X-axis starts at the Product minimum system size (minSystemKwp, v3-68) —
// the smallest array a quote can carry — at this phase's panel-count
// equivalent, exactly as computeRecommendedPanels floors it.
//
// STOCK: inverters come from availableInverters(phase) — the same chokepoint
// the recommendation engine and Step 2C read; out-of-stock SKUs never appear.
// If the phase has NO in-stock inverters, a full system cannot be quoted, so
// the chart reprices every point as a PANELS-WITHOUT-INVERTER order (panels at
// the phase's no-inverter margin, all other components at Otherwise) and says
// so — charting full-system margins there would show a price no customer can
// be quoted (approved handling, Pat).
function FullSystemPerKwpChart({ params, phase }) {
  const three = phase === 'three';
  const ps = three ? PANEL_SETTINGS.threePhase : PANEL_SETTINGS.singlePhase;
  const label = three ? 'Three-Phase' : 'Single-Phase';
  const cabId = three ? 'C' : 'B';
  const invId = three ? 'J' : 'I';

  const q1 = three ? params.grossMarginMinTp : params.grossMarginMin;
  const q2 = three ? params.grossMarginMidTp : params.grossMarginMid;
  const q3 = three ? params.grossMarginMaxTp : params.grossMarginMax;
  const x1 = three ? params.grossMarginMinKwpTp : params.grossMarginMinKwp;
  const x2 = three ? params.grossMarginMidKwpTp : params.grossMarginMidKwp;
  const x3 = three ? params.grossMarginMaxKwpTp : params.grossMarginMaxKwp;
  const anchorsOk = [q1, q2, q3, x1, x2, x3].every(Number.isFinite)
    && q1 < q2 && q2 < q3 && x1 < x2 && x2 < x3;
  if (!anchorsOk) return null;   // the curve preview above already shows the warning
  if (ps.available === false) {
    return (
      <div style={rsStyles.wrap}>
        <div style={rsStyles.caption}>
          <strong>{label} full-system price per kWp</strong> — hidden: the {label.toLowerCase()}
          {' '}panel is marked out of stock in Inventory, so no {label.toLowerCase()} system can
          be quoted at all.
        </div>
      </div>
    );
  }

  const stock = availableInverters(phase);
  const stockedOut = stock.length === 0;
  const noInv = grossMarginNoInverter(params, phase);
  // v3-192 — include/exclude-inverters view toggle (user-directed, Pat; the
  // rev-4 mockup control, now a first-class option instead of a stock
  // simulation). UNCHECKED reprices the whole chart as a PANELS-WITHOUT-
  // INVERTER order — panels at the phase's no-inverter margin, every other
  // component at Otherwise, no inverter hardware in the bundle — because
  // that is the only inverter-less shape the engine can actually quote; a
  // "full-system margin without the inverter" price exists for no customer.
  // A real stock-out FORCES the excluded view and disables the checkbox: the
  // included view would chart quotes that cannot be issued.
  const [inclInverters, setInclInverters] = React.useState(true);
  const panelsOnly = stockedOut || !inclInverters;
  const fullSystem = !panelsOnly;

  const watts = ps.panelWatts, cogsEa = ps.panelCogs;
  const nMin = Math.max(1, Math.ceil(((params.minSystemKwp || 0) * 1000) / watts));
  const nMax = Math.max(nMin + 4, Math.ceil((x3 * 1.15 * 1000) / watts));
  const OVERHEAD = ['fixedOverheadDeliveryLogisticsCogs', 'fixedOverheadWarehouseCogs',
                    'fixedOverheadCustomsCogs', 'fixedOverheadSafetySupervisionCogs',
                    'fixedOverheadTestingCogs'];
  const data = [];
  for (let n = nMin; n <= nMax; n++) {
    const kwp = (n * watts) / 1000;
    const gmA = panelsOnly ? noInv : grossMarginCurve(kwp, params, phase);
    const gmOf = (id) => componentMarginFor(id, params, fullSystem, gmA);
    const dpA = n * directFromCogs(cogsEa, params, gmA);
    const dpCab = directFromCogs(cablingTotalPct(n, params, phase) * n * cogsEa, params, gmOf(cabId));
    const dpF = kwp * directFromCogs(params.laborInstallationPerKwpCogs, params, gmOf('F'));
    const gmO = gmOf('O');
    const dpO = OVERHEAD.reduce((s, k) => s + directFromCogs(params[k], params, gmO), 0);
    const dpP = directFromCogs(
      Math.max(params.mountingSupportFloorCogs, params.mountingSupportPctOfPanels * n * cogsEa),
      params, gmOf('P'));
    const gmInv = gmOf(invId);
    const slots = panelsOnly ? [] : recommendInverters(kwp, phase).filter(Boolean);
    const dpInv = slots.reduce((s, inv) => s + directFromCogs(inv.cogs, params, gmInv), 0);
    data.push({
      kwp: +kwp.toFixed(2),
      perKwp: Math.round((dpA + dpCab + dpF + dpO + dpP + dpInv) / kwp),
      inverters: slots.length ? slots.map(i => `${i.ratedKw} kW`).join(' + ')
                              : (stockedOut ? 'none in stock' : 'excluded'),
    });
  }

  const stroke = three ? '#B45309' : '#1D4ED8';
  return (
    <div style={rsStyles.wrap}>
      <div style={rsStyles.caption}>
        <strong>{label} {panelsOnly ? 'panels-without-inverter' : 'full-system'} price per kWp</strong>
        {' '}— Panels + Cabling Bundle + Labor + Fixed Overhead + Mounting
        {panelsOnly ? '' : ' + recommended in-stock inverters'}, one point per whole panel
        count ({watts} W panels{params.minSystemKwp > 0
          ? `; X-axis starts at the ${params.minSystemKwp} kWp minimum system size — ${nMin} panels on this phase`
          : ''}).{panelsOnly ? '' : ` Inverters are sized by the live recommendation algorithm — hover any point to
        see the picked units. Steps are inverter SKU jumps; knees are cabling tier anchors and
        the mounting floor crossover.`}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
                      color: stockedOut ? '#9CA3AF' : '#374151', marginBottom: 8,
                      cursor: stockedOut ? 'not-allowed' : 'pointer', userSelect: 'none' }}>
        <input type="checkbox"
               checked={inclInverters && !stockedOut}
               disabled={stockedOut}
               onChange={e => setInclInverters(e.target.checked)} />
        Include recommended inverters (full-system pricing)
      </label>
      {panelsOnly && !stockedOut && (
        <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: '#F3F4F6',
                      border: '1px solid #E5E7EB', fontSize: 12, color: '#4B5563',
                      lineHeight: 1.55, marginBottom: 8 }}>
          Inverters excluded — the chart prices every point as a
          {' '}<strong>panels-without-inverter</strong> order, the only inverter-less shape the
          engine can quote: panels at this phase&rsquo;s no-inverter margin
          ({(noInv * 100).toFixed(1)}%), all other components at their Otherwise margins.
          Follow / Fixed settings and the phase curve do not apply to this view.
        </div>
      )}
      {stockedOut && (
        <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: '#FFFBEB',
                      border: '1px solid #FCD34D', fontSize: 12, color: '#92400E',
                      lineHeight: 1.55, marginBottom: 8 }}>
          No {label.toLowerCase()} inverters are in stock — a full system cannot be quoted on
          this phase. The chart prices every point as a <strong>panels-without-inverter</strong>
          {' '}order: panels at this phase&rsquo;s no-inverter margin ({(noInv * 100).toFixed(1)}%),
          all other components at their Otherwise margins. Follow / Fixed settings and the phase
          curve do not apply while stock is empty.
        </div>
      )}
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, left: 12, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} />
            <XAxis dataKey="kwp" type="number" domain={['dataMin', 'dataMax']}
                   tick={{ fontSize: 11 }}
                   label={{ value: 'Solar array capacity (kWp)', position: 'insideBottom', offset: -4, fontSize: 11 }} />
            <YAxis type="number" domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={74}
                   tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v, k, item) => [
                `PHP ${Number(v).toLocaleString('en-PH')} / kWp — inverters: ${item?.payload?.inverters}`,
                'DP per kWp']}
              labelFormatter={l => `${l} kWp`} />
            <Line type="monotone" dataKey="perKwp" stroke={stroke} strokeWidth={2}
                  dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
