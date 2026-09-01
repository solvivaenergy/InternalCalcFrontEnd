// =============================================================================
// ADMIN SHARED — helper components used by AdminShell + Inventory + tab pages
// -----------------------------------------------------------------------------
// In v3-54 the single-page Admin Parameters editor was split into three tabs
// (Inventory / Engineering / Product) with one global save bar. The helpers
// here are shared across all three tab pages:
//
//   • Section            — section heading + read-only-for-your-role badge
//   • Param              — single editable parameter row (peso / pct / num)
//   • CablingTierTable   — 12-row % allocation editor (Inventory tab)
//   • BatteryPackagesEditor — N-package list with 9 fields each (Inventory tab)
//   • PromoCodesTable    — promo code list (Product tab)
//   • MinDpTiersTable    — tiered minimum-DP editor (Product tab, v3-75)
//   • ContactGatePasswordToggle — Maintenance Mode checkbox (above tabs)
//
// All styling lives here too (Param row, Section heading, table styles) and
// is re-exported as `adminStyles` for tab pages that need to extend it.
// =============================================================================

import { directFromCogs, signedDirectFromCogs } from '../lib/calculations.js';
import React from 'react';
import { COLORS, fmt, NumberInput } from './ui.jsx';
import { cablingTierTotal, cablingTierRequiredTotal } from '../lib/calculations.js';
// v3-178 — the test row's figures come from the ENGINE, never a local copy
// (v3-144 post-mortem, fifth application).
import { cablingComponentPcts, cablingInterpolationSpan, cablingTotalPct,
         CABLING_COMPONENT_FIELDS } from '../lib/calculations.js';
import { PACKAGE_CATEGORIES, normalizeCategory,
         PROMO_TYPES, normalizePromoType } from '../data/adminParams.js';   // v3-150 / v3-151

