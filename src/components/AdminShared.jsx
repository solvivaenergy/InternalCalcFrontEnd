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
//   • ContactGatePasswordToggle — Maintenance Mode checkbox (above tabs)
//
// All styling lives here too (Param row, Section heading, table styles) and
// is re-exported as `adminStyles` for tab pages that need to extend it.
// =============================================================================

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
export function Param({ label, value, onChange, canEdit, isPct, isPeso, suffix, step, hint, min, max }) {
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
      </div>
    </div>
  );
}

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
export function BatteryPackagesEditor({ packages, canEdit, onChange }) {
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

function BatteryPackageCard({ pkg, canEdit, onUpdate, onDelete, deleteDisabled, index }) {
  const labelInputStyle = {
    width: 200, padding: '6px 10px',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 14,
    fontWeight: 600,
  };
  return (
    <div style={pkgCardStyles.card}>
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
        <Param label="Battery Unit Price (incl. cables & lugs)" isPeso step={1000}
               value={pkg.batteryUnitPrice}
               onChange={v => onUpdate({ batteryUnitPrice: v })}
               canEdit={canEdit} />
        <Param label="Battery Rack Capacity" suffix="units per rack" step={1}
               value={pkg.batteryRackCapacity}
               onChange={v => onUpdate({ batteryRackCapacity: v })}
               canEdit={canEdit} min={1} max={20} />
        <Param label="Battery Rack Price" isPeso step={500}
               value={pkg.batteryRackPrice}
               onChange={v => onUpdate({ batteryRackPrice: v })}
               canEdit={canEdit} />
        <Param label="Automatic Transfer Switch (ATS)" isPeso step={500}
               value={pkg.atsPrice}
               onChange={v => onUpdate({ atsPrice: v })}
               canEdit={canEdit} />
        <Param label="Materials for Critical Loads" isPeso step={100}
               hint="Materials for critical-loads sub-panel"
               value={pkg.criticalLoadsMaterials}
               onChange={v => onUpdate({ criticalLoadsMaterials: v })}
               canEdit={canEdit} />
        <Param label="Battery Labor & Installation w/ Solar Package Installation" isPeso step={500}
               hint="Charged when battery is installed alongside the solar package"
               value={pkg.laborWithSolarInstall}
               onChange={v => onUpdate({ laborWithSolarInstall: v })}
               canEdit={canEdit} />
        <Param label="Battery Standalone Labor & Installation" isPeso step={1000}
               hint="Charged when battery is added without a concurrent solar install"
               value={pkg.standaloneLabor}
               onChange={v => onUpdate({ standaloneLabor: v })}
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

export const adminStyles = {
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
