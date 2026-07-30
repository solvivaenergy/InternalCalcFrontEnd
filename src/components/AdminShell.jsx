// =============================================================================
// ADMIN SHELL — owns admin state, save bar, Maintenance Mode block, tab content
// -----------------------------------------------------------------------------
// v3-54: replaces the two-page Admin/Inventory split with a unified 3-tab
// shell. State (params + panelSettings + inverters + devices + battery pkgs)
// lives here at the top so dirty edits persist across tab switches and one
// global Save bar at the bottom commits everything.
//
// LAYOUT
//   ┌────────────────────────────────────────┐
//   │ Header (title, role, sign-out)         │
//   ├────────────────────────────────────────┤
//   │ MaintenanceModeBlock                   │  ← always visible
//   │   ContactGatePasswordToggle            │
//   ├────────────────────────────────────────┤
//   │ AdminTabs (Inventory|Engineering|Prod) │  ← in App.jsx, not here
//   ├────────────────────────────────────────┤
//   │ Tab content (Inventory|Engineering|    │
//   │   Product), based on `tab` prop        │
//   ├────────────────────────────────────────┤
//   │ Save / Discard bar (global)            │
//   └────────────────────────────────────────┘
//
// VISIBILITY
//   All four admin roles see every section in every tab. Sections outside the
//   role's edit allowlist render read-only (greyed). Edit allowlists live in
//   permissions.js.
// =============================================================================

import React, { useState } from 'react';
import { ADMIN_PARAMS } from '../data/adminParams.js';
import {
  PANEL_SETTINGS, INVERTERS_SINGLE_PHASE, INVERTERS_THREE_PHASE,
} from '../data/inventory.js';
import { DEVICES } from '../data/devices.js';
import { DEFAULTS, AUTH } from '../config.js';
import { COLORS, CalloutBox } from './ui.jsx';
import * as paramsService from '../lib/paramsService.js';
import {
  canEditAdminSection, canEditInventory, hasAnyEditAccess,
  roleLabel, PARAM_KEY_TO_SECTION,
} from '../lib/permissions.js';
import { adminStyles, ContactGatePasswordToggle } from './AdminShared.jsx';
import InventoryTab from './InventoryTab.jsx';
import EngineeringTab from './EngineeringTab.jsx';
import ProductTab from './ProductTab.jsx';

