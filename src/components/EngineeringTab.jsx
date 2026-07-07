// =============================================================================
// ENGINEERING TAB — second of three admin tabs (v3-54)
// -----------------------------------------------------------------------------
// Section order (per spec):
//   1. Device Library       (moved here from Inventory tab, at the top)
//   2. Variable Charges
//   3. Roof Material (per kWp)
//   4. Location / Delivery Charges
//   5. Standalone Retrofit Charges
//   6. Fixed Overhead
//   7. Schedule Constants
//
// All edits flow through props from AdminShell. Edit gating per section is
// read from permissions.js — Engineering + Super Admin can edit; Product +
// Audit see read-only.
// =============================================================================

import React from 'react';
import { COLORS, fmt } from './ui.jsx';
import { Section, Param, adminStyles } from './AdminShared.jsx';
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

      {/* ─── Variable Charges ────────────────────────────────────────── */}
      <Section title="Variable Charges"
               canEdit={canEditSection('variableCharges')}
               anyEditRole={anyEdit}>
        <Param label="Additional DC Cable (per meter)" isPeso step={10}
               value={params.additionalDcCablePerMeter}
               onChange={v => updateParam('variableCharges', 'additionalDcCablePerMeter', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="Additional AC Cable (per meter)" isPeso step={10}
               value={params.additionalAcCablePerMeter}
               onChange={v => updateParam('variableCharges', 'additionalAcCablePerMeter', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="Labor & Installation (per kWp)" isPeso step={500}
               value={params.laborInstallationPerKwp}
               onChange={v => updateParam('variableCharges', 'laborInstallationPerKwp', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="RSD — Variable Charge (per panel)" isPeso step={100}
               value={params.rsdVariablePerPanel}
               onChange={v => updateParam('variableCharges', 'rsdVariablePerPanel', v)}
               canEdit={canEditSection('variableCharges')} />
        <Param label="RSD — Fixed Transmitter" isPeso step={500}
               value={params.rsdFixedTransmitter}
               onChange={v => updateParam('variableCharges', 'rsdFixedTransmitter', v)}
               canEdit={canEditSection('variableCharges')} />
      </Section>

      {/* ─── Roof Material ───────────────────────────────────────────── */}
      <Section title="Roof Material (per kWp)"
               canEdit={canEditSection('roofMaterial')}
               anyEditRole={anyEdit}>
        <Param label="Asphalt / Shingles / Tiled — per kWp surcharge" isPeso step={500}
               value={params.roofAsphaltPerKwp}
               onChange={v => updateParam('roofMaterial', 'roofAsphaltPerKwp', v)}
               canEdit={canEditSection('roofMaterial')} />
        <Param label="Concrete — per kWp surcharge" isPeso step={500}
               value={params.roofConcretePerKwp}
               onChange={v => updateParam('roofMaterial', 'roofConcretePerKwp', v)}
               canEdit={canEditSection('roofMaterial')} />
      </Section>

      {/* ─── Location / Delivery Charges ────────────────────────────── */}
      <Section title="Location / Delivery Charges"
               canEdit={canEditSection('location')}
               anyEditRole={anyEdit}>
        <Param label="Cebu — Fixed Fee" isPeso step={500}
               value={params.cebuFixedFee}
               onChange={v => updateParam('location', 'cebuFixedFee', v)}
               canEdit={canEditSection('location')} />
        <Param label="Cebu — Per Panel" isPeso step={50}
               value={params.cebuPerPanel}
               onChange={v => updateParam('location', 'cebuPerPanel', v)}
               canEdit={canEditSection('location')} />
        <Param label="Siargao — Fixed Fee" isPeso step={500}
               value={params.siargaoFixedFee}
               onChange={v => updateParam('location', 'siargaoFixedFee', v)}
               canEdit={canEditSection('location')} />
        <Param label="Siargao — Per Panel" isPeso step={50}
               value={params.siargaoPerPanel}
               onChange={v => updateParam('location', 'siargaoPerPanel', v)}
               canEdit={canEditSection('location')} />
        <Param label="Luzon Over-30km — Fixed Fee" isPeso step={500}
               value={params.luzonOver30FixedFee}
               onChange={v => updateParam('location', 'luzonOver30FixedFee', v)}
               canEdit={canEditSection('location')} />
        <Param label="Luzon Over-30km — Per Km" isPeso step={10}
               value={params.luzonOver30PerKm}
               onChange={v => updateParam('location', 'luzonOver30PerKm', v)}
               canEdit={canEditSection('location')} />
      </Section>

      {/* ─── Standalone Retrofit Charges ─────────────────────────────── */}
      <Section title="Standalone Retrofit Charges"
               canEdit={canEditSection('standaloneCharges')}
               anyEditRole={anyEdit}>
        <Param label="RSD Standalone Labor (per panel)" isPeso step={100}
               hint="Charged on RSD-only retrofit orders without solar"
               value={params.rsdStandaloneLaborPerPanel}
               onChange={v => updateParam('standaloneCharges', 'rsdStandaloneLaborPerPanel', v)}
               canEdit={canEditSection('standaloneCharges')} />
        <Param label="RSD Standalone Labor Mobilization" isPeso step={500}
               value={params.rsdStandaloneLaborMobilization}
               onChange={v => updateParam('standaloneCharges', 'rsdStandaloneLaborMobilization', v)}
               canEdit={canEditSection('standaloneCharges')} />
        <Param label="Inverter Standalone Labor (per unit)" isPeso step={500}
               hint="Charged on inverter-only retrofit orders without solar"
               value={params.inverterStandaloneLaborPerUnit}
               onChange={v => updateParam('standaloneCharges', 'inverterStandaloneLaborPerUnit', v)}
               canEdit={canEditSection('standaloneCharges')} />
        <Param label="Inverter Standalone Mobilization" isPeso step={500}
               value={params.inverterStandaloneMobilization}
               onChange={v => updateParam('standaloneCharges', 'inverterStandaloneMobilization', v)}
               canEdit={canEditSection('standaloneCharges')} />
      </Section>

      {/* ─── Fixed Overhead ──────────────────────────────────────────── */}
      <Section title="Fixed Overhead"
               canEdit={canEditSection('fixedOverhead')}
               anyEditRole={anyEdit}>
        <Param label="Delivery & Logistics" isPeso step={100}
               value={params.fixedOverheadDeliveryLogistics}
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadDeliveryLogistics', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Warehouse" isPeso step={100}
               value={params.fixedOverheadWarehouse}
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadWarehouse', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Customs" isPeso step={100}
               value={params.fixedOverheadCustoms}
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadCustoms', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Safety, Supervision & Testing" isPeso step={500}
               value={params.fixedOverheadSafetySupervision}
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadSafetySupervision', v)}
               canEdit={canEditSection('fixedOverhead')} />
        <Param label="Testing & Commissioning" isPeso step={500}
               value={params.fixedOverheadTesting}
               onChange={v => updateParam('fixedOverhead', 'fixedOverheadTesting', v)}
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
        <Param label="Battery Depth of Discharge" isPct step={0.01}
               value={params.batteryDepthOfDischarge}
               onChange={v => updateParam('scheduleConstants', 'batteryDepthOfDischarge', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Panel Annual Degradation" isPct step={0.001}
               value={params.panelAnnualDegradation}
               onChange={v => updateParam('scheduleConstants', 'panelAnnualDegradation', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="LCOE / NPV Discount Rate" isPct step={0.005}
               value={params.lcoeNpvDiscountRate}
               onChange={v => updateParam('scheduleConstants', 'lcoeNpvDiscountRate', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Maintenance Inflation Rate" isPct step={0.005}
               value={params.maintenanceInflationRate}
               onChange={v => updateParam('scheduleConstants', 'maintenanceInflationRate', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Net Metering Credit Efficiency" isPct step={0.01}
               value={params.netMeteringEfficiency}
               onChange={v => updateParam('scheduleConstants', 'netMeteringEfficiency', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Preventive Maintenance (per panel)" isPeso step={50}
               value={params.preventiveMaintenancePerPanel}
               onChange={v => updateParam('scheduleConstants', 'preventiveMaintenancePerPanel', v)}
               canEdit={canEditSection('scheduleConstants')} />
        <Param label="Preventive Maintenance (per visit)" isPeso step={500}
               value={params.preventiveMaintenancePerVisit}
               onChange={v => updateParam('scheduleConstants', 'preventiveMaintenancePerVisit', v)}
               canEdit={canEditSection('scheduleConstants')} />
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
