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

import { directFromCogs } from '../lib/calculations.js';
import React from 'react';
import { COLORS, fmt, NumberInput } from './ui.jsx';

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
export function Param({ label, value, onChange, canEdit, isPct, isPeso, suffix, step, hint, min, max, derived }) {
  const displayValue = isPct ? Number((value * 100).toFixed(4)) : value;
  const displayStep = isPct ? (step * 100) : step;
  let editorValue;
  if (isPeso) {
    editorValue = (value == null) ? null : Math.round(value);
  } else {
    editorValue = displayValue;
  }
  const editorStep = isPeso ? 1 : displayStep;
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
            width={140}
          />
        ) : (
          <div style={adminStyles.paramValueRO}>
            {isPct ? `${(value * 100).toFixed(2)}%` :
             isPeso ? fmt.peso(Math.round(value)) :
             `${fmt.num(value)}${suffix ? ' ' + suffix : ''}`}
          </div>
        )}
        {/* v3-107 — a derived value marks this as a COGS → price row; caption
            tells the admin WHICH number they're entering (user-directed: the
            tables carry "COGS (pre-VAT)" column headers, Param rows carried
            nothing). Editable rows get the imperative; read-only roles just
            get the noun. */}
        {derived != null && (
          <div style={adminStyles.cogsCaption}>
            {canEdit ? 'COGS (pre-VAT) — enter here' : 'COGS (pre-VAT)'}
          </div>
        )}
      </div>
      {derived != null && (
        <div style={adminStyles.derivedCol}>
          <span style={adminStyles.derivedArrow} aria-hidden="true">→</span>
          <div style={{ textAlign: 'right' }}>
            <span style={adminStyles.derivedValue} title="Direct Purchase Price — derived from COGS. Not editable.">
              {fmt.peso(Math.round(derived))}
            </span>
            <div style={adminStyles.derivedCaption}>Direct Purchase Price (derived)</div>
          </div>
        </div>
      )}
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