export default function AdminShell({ tab, accessLevel, onLogout, savingDisabled }) {
  const anyEdit = hasAnyEditAccess(accessLevel);
  const canEditMaintenance = canEditAdminSection(accessLevel, 'maintenance');
  const canEditInv = canEditInventory(accessLevel);

  // ─── Unified state (persists across tab switches) ─────────────────────────
  const [params, setParams] = useState(() => JSON.parse(JSON.stringify(ADMIN_PARAMS)));
  const [panelSingle, setPanelSingle] = useState({ ...PANEL_SETTINGS.singlePhase });
  const [panelThree,  setPanelThree]  = useState({ ...PANEL_SETTINGS.threePhase });
  const [single,  setSingle]  = useState(() => INVERTERS_SINGLE_PHASE.map(i => ({ ...i })));
  const [three,   setThree]   = useState(() => INVERTERS_THREE_PHASE.map(i => ({ ...i })));
  const [devices, setDevices] = useState(() => DEVICES.map(d => ({ ...d })));
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const markDirty = () => { setDirty(true); setSaveStatus(null); };

  // Param update — gated by section permission.
  const canEditSection = (sectionKey) => canEditAdminSection(accessLevel, sectionKey);
  const updateParam = (sectionKey, key, value) => {
    if (!canEditSection(sectionKey)) return;
    setParams(p => ({ ...p, [key]: value }));
    markDirty();
  };

  // Inventory mutations — only Engineering + Super Admin (canEditInv).
  const updatePanelSingle = (patch) => { if (!canEditInv) return; setPanelSingle(p => ({ ...p, ...patch })); markDirty(); };
  const updatePanelThree  = (patch) => { if (!canEditInv) return; setPanelThree(p  => ({ ...p, ...patch })); markDirty(); };
  const updateInverter = (which, idx, patch) => {
    if (!canEditInv) return;
    const setter = which === 'single' ? setSingle : setThree;
    setter(s => s.map((inv, i) => i === idx ? { ...inv, ...patch } : inv));
    markDirty();
  };
  const addInverter = (which) => {
    if (!canEditInv) return;
    const setter = which === 'single' ? setSingle : setThree;
    setter(s => {
      const next = [...s, { ratedKw: 5, cogs: 0, directPrice: 0, available: true }];
      return next.sort((a, b) => a.ratedKw - b.ratedKw);
    });
    markDirty();
  };
  const removeInverter = (which, idx) => {
    if (!canEditInv) return;
    const arr = which === 'single' ? single : three;
    const inv = arr[idx];
    if (!window.confirm(`Remove the ${inv.ratedKw} kW inverter from the ${which === 'single' ? 'single-phase' : '3-phase'} list?`)) return;
    const setter = which === 'single' ? setSingle : setThree;
    setter(s => s.filter((_, i) => i !== idx));
    markDirty();
  };
  const updateDevice = (idx, patch) => {
    if (!canEditInv) return;
    setDevices(d => d.map((dev, i) => i === idx ? { ...dev, ...patch } : dev));
    markDirty();
  };
  const addDevice = () => {
    if (!canEditInv) return;
    setDevices(d => [...d, { name: 'New Device', peakKw: 1.0, dutyFactor: 1.0 }]);
    markDirty();
  };
  const deleteDevice = (idx) => {
    if (!canEditInv) return;
    if (!window.confirm(`Remove "${devices[idx].name}" from the device library?`)) return;
    setDevices(d => d.filter((_, i) => i !== idx));
    markDirty();
  };

  // ─── Validation ───────────────────────────────────────────────────────────
  const tiersValid = Array.isArray(params.cablingTiers) && params.cablingTiers.length > 0;
  const tiers3pValid = Array.isArray(params.cablingTiersThreePhase) && params.cablingTiersThreePhase.length > 0;
  const validityDays = params.quoteValidityDays ?? DEFAULTS.quoteValidityDays;
  const validityDaysValid = Number.isInteger(params.quoteValidityDays) && params.quoteValidityDays >= 1;
  const promosValid = (() => {
    const codes = (params.promoCodes || []).map(p => (p.code || '').trim().toUpperCase());
    if (codes.some(c => c === '')) return { ok: false, msg: 'Every promo code must have a non-empty Code value.' };
    const seen = new Set();
    for (const c of codes) {
      if (seen.has(c)) return { ok: false, msg: `Duplicate promo code "${c}" — codes must be unique.` };
      seen.add(c);
    }
    return { ok: true };
  })();
  const battPkgsValid = Array.isArray(params.batteryPackages) && params.batteryPackages.length > 0;
  // v3-75: tiered minimum-DP table. Mirrors the server-side rules in
  // netlify/functions/parameters.js — 1–10 rows, base row anchored at ₱0,
  // strictly ascending thresholds, fractions within 0–50%.
  // v3-116 — delivery locations: <=10 rows, labels non-empty + unique, COGS
  // finite >= 0. Empty array IS valid (dropdown = Luzon + Other only).
  const deliveryLocationsValid = (() => {
    const rows = params.deliveryLocations;
    if (rows == null) return { ok: true };
    if (!Array.isArray(rows)) return { ok: false, msg: 'Delivery locations must be a list.' };
    if (rows.length > 10) return { ok: false, msg: 'At most 10 delivery locations.' };
    const seen = new Set();
    for (const r of rows) {
      const lbl = String(r?.label || '').trim();
      if (lbl === '') return { ok: false, msg: 'Every delivery location needs a label.' };
      if (seen.has(lbl.toLowerCase())) return { ok: false, msg: `Duplicate delivery location "${lbl}".` };
      seen.add(lbl.toLowerCase());
      for (const k of ['fixedFeeCogs', 'perPanelCogs']) {
        const v = Number(r?.[k]);
        if (!Number.isFinite(v) || v < 0) {
          return { ok: false, msg: `Delivery location "${lbl}" has an invalid ${k === 'fixedFeeCogs' ? 'fixed fee' : 'per-panel'} COGS.` };
        }
      }
    }
    return { ok: true };
  })();

  // v3-138 — misc catalog: <=40 rows, descriptions non-empty + unique, cost
  // finite >= 0. Mirrors the server rules. Empty array IS valid (Step 2F then
  // offers "Other (please specify)" only).
  const miscCatalogValid = (() => {
    const rows = params.miscCatalog;
    if (rows == null) return { ok: true };
    if (!Array.isArray(rows)) return { ok: false, msg: 'Misc catalog must be a list.' };
    if (rows.length > 40) return { ok: false, msg: 'At most 40 misc catalog items.' };
    const seen = new Set();
    for (const r of rows) {
      const lbl = String(r?.label || '').trim();
      if (lbl === '') return { ok: false, msg: 'Every misc catalog item needs a description.' };
      if (seen.has(lbl.toLowerCase())) return { ok: false, msg: `Duplicate misc catalog item "${lbl}".` };
      seen.add(lbl.toLowerCase());
      const v = Number(r?.cogs);
      if (!Number.isFinite(v) || v < 0) {
        return { ok: false, msg: `Misc catalog item "${lbl}" has an invalid cost.` };
      }
    }
    return { ok: true };
  })();

  const minDpTiersValid = (() => {
    const t = params.minDpTiers;
    if (!Array.isArray(t) || t.length < 1) {
      return { ok: false, msg: 'Minimum-DP tier table cannot be empty — the ₱0 base tier must remain.' };
    }
    if (t.length > 10) {
      return { ok: false, msg: 'Minimum-DP tier table is limited to 10 tiers.' };
    }
    if ((Number(t[0].fromNetPrice) || 0) !== 0) {
      return { ok: false, msg: 'The first minimum-DP tier must start at ₱0 (base tier).' };
    }
    for (let i = 0; i < t.length; i++) {
      const p = Number(t[i].minDpPct);
      if (!Number.isFinite(p) || p < 0 || p > 0.5) {
        return { ok: false, msg: `Minimum-DP tier ${i + 1}: minimum must be between 0% and 50%.` };
      }
      if (i > 0 && !((Number(t[i].fromNetPrice) || 0) > (Number(t[i - 1].fromNetPrice) || 0))) {
        return { ok: false, msg: `Minimum-DP tier thresholds must be strictly ascending — tier ${i + 1} must exceed tier ${i}.` };
      }
    }
    return { ok: true };
  })();
  // v3-79 — the three rate anchors ARE the curve; if they aren't strictly
  // increasing the generalized-lognormal is undefined and every rate in the app
  // comes back NaN. Block the save before it can reach the server.
  const rateAnchorsValid = (() => {
    const { rateAnchorMin: lo, rateAnchorMid: mid, rateAnchorMax: hi } = params;
    if (![lo, mid, hi].every(v => Number.isFinite(v))) {
      return { ok: false, msg: 'Interest rate anchors must all be numbers.' };
    }
    if (!(lo < mid && mid < hi)) {
      return { ok: false, msg:
        'Interest rate anchors must increase: min < mid < max. '
        + `Currently min ${(lo * 100).toFixed(2)}%, mid ${(mid * 100).toFixed(2)}%, max ${(hi * 100).toFixed(2)}%.` };
    }
    // v3-100 — DST rate lives in the same Interest Rates section. A fraction
    // ≥ 1 would tax more than the financed amount; NaN would NaN the DST line
    // and the summary total on every financed quote (mirrors the server guard).
    const dstRate = params.documentaryStampTaxRate;
    if (dstRate != null && (!Number.isFinite(dstRate) || dstRate < 0 || dstRate >= 1)) {
      return { ok: false, msg:
        'Documentary Stamp Tax rate must be a fraction between 0% and 100%.' };
    }
    return { ok: true };
  })();

  // v3-142 — package-level margins (A/B/C) are primary. Keep legacy curve
  // validation for older payloads where package-level keys are absent.
  const marginsValid = (() => {
    const MDR_CEILING = 1 - (0.12 / 1.12);   // 0.892857…
    const {
      grossMarginMin: q1,
      grossMarginMid: q2,
      grossMarginMax: q3,
      grossMarginMinKwp: x1,
      grossMarginMidKwp: x2,
      grossMarginMaxKwp: x3,
      grossMarginReference: xref,
      merchantDiscountRate: mdr,
    } = params;

    // Shared capacity breakpoints (kWp) — always validated.
    if (![x1, x2, x3].every(v => Number.isFinite(v) && v > 0) || !(x1 < x2 && x2 < x3)) {
      return { ok: false, msg: 'Gross-margin capacity breakpoints (kWp) must be positive and strictly increasing: MinKwp < MidKwp < MaxKwp.' };
    }

    // v3-142 — per-package anchors. Each package's three anchors must be
    // strictly increasing fractions in [0%, 100%). A package with all three
    // anchors absent falls back to the legacy curve, which is validated instead.
    const packages = [
      { label: 'A. Solar', keys: ['grossMarginSolarMin', 'grossMarginSolarMid', 'grossMarginSolarMax'] },
      { label: 'B. Battery', keys: ['grossMarginBatteryMin', 'grossMarginBatteryMid', 'grossMarginBatteryMax'] },
      { label: 'C. Misc', keys: ['grossMarginMiscMin', 'grossMarginMiscMid', 'grossMarginMiscMax'] },
    ];
    const anyPackageProvided = packages.some(p => p.keys.some(k => params[k] != null));
    if (anyPackageProvided) {
      for (const p of packages) {
        const [pMin, pMid, pMax] = p.keys.map(k => params[k]);
        if (![pMin, pMid, pMax].every(v => Number.isFinite(v) && v >= 0 && v < 1) || !(pMin < pMid && pMid < pMax)) {
          return { ok: false, msg: `${p.label} package margins must be strictly increasing fractions in [0%, 100%): Min < Med < Max.` };
        }
      }
    } else {
      if (![q1, q2, q3].every(v => Number.isFinite(v) && v >= 0 && v < 1) || !(q1 < q2 && q2 < q3)) {
        return { ok: false, msg: 'Gross-margin anchors must be strictly increasing fractions in [0%, 100%): Min < Mid < Max.' };
      }
    }

    if (!Number.isFinite(xref) || xref < 0 || xref >= 1) {
      return { ok: false, msg: 'Reference gross margin must be a fraction in [0%, 100%).' };
    }
    if (!Number.isFinite(mdr) || mdr < 0 || mdr >= MDR_CEILING) {
      return { ok: false, msg:
        `Merchant discount rate must be below ${(MDR_CEILING * 100).toFixed(1)}% — at or above it, `
        + 'the acquirer\'s cut plus the VAT remittance exceeds the whole sale and every price would be zero.' };
    }
    return { ok: true };
  })();

  const validationError =
    !tiersValid       ? 'Single-phase cabling tier table cannot be empty — add at least one row before saving.' :
    !tiers3pValid     ? 'Three-phase cabling tier table cannot be empty — add at least one row before saving.' :
    !battPkgsValid    ? 'At least one battery package must remain — add a package before saving.' :
    !validityDaysValid ? 'Quote validity must be a whole number of days, 1 or more.' :
    !promosValid.ok   ? promosValid.msg :
    !minDpTiersValid.ok ? minDpTiersValid.msg :
    !deliveryLocationsValid.ok ? deliveryLocationsValid.msg :
    !miscCatalogValid.ok ? miscCatalogValid.msg :
    !marginsValid.ok ? marginsValid.msg :
    !rateAnchorsValid.ok ? rateAnchorsValid.msg :
    null;

  // ─── Save / Discard ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!anyEdit || savingDisabled) return;
    if (validationError) {
      setSaveStatus({ ok: false, error: validationError });
      return;
    }
    setSaveStatus('saving');
    // Start from the current live snapshot and overlay only this role's allowed
    // keys, so other roles' fields stay as-is on the server.
    const snapshot = paramsService.getSnapshot();
    const liveAdminParams = snapshot.adminParams || {};
    const merged = { ...liveAdminParams };
    for (const [key, sectionKey] of Object.entries(PARAM_KEY_TO_SECTION)) {
      if (canEditSection(sectionKey) && Object.prototype.hasOwnProperty.call(params, key)) {
        merged[key] = params[key];
      }
    }
    snapshot.adminParams = merged;
    // Inventory bucket — only sent if role can edit it.
    if (canEditInv) {
      snapshot.panelSettings = {
        singlePhase: { ...panelSingle },
        threePhase:  { ...panelThree },
      };
      snapshot.invertersSinglePhase = single.map(i => ({ ...i }));
      snapshot.invertersThreePhase  = three.map(i => ({ ...i }));
      snapshot.devices = devices.map(d => ({ ...d }));
    }
    const result = await paramsService.save(snapshot, accessLevel);
    setSaveStatus(result);
    if (result.ok) setDirty(false);
  };

  const handleDiscard = () => {
    setParams(JSON.parse(JSON.stringify(ADMIN_PARAMS)));
    setPanelSingle({ ...PANEL_SETTINGS.singlePhase });
    setPanelThree({ ...PANEL_SETTINGS.threePhase });
    setSingle(INVERTERS_SINGLE_PHASE.map(i => ({ ...i })));
    setThree(INVERTERS_THREE_PHASE.map(i => ({ ...i })));
    setDevices(DEVICES.map(d => ({ ...d })));
    setDirty(false);
    setSaveStatus(null);
  };

  const titleByTab = { inventory: 'Inventory', engineering: 'Engineering', product: 'Product' };

  return (
    <div style={adminStyles.container}>
      <div style={adminStyles.headerRow}>
        <div>
          <h1 style={adminStyles.title}>{titleByTab[tab] || 'Admin'}</h1>
          <p style={adminStyles.subtitle}>
            Mode: <strong>{roleLabel(accessLevel)}</strong>
            {/* v3-141 — build stamp so admins can read the deployed version at
                a glance. Injected by Vite define onto import.meta.env; the
                optional chain keeps non-Vite contexts (smoke tests) safe. */}
            {import.meta.env?.APP_VERSION && (
              <span style={{ color: '#9A968A', marginLeft: 10 }}>· {import.meta.env.APP_VERSION}</span>
            )}
          </p>
        </div>
        <button onClick={onLogout} style={adminStyles.logoutBtn}>Sign out</button>
      </div>

      {!anyEdit && (
        <CalloutBox kind="info">
          You are in read-only mode. Sign in with an editor password to make changes.
        </CalloutBox>
      )}
      {anyEdit && savingDisabled && (
        <div style={{ marginBottom: 16 }}>
          <CalloutBox kind="warn">
            <strong>Backend unreachable — save is disabled.</strong> The
            parameters API at <code>/.netlify/functions/parameters</code> isn't
            responding. This usually means you're running in local dev. Edits
            here will not persist.
          </CalloutBox>
        </div>
      )}
      {anyEdit && !savingDisabled && (
        <div style={{ marginBottom: 16 }}>
          <CalloutBox kind="info">
            <strong>Edits are saved globally.</strong> When you click Save, the
            changes are pushed to the server and become the live values for
            every user of the calculator on their next page load. Sections
            outside your team's remit are shown read-only. Edits persist across
            tab switches — save once to commit changes from any tab.
          </CalloutBox>
        </div>
      )}

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      {tab === 'inventory' && (
        <InventoryTab
          params={params} updateParam={updateParam}
          panelSingle={panelSingle} updatePanelSingle={updatePanelSingle}
          panelThree={panelThree}   updatePanelThree={updatePanelThree}
          single={single} three={three}
          updateInverter={updateInverter} addInverter={addInverter} removeInverter={removeInverter}
          accessLevel={accessLevel}
        />
      )}
      {tab === 'engineering' && (
        <EngineeringTab
          params={params} updateParam={updateParam}
          devices={devices}
          updateDevice={updateDevice} addDevice={addDevice} deleteDevice={deleteDevice}
          accessLevel={accessLevel}
        />
      )}
      {tab === 'product' && (
        <ProductTab
          params={params} updateParam={updateParam}
          accessLevel={accessLevel} validityDays={validityDays}
        />
      )}

      {/* ─── Validation error ───────────────────────────────────────────── */}
      {anyEdit && validationError && (
        <div style={{ marginTop: 16 }}>
          <CalloutBox kind="error">
            <strong>Cannot save:</strong> {validationError}
          </CalloutBox>
        </div>
      )}

      {/* ─── Global Save / Discard bar ──────────────────────────────────── */}
      {anyEdit && (
        <div style={adminStyles.saveBar}>
          {saveStatus === 'saving' && (
            <span style={adminStyles.saveStatusInfo}>Saving…</span>
          )}
          {saveStatus && saveStatus !== 'saving' && saveStatus.ok && (
            <span style={adminStyles.saveStatusOk}>✓ Saved globally — visible to all users.</span>
          )}
          {saveStatus && saveStatus !== 'saving' && !saveStatus.ok && (
            <span style={adminStyles.saveStatusErr}>✗ Save failed: {saveStatus.error}</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={handleDiscard}
                  disabled={!dirty || saveStatus === 'saving'}
                  style={{ ...adminStyles.discardBtn,
                           ...((!dirty || saveStatus === 'saving') ? adminStyles.btnDisabled : {}) }}>
            Discard changes
          </button>
          <button onClick={handleSave}
                  disabled={!dirty || saveStatus === 'saving' || savingDisabled || !!validationError}
                  style={{ ...adminStyles.saveBtn,
                           ...((!dirty || saveStatus === 'saving' || savingDisabled || !!validationError) ? adminStyles.btnDisabled : {}) }}>
            {saveStatus === 'saving' ? 'Saving…' : 'Save changes globally'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MaintenanceModeBlock ─────────────────────────────────────────────────
// Rendered ABOVE the AdminTabs in App.jsx. Always visible across all three
// admin tabs. Owns its own dirty/save state because it's outside the main
// AdminShell — this keeps the surface area simple (a single boolean toggle
// that posts directly to the server when changed). Maintenance Mode edit is
// allowed by all four admin roles (edit, engineering, product, view → only
// view cannot edit), per ROLE_ADMIN_SECTIONS in permissions.js.
export function MaintenanceModeBlock({ accessLevel, savingDisabled }) {
  const canEdit = canEditAdminSection(accessLevel, 'maintenance');
  const [enabled, setEnabled] = useState(!!(ADMIN_PARAMS.gateAuthEnabled ?? true));
  const [saveStatus, setSaveStatus] = useState(null);

  const handleToggle = async (newVal) => {
    if (!canEdit || savingDisabled) return;
    setEnabled(newVal);  // Optimistic
    setSaveStatus('saving');
    const snapshot = paramsService.getSnapshot();
    snapshot.adminParams = { ...(snapshot.adminParams || {}), gateAuthEnabled: newVal };
    const result = await paramsService.save(snapshot, accessLevel);
    setSaveStatus(result);
    if (!result.ok) {
      // Roll back optimistic flip
      setEnabled(!newVal);
    }
  };

  return (
    <div style={mmStyles.container}>
      <div style={mmStyles.header}>
        <h3 style={mmStyles.title}>Maintenance Mode</h3>
        {saveStatus === 'saving' && <span style={mmStyles.status}>Saving…</span>}
        {saveStatus && saveStatus !== 'saving' && saveStatus.ok && (
          <span style={mmStyles.statusOk}>✓ Saved</span>
        )}
        {saveStatus && saveStatus !== 'saving' && !saveStatus.ok && (
          <span style={mmStyles.statusErr}>✗ {saveStatus.error}</span>
        )}
      </div>
      <ContactGatePasswordToggle
        enabled={enabled}
        onChange={handleToggle}
        envVarSet={!!AUTH.testingPassword}
        canEdit={canEdit && !savingDisabled}
      />
    </div>
  );
}

const mmStyles = {
  container: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    border: `1px solid ${COLORS.divider}`,
    padding: '20px 24px',
    marginBottom: 12,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    marginBottom: 12, paddingBottom: 12,
    borderBottom: `1px solid ${COLORS.divider}`,
  },
  title: {
    fontSize: 14, fontWeight: 700, color: COLORS.brandGreen,
    margin: 0, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  status: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  statusOk: { fontSize: 12, color: '#065F46', fontWeight: 600 },
  statusErr: { fontSize: 12, color: '#991B1B', fontWeight: 600 },
};