// ─── Section heading ───────────────────────────────────────────────────────
export function Section({ title, canEdit, anyEditRole, children }) {
  const showBadge = anyEditRole && !canEdit;
  return (
    <section style={adminStyles.section}>
      <div style={adminStyles.sectionHeader}>
        <h2 style={adminStyles.sectionTitle}>{title}</h2>
        {showBadge && (
          <span style={adminStyles.readOnlyBadge}>Read-only for your role</span>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── Param row ─────────────────────────────────────────────────────────────
// v3-83 — `derived` renders a read-only computed value to the RIGHT of the
// editor, with an arrow between. Used for the COGS → Direct Purchase Price rows:
// Engineering types the COGS, the price appears live beside it and cannot be
// edited (it isn't stored anywhere — it's computed from COGS + the two Product
// margin levers).
// v3-190 — `cogs` (boolean) replaces the v3-107 `derived` prop on every row
// that lost its reference Direct Purchase price display: it keeps the
// "COGS (pre-VAT)" caption (which told the admin WHICH number the field holds)
// without rendering a price. The derived arrow-and-price column is REMOVED
// from Param entirely — no call site remained, and shipping the markup kept
// the banned string in the bundle (caught by smoke E-audit). The FinCo tab's
// imputed-maintenance preview is its own table, not a Param pathway.
export function Param({ label, value, onChange, canEdit, isPct, isPeso, suffix, step, hint, min, max, cogs, decimals }) {
  const displayValue = isPct ? Number((value * 100).toFixed(4)) : value;
  const displayStep = isPct ? (step * 100) : step;
  // v3-185 — `isPeso` hard-rounded to whole pesos and forced step=1. Correct
  // for all 39 whole-peso cost fields, WRONG for a ₱/kWh tariff: the DU
  // inflation reference rates are published to four decimals, and ₱9.8165 was
  // being shown as ₱10 while the stored value stayed 9.8165. Nothing was
  // corrupted on load — blur only commits when clamping moves the value — but
  // an admin editing the field started from the ROUNDED draft, and the
  // read-only view showed ₱10 beside a 4.90% rate derived from 9.8165, which
  // reads as a bug and invites "correcting" the right number.
  // `decimals` is opt-in so every existing peso field keeps its exact behaviour.
  const pesoDecimals = (isPeso && typeof decimals === 'number' && decimals > 0)
    ? decimals : 0;
  let editorValue;
  if (isPeso) {
    editorValue = (value == null) ? null
                : pesoDecimals ? value
                : Math.round(value);
  } else {
    editorValue = displayValue;
  }
  // A four-decimal tariff must step by the caller's step (0.0001), not by ₱1 —
  // otherwise the browser spinner and arrow keys jump a whole peso.
  const editorStep = (isPeso && !pesoDecimals) ? 1 : displayStep;
  const onChangeWrap = (v) => {
    if (!canEdit) return;
    if (v == null) return;
    let clamped = v;
    if (typeof min === 'number') clamped = Math.max(min, clamped);
    if (typeof max === 'number') clamped = Math.min(max, clamped);
    onChange(isPct ? clamped / 100 : clamped);
  };

  return (
    <div style={adminStyles.paramRow}>
      <div style={adminStyles.paramLabelCol}>
        <div style={adminStyles.paramLabel}>{label}</div>
        {hint && <div style={adminStyles.paramHint}>{hint}</div>}
      </div>
      <div style={adminStyles.paramValueCol}>
        {canEdit ? (
          <NumberInput
            value={editorValue}
            onChange={onChangeWrap}
            step={editorStep}
            min={min}
            max={max}
            prefix={isPeso ? '₱' : null}
            suffix={isPct ? '%' : suffix}
            decimals={pesoDecimals || undefined}
            width={140}
          />
        ) : (
          <div style={adminStyles.paramValueRO}>
            {isPct ? `${(value * 100).toFixed(2)}%` :
             isPeso ? (pesoDecimals
                        ? `\u20B1${Number(value).toLocaleString('en-PH', {
                            minimumFractionDigits: pesoDecimals,
                            maximumFractionDigits: pesoDecimals })}`
                        : fmt.peso(Math.round(value))) :
             `${fmt.num(value)}${suffix ? ' ' + suffix : ''}`}
          </div>
        )}
        {/* v3-107 — a derived value marks this as a COGS → price row; caption
            tells the admin WHICH number they're entering (user-directed: the
            tables carry "COGS (pre-VAT)" column headers, Param rows carried
            nothing). Editable rows get the imperative; read-only roles just
            get the noun. */}
        {cogs && (
          <div style={adminStyles.cogsCaption}>
            {canEdit ? 'COGS (pre-VAT) — enter here' : 'COGS (pre-VAT)'}
          </div>
        )}
      </div>
    </div>
  );
}

// v3-94 — a margin anchor and its capacity breakpoint on ONE row, side by side,
// so the pairing is unambiguous (was two stacked Param rows). Left: the anchor
// label + hint. Right: the margin % input, "at", then the kWp input.
export function MarginAnchorRow({ label, hint, marginValue, onMargin, kwpValue, onKwp, canEdit }) {
  const setM = (v) => { if (canEdit && v != null) onMargin(Math.max(0, Math.min(99, v)) / 100); };
  const setK = (v) => { if (canEdit && v != null) onKwp(Math.max(0, v)); };
  return (
    <div style={adminStyles.paramRow}>
      <div style={adminStyles.paramLabelCol}>
        <div style={adminStyles.paramLabel}>{label}</div>
        {hint && <div style={adminStyles.paramHint}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {canEdit ? (
          <NumberInput value={Number((marginValue * 100).toFixed(4))} onChange={setM}
                       step={0.5} min={0} max={99} suffix="%" width={96} />
        ) : (
          <div style={{ ...adminStyles.paramValueRO, width: 96 }}>{(marginValue * 100).toFixed(2)}%</div>
        )}
        <span style={{ fontSize: 12, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>at</span>
        {canEdit ? (
          <NumberInput value={kwpValue} onChange={setK}
                       step={1} min={0} suffix="kWp" width={104} />
        ) : (
          <div style={{ ...adminStyles.paramValueRO, width: 104 }}>{fmt.num(kwpValue)} kWp</div>
        )}
      </div>
    </div>
  );
}

// ─── WeightSlider ──────────────────────────────────────────────────────────
// v3-96 — replaces the bare "Tenor weight" NumberInput on the Product tab's
// Interest Rates section. One slider splits the rate-surface blend between the
// DOWN PAYMENT axis and the TENOR axis; the two weights always sum to 100%.
//
// The stored param `rateTenorWeight` (w) is the TENOR weight; the down-payment
// weight is 1 − w (the surface uses `u = w·uT + (1−w)·uDP`). The slider value
// IS the tenor weight in whole percent, so sliding right raises tenor / lowers
// DP. Step 5% keeps the split whole — the rate itself snaps to ⅛-point anyway,
// so finer weight granularity would be meaningless. Writes onChange(fraction)
// exactly as the old NumberInput did — no param key, math, or default change
// (the shipped 0.25 seeds the slider at DP 75% / Tenor 25%).
export function WeightSlider({ tenorWeight, onChange, canEdit }) {
  const tenorPct = Math.max(0, Math.min(100, Math.round((tenorWeight ?? 0) * 100)));
  const dpPct = 100 - tenorPct;
  const setPct = (v) => {
    if (!canEdit) return;
    const p = Math.max(0, Math.min(100, v));
    onChange(Number((p / 100).toFixed(2)));
  };
  return (
    <div style={adminStyles.paramRow}>
      <div style={adminStyles.paramLabelCol}>
        <div style={adminStyles.paramLabel}>Interest rate weighting</div>
        <div style={adminStyles.paramHint}>
          How much each factor moves the rate. The three anchor rates above are never affected.
        </div>
      </div>
      <div style={weightSliderStyles.control}>
        <div style={weightSliderStyles.readouts}>
          <span>
            <span style={weightSliderStyles.dpNum}>{dpPct}%</span>
            <span style={weightSliderStyles.sideLbl}> Down payment</span>
          </span>
          <span>
            <span style={weightSliderStyles.sideLbl}>Tenor </span>
            <span style={weightSliderStyles.tenorNum}>{tenorPct}%</span>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={tenorPct}
          disabled={!canEdit}
          onChange={(e) => setPct(parseInt(e.target.value, 10))}
          aria-label="Tenor weight percentage"
          style={{
            ...weightSliderStyles.range,
            ...(canEdit ? null : weightSliderStyles.rangeDisabled),
          }}
        />
        <div style={weightSliderStyles.endLbls}>
          <span>← down-payment driven</span>
          <span>tenor driven →</span>
        </div>
      </div>
    </div>
  );
}

const weightSliderStyles = {
  control: { width: 300 },
  readouts: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 6,
  },
  dpNum: { fontSize: 17, fontWeight: 700, color: COLORS.brandGreen,
           fontVariantNumeric: 'tabular-nums' },
  tenorNum: { fontSize: 17, fontWeight: 700, color: '#E87722',
              fontVariantNumeric: 'tabular-nums' },
  sideLbl: { fontSize: 12, color: COLORS.textMuted },
  range: { width: '100%', accentColor: COLORS.brandGreen, cursor: 'pointer' },
  rangeDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  endLbls: {
    display: 'flex', justifyContent: 'space-between', marginTop: 3,
    fontSize: 10, color: COLORS.textMuted,
  },
};

// ─── ContactGatePasswordToggle ─────────────────────────────────────────────
// Maintenance Mode checkbox. v3-54: rendered ABOVE the admin tab bar, not
// inside any tab — always visible whether the admin is on Inventory,
// Engineering, or Product.
export function ContactGatePasswordToggle({ enabled, onChange, envVarSet, canEdit }) {
  return (
    <div>
      <label style={gateStyles.row}>
        <input
          type="checkbox"
          checked={!!enabled}
          onChange={(e) => onChange(e.target.checked)}
          disabled={!canEdit}
          style={gateStyles.checkbox}
        />
        <span style={gateStyles.labelText}>
          Restrict access with a password
        </span>
      </label>
      <div style={gateStyles.hint}>
        When ON, customers see an "Under Maintenance" notice and must enter a
        password to access the calculator. When OFF, the calculator is fully
        open to all visitors. Useful for restricting access during scheduled
        maintenance, large updates, or beta windows — no redeploy needed.
      </div>
      {!envVarSet && (
        <div style={gateStyles.envWarn}>
          <strong>Note:</strong> The <code>VITE_MAINTENANCE_PASSWORD</code>{' '}
          environment variable is not set on Netlify, so the password screen
          will not appear regardless of this toggle. Set the env var and
          redeploy to enable password-protected maintenance mode.
        </div>
      )}
      {envVarSet && (
        <div style={gateStyles.envOk}>
          <strong>Status:</strong> A maintenance-mode password is configured
          on Netlify. To rotate it, update the{' '}
          <code>VITE_MAINTENANCE_PASSWORD</code> env var and trigger a redeploy.
        </div>
      )}
    </div>
  );
}

const gateStyles = {
  row: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
         fontSize: 14, fontWeight: 500, color: COLORS.textBody, marginBottom: 8 },
  checkbox: { width: 18, height: 18, cursor: 'pointer', accentColor: COLORS.brandGreen },
  labelText: { userSelect: 'none' },
  hint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 1.55,
          marginBottom: 12, paddingLeft: 28 },
  envWarn: { marginTop: 4, padding: '10px 14px', backgroundColor: '#FFFBEB',
             border: '1px solid #FCD34D', borderRadius: 6, fontSize: 12,
             color: '#854F0B', lineHeight: 1.55 },
  envOk: { marginTop: 4, padding: '10px 14px', backgroundColor: '#F0F9FF',
           border: '1px solid #BAE6FD', borderRadius: 6, fontSize: 12,
           color: '#075985', lineHeight: 1.55 },
};

// ─── CablingTierTable ──────────────────────────────────────────────────────
// v3-174 — PER-FIELD MONOTONICITY FLOORS (user-directed, Pat; mockup approved).
// Cabling cost is pct × panels × panelPrice, so each row's cost at its own
// minPanels is an anchor and the ladder must never step down. The floor per
// row comes from cablingTierRequiredTotal() (the engine's own definition —
// never a local copy); each FIELD then shows the least it may hold given its
// three siblings: max(0, requiredTotal − sum(others)).
//
// Enforcement is BLUR-SNAP, not per-keystroke (typing "1" en route to "15"
// must not fight the admin): the field turns red while below its floor and
// snaps UP to the floor on blur. Hard clamping alone cannot cover the cascade
// cases — raising an EARLIER row, editing a panel count, or deleting a row can
// strand a LATER row below a floor the admin never touched — so violating rows
// also flag in place with a one-click "Raise total to minimum" (Option A, per
// Pat: the whole shortfall lands on Conduits, the largest component, rounded
// UP to whole points, so exactly one number visibly changes and the fix is
// auditable). AdminShell blocks Save while any row violates; the server
// mirrors the rule with a 400. A stale blob that already violates LOADS and
// flags — it never blocks loading, only saving.
// v3-178 — TEST ROW (user-directed, Pat; mockup approved, five decisions).
// A non-editing row at the foot of each table: type a panel count, read the
// resulting percentage under every component column. `testPanelCount` /
// `onTestPanelCount` are LIFTED to AdminShell so the value survives tab
// switches — and, critically, so that the only writer in the path is admin
// state. There is NO route from this control back into calculator state, which
// is what guarantees the count cannot follow the admin out on logout.
// Rendered only when `canEdit` — which for the 'cabling' section is exactly
// Super Admin + Engineering (decision 1a: Audit and Product do not see it, a
// disabled input on a row whose whole purpose is typing being a dead control).
export function CablingTierTable({ tiers, canEdit, onChange,
                                   testPanelCount = null, onTestPanelCount = null }) {
  const updateRow = (idx, patch) => {
    const next = tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onChange(next);
  };
  const deleteRow = (idx) => {
    if (!window.confirm(`Remove tier starting at ${tiers[idx].minPanels} panels?`)) return;
    onChange(tiers.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    // v3-174 — new rows seed AT their floor in the last row's component
    // proportions, so "+ Add tier" can never itself create a violation.
    const sorted = [...tiers].sort((a, b) => a.minPanels - b.minPanels);
    const lastT = sorted[sorted.length - 1];
    const minPanels = (lastT ? lastT.minPanels : 0) + 50;
    let newRow;
    if (lastT) {
      const tot = cablingTierTotal(lastT);
      const req = tot * lastT.minPanels / minPanels;
      const f = tot > 0 ? req / tot : 0;
      const r2 = (x) => Math.ceil(x * f * 100) / 100;
      newRow = { minPanels, dcCablePct: r2(lastT.dcCablePct), acCablePct: r2(lastT.acCablePct),
                 conduitsPct: r2(lastT.conduitsPct), panelBoardPct: r2(lastT.panelBoardPct) };
    } else {
      newRow = { minPanels, dcCablePct: 0.05, acCablePct: 0.03, conduitsPct: 0.05, panelBoardPct: 0.02 };
    }
    onChange([...tiers, newRow].sort((a, b) => a.minPanels - b.minPanels));
  };
  const fixRow = (idx) => {
    // Option A (Pat): shortfall onto Conduits, rounded up to a whole point.
    const short = cablingTierRequiredTotal(tiers, idx) - cablingTierTotal(tiers[idx]);
    if (short <= 0) return;
    const conduits = Math.ceil((tiers[idx].conduitsPct + short) * 100) / 100;
    updateRow(idx, { conduitsPct: conduits });
  };
  const pctInputStyle = {
    width: 56, padding: '4px 6px', textAlign: 'right',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  };
  const pctInputBad = { ...pctInputStyle, border: '1px solid #B91C1C', backgroundColor: '#FEE2E2' };
  const numInputStyle = { ...pctInputStyle, width: 70 };
  const minStyle = { fontSize: 10.5, color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' };
  const minTight = { ...minStyle, color: '#B45309', fontWeight: 600 };
  const minFree  = { ...minStyle, color: '#A8A29E' };

  const FIELDS = ['dcCablePct', 'acCablePct', 'conduitsPct', 'panelBoardPct'];
  // Sorted VIEW indices → real indices, so floors always read off the ladder
  // in panel order even while an edited minPanels is mid-flight.
  const order = tiers.map((t, i) => i).sort((a, b) => tiers[a].minPanels - tiers[b].minPanels);
  const sorted = order.map(i => tiers[i]);

  // ─── v3-178 · test row derivation ─────────────────────────────────────────
  // Gated on canEdit (Super Admin + Engineering for 'cabling') AND on the
  // setter actually being wired, so a caller that has not adopted the props
  // renders exactly the pre-v3-178 table rather than a broken half-row.
  const showTestRow = canEdit && typeof onTestPanelCount === 'function';
  const testN = Math.max(1, testPanelCount || 1);
  const testPcts = showTestRow ? cablingComponentPcts(testN, tiers) : [];
  // The TOTAL cell reads the ENGINE, not the sum of the four cells above it.
  // cablingTotalPct takes (panelCount, adminParams, phase) and picks a table
  // off adminParams, so it is handed a synthetic params object carrying THIS
  // table as the single-phase list — the same numbers a quote would price,
  // without this component needing to know which phase it is rendering.
  const testTotal = showTestRow
    ? cablingTotalPct(testN, { cablingTiers: tiers, cablingTiersThreePhase: [] }, 'single')
    : 0;
  const testSpan = showTestRow ? cablingInterpolationSpan(testN, tiers) : null;
  const testCaption = !testSpan ? ''
    : testSpan.flat === 'below'
      ? `Flat \u2014 at or below the ${testSpan.anchor}-panel anchor, so every count here prices identically.`
      : testSpan.flat === 'above'
        ? `Flat \u2014 at or above the ${testSpan.anchor}-panel anchor; the percentage holds, so cost keeps growing linearly.`
        : `Interpolating between the ${testSpan.from}-panel and ${testSpan.to}-panel anchors.`;
  const testCellTop = { borderTop: `2px solid ${COLORS.brandGreenLight}`, paddingTop: 11 };

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={tableStyles.th}>Panels (≥)</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>DC Cabling</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>AC Cabling</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Conduits &amp; Fittings</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Panel Board &amp; Protective</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>TOTAL</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Min total</th>
            {canEdit && <th style={tableStyles.th} aria-label="actions" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, vi) => {
            const i = order[vi];
            const total = cablingTierTotal(t);
            const required = cablingTierRequiredTotal(sorted, vi);
            const violating = total < required - 1e-9;
            const tight = !violating && vi > 0 && (total - required) < 0.02;
            return (
              <React.Fragment key={i}>
                <tr>
                  <td style={tableStyles.td}>
                    {canEdit ? (
                      <input type="number" style={numInputStyle}
                        value={t.minPanels} step={1} min={1}
                        onChange={e => updateRow(i, { minPanels: parseInt(e.target.value) || 1 })} />
                    ) : t.minPanels}
                  </td>
                  {FIELDS.map(field => {
                    const others = total - t[field];
                    const fieldMin = Math.max(0, required - others);
                    const below = t[field] < fieldMin - 1e-9;
                    return (
                      <td key={field} style={{ ...tableStyles.td, textAlign: 'right' }}>
                        {canEdit ? (
                          <span style={{ display: 'inline-flex', flexDirection: 'column',
                                         alignItems: 'flex-end', gap: 2 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <input type="number" style={below ? pctInputBad : pctInputStyle}
                                value={Math.round(t[field] * 100)} step={1} min={0} max={100}
                                aria-label={`${field} percentage, minimum ${Math.ceil(fieldMin * 100)}%`}
                                onChange={e => updateRow(i, {
                                  [field]: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                                })}
                                onBlur={e => {
                                  // v3-174 blur-snap: a value below the floor snaps UP to it.
                                  const v = Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100));
                                  const fm = Math.max(0,
                                    cablingTierRequiredTotal(sorted, vi) - (cablingTierTotal(t) - t[field]));
                                  if (v < fm - 1e-9) {
                                    updateRow(i, { [field]: Math.ceil(fm * 100) / 100 });
                                  }
                                }} />
                              <span style={{ color: COLORS.textMuted }}>%</span>
                            </span>
                            <span style={vi === 0 ? minFree : (fieldMin <= 0 ? minFree : (tight ? minTight : minStyle))}>
                              {vi === 0 ? 'no floor'
                                : fieldMin <= 0 ? 'free'
                                : `≥ ${Math.ceil(fieldMin * 100)}%`}
                            </span>
                          </span>
                        ) : `${(t[field] * 100).toFixed(0)}%`}
                      </td>
                    );
                  })}
                  <td style={{ ...tableStyles.td, textAlign: 'right', fontWeight: 600,
                               color: violating ? '#B91C1C' : '#15803D' }}>
                    {(total * 100).toFixed(0)}%
                  </td>
                  <td style={{ ...tableStyles.td, textAlign: 'right',
                               ...(tight ? { color: '#B45309', fontWeight: 600 } : { color: COLORS.textMuted }) }}>
                    {vi === 0 ? '—' : `${(Math.ceil(required * 100 * 100) / 100).toFixed(2)}%`}
                  </td>
                  {canEdit && (
                    <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                      {tiers.length > 1 && (
                        <button onClick={() => deleteRow(i)} style={tableStyles.deleteBtn}
                                title="Remove this tier">×</button>
                      )}
                    </td>
                  )}
                </tr>
                {violating && (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7}
                        style={{ ...tableStyles.td, textAlign: 'left', color: '#B91C1C',
                                 fontSize: 11.5, fontWeight: 600, whiteSpace: 'normal' }}>
                      ⚠ This tier prices a {t.minPanels}-panel system cheaper than the{' '}
                      {sorted[vi - 1].minPanels}-panel tier before it — the total must be at least{' '}
                      {(Math.ceil(required * 10000) / 100).toFixed(2)}%.
                      {canEdit && (
                        <button onClick={() => fixRow(i)}
                                style={{ marginLeft: 8, border: '1px solid #B91C1C', background: '#fff',
                                         color: '#B91C1C', borderRadius: 4, padding: '1px 8px',
                                         fontSize: 10.5, cursor: 'pointer' }}>
                          Raise total to minimum
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        {/* ─── v3-178 · TEST ROW ───────────────────────────────────────────
            Percentages only (decision 3 — no peso column). The TOTAL cell
            calls the ENGINE's cablingTotalPct rather than summing the four
            component cells: the two are identical by construction (see the
            proof at cablingComponentPcts) and the smoke suite asserts it, so
            a divergence fails the gate instead of quietly showing Anjon a
            total his own columns contradict. */}
        {showTestRow && (
          <tbody>
            <tr>
              <td style={{ ...tableStyles.td, ...testCellTop }}>
                <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '.08em',
                               textTransform: 'uppercase', color: COLORS.brandGreenLight,
                               fontWeight: 800, marginBottom: 4 }}>Test</span>
                <input type="number" style={numInputStyle}
                  value={testPanelCount == null ? '' : testPanelCount}
                  step={1} min={1}
                  aria-label="Test panel count — preview only, does not affect the calculator"
                  onChange={e => onTestPanelCount(Math.max(1, parseInt(e.target.value, 10) || 1))} />
              </td>
              {testPcts.map((p, ci) => (
                <td key={CABLING_COMPONENT_FIELDS[ci]}
                    style={{ ...tableStyles.td, ...testCellTop, textAlign: 'right',
                             fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {(p * 100).toFixed(2)}%
                </td>
              ))}
              <td style={{ ...tableStyles.td, ...testCellTop, textAlign: 'right',
                           fontWeight: 800, color: '#15803D',
                           fontVariantNumeric: 'tabular-nums' }}>
                {(testTotal * 100).toFixed(2)}%
              </td>
              <td style={{ ...tableStyles.td, ...testCellTop, textAlign: 'right',
                           color: COLORS.textMuted }}>&mdash;</td>
              <td style={{ ...tableStyles.td, ...testCellTop }} />
            </tr>
            <tr>
              <td colSpan={8} style={{ ...tableStyles.td, textAlign: 'left', fontSize: 11,
                                       color: COLORS.textMuted, fontStyle: 'italic',
                                       whiteSpace: 'normal', paddingTop: 0 }}>
                {testCaption} Preview only &mdash; this row changes nothing in the
                calculator and nothing that gets saved.
              </td>
            </tr>
          </tbody>
        )}
      </table>
      {canEdit && (
        <div style={{ marginTop: 12 }}>
          <button onClick={addRow} style={tableStyles.addBtn}>+ Add tier</button>
        </div>
      )}
    </div>
  );
}

// ─── BatteryPackagesEditor (NEW in v3-54) ──────────────────────────────────
// List of N battery packages, each rendered as a card with 9 fields:
//   label / batteryUnitKwh / batteryUnitPrice / batteryRackCapacity /
//   batteryRackPrice / atsPrice / criticalLoadsMaterials /
//   laborWithSolarInstall / standaloneLabor
// × Delete on each card (confirmed); disabled when only 1 pack remains.
// + Add Battery Package below (seeds from pack #1 template, new UUID).
export function BatteryPackagesEditor({ packages, canEdit, onChange, adminParams }) {
  const updatePkg = (idx, patch) => {
    onChange(packages.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };
  const deletePkg = (idx) => {
    if (packages.length <= 1) {
      window.alert('At least one battery package must remain.');
      return;
    }
    const p = packages[idx];
    if (!window.confirm(`Remove battery package "${p.label}"?`)) return;
    onChange(packages.filter((_, i) => i !== idx));
  };
  const addPkg = () => {
    // Seed from first package as a starting template; admin renames + retunes.
    const template = packages[0] || {};
    const newId = 'pkg' + Math.random().toString(36).slice(2, 10);
    const seed = {
      ...template,
      id: newId,
      label: `${template.label || 'New'} (copy)`,
    };
    onChange([...packages, seed]);
  };

  return (
    <div>
      {packages.map((pkg, idx) => (
        <BatteryPackageCard
          key={pkg.id || idx}
          pkg={pkg}
          adminParams={adminParams}
          canEdit={canEdit}
          onUpdate={(patch) => updatePkg(idx, patch)}
          onDelete={() => deletePkg(idx)}
          deleteDisabled={packages.length <= 1}
          index={idx}
        />
      ))}
      {canEdit && (
        <div style={{ marginTop: 16 }}>
          <button onClick={addPkg} style={tableStyles.addBtn}>+ Add Battery Package</button>
        </div>
      )}
    </div>
  );
}

function BatteryPackageCard({ pkg, adminParams, canEdit, onUpdate, onDelete, deleteDisabled, index }) {
  const labelInputStyle = {
    width: 200, padding: '6px 10px',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 14,
    fontWeight: 600,
  };
  return (
    <div style={pkg.available !== false
      ? pkgCardStyles.card
      : { ...pkgCardStyles.card, opacity: 0.65 }}>
      <div style={pkgCardStyles.cardHeader}>
        <div style={pkgCardStyles.cardHeaderLeft}>
          <span style={pkgCardStyles.pkgBadge}>Package {index + 1}</span>
          {canEdit ? (
            <input type="text" style={labelInputStyle}
              value={pkg.label || ''}
              placeholder="Label, e.g. 5 kWh BYD"
              onChange={e => onUpdate({ label: e.target.value })} />
          ) : (
            <span style={pkgCardStyles.labelRO}>{pkg.label || '—'}</span>
          )}
          {/* v3-106 — per-package stock flag. Unchecked ⇒ excluded from the
              optimizer, the Step 2 dropdown, and all fallbacks, without
              losing the package (no delete-and-recreate). */}
          {canEdit ? (
            <label style={pkgCardStyles.stockToggle}
                   title={pkg.available !== false
                     ? 'In stock — offered on quotes'
                     : 'OUT OF STOCK — hidden from quotes'}>
              <input type="checkbox" checked={pkg.available !== false}
                     onChange={e => onUpdate({ available: e.target.checked })}
                     style={pkgCardStyles.stockCheckbox} />
              In stock
            </label>
          ) : (
            <span style={pkg.available !== false
              ? pkgCardStyles.stockBadgeIn : pkgCardStyles.stockBadgeOut}>
              {pkg.available !== false ? 'In stock' : 'Out of stock'}
            </span>
          )}
        </div>
        {canEdit && (
          <button onClick={onDelete}
                  disabled={deleteDisabled}
                  style={{ ...pkgCardStyles.deleteBtn,
                           ...(deleteDisabled ? { opacity: 0.3, cursor: 'not-allowed' } : {}) }}
                  title={deleteDisabled ? 'Cannot delete — at least one package must remain' : `Remove ${pkg.label}`}>×</button>
        )}
      </div>
      <div style={pkgCardStyles.cardBody}>
        <Param label="Battery Unit Capacity" suffix="kWh" step={1}
               value={pkg.batteryUnitKwh}
               onChange={v => onUpdate({ batteryUnitKwh: v })}
               canEdit={canEdit} min={1} max={1000} />
        <Param label="Battery Unit (incl. cables & lugs)" isPeso step={1000}
               value={pkg.batteryUnitCogs}
               cogs
               onChange={v => onUpdate({ batteryUnitCogs: v })}
               canEdit={canEdit} />
        {/* v3-151 — TWO separate questions. rackRequiredFromUnits decides
            WHETHER a rack is quoted at all; batteryRackCapacity decides HOW
            MANY once one is needed. 5 kWh pack at threshold 3 / capacity 3:
            1-2 units none, 3 one, 4-6 two. */}
        <Param label="Battery Rack Capacity" suffix="units per rack" step={1}
               value={pkg.batteryRackCapacity}
               onChange={v => onUpdate({ batteryRackCapacity: v })}
               canEdit={canEdit} min={1} max={20} />
        <Param label="Rack Required From" suffix="units or more" step={1}
               hint="No rack is quoted below this many battery units. 1 = always include one; 0 = this package never takes a rack."
               value={pkg.rackRequiredFromUnits ?? 1}
               onChange={v => onUpdate({ rackRequiredFromUnits: v })}
               canEdit={canEdit} min={0} max={20} />
        <Param label="Battery Rack" isPeso step={500}
               value={pkg.batteryRackCogs}
               cogs
               onChange={v => onUpdate({ batteryRackCogs: v })}
               canEdit={canEdit} />
        <Param label="Automatic Transfer Switch (ATS)" isPeso step={500}
               value={pkg.atsCogs}
               cogs
               onChange={v => onUpdate({ atsCogs: v })}
               canEdit={canEdit} />
        <Param label="Materials for Critical Loads" isPeso step={100}
               hint="Materials for critical-loads sub-panel"
               value={pkg.criticalLoadsMaterialsCogs}
               cogs
               onChange={v => onUpdate({ criticalLoadsMaterialsCogs: v })}
               canEdit={canEdit} />
        <Param label="Battery Labor & Installation w/ Solar Package Installation" isPeso step={500}
               hint="Charged when battery is installed alongside the solar package"
               value={pkg.laborWithSolarInstallCogs}
               cogs
               onChange={v => onUpdate({ laborWithSolarInstallCogs: v })}
               canEdit={canEdit} />
        <Param label="Battery Standalone Labor & Installation" isPeso step={1000}
               hint="Charged when battery is added without a concurrent solar install"
               value={pkg.standaloneLaborCogs}
               cogs
               onChange={v => onUpdate({ standaloneLaborCogs: v })}
               canEdit={canEdit} />
      </div>
    </div>
  );
}

const pkgCardStyles = {
  card: {
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 8,
    padding: '14px 16px 8px',
    marginBottom: 14,
    backgroundColor: '#FAFAF9',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, paddingBottom: 12, marginBottom: 8,
    borderBottom: `1px dashed ${COLORS.divider}`,
  },
  cardHeaderLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  pkgBadge: {
    fontSize: 10, fontWeight: 700, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    border: `1px solid ${COLORS.divider}`, borderRadius: 4,
    padding: '2px 8px', backgroundColor: '#FFFFFF',
  },
  labelRO: { fontSize: 14, fontWeight: 600, color: COLORS.textBody },
  // v3-106 — stock-flag UI
  stockToggle: { display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, color: COLORS.textMuted,
    cursor: 'pointer', userSelect: 'none' },
  stockCheckbox: { width: 15, height: 15, cursor: 'pointer', accentColor: '#15803D' },
  stockBadgeIn: { fontSize: 11, fontWeight: 600, color: '#15803D',
    backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: 8 },
  stockBadgeOut: { fontSize: 11, fontWeight: 600, color: '#B91C1C',
    backgroundColor: '#FEE2E2', padding: '2px 8px', borderRadius: 8 },
  deleteBtn: {
    background: 'transparent', border: `1px solid ${COLORS.divider}`,
    color: '#B91C1C', fontSize: 16, fontWeight: 700,
    width: 28, height: 28, borderRadius: 4, cursor: 'pointer',
    fontFamily: 'inherit', padding: 0, lineHeight: 1,
  },
  cardBody: {},
};

// ─── PromoCodesTable ───────────────────────────────────────────────────────
export function PromoCodesTable({ codes, canEdit, onChange }) {
  const updateRow = (idx, patch) => {
    const next = codes.map((c, i) => i === idx ? { ...c, ...patch } : c);
    onChange(next);
  };
  const deleteRow = (idx) => {
    const c = codes[idx];
    const label = (c.code || '').trim() || c.label || `row ${idx + 1}`;
    if (!window.confirm(`Remove promo code "${label}"?`)) return;
    onChange(codes.filter((_, i) => i !== idx));
  };
  // v3-151 — a new code starts as a percentage, the only type that existed
  // before this release and the one Product reaches for most.
  const addRow = () => onChange([...codes, { code: '', label: '', type: 'percent', discount: 0.05 }]);

  const codeInputStyle = {
    width: 110, padding: '4px 6px',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
  };
  const labelInputStyle = {
    width: '100%', minWidth: 140, padding: '4px 6px',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    boxSizing: 'border-box',
  };
  const pctInputStyle = {
    width: 70, padding: '4px 6px', textAlign: 'right',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div>
      {codes.length === 0 ? (
        <div style={tableStyles.emptyHint}>
          No promo codes configured. {canEdit && 'Click "+ Add promo code" to create one.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={tableStyles.th}>Code</th>
              <th style={tableStyles.th}>Label</th>
              {/* v3-151 — percent or flat peso. */}
              <th style={tableStyles.th}>Type</th>
              <th style={{ ...tableStyles.th, textAlign: 'right' }}>Discount</th>
              {canEdit && <th style={tableStyles.th} aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {codes.map((p, i) => (
              <tr key={i}>
                <td style={tableStyles.td}>
                  {canEdit ? (
                    <input type="text" style={codeInputStyle}
                      value={p.code || ''} placeholder="CODE" maxLength={20}
                      onChange={e => updateRow(i, { code: e.target.value.toUpperCase().trim() })} />
                  ) : <code>{p.code}</code>}
                </td>
                <td style={tableStyles.td}>
                  {canEdit ? (
                    <input type="text" style={labelInputStyle}
                      value={p.label || ''} placeholder="Description"
                      onChange={e => updateRow(i, { label: e.target.value })} />
                  ) : p.label}
                </td>
                <td style={tableStyles.td}>
                  {canEdit ? (
                    <select
                      value={normalizePromoType(p.type)}
                      onChange={e => {
                        // Switching type reinterprets the stored number, so
                        // reset it to a sane default for the new type rather
                        // than leaving 0.05 to read as five centavos or
                        // 25000 to clamp as 100%.
                        const next = e.target.value;
                        updateRow(i, { type: next, discount: next === 'peso' ? 0 : 0.05 });
                      }}
                      style={{ width: 104, padding: '4px 6px', fontSize: 13,
                               background: COLORS.inputTint,
                               border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
                               fontFamily: 'inherit', color: COLORS.textPrimary }}
                    >
                      {PROMO_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span>{(PROMO_TYPES.find(t => t.id === normalizePromoType(p.type)) || {}).label}</span>
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {/* v3-151 — one cell, two meanings. A peso code takes a flat
                      VAT-inclusive amount (NumberInput, so it comma-formats
                      like every other money field); a percent code keeps the
                      0-100 spinner. The engine clamps a peso code to the
                      package price, so an over-large amount nets the quote to
                      zero rather than negative. */}
                  {canEdit ? (
                    normalizePromoType(p.type) === 'peso' ? (
                      <NumberInput compact width={110} prefix="₱" step={500} min={0}
                        value={p.discount ?? 0}
                        onChange={v => updateRow(i, {
                          discount: Number.isFinite(v) ? Math.max(0, Math.round(v * 100) / 100) : 0,
                        })} />
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <input type="number" style={pctInputStyle}
                          value={Math.round((p.discount || 0) * 1000) / 10}
                          step={0.5} min={0} max={100}
                          onChange={e => updateRow(i, {
                            discount: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                          })} />
                        <span style={{ color: COLORS.textMuted }}>%</span>
                      </span>
                    )
                  ) : (
                    normalizePromoType(p.type) === 'peso'
                      ? fmt.peso(p.discount || 0) : fmt.pct(p.discount, 0)
                  )}
                </td>
                {canEdit && (
                  <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                    <button onClick={() => deleteRow(i)} style={tableStyles.deleteBtn}
                            title="Remove this promo code">×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <div style={{ marginTop: 12 }}>
          <button onClick={addRow} style={tableStyles.addBtn}>+ Add promo code</button>
        </div>
      )}
    </div>
  );
}

// ─── MinDpTiersTable (v3-75) ────────────────────────────────────────────────
// Tiered minimum-down-payment editor (Product tab → Quote Limits). Each row is
// { fromNetPrice, minDpPct }: the tier applies to quotes whose "Net Price
// (before DP Discount)" (AI9) is ≥ fromNetPrice and < the next row's
// threshold. Row 0 is the BASE TIER — its threshold is locked at ₱0 and the
// row cannot be deleted, so a floor always resolves. The computed read-only
// "Applies to" column spells out each tier's effective peso range so
// off-by-one questions (does ₱500,000 exactly fall in tier 1 or 2?) answer
// themselves: a row's range STARTS at its own threshold. Ascending-order
// violations get a red input + inline message here AND block Save via
// AdminShell's validation chain AND are rejected server-side — three layers,
// same rule. Max 10 rows (server-enforced; the add button hides at the cap).
export function MinDpTiersTable({ tiers, canEdit, onChange }) {
  const rows = Array.isArray(tiers) && tiers.length > 0
    ? tiers
    : [{ fromNetPrice: 0, minDpPct: 0 }];

  const updateRow = (idx, patch) => {
    const next = rows.map((t, i) => i === idx ? { ...t, ...patch } : t);
    // Row 0's threshold is structurally pinned at 0 whatever happens.
    next[0] = { ...next[0], fromNetPrice: 0 };
    onChange(next);
  };
  const deleteRow = (idx) => {
    if (idx === 0) return; // base tier is undeletable
    const t = rows[idx];
    if (!window.confirm(
      `Remove the tier starting at ₱${fmt.num(t.fromNetPrice || 0, 0)} (${Math.round((t.minDpPct || 0) * 100)}% minimum)?`
    )) return;
    onChange(rows.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    const last = rows[rows.length - 1];
    onChange([...rows, {
      fromNetPrice: (Number(last.fromNetPrice) || 0) + 500000,
      minDpPct: last.minDpPct || 0,
    }]);
  };

  // Per-row ascending check (row i must strictly exceed row i-1). Row 0 is
  // pinned at 0 so it can never violate.
  const rowError = (i) =>
    i > 0 && !((Number(rows[i].fromNetPrice) || 0) > (Number(rows[i - 1].fromNetPrice) || 0))
      ? `Must exceed ₱${fmt.num(rows[i - 1].fromNetPrice || 0, 0)} (Tier ${i})`
      : null;

  // Computed "Applies to" range text. A row's range runs from its own
  // threshold up to (next threshold − 1); the last row is open-ended.
  const appliesTo = (i) => {
    const from = Number(rows[i].fromNetPrice) || 0;
    if (rowError(i)) return '—';
    const next = rows[i + 1];
    if (!next || rowError(i + 1)) return `₱${fmt.num(from, 0)} and above`;
    const to = (Number(next.fromNetPrice) || 0) - 1;
    return `₱${fmt.num(from, 0)} – ₱${fmt.num(Math.max(from, to), 0)}`;
  };

  const pesoInputStyle = (bad) => ({
    width: 110, padding: '4px 6px', textAlign: 'right',
    border: `1px solid ${bad ? COLORS.error : COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: bad ? '#FEF2F2' : COLORS.inputTint,
    fontFamily: 'inherit', fontSize: 13, fontVariantNumeric: 'tabular-nums',
  });
  const pctInputStyle = {
    width: 64, padding: '4px 6px', textAlign: 'right',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  };
  const rangeStyle = { fontSize: 12, color: COLORS.textMuted };
  const errStyle = { fontSize: 11, color: COLORS.error, marginTop: 3 };
  const baseNoteStyle = {
    fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic', marginLeft: 8,
  };

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={tableStyles.th}>Tier</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>From Net Price</th>
            <th style={tableStyles.th}>Applies to</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Minimum DP</th>
            {canEdit && <th style={tableStyles.th} aria-label="actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const err = rowError(i);
            return (
              <tr key={i}>
                <td style={tableStyles.td}>{i + 1}</td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {canEdit && i > 0 ? (
                    <>
                      {/* v3-142 — NumberInput for peso comma formatting on the
                          Net-Price thresholds; whole-peso rounding unchanged.
                          Red border on validation error via the error prop. */}
                      <NumberInput compact width={130} prefix="₱" step={50000} min={0}
                        error={!!err}
                        value={t.fromNetPrice ?? 0}
                        onChange={v => updateRow(i, {
                          fromNetPrice: Math.max(0, Math.round(v || 0)),
                        })} />
                      {err && <div style={errStyle}>{err}</div>}
                    </>
                  ) : (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ₱{fmt.num(t.fromNetPrice || 0, 0)}
                      {i === 0 && <span style={baseNoteStyle}>base tier</span>}
                    </span>
                  )}
                </td>
                <td style={tableStyles.td}>
                  <span style={rangeStyle}>{appliesTo(i)}</span>
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {canEdit ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <input type="number" style={pctInputStyle}
                        value={Math.round((t.minDpPct || 0) * 1000) / 10}
                        step={0.5} min={0} max={50}
                        onChange={e => updateRow(i, {
                          minDpPct: Math.max(0, Math.min(0.5, (parseFloat(e.target.value) || 0) / 100)),
                        })} />
                      <span style={{ color: COLORS.textMuted }}>%</span>
                    </span>
                  ) : fmt.pct(t.minDpPct || 0, 0)}
                </td>
                {canEdit && (
                  <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                    {i > 0 && (
                      <button onClick={() => deleteRow(i)} style={tableStyles.deleteBtn}
                              title="Remove this tier">×</button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {canEdit && rows.length < 10 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={addRow} style={tableStyles.addBtn}>+ Add tier</button>
        </div>
      )}
      {canEdit && rows.length >= 10 && (
        <div style={{ ...tableStyles.emptyHint, marginTop: 8 }}>
          Up to 10 tiers.
        </div>
      )}
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────
const tableStyles = {
  th: {
    textAlign: 'left', padding: '8px 12px',
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}`,
  },
  td: { padding: '6px 12px', borderBottom: `1px solid ${COLORS.divider}` },
  addBtn: {
    background: COLORS.brandGreen, color: '#FFFFFF', border: 'none',
    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  deleteBtn: {
    background: 'transparent', border: `1px solid ${COLORS.divider}`,
    color: '#B91C1C', fontSize: 14, fontWeight: 700,
    width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
    fontFamily: 'inherit', padding: 0, lineHeight: 1,
  },
  emptyHint: {
    fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic',
    padding: '12px 0',
  },
};



// ─── v3-116: Delivery Locations editor (Location / Delivery Charges) ─────────
// Dynamic fixed+per-panel locations (Cebu/Siargao seeds + admin additions).
// Inventory-tab idiom: the In-Stock toggle keeps a row priced/editable but
// hides it from the Step 2E dropdown; ✕ deletes (confirm). Luzon main island
// and "Other" are structural and never appear here. Cap 10 rows; EMPTY is a
// valid saved state (dropdown = Luzon + Other only). COGS entered pre-VAT.
// v3-190 — the derived Direct Purchase display column is GONE (reference DP
// prices removed from every admin page); quotes still price these rows from
// COGS at the quote's own capacity margin, unchanged.
export function DeliveryLocationsTable({ locations, canEdit, onChange, adminParams }) {
  const rows = Array.isArray(locations) ? locations : [];
  const update = (idx, patch) => {
    onChange(rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };
  const deleteRow = (idx) => {
    if (!window.confirm(
      `Delete delivery location "${rows[idx]?.label || ''}"? Quotes holding it will fall back to Luzon main island.`
    )) return;
    onChange(rows.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    const id = 'loc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    onChange([...rows, { id, label: '', fixedFeeCogs: 0, perPanelCogs: 0,
                         fixedFee: 0, perPanel: 0, available: true }]);
  };
  const labelError = (idx) => {
    const lbl = String(rows[idx]?.label || '').trim();
    if (lbl === '') return 'Label required';
    const dup = rows.some((r, i) => i !== idx
      && String(r.label || '').trim().toLowerCase() === lbl.toLowerCase());
    return dup ? 'Duplicate label' : null;
  };
  const cogsInputStyle = (bad) => ({
    width: 110, padding: '4px 6px', fontSize: 13, textAlign: 'right',
    background: COLORS.inputTint,
    border: `1px solid ${bad ? '#B91C1C' : COLORS.inputBorder}`, borderRadius: 4,
  });
  const errStyle = { color: '#B91C1C', fontSize: 11, marginTop: 2 };
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={tableStyles.th}>Location</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Fixed Fee — COGS (pre-VAT)</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Per Panel — COGS (pre-VAT)</th>
            <th style={{ ...tableStyles.th, textAlign: 'center' }}>In Stock</th>
            {canEdit && <th style={tableStyles.th} aria-label="actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={canEdit ? 5 : 4} style={{ ...tableStyles.td, color: COLORS.textMuted }}>
              No dynamic locations — the Step 2 dropdown offers Luzon main island and Other only.
            </td></tr>
          )}
          {rows.map((r, i) => {
            const err = labelError(i);
            return (
              <tr key={r.id || i} style={r.available === false ? { opacity: 0.55 } : undefined}>
                <td style={tableStyles.td}>
                  {canEdit ? (
                    <>
                      <input type="text" value={r.label || ''} placeholder="e.g. Bohol"
                        style={{ ...cogsInputStyle(!!err), width: 130, textAlign: 'left' }}
                        onChange={e => update(i, { label: e.target.value })} />
                      {err && <div style={errStyle}>{err}</div>}
                    </>
                  ) : (
                    <span>{r.label || '—'}</span>
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {canEdit ? (
                    /* v3-142 — NumberInput for peso comma formatting; whole-peso
                       rounding unchanged. */
                    <NumberInput compact width={110} prefix="₱" step={500} min={0}
                      value={r.fixedFeeCogs ?? 0}
                      onChange={v => update(i, {
                        fixedFeeCogs: Math.max(0, Math.round(v || 0)),
                      })} />
                  ) : (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>₱{fmt.num(r.fixedFeeCogs || 0, 0)}</span>
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {canEdit ? (
                    /* v3-142 — NumberInput for peso comma formatting; whole-peso
                       rounding unchanged. */
                    <NumberInput compact width={110} prefix="₱" step={50} min={0}
                      value={r.perPanelCogs ?? 0}
                      onChange={v => update(i, {
                        perPanelCogs: Math.max(0, Math.round(v || 0)),
                      })} />
                  ) : (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>₱{fmt.num(r.perPanelCogs || 0, 0)}</span>
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'center' }}>
                  <input type="checkbox" checked={r.available !== false} disabled={!canEdit}
                    onChange={e => update(i, { available: e.target.checked })}
                    aria-label={`${r.label || 'location'} in stock`} />
                </td>
                {canEdit && (
                  <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                    <button onClick={() => deleteRow(i)} style={tableStyles.deleteBtn}
                            title="Delete this location">×</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {canEdit && rows.length < 10 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={addRow} style={tableStyles.addBtn}>+ Add location</button>
        </div>
      )}
      {canEdit && rows.length >= 10 && (
        <div style={{ ...tableStyles.emptyHint, marginTop: 8 }}>Up to 10 delivery locations.</div>
      )}
      <div style={{ ...tableStyles.emptyHint, marginTop: 8 }}>
        Luzon main island (per-km, above) and "Other" are fixed options. Out-of-stock rows
        stay priced and editable but leave the Step 2 dropdown; quotes holding a hidden or
        deleted location fall back to Luzon main island.
      </div>
    </div>
  );
}

// ─── v3-138: Misc Materials / Labor / Services catalog editor ────────────────
// Same idiom as DeliveryLocationsTable above: label + COGS + In-Stock toggle +
// ✕ delete + Add. One deliberate difference: COGS accepts CENTAVOS (step 0.01,
// 2dp). Anjon's BOM Q3 sheet carries ₱4,089.12 on four breakers; the integer
// coercion used for delivery locations would silently drift those to ₱4,089.
// directFromCogs() CEILINGs to whole pesos anyway, so keeping 2dp costs nothing
// downstream and keeps the cell reconcilable against the sheet.
// v3-190 — the "Direct Purchase Price at reference margin" column is GONE
// (reference DP prices removed from every admin page). The rep still sees a
// price in the Step 2F dropdown — the quote's own capacity-margin price, as
// always (v3-92).
export function MiscCatalogTable({ items, canEdit, onChange, adminParams }) {
  const rows = Array.isArray(items) ? items : [];
  const update = (idx, patch) => {
    onChange(rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };
  const deleteRow = (idx) => {
    if (!window.confirm(
      `Delete catalog item "${rows[idx]?.label || ''}"? Quotes holding it will price that line at ₱0 until the rep picks another item.`
    )) return;
    onChange(rows.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    const id = 'mc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // v3-150 — a new catalog item starts in Misc, the same default a free-form
    // "Other (please specify)" 2F row takes. Anjon reassigns it deliberately.
    onChange([...rows, { id, label: '', cogs: 0, price: 0, category: 'misc', available: true }]);
  };
  const labelError = (idx) => {
    const lbl = String(rows[idx]?.label || '').trim();
    if (lbl === '') return 'Description required';
    const dup = rows.some((r, i) => i !== idx
      && String(r.label || '').trim().toLowerCase() === lbl.toLowerCase());
    return dup ? 'Duplicate description' : null;
  };
  const cellInput = (bad, w) => ({
    width: w, padding: '4px 6px', fontSize: 13, textAlign: 'right',
    background: COLORS.inputTint,
    border: `1px solid ${bad ? '#B91C1C' : COLORS.inputBorder}`, borderRadius: 4,
  });
  const errStyle = { color: '#B91C1C', fontSize: 11, marginTop: 2 };
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={tableStyles.th}>Description</th>
            {/* v3-150 — which Quote Summary group this item's 2F line reports
                into. Sits next to Description because it is a property of the
                ITEM, not of its price. */}
            <th style={tableStyles.th}>Summary Category</th>
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Cost — COGS (VAT exc)</th>
            <th style={{ ...tableStyles.th, textAlign: 'center' }}>In Stock</th>
            {canEdit && <th style={tableStyles.th} aria-label="actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={canEdit ? 5 : 4} style={{ ...tableStyles.td, color: COLORS.textMuted }}>
              No catalog items — Step 2F offers "Other (please specify)" only.
            </td></tr>
          )}
          {rows.map((r, i) => {
            const err = labelError(i);
            return (
              <tr key={r.id || i} style={r.available === false ? { opacity: 0.55 } : undefined}>
                <td style={tableStyles.td}>
                  {canEdit ? (
                    <>
                      <input type="text" value={r.label || ''} placeholder="e.g. AC Breaker, 60AT, 2-pole"
                        style={{ ...cellInput(!!err, '100%'), textAlign: 'left' }}
                        onChange={e => update(i, { label: e.target.value })} />
                      {err && <div style={errStyle}>{err}</div>}
                    </>
                  ) : (
                    <span>{r.label || '—'}</span>
                  )}
                </td>
                {/* v3-150 — Summary category picker. Read-only roles see the
                    resolved label, so an uncategorized legacy row reads
                    "Misc." rather than blank — matching where its line will
                    actually appear in the quote. */}
                <td style={tableStyles.td}>
                  {canEdit ? (
                    <select
                      value={normalizeCategory(r.category)}
                      onChange={e => update(i, { category: e.target.value })}
                      style={{
                        width: 150, padding: '4px 6px', fontSize: 13,
                        background: COLORS.inputTint,
                        border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
                        fontFamily: 'inherit', color: COLORS.textPrimary,
                      }}
                    >
                      {PACKAGE_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span>{(PACKAGE_CATEGORIES.find(c => c.id === normalizeCategory(r.category)) || {}).label}</span>
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {canEdit ? (
                    /* v3-142 — NumberInput (prefix ₱) instead of a raw
                       type="number": pesos comma-format at rest like every
                       other money field on the tab. Centavos preserved —
                       2dp round on change, as before. */
                    /* v3-144 — negatives allowed: reversal/credit items
                       (e.g. "REVERSAL: Battery Rack" at −10,000). */
                    <NumberInput compact width={120} prefix="₱" step={0.01}
                      value={r.cogs ?? 0}
                      onChange={v => update(i, {
                        cogs: Number.isFinite(v) ? Math.round(v * 100) / 100 : 0,
                      })} />
                  ) : (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>₱{fmt.num(r.cogs || 0, 2)}</span>
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'center' }}>
                  <input type="checkbox" checked={r.available !== false} disabled={!canEdit}
                    onChange={e => update(i, { available: e.target.checked })}
                    aria-label={`${r.label || 'item'} in stock`} />
                </td>
                {canEdit && (
                  <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                    <button onClick={() => deleteRow(i)} style={tableStyles.deleteBtn}
                            title="Delete this catalog item">×</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {canEdit && rows.length < MISC_CATALOG_MAX && (
        <div style={{ marginTop: 12 }}>
          <button onClick={addRow} style={tableStyles.addBtn}>+ Add catalog item</button>
        </div>
      )}
      {canEdit && rows.length >= MISC_CATALOG_MAX && (
        <div style={{ ...tableStyles.emptyHint, marginTop: 8 }}>
          Up to {MISC_CATALOG_MAX} catalog items.
        </div>
      )}
      <div style={{ ...tableStyles.emptyHint, marginTop: 8 }}>
        On a live quote each item is priced from its COGS at that system's capacity-resolved
        margin. Out-of-stock rows stay editable but leave the Step 2F dropdown;
        quotes holding a hidden or deleted item price that line at ₱0 and flag it to the rep.
        Negative costs are allowed for reversal / credit items (e.g. "REVERSAL: Battery Rack"
        when the standard package includes a rack the site doesn't need) — the derived credit
        is the exact negative of what the same positive cost would price at, so a reversal
        cancels its counterpart to the centavo.
      </div>
    </div>
  );
}

export const MISC_CATALOG_MAX = 40;

export const adminStyles = {
  // v3-107 — caption under a COGS input (user-directed: Param rows say which
  // number the admin enters, matching the tables' "COGS (pre-VAT)" column
  // headers). v3-190 — the derivedCol/derivedArrow/derivedValue/derivedCaption
  // styles for the reference Direct Purchase price column are REMOVED with the
  // column itself.
  cogsCaption: {
    fontSize: 10.5, color: COLORS.textMuted, marginTop: 3,
    textAlign: 'right', letterSpacing: 0.3, whiteSpace: 'nowrap',
  },
  container: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    border: `1px solid ${COLORS.divider}`, padding: '32px 36px',
  },
  headerRow: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${COLORS.divider}`,
  },
  title: { fontSize: 24, fontWeight: 700, color: COLORS.brandGreen, margin: '0 0 6px' },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: 0 },
  logoutBtn: {
    background: 'transparent', border: `1px solid ${COLORS.divider}`,
    color: COLORS.textMuted, fontSize: 12, fontWeight: 600,
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
  },
  saveBar: {
    marginTop: 32, paddingTop: 20,
    borderTop: `1px solid ${COLORS.divider}`,
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  },
  saveStatusInfo: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },
  saveStatusOk:   { fontSize: 13, color: '#065F46', fontWeight: 600 },
  saveStatusErr:  { fontSize: 13, color: '#991B1B', fontWeight: 600 },
  saveBtn: {
    background: '#25543A', border: '1px solid #25543A', color: '#FFFFFF',
    fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 6,
    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3,
  },
  discardBtn: {
    background: 'transparent', border: `1px solid ${COLORS.divider}`,
    color: COLORS.textBody, fontSize: 13, fontWeight: 600,
    padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
  },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  section: {
    marginTop: 24, paddingTop: 20,
    borderTop: `1px solid ${COLORS.divider}`,
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: 12,
    marginBottom: 14, flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, color: COLORS.brandGreen,
    margin: 0, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  readOnlyBadge: {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    color: COLORS.textMuted, textTransform: 'uppercase',
    border: `1px solid ${COLORS.divider}`, borderRadius: 4,
    padding: '2px 8px', backgroundColor: '#F9FAFB',
  },
  paramRow: {
    display: 'flex', alignItems: 'center', gap: 16,
    paddingBottom: 10, marginBottom: 10,
    borderBottom: `1px dashed ${COLORS.divider}`,
  },
  paramLabelCol: { flex: 1 },
  paramLabel: { fontSize: 13, fontWeight: 500, color: COLORS.textBody },
  paramHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  paramValueCol: { width: 160 },
  paramValueRO: {
    fontSize: 13, fontWeight: 600, color: COLORS.textBody,
    fontVariantNumeric: 'tabular-nums', textAlign: 'right',
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// SHARED PREVIEW-CHART PRIMITIVES (moved here in v3-180)
// ---------------------------------------------------------------------------
// `niceAxis` and `rsStyles` were local to ProductTab.jsx while BOTH preview
// charts lived there. v3-180 moved the Interest Rates section — and with it
// RateSurfacePreview — to the new FinCoTab.jsx, leaving GrossMarginPreview
// behind on the Product tab. Copying the pair into the new file would have
// created two definitions of the same admin chart styling that drift the first
// time either is touched, so they live here instead and both tabs import them.
// Neither is engine math: `niceAxis` is axis rounding, `rsStyles` is CSS.
// ═══════════════════════════════════════════════════════════════════════════

// v3-93 — "nice" axis bounds: round [lo, hi] outward to a clean step so the
// chart frames the curve tightly with readable ticks. Returns [min, max, step].
export function niceAxis(lo, hi, targetTicks) {
  const span = Math.max(hi - lo, 1e-6);
  const raw  = span / Math.max(targetTicks, 1);
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step, step];
}

// ─── v3-179 · panel width constants ─────────────────────────────────────────
// Each table's minimum rendered width, in px. SINGLE-SOURCED because they are
// consumed twice each: once as the table's own `minWidth`, and once as its
// panel's flex-basis. If the two ever disagreed the dead band described under
// `panels` would come straight back — the payment panel would be sized for a
// width its table does not accept. The 60px gap between them is the cost of
// seven-character pesos against six-character percentages at 9.5px (v3-196).
// v3-196 — rate grid shows THREE decimals (user-directed, Pat): the 0.25%
// rate step yields true values on eighth-of-a-percent boundaries (18.125,
// 20.625) that two decimals rounded into lies (18.13, 20.63). One more glyph
// per cell across eleven tenor columns is bought back by dropping BOTH
// tables' font from 10.5px to 9.5px (Pat OK'd the size cut), so the widths
// TIGHTEN: at 9.5px tabular-nums a 6-glyph rate cell needs ~36px and a
// 7-glyph payment cell ~42px. Side-by-side now begins at 470+530+28 =
// 1028px — 20px EARLIER than v3-179's 1048.
export const RATE_TABLE_MIN = 470;
export const PMT_TABLE_MIN  = 530;

export const rsStyles = {
  wrap:       { marginTop: 20, paddingTop: 16, borderTop: `1px solid ${COLORS.divider}` },
  // v3-172 — the two grids sit side by side on a wide admin window and stack on a
  // narrow one, without a media query or a resize listener.
  //
  // ⚠ v3-179 — WAS `grid` with `repeat(auto-fit, minmax(520px, 1fr))`, which
  // forced the two panels to EQUAL width. The two tables do not need equal
  // width and the file already said so: the rate table declares minWidth 460
  // and the payment table overrides it to 560, because "102,302" is seven
  // characters where "27.63" is five. Equal tracks therefore produced an 80px
  // DEAD BAND — two panels appear at 2×520+28 = 1068px, but the payment table
  // only stops needing a scrollbar at 2×560+28 = 1148px. In between, the rate
  // panel sat on ~60px of slack while the payment panel scrolled by ~40px,
  // which is almost exactly one tenor column: the 60-month one disappeared.
  //
  // Flex with a per-panel basis fixes it at the source. Each panel ASKS FOR
  // WHAT ITS OWN TABLE NEEDS (basis === that table's minWidth, single-sourced
  // from the two constants above so the pair cannot drift), flex-shrink 0 makes
  // a panel WRAP rather than squeeze below its table's minimum — which is what
  // removes the dead band entirely — and flex-grow 1 on both splits any
  // leftover evenly, holding the payment panel wider at every width. Side by
  // side begins at RATE_TABLE_MIN + PMT_TABLE_MIN + 28 (v3-196: 1028px — see
  // the constants above; each font/precision change re-derives them there).
  // Below that the panels stack full-width, the same fallback the grid gave.
  panels:     { display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' },
  panelRate:  { flex: `1 0 ${RATE_TABLE_MIN}px`, minWidth: 0 },
  panelPmt:   { flex: `1 0 ${PMT_TABLE_MIN}px`,  minWidth: 0 },
  caption:    { fontSize: 12, color: COLORS.textMuted, marginBottom: 8, marginTop: 16, lineHeight: 1.5 },
  chartCaption: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6, marginTop: 16, lineHeight: 1.5 },
  anchorNote: { border: '2.5px solid #854F0B', borderRadius: 3, padding: '0 4px', fontWeight: 700 },  // v3-143 — matches the grid's anchor ring
  invNote:    { backgroundColor: '#FDE68A', border: '2px solid #B45309', borderRadius: 3,
                padding: '0 4px', fontWeight: 700, color: '#78350F' },                                // v3-172 — matches the payment grid's inversion flag
  scroll:     { overflowX: 'auto' },
  // v3-172 — small type and tight cell padding: eleven tenor columns have to fit
  // a half-width panel. Below minWidth the panel scrolls rather than crushing.
  // v3-196 — 10.5px → 9.5px, paying for the rate grid's third decimal.
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 9.5,
                fontVariantNumeric: 'tabular-nums', tableLayout: 'fixed', minWidth: RATE_TABLE_MIN },
  th:         { padding: '4px 1px', fontWeight: 600, color: COLORS.textMuted, textAlign: 'center', whiteSpace: 'nowrap' },
  thCorner:   { padding: '4px 4px', fontWeight: 600, color: COLORS.textMuted, textAlign: 'left', width: 34 },
  rowLabel:   { padding: '3px 4px', fontWeight: 600, color: COLORS.textMuted, whiteSpace: 'nowrap' },
  td:         { padding: '3px 1px', textAlign: 'center', color: COLORS.textBody, whiteSpace: 'nowrap' },
  warn:       { marginTop: 20, padding: '12px 14px', borderRadius: 8,
                backgroundColor: '#FEF3C7', color: '#92400E', fontSize: 13 },
};


// ─── TextParam (v3-183) ──────────────────────────────────────────────────────
// `Param` is numeric-only (it coerces, clamps and percent-scales). The DU Rate
// Inflation Reference section needs free-text and month fields — source name,
// URL, consumption basis, and two YYYY-MM dates — so they get their own row
// rather than a numeric input bent into accepting strings.
export function TextParam({ label, value, onChange, canEdit, hint, placeholder,
                            type = 'text', mono, wide }) {
  return (
    <div style={adminStyles.paramRow}>
      <div style={adminStyles.paramLabelCol}>
        <div style={adminStyles.paramLabel}>{label}</div>
        {hint && <div style={adminStyles.paramHint}>{hint}</div>}
      </div>
      <div style={{ ...adminStyles.paramValueCol, width: wide ? 300 : 200 }}>
        {canEdit ? (
          <input
            type={type}
            value={value ?? ''}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', textAlign: 'left',
              border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
              backgroundColor: COLORS.inputTint, font: 'inherit', fontSize: 13,
              fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
            }}
          />
        ) : (
          <div style={{ ...adminStyles.paramValueRO, textAlign: 'left',
                        wordBreak: 'break-all' }}>
            {value || '\u2014'}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── SelectParam (v3-187) ────────────────────────────────────────────────────
// A fixed-choice admin row. `Param` is numeric-free-entry and `TextParam` is
// free text; neither can express "one of exactly these values". Used for the
// IRR/LCOE horizon default, which must offer precisely the options the Step 4
// dropdown offers — an admin able to type 27 there would seed a default no
// customer could return to, and the customer <select> would render with
// nothing selected.
export function SelectParam({ label, value, onChange, canEdit, options, hint,
                              formatOption }) {
  const fmtOpt = formatOption || ((v) => String(v));
  return (
    <div style={adminStyles.paramRow}>
      <div style={adminStyles.paramLabelCol}>
        <div style={adminStyles.paramLabel}>{label}</div>
        {hint && <div style={adminStyles.paramHint}>{hint}</div>}
      </div>
      <div style={adminStyles.paramValueCol}>
        {canEdit ? (
          <select
            value={value ?? ''}
            onChange={e => onChange(Number(e.target.value))}
            style={{
              width: 140, padding: '6px 8px',
              border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
              backgroundColor: COLORS.inputTint, font: 'inherit', fontSize: 13,
            }}
          >
            {options.map(o => (
              <option key={o} value={o}>{fmtOpt(o)}</option>
            ))}
          </select>
        ) : (
          <div style={adminStyles.paramValueRO}>{fmtOpt(value)}</div>
        )}
      </div>
    </div>
  );
}