// v3-142 — per-package gross-margin MATRIX. The per-system-size (kWp) curve is
// retained, but each package (Solar / Battery / Misc) now rides its OWN curve
// fitted through the SAME three kWp breakpoints. Rows = kWp anchors (Min / Med /
// Max, each with an editable shared kWp), columns = packages. A no-panels order
// prices at the Max row for every package.
export function PackageMarginMatrix({ params, updateParam, canEdit }) {
  const rows = [
    {
      label: 'Min anchor',
      sub: 'small systems / floor',
      kwpKey: 'grossMarginMinKwp',
      keys: { solar: 'grossMarginSolarMin', battery: 'grossMarginBatteryMin', misc: 'grossMarginMiscMin' },
    },
    {
      label: 'Med anchor',
      sub: 'curvature',
      kwpKey: 'grossMarginMidKwp',
      keys: { solar: 'grossMarginSolarMid', battery: 'grossMarginBatteryMid', misc: 'grossMarginMiscMid' },
    },
    {
      label: 'Max anchor',
      sub: 'large / ceiling / no-panels',
      kwpKey: 'grossMarginMaxKwp',
      keys: { solar: 'grossMarginSolarMax', battery: 'grossMarginBatteryMax', misc: 'grossMarginMiscMax' },
    },
  ];
  const setPct = (key, v) => { if (canEdit && v != null) updateParam('margins', key, Math.max(0, Math.min(99, v)) / 100); };
  const setKwp = (key, v) => { if (canEdit && v != null) updateParam('margins', key, Math.max(0, v)); };

  const th = {
    textAlign: 'center', fontSize: 12, fontWeight: 600, color: COLORS.text,
    padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap',
  };
  const thLeft = { ...th, textAlign: 'left' };
  const td = { padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' };
  const tdLabel = {
    padding: '6px 8px', textAlign: 'left', fontSize: 12, color: COLORS.text, whiteSpace: 'nowrap',
  };
  const pctCell = (key) => (
    canEdit
      ? <NumberInput value={Number(((params[key] ?? 0) * 100).toFixed(4))}
                     onChange={(v) => setPct(key, v)} step={0.5} min={0} max={99} suffix="%" width={92} />
      : <div style={{ ...adminStyles.paramValueRO, width: 92, margin: '0 auto' }}>{((params[key] ?? 0) * 100).toFixed(2)}%</div>
  );

  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={thLeft}>Anchor</th>
            <th style={th}>kWp</th>
            <th style={th}>A. Solar</th>
            <th style={th}>B. Battery</th>
            <th style={th}>C. Misc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.kwpKey}>
              <td style={tdLabel}>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{r.sub}</div>
              </td>
              <td style={td}>
                {canEdit
                  ? <NumberInput value={params[r.kwpKey]} onChange={(v) => setKwp(r.kwpKey, v)}
                                 step={1} min={0} suffix="kWp" width={96} />
                  : <div style={{ ...adminStyles.paramValueRO, width: 96, margin: '0 auto' }}>{fmt.num(params[r.kwpKey])} kWp</div>}
              </td>
              <td style={td}>{pctCell(r.keys.solar)}</td>
              <td style={td}>{pctCell(r.keys.battery)}</td>
              <td style={td}>{pctCell(r.keys.misc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
export function CablingTierTable({ tiers, canEdit, onChange }) {
  const updateRow = (idx, patch) => {
    const next = tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onChange(next);
  };
  const deleteRow = (idx) => {
    if (!window.confirm(`Remove tier starting at ${tiers[idx].minPanels} panels?`)) return;
    onChange(tiers.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    const maxPanels = Math.max(0, ...tiers.map(t => t.minPanels));
    const newRow = { minPanels: maxPanels + 50, dcCablePct: 0.05, acCablePct: 0.03,
                     conduitsPct: 0.05, panelBoardPct: 0.02 };
    onChange([...tiers, newRow].sort((a, b) => a.minPanels - b.minPanels));
  };
  const pctInputStyle = {
    width: 56, padding: '4px 6px', textAlign: 'right',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  };
  const numInputStyle = { ...pctInputStyle, width: 70 };

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
            {canEdit && <th style={tableStyles.th} aria-label="actions" />}
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => {
            const total = t.dcCablePct + t.acCablePct + t.conduitsPct + t.panelBoardPct;
            return (
              <tr key={i}>
                <td style={tableStyles.td}>
                  {canEdit ? (
                    <input type="number" style={numInputStyle}
                      value={t.minPanels} step={1} min={1}
                      onChange={e => updateRow(i, { minPanels: parseInt(e.target.value) || 1 })} />
                  ) : t.minPanels}
                </td>
                {['dcCablePct', 'acCablePct', 'conduitsPct', 'panelBoardPct'].map(field => (
                  <td key={field} style={{ ...tableStyles.td, textAlign: 'right' }}>
                    {canEdit ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <input type="number" style={pctInputStyle}
                          value={Math.round(t[field] * 100)} step={1} min={0} max={100}
                          onChange={e => updateRow(i, {
                            [field]: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                          })} />
                        <span style={{ color: COLORS.textMuted }}>%</span>
                      </span>
                    ) : `${(t[field] * 100).toFixed(0)}%`}
                  </td>
                ))}
                <td style={{ ...tableStyles.td, textAlign: 'right', color: '#15803D', fontWeight: 600 }}>
                  {(total * 100).toFixed(0)}%
                </td>
                {canEdit && (
                  <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                    <button onClick={() => deleteRow(i)} style={tableStyles.deleteBtn}
                            title="Remove this tier">×</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
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
               derived={directFromCogs(pkg.batteryUnitCogs, adminParams)}
               onChange={v => onUpdate({ batteryUnitCogs: v })}
               canEdit={canEdit} />
        <Param label="Battery Rack Capacity" suffix="units per rack" step={1}
               value={pkg.batteryRackCapacity}
               onChange={v => onUpdate({ batteryRackCapacity: v })}
               canEdit={canEdit} min={1} max={20} />
        <Param label="Battery Rack" isPeso step={500}
               value={pkg.batteryRackCogs}
               derived={directFromCogs(pkg.batteryRackCogs, adminParams)}
               onChange={v => onUpdate({ batteryRackCogs: v })}
               canEdit={canEdit} />
        <Param label="Automatic Transfer Switch (ATS)" isPeso step={500}
               value={pkg.atsCogs}
               derived={directFromCogs(pkg.atsCogs, adminParams)}
               onChange={v => onUpdate({ atsCogs: v })}
               canEdit={canEdit} />
        <Param label="Materials for Critical Loads" isPeso step={100}
               hint="Materials for critical-loads sub-panel"
               value={pkg.criticalLoadsMaterialsCogs}
               derived={directFromCogs(pkg.criticalLoadsMaterialsCogs, adminParams)}
               onChange={v => onUpdate({ criticalLoadsMaterialsCogs: v })}
               canEdit={canEdit} />
        <Param label="Battery Labor & Installation w/ Solar Package Installation" isPeso step={500}
               hint="Charged when battery is installed alongside the solar package"
               value={pkg.laborWithSolarInstallCogs}
               derived={directFromCogs(pkg.laborWithSolarInstallCogs, adminParams)}
               onChange={v => onUpdate({ laborWithSolarInstallCogs: v })}
               canEdit={canEdit} />
        <Param label="Battery Standalone Labor & Installation" isPeso step={1000}
               hint="Charged when battery is added without a concurrent solar install"
               value={pkg.standaloneLaborCogs}
               derived={directFromCogs(pkg.standaloneLaborCogs, adminParams)}
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
  const addRow = () => onChange([...codes, { code: '', label: '', discount: 0.05 }]);

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
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {canEdit ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <input type="number" style={pctInputStyle}
                        value={Math.round((p.discount || 0) * 1000) / 10}
                        step={0.5} min={0} max={100}
                        onChange={e => updateRow(i, {
                          discount: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                        })} />
                      <span style={{ color: COLORS.textMuted }}>%</span>
                    </span>
                  ) : fmt.pct(p.discount, 0)}
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
// valid saved state (dropdown = Luzon + Other only). COGS entered pre-VAT;
// Direct Purchase derived per the standard COGS pipeline (display uses the
// boot/reference margin like every other derived cell on this tab).
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
            <th style={tableStyles.th}>Derived Direct Purchase</th>
            <th style={{ ...tableStyles.th, textAlign: 'center' }}>In Stock</th>
            {canEdit && <th style={tableStyles.th} aria-label="actions" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={canEdit ? 6 : 5} style={{ ...tableStyles.td, color: COLORS.textMuted }}>
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
                <td style={{ ...tableStyles.td, color: COLORS.textMuted, fontSize: 12 }}>
                  ₱{fmt.num(directFromCogs(r.fixedFeeCogs || 0, adminParams), 0)}
                  {' + ₱'}{fmt.num(directFromCogs(r.perPanelCogs || 0, adminParams), 0)}/panel
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
// Same idiom as DeliveryLocationsTable above: label + COGS + derived price +
// In-Stock toggle + ✕ delete + Add. Two deliberate differences:
//
//   1. COGS accepts CENTAVOS (step 0.01, 2dp). Anjon's BOM Q3 sheet carries
//      ₱4,089.12 on four breakers; the integer coercion used for delivery
//      locations would silently drift those to ₱4,089. directFromCogs()
//      CEILINGs to whole pesos anyway, so keeping 2dp costs nothing downstream
//      and keeps the cell reconcilable against the sheet.
//   2. The derived column is labelled "at reference margin" — unlike delivery
//      locations, this number is what the REP sees in the Step 2F dropdown,
//      and it moves with the quote's capacity margin (v3-92). The admin view
//      shows the reference-margin price; a small-system quote will price the
//      same item lower. Spelled out in the footnote so nobody reports it as a
//      mismatch.
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
    onChange([...rows, { id, label: '', cogs: 0, price: 0, available: true }]);
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
            <th style={{ ...tableStyles.th, textAlign: 'right' }}>Cost — COGS (VAT exc)</th>
            <th style={{ ...tableStyles.th, textAlign: 'right', color: COLORS.textMuted }}>
              Direct Purchase Price
            </th>
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
                <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                  {canEdit ? (
                    /* v3-142 — NumberInput (prefix ₱) instead of a raw
                       type="number": pesos comma-format at rest like every
                       other money field on the tab. Centavos preserved —
                       2dp round on change, as before. */
                    <NumberInput compact width={120} prefix="₱" step={0.01} min={0}
                      value={r.cogs ?? 0}
                      onChange={v => update(i, {
                        cogs: Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0,
                      })} />
                  ) : (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>₱{fmt.num(r.cogs || 0, 2)}</span>
                  )}
                </td>
                <td style={{ ...tableStyles.td, textAlign: 'right', color: COLORS.textMuted, fontSize: 12 }}>
                  ₱{fmt.num(directFromCogs(r.cogs || 0, adminParams), 0)}
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
        Direct Purchase Price is shown at the <strong>reference margin</strong>. On a live quote each
        item is re-priced at that system's capacity margin, so a small system prices lower than the
        figure above. Out-of-stock rows stay priced and editable but leave the Step 2F dropdown;
        quotes holding a hidden or deleted item price that line at ₱0 and flag it to the rep.
      </div>
    </div>
  );
}

export const MISC_CATALOG_MAX = 40;

export const adminStyles = {
  // v3-83 — the derived Direct Purchase Price shown beside a COGS input.
  derivedCol: {
    display: 'flex', alignItems: 'center', gap: 8,
    minWidth: 150, justifyContent: 'flex-end',
  },
  derivedArrow: { color: '#9CA3AF', fontSize: 14 },
  derivedValue: {
    minWidth: 110, textAlign: 'right', padding: '7px 10px',
    borderRadius: 6, border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB',
    color: '#4B5563', fontSize: 14, fontVariantNumeric: 'tabular-nums',
    display: 'inline-block',
  },
  // v3-107 — captions under the COGS input / derived price (user-directed:
  // Param rows now say which number the admin enters, matching the tables'
  // "COGS (pre-VAT)" column headers).
  cogsCaption: {
    fontSize: 10.5, color: COLORS.textMuted, marginTop: 3,
    textAlign: 'right', letterSpacing: 0.3, whiteSpace: 'nowrap',
  },
  derivedCaption: {
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
