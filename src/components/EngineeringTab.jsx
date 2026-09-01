// =============================================================================
// ENGINEERING TAB — second of three admin tabs (v3-54)
// -----------------------------------------------------------------------------
// Section order (per spec; Variable Charges moved to the Inventory tab in
// v3-106 to sit beside the cabling tier tables + the RSD stock toggle):
//   1. Device Library       (moved here from Inventory tab, at the top)
//   2. Roof Material (per kWp)
//   3. Location / Delivery Charges
//   4. Standalone Retrofit Charges
//   5. Fixed Overhead
//   6. Schedule Constants
//
// All edits flow through props from AdminShell. Edit gating per section is
// read from permissions.js — Engineering + Super Admin can edit; Product +
// Audit see read-only.
// =============================================================================

import React from 'react';
import { COLORS, fmt } from './ui.jsx';
import { Section, Param, DeliveryLocationsTable, MiscCatalogTable,
         adminStyles } from './AdminShared.jsx';
import {
  canEditAdminSection, canEditInventory, hasAnyEditAccess,
} from '../lib/permissions.js';

export default function EngineeringTab({
  params, updateParam,
  devices, updateDevice, addDevice, deleteDevice,
  accessLevel,
}) {
  const anyEdit = hasAnyEditAccess(accessLevel);
  const canEditInv = canEditInventory(accessLevel);
  const canEditSection = (k) => canEditAdminSection(accessLevel, k);

  return (
    <div>
      {/* ─── Device Library (moved here from Inventory tab) ─────────── */}
      <Section
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Device Library
            {canEditInv && (
              <button onClick={addDevice} style={localStyles.addPillBtn}>+ Add device</button>
            )}
          </span>
        }
        canEdit={canEditInv}
        anyEditRole={anyEdit}
      >
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 10px' }}>
          Used by Step 1 device picker. <strong>Avg Power = Peak Power × % of Peak</strong>
          {' '}is recomputed live as you edit.
        </p>
        <table style={localStyles.table}>
          <thead>
            <tr>
              <th style={localStyles.th}>Device Name</th>
              <th style={{ ...localStyles.th, textAlign: 'right' }}>Peak Power</th>
              <th style={{ ...localStyles.th, textAlign: 'right' }}>% of Peak</th>
              <th style={{ ...localStyles.th, textAlign: 'right' }}>Avg Power</th>
              {canEditInv && <th style={localStyles.th} aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {devices.map((dev, i) => {
              const avg = dev.peakKw * dev.dutyFactor;
              return (
                <tr key={i}>
                  <td style={localStyles.td}>
                    {canEditInv ? (
                      <input style={localStyles.cellInput} value={dev.name}
                        onChange={e => updateDevice(i, { name: e.target.value })} />
                    ) : dev.name}
                  </td>
                  <td style={{ ...localStyles.td, ...localStyles.tdNum }}>
                    {canEditInv ? (
                      <input type="number" style={localStyles.cellInputNum}
                        value={dev.peakKw} step={0.1} min={0}
                        onChange={e => updateDevice(i, { peakKw: parseFloat(e.target.value) || 0 })} />
                    ) : `${fmt.num(dev.peakKw, 2)} kW`}
                  </td>
                  <td style={{ ...localStyles.td, ...localStyles.tdNum }}>
                    {canEditInv ? (
                      <input type="number" style={localStyles.cellInputNum}
                        value={dev.dutyFactor * 100} step={5} min={0} max={100}
                        onChange={e => updateDevice(i, {
                          dutyFactor: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                        })} />
                    ) : `${(dev.dutyFactor * 100).toFixed(0)}%`}
                  </td>
                  <td style={{ ...localStyles.td, ...localStyles.tdNum, color: '#15803D', fontWeight: 600 }}>
                    {fmt.num(avg, 2)} kW
                  </td>
                  {canEditInv && (
                    <td style={{ ...localStyles.td, textAlign: 'right' }}>
                      <button onClick={() => deleteDevice(i)} style={localStyles.deleteBtn}
                              title="Remove this device">×</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ─── Variable Charges — MOVED to the Inventory tab in v3-106 ───
           (cable / labor / RSD charges sit better beside the cabling tier
           tables and the new RSD stock toggle). Same 'variableCharges'
           section key and edit gate — pure relocation, no permission or
           server change. ─────────────────────────────────────────────── */}

      {/* ─── Roof Material ───────────────────────────────────────────── */}
      <Section title="Roof Material (per kWp)"
               canEdit={canEditSection('roofMaterial')}
               anyEditRole={anyEdit}>
        <Param label="Asphalt / Shingles / Tiled — per kWp surcharge" isPeso step={500}
               value={params.roofAsphaltPerKwpCogs}
               cogs
               onChange={v => updateParam('roofMaterial', 'roofAsphaltPerKwpCogs', v)}
               canEdit={canEditSection('roofMaterial')} />
        <Param label="Concrete — per kWp surcharge" isPeso step={500}
               value={params.roofConcretePerKwpCogs}
               cogs
               onChange={v => updateParam('roofMaterial', 'roofConcretePerKwpCogs', v)}
               canEdit={canEditSection('roofMaterial')} />
      </Section>

      {/* ─── Misc Materials / Labor / Services catalog (v3-138) ──────── */}
      <Section title="Miscellaneous Materials, Labor, Services &amp; Other Adjustments Catalog"
               canEdit={canEditSection('miscCatalog')}
               anyEditRole={anyEdit}>
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: '0 0 10px' }}>
          The standing list a rep picks from in <strong>Step 2F</strong> of the calculator.
          Enter <strong>pre-VAT cost</strong> (the BOM sheet's "Cost (VAT Exc)" column) —
          the customer price is derived, same as every other cost on this tab. A rep who
          needs something not listed here uses <em>Other (please specify)</em> and prices
          it by hand.
        </p>
        <MiscCatalogTable
          items={params.miscCatalog}
          canEdit={canEditSection('miscCatalog')}
          onChange={rows => updateParam('miscCatalog', 'miscCatalog', rows)}
          adminParams={params}
        />
      </Section>

      {/* ─── Location / Delivery Charges ────────────────────────────── */}
      <Section title="Location / Delivery Charges"
               canEdit={canEditSection('location')}
               anyEditRole={anyEdit}>
        {/* v3-116 — the four Cebu/Siargao scalars became the dynamic
            deliveryLocations table below the Luzon pair. Luzon main island
            stays structural (per-km excess formula, AA38). */}
        <Param label="Luzon Free-Delivery Radius" suffix="km" step={5} min={1} max={500}
               value={params.luzonFreeTravelKm}
               onChange={v => updateParam('location', 'luzonFreeTravelKm', v)}
               canEdit={canEditSection('location')}
               hint="Distance from the Parañaque logistics hub within which Luzon delivery is free. Beyond it, the fixed fee below is charged once plus the per-km rate on the excess distance only. The customer sentences and the proposal's Logistics Add-On clause quote this value." />
        <Param label="Luzon Beyond-Radius — Fixed Fee" isPeso step={500}
               value={params.luzonOver30FixedFeeCogs}
               cogs
               onChange={v => updateParam('location', 'luzonOver30FixedFeeCogs', v)}
               canEdit={canEditSection('location')} />
        <Param label="Luzon Beyond-Radius — Per Km" isPeso step={10}
               value={params.luzonOver30PerKmCogs}
               cogs
               onChange={v => updateParam('location', 'luzonOver30PerKmCogs', v)}
               canEdit={canEditSection('location')} />
        <div style={{ marginTop: 14 }}>
          <DeliveryLocationsTable
            locations={params.deliveryLocations}
            canEdit={canEditSection('location')}
            adminParams={params}
            onChange={rows => updateParam('location', 'deliveryLocations', rows)}
          />
        </div>
      </Section>

      {/* ─── Standalone Retrofit Charges ─────────────────────────────── */}
      <Section title="Standalone Retrofit Charges"
               canEdit={canEditSection('standaloneCharges')}
               anyEditRole={anyEdit}>
        <Param label="RSD Standalone Labor (per panel)" isPeso step={100}
               hint="Charged on RSD-only retrofit orders without solar"
               value={params.rsdStandaloneLaborPerPanelCogs}
               cogs
               onChange={v => updateParam('standaloneCharges', 'rsdStandaloneLaborPerPanelCogs', v)}
               canEdit={canEditSection('standaloneCharges')} />
        <Param label="RSD Standalone Labor Mobilization" isPeso step={500}
               value={params.rsdStandaloneLaborMobilizationCogs}
               cogs
               onChange={v => updateParam('standaloneCharges', 'rsdStandaloneLaborMobilizationCogs', v)}
               canEdit={canEditSection('standaloneCharges')} />
        <Param label="Inverter Standalone Labor (per unit)" isPeso step={500}
               hint="Charged on inverter-only retrofit orders without solar"
               value={params.inverterStandaloneLaborPerUnitCogs}
               cogs
               onChange={v => updateParam('standaloneCharges', 'inverterStandaloneLaborPerUnitCogs', v)}
               canEdit={canEditSection('standaloneCharges')} />
        <Param label="Inverter Standalone Mobilization" isPeso step={500}
               value={params.inverterStandaloneMobilizationCogs}
               cogs
               onChange={v => updateParam('standaloneCharges', 'inverterStandaloneMobilizationCogs', v)}
               canEdit={canEditSection('standaloneCharges')} />
      </Section>

      {/* ─── Fixed Overhead ──────────────────────────────────────────── */}
      <Section title="Fixed Overhead"
               canEdit={canEditSection('fixedOverhead')}
               anyEditRole={anyEdit}>
        <Param label="Delivery & Logistics" isPeso step={100}
               value={params.fixedOverheadDeliveryLogisticsCogs}
               cogs
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadDeliveryLogisticsCogs', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Warehouse" isPeso step={100}
               value={params.fixedOverheadWarehouseCogs}
               cogs
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadWarehouseCogs', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Customs" isPeso step={100}
               value={params.fixedOverheadCustomsCogs}
               cogs
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadCustomsCogs', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Safety, Supervision & Testing" isPeso step={500}
               value={params.fixedOverheadSafetySupervisionCogs}
               cogs
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadSafetySupervisionCogs', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Testing & Commissioning" isPeso step={500}
               value={params.fixedOverheadTestingCogs}
               cogs
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadTestingCogs', v)}
               canEdit={canEditSection('fixedOverhead')} />
      </Section>

      {/* ─── Schedule Constants ─────────────────────────────────────── */}
      <Section title="Schedule Constants"
               canEdit={canEditSection('scheduleConstants')}
               anyEditRole={anyEdit}>
        <Param label="kWh per kWp per Day (daily yield)" suffix="kWh" step={0.1}
               value={params.kWhPerKwpPerDay}
               onChange={v => updateParam('scheduleConstants', 'kWhPerKwpPerDay', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Battery Round-Trip Efficiency" isPct step={0.01}
               value={params.batteryEfficiency}
               onChange={v => updateParam('scheduleConstants', 'batteryEfficiency', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Max Unabsorbed Excess Solar — kWh/day" step={0.1} min={0} max={24}
               value={params.maxDailySpillKwh}
               onChange={v => updateParam('scheduleConstants', 'maxDailySpillKwh', v)}
               canEdit={canEditSection('scheduleConstants')}
               hint="Fewest-panels mode: largest daily solar spill the recommended battery may leave unstored. 0 = absorb everything." />
        <Param label="Battery Depth of Discharge" isPct step={0.01}
               value={params.batteryDepthOfDischarge}
               onChange={v => updateParam('scheduleConstants', 'batteryDepthOfDischarge', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Panel Annual Degradation" isPct step={0.001}
               value={params.panelAnnualDegradation}
               onChange={v => updateParam('scheduleConstants', 'panelAnnualDegradation', v)}
               canEdit={canEditSection('scheduleConstants')} />
        {/* v3-190 — LCOE / NPV Discount Rate and Maintenance Inflation Rate
            MOVED to the FinCo tab's Returns Assumptions ('returnsAssumptions'
            section — FinCo Admin + Super Admin edit). They are LCOE/IRR
            assumptions, not engineering constants. */}
        <Param label="Net Metering Credit Efficiency" isPct step={0.01}
               value={params.netMeteringEfficiency}
               onChange={v => updateParam('scheduleConstants', 'netMeteringEfficiency', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Preventive Maintenance (per panel)" isPeso step={50}
               value={params.preventiveMaintenancePerPanelCogs}
               cogs
               onChange={v => updateParam('scheduleConstants', 'preventiveMaintenancePerPanelCogs', v)}
               canEdit={canEditSection('scheduleConstants')}
               hint="Priced into LCOE & IRR at the assumed gross margin set on the FinCo tab, where the imputed price is shown." />
        <Param label="Preventive Maintenance (per visit)" isPeso step={500}
               value={params.preventiveMaintenancePerVisitCogs}
               cogs
               onChange={v => updateParam('scheduleConstants', 'preventiveMaintenancePerVisitCogs', v)}
               canEdit={canEditSection('scheduleConstants')}
               hint="Priced into LCOE & IRR at the assumed gross margin set on the FinCo tab, where the imputed price is shown." />
        <Param label="Min. Days to First Post-Install Payment" suffix="days" step={1}
               value={params.minDaysToFirstPostInstallPayment}
               onChange={v => updateParam('scheduleConstants', 'minDaysToFirstPostInstallPayment', v)}
               canEdit={canEditSection('scheduleConstants')}
               min={14} max={180}
               hint="Set this based on your current installation queue and capacity. The first post-installation payment due date must fall after a realistic installation completion date." />
      </Section>
    </div>
  );
}

const localStyles = {
  addPillBtn: { background: COLORS.brandGreen, color: '#FFFFFF', border: 'none',
    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
    cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px',
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}` },
  td: { padding: '8px 12px', borderBottom: `1px solid ${COLORS.divider}` },
  tdNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  cellInput: { width: '100%', padding: '4px 8px',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    boxSizing: 'border-box' },
  cellInputNum: { width: 80, padding: '4px 8px', textAlign: 'right',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 4,
    backgroundColor: COLORS.inputTint, fontFamily: 'inherit', fontSize: 13,
    fontVariantNumeric: 'tabular-nums' },
  deleteBtn: { background: 'transparent', border: `1px solid ${COLORS.divider}`,
    color: '#B91C1C', fontSize: 14, fontWeight: 700,
    width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
    fontFamily: 'inherit', padding: 0, lineHeight: 1 },
};
