// =============================================================================
// INVENTORY TAB — first of three admin tabs (v3-54)
// -----------------------------------------------------------------------------
// Section order (per spec):
//   1. Panel Settings        (existing, Inventory)
//   2. Solar Panel & Mounting (moved here from Admin Parameters)
//   3. SINGLE-PHASE AC/DC Cabling (% of Panels Price) (moved from Admin Params)
//   3b. THREE-PHASE AC/DC Cabling (% of Panels Price) (NEW in v3-62)
//   3c. Variable Charges      (MOVED here from Engineering in v3-106 — cable/
//                              labor/RSD charges + the RSD stock toggle)
//   4. Single-phase Inverters (existing, Inventory)
//   5. 3-phase Inverters     (existing, Inventory)
//   6. Battery Packages      (rewritten — multi-package editor; was a 6-field
//                             single-pack section in Admin Parameters)
//
// v3-106 — stock flags: panel-settings rows, inverter rows, battery packages
// (in AdminShared's editor), and RSD each carry an availability toggle so an
// out-of-stock item keeps its row/pricing instead of being deleted and
// recreated later.
//
// All edits flow through props from AdminShell, which owns the unified state
// and the global save bar. Edit gating per section is read from permissions.
// =============================================================================

import React from 'react';
import { COLORS, fmt } from './ui.jsx';
import { directFromCogs } from '../lib/calculations.js';
import {
  Section, Param, CablingTierTable, BatteryPackagesEditor, adminStyles,
} from './AdminShared.jsx';
import {
  canEditAdminSection, canEditInventory, hasAnyEditAccess,
} from '../lib/permissions.js';

