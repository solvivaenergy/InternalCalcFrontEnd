// =============================================================================
// INVENTORY TAB — first of three admin tabs (v3-54)
// -----------------------------------------------------------------------------
// Section order (per spec):
//   1. Panel Settings        (existing, Inventory)
//   2. Solar Panel & Mounting (moved here from Admin Parameters)
//   3. SINGLE-PHASE AC/DC Cabling (% of Panels Price) (moved from Admin Params)
//   3b. THREE-PHASE AC/DC Cabling (% of Panels Price) (NEW in v3-62)
//   4. Single-phase Inverters (existing, Inventory)
//   5. 3-phase Inverters     (existing, Inventory)
//   6. Battery Packages      (rewritten — multi-package editor; was a 6-field
//                             single-pack section in Admin Parameters)
//
// All edits flow through props from AdminShell, which owns the unified state
// and the global save bar. Edit gating per section is read from permissions.
// =============================================================================

import React from 'react';
import { COLORS, fmt } from './ui.jsx';
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
              <th style={{ ...localStyles.th, textAlign: 'right' }}>Direct Purchase Price</th>
              <th style={{ ...localStyles.th, textAlign: 'right' }}>Max DC/AC Ratio</th>
            </tr>
          </thead>
          <tbody>
            <PanelSettingsRow label="Single-phase" row={panelSingle} setRow={updatePanelSingle} canEdit={canEditInv} />
            <PanelSettingsRow label="3-phase"      row={panelThree}  setRow={updatePanelThree}  canEdit={canEditInv} />
          </tbody>
        </table>
      </Section>

      {/* ─── Solar Panel & Mounting (moved from Admin Parameters) ─────── */}
      <Section title="Solar Panel & Mounting"
               canEdit={canEditSection('solarPanel')}
               anyEditRole={anyEdit}>
        <Param label="Mounting Support Floor Price" isPeso step={500}
               value={params.mountingSupportFloorPrice}
               onChange={v => updateParam('solarPanel', 'mountingSupportFloorPrice', v)}
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
          The list IS the available stock — only inverters listed here can be picked
          on customer quotes. Use <strong>+ Add inverter</strong> to introduce a new
          size, or the <strong>×</strong> button on a row to retire one.
        </p>
        <InverterList items={single} which="single" canEdit={canEditInv}
                      onUpdate={updateInverter} onAdd={addInverter} onRemove={removeInverter} />
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
          The list IS the available stock — only inverters listed here can be picked
          on customer quotes.
        </p>
        <InverterList items={three} which="three" canEdit={canEditInv}
                      onUpdate={updateInverter} onAdd={addInverter} onRemove={removeInverter} />
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
                               onChange={v => updateParam('batteryPackage', 'batteryPackages', v)}
                               canEdit={canEditSection('batteryPackage')} />
      </Section>
    </div>
  );
}

// ─── PanelSettingsRow ──────────────────────────────────────────────────────
function PanelSettingsRow({ label, row, setRow, canEdit }) {
  const priceForDisplay = Math.round(row.panelDirectPrice);
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
      <td style={{ ...localStyles.td, ...localStyles.tdNum }}>
        {canEdit ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: COLORS.textMuted }}>₱</span>
            <input type="number" style={localStyles.cellInputNum}
              value={priceForDisplay} step={100} min={0}
              onChange={e => setRow({ panelDirectPrice: parseFloat(e.target.value) || 0 })} />
          </span>
        ) : fmt.peso(priceForDisplay)}
      </td>
      <td style={{ ...localStyles.td, ...localStyles.tdNum }}>
        {canEdit ? (
          <input type="number" style={localStyles.cellInputNum}
            value={row.maxDcAcRatio} step={0.1} min={1.0} max={2.0}
            onChange={e => setRow({ maxDcAcRatio: parseFloat(e.target.value) || 1.3 })} />
        ) : row.maxDcAcRatio}
      </td>
    </tr>
  );
}

// ─── InverterList ─────────────────────────────────────────────────────────
function InverterList({ items, which, canEdit, onUpdate, onAdd, onRemove }) {
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
            <th style={{ ...localStyles.invTh, width: '30%' }}>Rated kW</th>
            <th style={{ ...localStyles.invTh, width: '50%' }}>Direct Purchase Price</th>
            {canEdit && <th style={{ ...localStyles.invTh, width: '20%', textAlign: 'right' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((inv, idx) => (
            <tr key={idx}>
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
              <td style={localStyles.invTd}>
                {canEdit ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: COLORS.textMuted }}>₱</span>
                    <input type="number" style={localStyles.priceInput}
                      value={Math.ceil(inv.directPrice)} step={1000} min={0}
                      onChange={e => onUpdate(which, idx, { directPrice: parseFloat(e.target.value) || 0 })} />
                  </span>
                ) : fmt.peso(Math.ceil(inv.directPrice))}
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
};
