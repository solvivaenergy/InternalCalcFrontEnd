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
import { findCablingTierViolation } from '../lib/calculations.js';
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
import FinCoTab from './FinCoTab.jsx';

// v3-178 — `calcPanelCount` is the Calculator's RESOLVED panel count at the
// moment the admin section was entered (App passes model.panelCount). It seeds
// the cabling tier-table test rows and is never written back: this component
// has no handle on calculator state, so the test count cannot follow the admin
// out on logout. That is a structural guarantee, not a guard.
export default function AdminShell({ tab, accessLevel, onLogout, savingDisabled,
                                     calcPanelCount = null }) {
  const anyEdit = hasAnyEditAccess(accessLevel);
  const canEditMaintenance = canEditAdminSection(accessLevel, 'maintenance');
  const canEditInv = canEditInventory(accessLevel);

  // Server auth is the Supabase session JWT (see paramsService.save), not a
  // shared per-role password as in upstream v3-207.

  // ─── Unified state (persists across tab switches) ─────────────────────────
  const [params, setParams] = useState(() => JSON.parse(JSON.stringify(ADMIN_PARAMS)));
  const [panelSingle, setPanelSingle] = useState({ ...PANEL_SETTINGS.singlePhase });
  const [panelThree,  setPanelThree]  = useState({ ...PANEL_SETTINGS.threePhase });
  const [single,  setSingle]  = useState(() => INVERTERS_SINGLE_PHASE.map(i => ({ ...i })));
  const [three,   setThree]   = useState(() => INVERTERS_THREE_PHASE.map(i => ({ ...i })));
  const [devices, setDevices] = useState(() => DEVICES.map(d => ({ ...d })));
  // v3-178 — test panel counts for the two cabling tier tables. Lifted here
  // (not into CablingTierTable) so they survive Inventory -> Engineering ->
  // Inventory the way every other admin edit does. Seeded from the Calculator
  // per Pat; decision 4: a zero/absent count (panels out of stock) falls back
  // to 5 rather than 1. They are DELIBERATELY excluded from `dirty` and from
  // the save payload — this is a preview, not a parameter.
  const seedTestCount = Math.max(1, calcPanelCount || 5);
  const [testPanelsSingle, setTestPanelsSingle] = useState(seedTestCount);
  const [testPanelsThree,  setTestPanelsThree]  = useState(seedTestCount);

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
  // v3-174 — monotonicity gate (shared engine helper, never a local copy):
  // no tier may price a larger system cheaper cabling than a smaller one.
  const tiersMonotone = tiersValid ? findCablingTierViolation(params.cablingTiers) : null;
  const tiers3pMonotone = tiers3pValid ? findCablingTierViolation(params.cablingTiersThreePhase) : null;
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
      // v3-145 — negatives are valid (reversal/credit items); the server
      // accepts them since v3-144. This client mirror was missed in v3-144
      // and blocked the save. Finiteness only.
      if (!Number.isFinite(v)) {
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

  // v3-83 / v3-92 — the margin curve + MDR drive every price in the app; a bad
  // value blanks the entire price list rather than degrading one number. Gross
  // margin is now a GENLINV curve over capacity: three anchors that must be
  // strictly increasing fractions in [0,1) and three positive strictly-
  // increasing kWp breakpoints (mirrors the server guard). v3-190 — the
  // reference-margin check moved OUT of this block to pmMarginValid below:
  // grossMarginReference now lives on the FinCo tab as the assumed gross
  // margin for preventive maintenance.
  const marginsValid = (() => {
    const MDR_CEILING = 1 - (0.12 / 1.12);   // 0.892857…
    const { grossMarginMin: q1, grossMarginMid: q2, grossMarginMax: q3,
            grossMarginMinKwp: x1, grossMarginMidKwp: x2, grossMarginMaxKwp: x3,
            merchantDiscountRate: mdr } = params;
    if (![q1, q2, q3].every(v => Number.isFinite(v) && v >= 0 && v < 1) || !(q1 < q2 && q2 < q3)) {
      return { ok: false, msg: 'Gross-margin anchors must be strictly increasing fractions in [0%, 100%): Min < Mid < Max.' };
    }
    if (![x1, x2, x3].every(v => Number.isFinite(v) && v > 0) || !(x1 < x2 && x2 < x3)) {
      return { ok: false, msg: 'Gross-margin capacity breakpoints (kWp) must be positive and strictly increasing: MinKwp < MidKwp < MaxKwp.' };
    }
    if (!Number.isFinite(mdr) || mdr < 0 || mdr >= MDR_CEILING) {
      return { ok: false, msg:
        `Merchant discount rate must be below ${(MDR_CEILING * 100).toFixed(1)}% — at or above it, `
        + 'the acquirer\'s cut plus the VAT remittance exceeds the whole sale and every price would be zero.' };
    }
    // v3-199 — the Luzon free-delivery radius (mirrors the server guard).
    {
      const v = params.luzonFreeTravelKm;
      if (!Number.isFinite(v) || v <= 0 || v > 500) {
        return { ok: false, msg: 'The Luzon free-delivery radius must be a positive number of kilometers (at most 500).' };
      }
    }
    // v3-191 — the three-phase curve anchors: identical monotonicity rules,
    // validated independently (mirrors the server guard).
    const { grossMarginMinTp: t1, grossMarginMidTp: t2, grossMarginMaxTp: t3,
            grossMarginMinKwpTp: y1, grossMarginMidKwpTp: y2, grossMarginMaxKwpTp: y3 } = params;
    if (![t1, t2, t3].every(v => Number.isFinite(v) && v >= 0 && v < 1) || !(t1 < t2 && t2 < t3)) {
      return { ok: false, msg: 'Three-phase gross-margin anchors must be strictly increasing fractions in [0%, 100%): Min < Mid < Max.' };
    }
    if (![y1, y2, y3].every(v => Number.isFinite(v) && v > 0) || !(y1 < y2 && y2 < y3)) {
      return { ok: false, msg: 'Three-phase gross-margin capacity breakpoints (kWp) must be positive and strictly increasing: MinKwp < MidKwp < MaxKwp.' };
    }
    // v3-191 — the per-phase panels-without-inverter margins.
    for (const [k, label] of [['grossMarginNoInverterSp', 'single-phase'],
                              ['grossMarginNoInverterTp', 'three-phase']]) {
      const v = params[k];
      if (!Number.isFinite(v) || v < 0 || v >= 1) {
        return { ok: false, msg:
          `The ${label} panels-without-inverter margin must be a fraction in [0%, 100%).` };
      }
    }
    // v3-191 — the componentMargins table (B–Q). Shape + range on every entry;
    // a bad entry would price an entire component group at NaN or a >=1 margin
    // on every quote (mirrors the server guard).
    const cm = params.componentMargins;
    if (!cm || typeof cm !== 'object' || Array.isArray(cm)) {
      return { ok: false, msg: 'Component gross margins are missing or malformed.' };
    }
    const marginOk = (v) => Number.isFinite(v) && v >= 0 && v < 1;
    for (const id of ['B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q']) {
      const row = cm[id];
      if (!row || typeof row !== 'object') {
        return { ok: false, msg: `Component ${id}: margin entry is missing.` };
      }
      if (!marginOk(row.otherwise)) {
        return { ok: false, msg: `Component ${id}: the Otherwise margin must be a fraction in [0%, 100%).` };
      }
      if (id !== 'N') {
        if (row.mode !== 'follow' && row.mode !== 'fixed') {
          return { ok: false, msg: `Component ${id}: mode must be Follow or Fixed.` };
        }
        if (!marginOk(row.fixed)) {
          return { ok: false, msg: `Component ${id}: the Fixed margin must be a fraction in [0%, 100%).` };
        }
      }
    }
    return { ok: true };
  })();

  // v3-181 — DU tariff inflation default. Third layer of the same rule the
  // engine clamps and both steppers enforce (the standing three-places rule).
  const duRateDefaultValid = (() => {
    const v = params.duRateInflationDefault;
    if (v == null) return { ok: true };
    if (!Number.isFinite(v) || v < 0 || v > 0.10) {
      return { ok: false, msg:
        'Default annual DU rate increase must be between 0.00% and 10.00%.' };
    }
    return { ok: true };
  })();

  // v3-190 — the assumed gross margin for preventive maintenance (storage key
  // grossMarginReference; moved to FinCo Returns Assumptions). Same [0,1)
  // fraction rule as before, message renamed to match the new UI label. The
  // server enforces the identical rule by key, unchanged.
  const pmMarginValid = (() => {
    const v = params.grossMarginReference;
    if (!Number.isFinite(v) || v < 0 || v >= 1) {
      return { ok: false, msg:
        'Assumed gross margin for preventive maintenance must be a fraction in [0%, 100%).' };
    }
    return { ok: true };
  })();

  // v3-183 — DU inflation reference inputs. Third layer of the same shape rules
  // the server enforces. Loose on VALUES (any published tariff point is
  // legitimate) and strict on SHAPE, because a malformed date or a
  // non-positive rate resolves to "no note" on the customer surface — a silent
  // removal of guidance rather than a visible error.
  const duRefValid = (() => {
    const ymOk = (v) => v === '' || v == null || /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v));
    if (!ymOk(params.duInflationDate1) || !ymOk(params.duInflationDate2)) {
      return { ok: false, msg: 'DU inflation reference dates must be a YYYY-MM month, e.g. 2016-07.' };
    }
    for (const k of ['duInflationRate1', 'duInflationRate2']) {
      const v = params[k];
      if (v == null || v === '') continue;
      if (!Number.isFinite(v) || v <= 0 || v > 1000) {
        return { ok: false, msg: 'DU inflation reference rates must be greater than 0 (per kWh).' };
      }
    }
    const url = params.duInflationSourceUrl;
    if (url && !/^https?:\/\//i.test(String(url))) {
      return { ok: false, msg: 'DU inflation source URL must start with http:// or https://.' };
    }
    return { ok: true };
  })();

  // v3-187 — horizon default must be one of the Step 4 dropdown's options.
  const irrYearsValid = (params.irrYearsDefault == null)
    || [10, 15, 20, 25, 30].includes(params.irrYearsDefault)
      ? { ok: true }
      : { ok: false, msg: 'Default IRR & LCOE period must be 10, 15, 20, 25 or 30 years.' };

  const validationError =
    !tiersValid       ? 'Single-phase cabling tier table cannot be empty — add at least one row before saving.' :
    !tiers3pValid     ? 'Three-phase cabling tier table cannot be empty — add at least one row before saving.' :
    tiersMonotone     ? `Single-phase cabling tier at ${tiersMonotone.minPanels} panels prices a larger system cheaper than the tier before it — its total must be at least ${(Math.ceil(tiersMonotone.requiredTotal * 10000) / 100).toFixed(2)}%.` :
    tiers3pMonotone   ? `Three-phase cabling tier at ${tiers3pMonotone.minPanels} panels prices a larger system cheaper than the tier before it — its total must be at least ${(Math.ceil(tiers3pMonotone.requiredTotal * 10000) / 100).toFixed(2)}%.` :
    !battPkgsValid    ? 'At least one battery package must remain — add a package before saving.' :
    !validityDaysValid ? 'Quote validity must be a whole number of days, 1 or more.' :
    !promosValid.ok   ? promosValid.msg :
    !minDpTiersValid.ok ? minDpTiersValid.msg :
    !deliveryLocationsValid.ok ? deliveryLocationsValid.msg :
    !miscCatalogValid.ok ? miscCatalogValid.msg :
    !marginsValid.ok ? marginsValid.msg :
    !rateAnchorsValid.ok ? rateAnchorsValid.msg :
    !duRateDefaultValid.ok ? duRateDefaultValid.msg :
    !pmMarginValid.ok ? pmMarginValid.msg :
    !duRefValid.ok ? duRefValid.msg :
    !irrYearsValid.ok ? irrYearsValid.msg :
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
          You are in read-only mode. Your account has view-only access — ask an
          administrator to change your role if you need to make changes.
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
          testPanelsSingle={testPanelsSingle} setTestPanelsSingle={setTestPanelsSingle}
          testPanelsThree={testPanelsThree}   setTestPanelsThree={setTestPanelsThree}
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
      {/* v3-180 — FinCo tab. Same props shape as ProductTab; the sections it
          renders (Financing Limits + Interest Rates) moved off that tab. */}
      {tab === 'finco' && (
        <FinCoTab
          params={params} updateParam={updateParam}
          accessLevel={accessLevel}
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