export default function InventoryTab({
  params, updateParam,
  panelSingle, updatePanelSingle,
  panelThree,  updatePanelThree,
  single, three, updateInverter, addInverter, removeInverter,
  accessLevel,
}) {
  const anyEdit = hasAnyEditAccess(accessLevel);
  const canEditInv = canEditInventory(accessLevel);
  const canEditSection = (k) => canEditAdminSection(accessLevel, k);

  return (
    <div>
      {/* ─── Panel Settings ───────────────────────────────────────────── */}
      <Section title="Panel Settings" canEdit={canEditInv} anyEditRole={anyEdit}>
        <table style={localStyles.table}>
          <thead>
            <tr>
              <th style={localStyles.th}>Phase</th>
              <th style={{ ...localStyles.th, textAlign: 'right' }}>Watts/Panel</th>
              <th style={{ ...localStyles.th, textAlign: 'right' }}>COGS (pre-VAT)</th>
              <th style={{ ...localStyles.th, textAlign: 'right', color: COLORS.textMuted }}>Direct Purchase Price</th>
              <th style={{ ...localStyles.th, textAlign: 'right' }}>Max DC/AC Ratio</th>
              <th style={{ ...localStyles.th, textAlign: 'center' }}>In Stock</th>
            </tr>
          </thead>
          <tbody>
            <PanelSettingsRow label="Single-phase" row={panelSingle} setRow={updatePanelSingle} canEdit={canEditInv} params={params} />
            <PanelSettingsRow label="3-phase"      row={panelThree}  setRow={updatePanelThree}  canEdit={canEditInv} params={params} />
          </tbody>
        </table>
      </Section>

      {/* ─── Solar Panel & Mounting (moved from Admin Parameters) ─────── */}
      <Section title="Solar Panel & Mounting"
               canEdit={canEditSection('solarPanel')}
               anyEditRole={anyEdit}>
        <Param label="Mounting Support Floor Price" isPeso step={500}
               value={params.mountingSupportFloorCogs}
               derived={directFromCogs(params.mountingSupportFloorCogs, params)}
               onChange={v => updateParam('solarPanel', 'mountingSupportFloorCogs', v)}
               canEdit={canEditSection('solarPanel')} />
        <Param label="Mounting Support % of Panels Price" isPct step={0.005}
               value={params.mountingSupportPctOfPanels}
               onChange={v => updateParam('solarPanel', 'mountingSupportPctOfPanels', v)}
               canEdit={canEditSection('solarPanel')}
               hint="Customer pays max(floor, this % of panel price)" />
      </Section>

      {/* ─── Cabling — SINGLE-PHASE (renamed in v3-62) ────────────────── */}
      <Section title="SINGLE-PHASE AC/DC Cables, Conduits, Fittings, Panel Board & Other Devices (% of Panels Price)"
               canEdit={canEditSection('cabling')}
               anyEditRole={anyEdit}>
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 10px' }}>
          Applies when the customer selects <strong>Single-phase</strong> in
          Step 1A of the calculator.
        </p>
        <CablingTierTable tiers={params.cablingTiers || []}
                          onChange={v => updateParam('cabling', 'cablingTiers', v)}
                          canEdit={canEditSection('cabling')} />
      </Section>

      {/* ─── Cabling — THREE-PHASE (NEW in v3-62) ─────────────────────── */}
      <Section title="THREE-PHASE AC/DC Cables, Conduits, Fittings, Panel Board & Other Devices (% of Panels Price)"
               canEdit={canEditSection('cabling')}
               anyEditRole={anyEdit}>
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 10px' }}>
          Applies when the customer selects <strong>3-phase</strong> in Step 1A
          of the calculator. Defaults were seeded from the single-phase table
          (DC ×1.0, AC ×1.5, Conduits ×1.2, Panel Board ×1.5) and are edited
          independently here.
        </p>
        <CablingTierTable tiers={params.cablingTiersThreePhase || []}
                          onChange={v => updateParam('cabling', 'cablingTiersThreePhase', v)}
                          canEdit={canEditSection('cabling')} />
      </Section>

      {/* ─── Variable Charges (moved here from Engineering in v3-106) ──
           Cable / labor / RSD charges grouped with the cabling tier tables
           above. Same 'variableCharges' section key + edit gate as before —
           pure relocation. NEW in v3-106: the RSD stock toggle lives beside
           the two RSD price rows it governs. ──────────────────────────── */}
      <Section title="Variable Charges"
               canEdit={canEditSection('variableCharges')}
               anyEditRole={anyEdit}>
        <Param label="Additional DC Cable (per meter)" isPeso step={10}
               value={params.additionalDcCablePerMeterCogs}
               derived={directFromCogs(params.additionalDcCablePerMeterCogs, params)}
               onChange={v => updateParam('variableCharges', 'additionalDcCablePerMeterCogs', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="Additional AC Cable (per meter)" isPeso step={10}
               value={params.additionalAcCablePerMeterCogs}
               derived={directFromCogs(params.additionalAcCablePerMeterCogs, params)}
               onChange={v => updateParam('variableCharges', 'additionalAcCablePerMeterCogs', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="Labor & Installation (per kWp)" isPeso step={500}
               value={params.laborInstallationPerKwpCogs}
               derived={directFromCogs(params.laborInstallationPerKwpCogs, params)}
               onChange={v => updateParam('variableCharges', 'laborInstallationPerKwpCogs', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="RSD — Variable Charge (per panel)" isPeso step={100}
               value={params.rsdVariablePerPanelCogs}
               derived={directFromCogs(params.rsdVariablePerPanelCogs, params)}
               onChange={v => updateParam('variableCharges', 'rsdVariablePerPanelCogs', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="RSD — Fixed Transmitter" isPeso step={500}
               value={params.rsdFixedTransmitterCogs}
               derived={directFromCogs(params.rsdFixedTransmitterCogs, params)}
               onChange={v => updateParam('variableCharges', 'rsdFixedTransmitterCogs', v)}
               canEdit={canEditSection('variableCharges')} />
        {/* v3-106 — RSD stock toggle. Unchecked ⇒ the customer/rep 2B
            checkbox is replaced by an out-of-stock note and App.jsx forces
            rsdEnabled off in the pricing inputs. */}
        <div style={localStyles.stockRow}>
          <div style={localStyles.stockRowLabel}>
            Rapid Shutdown Device (RSD) — stock status
            <span style={localStyles.stockRowHint}>
              When out of stock, the "Include RSD" option in Step 2B is replaced
              by an out-of-stock notice and RSD cannot be added to any quote.
            </span>
          </div>
          <StockCheckbox
            checked={params.rsdAvailable !== false}
            onChange={v => updateParam('variableCharges', 'rsdAvailable', v)}
            canEdit={canEditSection('variableCharges')}
          />
        </div>
      </Section>

      {/* ─── Single-phase Inverters ──────────────────────────────────── */}
      <Section
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Single-phase Inverters
            <span style={localStyles.countBadge}>{single.length} type{single.length === 1 ? '' : 's'}</span>
          </span>
        }
        canEdit={canEditInv}
        anyEditRole={anyEdit}
      >
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 10px' }}>
          Only inverters listed here <strong>and marked In Stock</strong> can be
          picked on customer quotes. Use <strong>+ Add inverter</strong> to introduce
          a new size, the <strong>In Stock</strong> checkbox to temporarily pull a
          size from quotes without losing its row, or the <strong>×</strong> button
          to retire one permanently.
        </p>
        <InverterList items={single} which="single" canEdit={canEditInv}
                      onUpdate={updateInverter} onAdd={addInverter} onRemove={removeInverter} params={params} />
      </Section>

      {/* ─── 3-phase Inverters ───────────────────────────────────────── */}
      <Section
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            3-phase Inverters
            <span style={localStyles.countBadge}>{three.length} type{three.length === 1 ? '' : 's'}</span>
          </span>
        }
        canEdit={canEditInv}
        anyEditRole={anyEdit}
      >
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 10px' }}>
          Only inverters listed here <strong>and marked In Stock</strong> can be
          picked on customer quotes.
        </p>
        <InverterList items={three} which="three" canEdit={canEditInv}
                      onUpdate={updateInverter} onAdd={addInverter} onRemove={removeInverter} params={params} />
      </Section>

      {/* ─── Battery Packages (NEW in v3-54 — multi-package editor) ──── */}
      <Section title="Battery Packages"
               canEdit={canEditSection('batteryPackage')}
               anyEditRole={anyEdit}>
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 14px' }}>
          Each package defines a battery unit size, rack capacity, and the
          full pricing chain (battery / rack / ATS / critical loads / labor).
          Reps select the active package via a Step 2 dropdown; customers
          always see the first package. At least one package must remain.
        </p>
        <BatteryPackagesEditor packages={params.batteryPackages || []}
                               adminParams={params}
                               onChange={v => updateParam('batteryPackage', 'batteryPackages', v)}
                               canEdit={canEditSection('batteryPackage')} />
      </Section>
    </div>
  );
}

// ─── PanelSettingsRow ──────────────────────────────────────────────────────
function PanelSettingsRow({ label, row, setRow, canEdit, params }) {
  // v3-83 — Engineering enters COGS; the direct price is DERIVED and read-only.
  const derived = directFromCogs(row.panelCogs, params);
  return (
    <tr>
      <td style={localStyles.td}>{label}</td>
      <td style={{ ...localStyles.td, ...localStyles.tdNum }}>
        {canEdit ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="number" style={localStyles.cellInputNum}
              value={row.panelWatts} step={5} min={1}
              onChange={e => setRow({ panelWatts: parseInt(e.target.value) || 1 })} />
            <span style={{ color: COLORS.textMuted }}>W</span>
          </span>
        ) : `${row.panelWatts}W`}
      </td>
      {/* COGS (pre-VAT) — the only editable price field. */}
      <td style={{ ...localStyles.td, ...localStyles.tdNum }}>
        {canEdit ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: COLORS.textMuted }}>₱</span>
            <input type="number" style={localStyles.cellInputNum}
              value={Math.round(row.panelCogs ?? 0)} step={100} min={0}
              onChange={e => setRow({ panelCogs: parseFloat(e.target.value) || 0 })} />
          </span>
        ) : fmt.peso(Math.round(row.panelCogs ?? 0))}
      </td>
      {/* Derived Direct Purchase Price — never editable, never stored. */}
      <td style={{ ...localStyles.td, ...localStyles.tdNum, color: COLORS.textMuted }}>
        {fmt.peso(derived)}
      </td>
      <td style={{ ...localStyles.td, ...localStyles.tdNum }}>
        {canEdit ? (
          <input type="number" style={localStyles.cellInputNum}
            value={row.maxDcAcRatio} step={0.1} min={1.0} max={2.0}
            onChange={e => setRow({ maxDcAcRatio: parseFloat(e.target.value) || 1.3 })} />
        ) : row.maxDcAcRatio}
      </td>
      {/* v3-106 — panel stock flag. Unchecked ⇒ quotes on this phase are
          forced to 0 panels (batteries / inverters / RSD retrofits still
          orderable via the standalone paths). */}
      <td style={{ ...localStyles.td, textAlign: 'center' }}>
        <StockCheckbox
          checked={row.available !== false}
          onChange={v => setRow({ available: v })}
          canEdit={canEdit}
          title={`${label} panels ${row.available !== false ? 'in stock' : 'OUT OF STOCK — quotes on this phase get 0 panels'}`}
        />
      </td>
    </tr>
  );
}

// ─── InverterList ─────────────────────────────────────────────────────────
function InverterList({ items, which, canEdit, onUpdate, onAdd, onRemove, params }) {
  if (items.length === 0 && !canEdit) {
    return (
      <p style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', margin: 0 }}>
        No inverters configured.
      </p>
    );
  }
  return (
    <div>
      <table style={localStyles.invTable}>
        <thead>
          <tr>
            <th style={{ ...localStyles.invTh, width: '20%' }}>Rated kW</th>
            <th style={{ ...localStyles.invTh, width: '28%' }}>COGS (pre-VAT)</th>
            <th style={{ ...localStyles.invTh, width: '28%', color: COLORS.textMuted }}>Direct Purchase Price</th>
            <th style={{ ...localStyles.invTh, width: '12%', textAlign: 'center' }}>In Stock</th>
            {canEdit && <th style={{ ...localStyles.invTh, width: '12%', textAlign: 'right' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((inv, idx) => (
            <tr key={idx} style={inv.available === false ? localStyles.oosRow : null}>
              <td style={localStyles.invTd}>
                {canEdit ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" style={localStyles.kwInput}
                      value={inv.ratedKw} step={0.5} min={0.1}
                      onChange={e => onUpdate(which, idx, { ratedKw: parseFloat(e.target.value) || 0.1 })} />
                    <span style={{ color: COLORS.textMuted }}>kW</span>
                  </span>
                ) : `${inv.ratedKw} kW`}
              </td>
              {/* v3-83 — COGS (pre-VAT) is the editable field. */}
              <td style={localStyles.invTd}>
                {canEdit ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: COLORS.textMuted }}>₱</span>
                    <input type="number" style={localStyles.priceInput}
                      value={Math.round(inv.cogs ?? 0)} step={1000} min={0}
                      onChange={e => onUpdate(which, idx, { cogs: parseFloat(e.target.value) || 0 })} />
                  </span>
                ) : fmt.peso(Math.round(inv.cogs ?? 0))}
              </td>
              {/* Derived Direct Purchase Price — read-only. */}
              <td style={{ ...localStyles.invTd, color: COLORS.textMuted }}>
                {fmt.peso(directFromCogs(inv.cogs, params))}
              </td>
              {/* v3-106 — per-SKU stock flag. Unchecked ⇒ excluded from the
                  recommendation engine and the Step 2C dropdown, without
                  losing the row (no delete-and-recreate). */}
              <td style={{ ...localStyles.invTd, textAlign: 'center' }}>
                <StockCheckbox
                  checked={inv.available !== false}
                  onChange={v => onUpdate(which, idx, { available: v })}
                  canEdit={canEdit}
                  title={`${inv.ratedKw} kW inverter ${inv.available !== false ? 'in stock' : 'OUT OF STOCK — hidden from quotes'}`}
                />
              </td>
              {canEdit && (
                <td style={{ ...localStyles.invTd, textAlign: 'right' }}>
                  <button style={localStyles.deleteBtn}
                          onClick={() => onRemove(which, idx)}
                          title={`Remove ${inv.ratedKw} kW inverter`}>×</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <button style={localStyles.addBtn} onClick={() => onAdd(which)}>
          + Add inverter
        </button>
      )}
    </div>
  );
}

// ─── StockCheckbox (v3-106) ─────────────────────────────────────────────────
// Availability toggle used on panel-settings rows, inverter rows, and the
// RSD stock row. Read-only roles get a plain "In stock / Out of stock" badge
// instead of a disabled checkbox (clearer at a glance).
export function StockCheckbox({ checked, onChange, canEdit, title }) {
  if (!canEdit) {
    return (
      <span style={checked ? localStyles.stockBadgeIn : localStyles.stockBadgeOut}>
        {checked ? 'In stock' : 'Out of stock'}
      </span>
    );
  }
  return (
    <input type="checkbox" checked={!!checked}
           onChange={e => onChange(e.target.checked)}
           title={title || (checked ? 'In stock' : 'Out of stock')}
           style={localStyles.stockCheckbox} />
  );
}

const localStyles = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px',
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}` },
  td: { padding: '8px 12px', borderBottom: `1px solid ${COLORS.divider}` },
  tdNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  cellInputNum: { width: 80, padding: '4px 8px', textAlign: 'right',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    fontVariantNumeric: 'tabular-nums' },
  countBadge: { fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    backgroundColor: COLORS.brandCream, padding: '3px 10px', borderRadius: 10,
    textTransform: 'none', letterSpacing: 0 },
  invTable: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  invTh: { textAlign: 'left', padding: '10px 12px', fontSize: 11,
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
    color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.divider}` },
  invTd: { padding: '8px 12px', borderBottom: `1px solid ${COLORS.divider}`,
    verticalAlign: 'middle' },
  kwInput: { width: 80, padding: '6px 10px',
    border: `1px solid ${COLORS.divider}`, borderRadius: 4,
    fontSize: 14, backgroundColor: '#DBEAFE', fontFamily: 'inherit' },
  priceInput: { width: 120, padding: '6px 10px',
    border: `1px solid ${COLORS.divider}`, borderRadius: 4,
    fontSize: 14, backgroundColor: '#DBEAFE', fontFamily: 'inherit' },
  addBtn: { marginTop: 12, padding: '8px 16px', fontSize: 13, fontWeight: 600,
    background: 'transparent', border: `1px dashed ${COLORS.brandGreen}`,
    borderRadius: 6, color: COLORS.brandGreen, cursor: 'pointer', fontFamily: 'inherit' },
  deleteBtn: { background: 'transparent', border: `1px solid ${COLORS.divider}`,
    color: '#B91C1C', fontSize: 14, fontWeight: 700,
    width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
    fontFamily: 'inherit', padding: 0, lineHeight: 1 },
  // v3-106 — stock-flag UI
  stockCheckbox: { width: 16, height: 16, cursor: 'pointer', accentColor: '#15803D' },
  stockBadgeIn: { fontSize: 11, fontWeight: 600, color: '#15803D',
    backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: 8 },
  stockBadgeOut: { fontSize: 11, fontWeight: 600, color: '#B91C1C',
    backgroundColor: '#FEE2E2', padding: '2px 8px', borderRadius: 8 },
  oosRow: { opacity: 0.55 },
  stockRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, padding: '10px 0 4px', marginTop: 6,
    borderTop: `1px dashed ${COLORS.divider}` },
  stockRowLabel: { fontSize: 13, fontWeight: 600, display: 'flex',
    flexDirection: 'column', gap: 3 },
  stockRowHint: { fontSize: 12, fontWeight: 400, color: COLORS.textMuted,
    maxWidth: 520 },
};
