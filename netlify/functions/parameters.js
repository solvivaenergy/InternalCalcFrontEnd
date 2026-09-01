// =============================================================================
// PARAMETERS API — Netlify Function backed by Netlify Blobs
// -----------------------------------------------------------------------------
// Endpoint:  /.netlify/functions/parameters
//
// GET    → returns the current saved parameter overrides as JSON.
//          Returns {} if nothing has been saved yet (new deployments).
//          Public — no auth required for reads (the calculator needs to read
//          on every visit; gating reads behind a password would prevent the
//          calculator itself from working).
//
// PUT    → updates the saved parameter overrides. Requires:
//          • Header  x-solviva-edit-password  — the role's password
//          • Header  x-solviva-role           — 'edit' | 'engineering' | 'product' | 'finco'
//
//          The supplied password is matched against the corresponding env var
//          for the claimed role. After authentication, the request body's
//          changes are filtered against ROLE_PERMISSIONS so a role can only
//          mutate fields it's authorized for. Any attempt to mutate a field
//          outside the role's allowlist is silently dropped — the response
//          reports which fields were actually applied.
//
//          Roles, env vars, and allowlists:
//            'edit'         → VITE_SUPERADMIN_PASSWORD         → all fields
//            'engineering'  → VITE_ENGINEERING_PASSWORD  → see ALLOWLIST below
//            'product'      → VITE_PRODUCT_PASSWORD      → see ALLOWLIST below
//            'finco'        → VITE_FINCO_PASSWORD        → financingTerms + interestRates
//                             (v3-180 — FinCo/OpCo entity separation)
//
// Storage:
//   Netlify Blobs key-value store, store name "solviva-config",
//   key "parameters". Persists across deployments and is global to the site.
//
// v3-150 — mirrors PACKAGE_CATEGORY_IDS in src/data/adminParams.js. Netlify
// functions cannot import from src/, so this is a hand-kept copy; it is three
// string literals that change only if the Quote Summary grouping itself
// changes, and the release smoke suite asserts both lists agree.
const MISC_CATEGORY_IDS = ['solar', 'battery', 'misc'];

// v3-151 — mirrors PROMO_TYPE_IDS in src/data/adminParams.js. Hand-kept for
// the same reason as above; the release smoke suite diffs the two lists.
const PROMO_TYPE_IDS = ['percent', 'peso'];

// IMPORTANT: This file mirrors src/lib/permissions.js. Netlify functions can't
// import from src/, so any change to the role→sections mapping must be made
// in BOTH places. The allowlist below is the authoritative security boundary
// (the client-side mirror is just for UX).
// =============================================================================

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'solviva-config';
const KEY = 'parameters';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-solviva-edit-password, x-solviva-role',
};

// Roles that can carry edits. 'view' and 'none' are explicitly NOT here.
const EDIT_ROLES = new Set(['edit', 'engineering', 'product', 'finco']);

// Per-role admin-section allowlist. Mirrors src/lib/permissions.js.
// 'edit' (Super Admin) is wildcard, handled separately.
const ROLE_ADMIN_SECTIONS = {
  engineering: new Set([
    'solarPanel',
    'variableCharges',
    'roofMaterial',
    'miscCatalog',   // v3-138 — Step 2F standing catalog
    'location',
    'cabling',
    'batteryPackage',
    'standaloneCharges',
    'fixedOverhead',
    'scheduleConstants',
    'maintenance',
  ]),
  product: new Set([
    'margins',          // v3-89 — was added to the CLIENT's permissions.js in v3-83
                        // but NOT here. The server therefore stripped grossMargin /
                        // merchantDiscountRate from every PUT as not-permitted-for-role,
                        // so they never validated AND never saved. Two role maps exist;
                        // BOTH must be kept in sync, not just PARAM_KEY_TO_SECTION.
    'quoteValidity',
    'quoteLimits',      // v3-180 — minSystemKwp ONLY; min DP + max tenor left
                        // for 'financingTerms' (FinCo) at the entity split
    'step1Defaults',    // v3-70 — default utility rate / monthly bill
    'step3Defaults',
    'promoCodes',
    'maintenance',
  ]),
  finco: new Set([
    'financingTerms',      // v3-180 — minimum down payment tiers + maximum tenor
    'interestRates',       // v3-180 — moved wholesale off the Product tab
    'returnsAssumptions',  // v3-181 — DU tariff inflation default
    'duInflationReference',// v3-183 — historical reference calculator (advisory)
  ]),
};

const ROLE_INVENTORY_ACCESS = {
  // Wildcard for 'edit' handled separately.
  engineering: true,
  product: false,
  finco: false,
};

// ADMIN_PARAMS key → section. Mirrors src/lib/permissions.js.
const PARAM_KEY_TO_SECTION = {
  // Interest Rates
  financingEntityName:           'margins',
  financingEntityIsSeparate:     'margins',
  grossMarginMinKwp:             'margins',
  grossMarginMidKwp:             'margins',
  grossMarginMaxKwp:             'margins',
  grossMarginMin:                'margins',
  grossMarginMid:                'margins',
  grossMarginMax:                'margins',
  grossMarginMinKwpTp:           'margins',   // v3-191 — three-phase curve anchors
  grossMarginMidKwpTp:           'margins',
  grossMarginMaxKwpTp:           'margins',
  grossMarginMinTp:              'margins',
  grossMarginMidTp:              'margins',
  grossMarginMaxTp:              'margins',
  grossMarginNoInverterSp:       'margins',   // v3-191 — panels-without-inverter margins
  grossMarginNoInverterTp:       'margins',
  componentMargins:              'margins',   // v3-191 — per-component margin table (B–Q)
  grossMarginReference:          'returnsAssumptions',  // v3-190 — moved to FinCo; UI label renamed, key kept
  merchantDiscountRate:          'margins',
  rateAnchorMax:                 'interestRates',
  rateAnchorMid:                 'interestRates',
  rateAnchorMin:                 'interestRates',
  rateTenorWeight:               'interestRates',
  rateStepPct:                   'interestRates',
  earlyPayoffDiscountRate:       'interestRates',
  documentaryStampTaxRate:       'interestRates',   // v3-100 — Product-editable DST rate
  // Solar Panel & Mounting
  mountingSupportFloorCogs:        'solarPanel',
  mountingSupportPctOfPanels:    'solarPanel',
  // Variable Charges
  additionalDcCablePerMeterCogs:   'variableCharges',
  additionalAcCablePerMeterCogs:   'variableCharges',
  laborInstallationPerKwpCogs:     'variableCharges',
  rsdVariablePerPanelCogs:         'variableCharges',
  rsdFixedTransmitterCogs:         'variableCharges',
  rsdAvailable:                    'variableCharges',   // v3-106 — RSD stock flag
  // Roof Material
  roofAsphaltPerKwpCogs:           'roofMaterial',
  roofConcretePerKwpCogs:          'roofMaterial',
  // Misc Materials / Labor / Services catalog (v3-138)
  miscCatalog:                     'miscCatalog',
  // Location / Delivery
  deliveryLocations:               'location',   // v3-116 — replaces the 4 Cebu/Siargao scalars
  luzonFreeTravelKm:               'location',   // v3-199 — free-delivery radius
  luzonOver30FixedFeeCogs:         'location',
  luzonOver30PerKmCogs:            'location',
  // Cabling
  cablingTiers:                  'cabling',
  cablingTiersThreePhase:        'cabling',   // NEW v3-62 — 3-phase tier table
  // Battery Packages (v3-54: replaces 6 flat keys with a single array)
  batteryPackages:               'batteryPackage',
  // Standalone Retrofit Charges
  rsdStandaloneLaborPerPanelCogs:  'standaloneCharges',
  rsdStandaloneLaborMobilizationCogs: 'standaloneCharges',
  inverterStandaloneLaborPerUnitCogs: 'standaloneCharges',
  inverterStandaloneMobilizationCogs: 'standaloneCharges',
  // Fixed Overhead
  fixedOverheadDeliveryLogisticsCogs: 'fixedOverhead',
  fixedOverheadWarehouseCogs:      'fixedOverhead',
  fixedOverheadCustomsCogs:        'fixedOverhead',
  fixedOverheadSafetySupervisionCogs: 'fixedOverhead',
  fixedOverheadTestingCogs:        'fixedOverhead',
  // Schedule Constants
  kWhPerKwpPerDay:               'scheduleConstants',
  batteryEfficiency:             'scheduleConstants',
  maxDailySpillKwh:              'scheduleConstants',   // v3-132 — Mode-1 spill tolerance
  batteryDepthOfDischarge:       'scheduleConstants',
  panelAnnualDegradation:        'scheduleConstants',
  lcoeNpvDiscountRate:           'returnsAssumptions',  // v3-190 — moved from Engineering to FinCo
  maintenanceInflationRate:      'returnsAssumptions',  // v3-190 — moved from Engineering to FinCo
  netMeteringEfficiency:         'scheduleConstants',
  preventiveMaintenancePerPanelCogs: 'scheduleConstants',
  preventiveMaintenancePerVisitCogs: 'scheduleConstants',
  minDaysToFirstPostInstallPayment: 'scheduleConstants',
  // Promo Codes
  promoCodes:                    'promoCodes',
  // Quote Validity
  quoteValidityDays:             'quoteValidity',
  // Quote Limits (v3-68)
  minSystemKwp:                  'quoteLimits',
  // Financing Limits (v3-180) — FinCo-owned; both were 'quoteLimits' through v3-179.
  minDpTiers:                    'financingTerms',
  maxTenorMonths:                'financingTerms',
  irrYearsDefault:               'returnsAssumptions',
  duRateInflationDefault:        'returnsAssumptions',
  duInflationSourceName:         'duInflationReference',
  duInflationSourceUrl:          'duInflationReference',
  duInflationBasis:              'duInflationReference',
  duInflationDate1:              'duInflationReference',
  duInflationRate1:              'duInflationReference',
  duInflationDate2:              'duInflationReference',
  duInflationRate2:              'duInflationReference',
  // Step 1 Defaults (v3-70)
  defaultUtilityRate:            'step1Defaults',
  defaultMonthlyBill:            'step1Defaults',
  defaultDownPaymentPct:         'step3Defaults',
  // Maintenance Mode
  gateAuthEnabled:               'maintenance',
};

function canRoleEditAdminSection(role, sectionKey) {
  if (role === 'edit') return true;
  const set = ROLE_ADMIN_SECTIONS[role];
  return set ? set.has(sectionKey) : false;
}
function canRoleEditInventory(role) {
  if (role === 'edit') return true;
  return !!ROLE_INVENTORY_ACCESS[role];
}

// Map role → env-var name, used to look up the expected password.
function envVarForRole(role) {
  if (role === 'edit')        return 'VITE_SUPERADMIN_PASSWORD';
  if (role === 'engineering') return 'VITE_ENGINEERING_PASSWORD';
  if (role === 'product')     return 'VITE_PRODUCT_PASSWORD';
  if (role === 'finco')       return 'VITE_FINCO_PASSWORD';   // v3-180
  return null;
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  let store;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return json(500, { error: 'Blobs not configured', detail: String(err) });
  }

  if (request.method === 'GET') {
    try {
      const value = await store.get(KEY, { type: 'json' });
      return json(200, value || {});
    } catch (err) {
      return json(500, { error: 'Read failed', detail: String(err) });
    }
  }

  if (request.method === 'PUT') {
    // ─── Auth: validate role + matching password ───────────────────────────
    const supplied = request.headers.get('x-solviva-edit-password') || '';
    const claimedRole = request.headers.get('x-solviva-role') || '';
    if (!EDIT_ROLES.has(claimedRole)) {
      return json(401, { error: 'Missing or invalid role header' });
    }
    const envVarName = envVarForRole(claimedRole);
    const expected = process.env[envVarName];
    if (!expected) {
      return json(500, {
        error: `Server is missing ${envVarName} env var. ` +
               'Set it in Netlify → Site config → Environment variables.',
      });
    }
    if (supplied !== expected) {
      return json(401, { error: 'Invalid password for declared role' });
    }

    // ─── Parse + filter body against role allowlist ────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Body must be valid JSON' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(400, { error: 'Body must be a JSON object' });
    }

    // Read the current saved state so we can merge — fields a role isn't
    // allowed to change must be left at their current saved values, not
    // wiped or replaced.
    let current = {};
    try {
      current = (await store.get(KEY, { type: 'json' })) || {};
    } catch (err) {
      return json(500, { error: 'Read-before-write failed', detail: String(err) });
    }

    // v3-116 — migrate legacy Cebu/Siargao scalars on the INCOMING BODY
    // BEFORE the role-allowlist overlay: the scalar keys were removed from
    // PARAM_KEY_TO_SECTION, so the filter would silently drop them and the
    // migration below (which runs post-merge) would never see them. Running
    // here turns them into the allowed `deliveryLocations` key in time.
    if (body.adminParams && typeof body.adminParams === 'object') {
      const t = body.adminParams;
      const hasLegacyLoc = 'cebuFixedFeeCogs' in t || 'cebuPerPanelCogs' in t
                        || 'siargaoFixedFeeCogs' in t || 'siargaoPerPanelCogs' in t;
      if (hasLegacyLoc && !Array.isArray(t.deliveryLocations)) {
        t.deliveryLocations = [
          { id: 'cebu', label: 'Cebu',
            fixedFeeCogs: t.cebuFixedFeeCogs ?? 37736,
            perPanelCogs: t.cebuPerPanelCogs ?? 3740, available: true },
          { id: 'siargao', label: 'Siargao',
            fixedFeeCogs: t.siargaoFixedFeeCogs ?? 327053,
            perPanelCogs: t.siargaoPerPanelCogs ?? 5748, available: true },
        ];
      }
      delete t.cebuFixedFeeCogs; delete t.cebuFixedFee;
      delete t.cebuPerPanelCogs; delete t.cebuPerPanel;
      delete t.siargaoFixedFeeCogs; delete t.siargaoFixedFee;
      delete t.siargaoPerPanelCogs; delete t.siargaoPerPanel;
    }
    // Build the merged blob: start from current, overlay only allowed fields.
    const merged = {
      adminParams:            { ...(current.adminParams || {}) },
      panelSettings:          deepClone(current.panelSettings),
      invertersSinglePhase:   Array.isArray(current.invertersSinglePhase)
                                ? current.invertersSinglePhase.slice()
                                : null,
      invertersThreePhase:    Array.isArray(current.invertersThreePhase)
                                ? current.invertersThreePhase.slice()
                                : null,
      devices:                Array.isArray(current.devices)
                                ? current.devices.slice()
                                : null,
    };
    // Strip nulls so we don't write null where there was nothing.
    if (!merged.panelSettings)        delete merged.panelSettings;
    if (!merged.invertersSinglePhase) delete merged.invertersSinglePhase;
    if (!merged.invertersThreePhase)  delete merged.invertersThreePhase;
    if (!merged.devices)              delete merged.devices;

    // Track which keys were applied vs ignored, so the response can tell the
    // client what actually went through (helpful debugging if a UI bug ever
    // sends fields a role isn't authorized for).
    const appliedAdminKeys = [];
    const ignoredAdminKeys = [];

    // Apply adminParams diff field-by-field, gated by section allowlist.
    if (body.adminParams && typeof body.adminParams === 'object') {
      // v3-54: strip legacy battery keys from incoming bodies. If a client
      // somehow sends the old flat keys (shouldn't — they're gone from the
      // code path — but defense in depth), drop them silently rather than
      // persisting both old and new representations.
      const ap = body.adminParams;
      delete ap.batteryPer5kWhPrice;
      delete ap.batteryRackPer3Cap;
      delete ap.batteryAtsPrice;
      delete ap.batteryCriticalLoadsMaterials;
      delete ap.batteryLaborWithSolarInstall;
      delete ap.batteryStandaloneLabor;
      // Also strip them from the merged blob if they're hanging around from
      // a pre-v3-54 saved blob — guarantees post-save the legacy keys are
      // gone forever.
      delete merged.adminParams.batteryPer5kWhPrice;
      delete merged.adminParams.batteryRackPer3Cap;
      delete merged.adminParams.batteryAtsPrice;
      delete merged.adminParams.batteryCriticalLoadsMaterials;
      delete merged.adminParams.batteryLaborWithSolarInstall;
      delete merged.adminParams.batteryStandaloneLabor;

      // v3-75: migrate the legacy scalar minDownPaymentPct (v3-68) to the
      // tiered minDpTiers array, then strip the scalar — from both the
      // incoming body (defense in depth; post-v3-75 clients never send it)
      // and the merged blob (so the first Save post-deploy permanently
      // removes it from Blob storage). Mirrors paramsService.js's
      // migrateLegacyMinDp — keep the two in lockstep. A nonzero legacy
      // floor with no tier table becomes a single-row base tier preserving
      // the floor exactly; an existing minDpTiers array always wins.
      for (const target of [ap, merged.adminParams]) {
        const legacy = target.minDownPaymentPct;
        if (
          typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0 &&
          !Array.isArray(target.minDpTiers)
        ) {
          target.minDpTiers = [{ fromNetPrice: 0, minDpPct: legacy }];
        }
        delete target.minDownPaymentPct;
      }

      for (const [key, value] of Object.entries(body.adminParams)) {
        const sectionKey = PARAM_KEY_TO_SECTION[key];
        if (!sectionKey) {
          // Unknown key — ignore. Could be a future field or a typo;
          // either way, we don't want to silently persist it.
          ignoredAdminKeys.push(key);
          continue;
        }
        if (!canRoleEditAdminSection(claimedRole, sectionKey)) {
          ignoredAdminKeys.push(key);
          continue;
        }
        merged.adminParams[key] = value;
        appliedAdminKeys.push(key);
      }
    }

    // Inventory pane — accept iff role is allowed.
    let inventoryApplied = false;
    if (canRoleEditInventory(claimedRole)) {
      if (body.panelSettings) {
        merged.panelSettings = body.panelSettings;
        inventoryApplied = true;
      }
      if (Array.isArray(body.invertersSinglePhase)) {
        merged.invertersSinglePhase = body.invertersSinglePhase;
        inventoryApplied = true;
      }
      if (Array.isArray(body.invertersThreePhase)) {
        merged.invertersThreePhase = body.invertersThreePhase;
        inventoryApplied = true;
      }
      if (Array.isArray(body.devices)) {
        merged.devices = body.devices;
        inventoryApplied = true;
      }
    }

    // ─── Validation: don't accept a write that empties cablingTiers ────────
    // Empty cablingTiers crashes calculations.cablingTotalPct() and would
    // brick the live site. (See Admin.jsx for the same client-side check.)
    if (Array.isArray(merged.adminParams?.cablingTiers)
        && merged.adminParams.cablingTiers.length === 0) {
      return json(400, {
        error: 'Refusing to save: cablingTiers cannot be empty.',
      });
    }
    // v3-62: same guard for the 3-phase table. (Absent key is fine — the
    // client migration-seeds it on load; an explicit EMPTY array is not.)
    if (Array.isArray(merged.adminParams?.cablingTiersThreePhase)
        && merged.adminParams.cablingTiersThreePhase.length === 0) {
      return json(400, {
        error: 'Refusing to save: cablingTiersThreePhase cannot be empty.',
      });
    }
    // ─── v3-174 · cabling tier MONOTONICITY (hand-mirror of calculations.js
    // findCablingTierViolation — functions cannot import from src/; the smoke
    // suite diffs the two). Cabling costs pct × panels × panelPrice, so no
    // tier may price a larger system CHEAPER than the tier before it:
    //     total[i] × minPanels[i] ≥ total[i-1] × minPanels[i-1]
    // The Engineering console enforces the same floor per field and blocks
    // Save; this is the backstop for a hand-crafted PUT or a client skew.
    for (const key of ['cablingTiers', 'cablingTiersThreePhase']) {
      const tbl = merged.adminParams?.[key];
      if (!Array.isArray(tbl) || tbl.length === 0) continue;
      const tierTotal = (t) => (t.dcCablePct || 0) + (t.acCablePct || 0)
                             + (t.conduitsPct || 0) + (t.panelBoardPct || 0);
      const sorted = [...tbl].sort((a, b) => (a.minPanels || 0) - (b.minPanels || 0));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const required = tierTotal(prev) * (prev.minPanels || 1) / (sorted[i].minPanels || 1);
        if (tierTotal(sorted[i]) < required - 1e-9) {
          return json(400, {
            error: `Refusing to save: ${key} tier at ${sorted[i].minPanels} panels prices a `
              + `larger system cheaper cabling than the ${prev.minPanels}-panel tier before it — `
              + `its total must be at least ${(Math.ceil(required * 10000) / 100).toFixed(2)}%.`,
          });
        }
      }
    }
    // Battery packages: at least one package must exist; calculations.js
    // assumes there's always an active package to compute costs from.
    if (Array.isArray(merged.adminParams?.batteryPackages)
        && merged.adminParams.batteryPackages.length === 0) {
      return json(400, {
        error: 'Refusing to save: at least one battery package must remain.',
      });
    }
    // v3-138 — misc catalog: 0-40 rows (an EMPTY array is valid — Step 2F then
    // offers "Other (please specify)" only); labels non-empty and unique; COGS
    // finite. Centavos are ACCEPTED here (Anjon's sheet carries them).
    // v3-144 — NEGATIVE COGS accepted (reversal/credit items priced
    // sign-symmetrically by the engine); only finiteness is enforced now.
    if (merged.adminParams && Array.isArray(merged.adminParams.miscCatalog)) {
      const rows = merged.adminParams.miscCatalog;
      if (rows.length > 40) {
        return json(400, { error: 'Refusing to save: at most 40 misc catalog items.' });
      }
      const seenMisc = new Set();
      for (const r of rows) {
        const lbl = String(r?.label || '').trim();
        if (lbl === '') {
          return json(400, { error: 'Refusing to save: misc catalog item with empty description.' });
        }
        if (seenMisc.has(lbl.toLowerCase())) {
          return json(400, { error: `Refusing to save: duplicate misc catalog item "${lbl}".` });
        }
        seenMisc.add(lbl.toLowerCase());
        const v = Number(r?.cogs);
        if (!Number.isFinite(v)) {
          return json(400, { error: `Refusing to save: misc catalog item "${lbl}" has an invalid cost.` });
        }
        // v3-150 — Quote Summary category. ABSENT is valid and means 'misc':
        // every row in a pre-v3-150 blob predates the field, and rejecting
        // those would block the first post-deploy save of an otherwise
        // untouched catalog. A PRESENT but unrecognized value is rejected —
        // that can only come from a hand-edited blob or a client/server
        // version skew, and silently coercing it would put a line in the
        // wrong package subtotal with no signal that anything was wrong.
        if (r?.category !== undefined
            && !MISC_CATEGORY_IDS.includes(r.category)) {
          return json(400, { error: `Refusing to save: misc catalog item "${lbl}" has an unknown Summary category "${r.category}".` });
        }
      }
    }
    // v3-151 — battery packages: the rack threshold must be a non-negative
    // integer. 0 = this package never takes a rack; 1 = always one (the
    // pre-v3-151 behaviour, and what an ABSENT field reads as). A fractional
    // or negative threshold would make racksNeeded() behave unpredictably at
    // the boundary rather than failing loudly.
    if (merged.adminParams && Array.isArray(merged.adminParams.batteryPackages)) {
      for (const b of merged.adminParams.batteryPackages) {
        const lbl = String(b?.label || '').trim() || '(unnamed)';
        if (b?.rackRequiredFromUnits !== undefined
            && (!Number.isInteger(b.rackRequiredFromUnits) || b.rackRequiredFromUnits < 0)) {
          return json(400, { error: `Refusing to save: battery package "${lbl}" rack threshold must be a whole number, 0 or more.` });
        }
      }
    }
    // v3-116 — delivery locations: 0-10 rows (an EMPTY array is valid — the
    // Step 2E dropdown then offers Luzon main island + Other only); labels
    // non-empty and unique; COGS finite and >= 0. Also migrate + strip any
    // legacy Cebu/Siargao scalars on BOTH the incoming body and the merged
    // blob so the first post-deploy Save permanently removes them.
    if (merged.adminParams && Array.isArray(merged.adminParams.deliveryLocations)) {
      const rows = merged.adminParams.deliveryLocations;
      if (rows.length > 10) {
        return json(400, { error: 'Refusing to save: at most 10 delivery locations.' });
      }
      const seenLoc = new Set();
      for (const r of rows) {
        const lbl = String(r?.label || '').trim();
        if (lbl === '') {
          return json(400, { error: 'Refusing to save: delivery location with empty label.' });
        }
        if (seenLoc.has(lbl.toLowerCase())) {
          return json(400, { error: `Refusing to save: duplicate delivery location "${lbl}".` });
        }
        seenLoc.add(lbl.toLowerCase());
        for (const k of ['fixedFeeCogs', 'perPanelCogs']) {
          const v = Number(r?.[k]);
          if (!Number.isFinite(v) || v < 0) {
            return json(400, { error: `Refusing to save: delivery location "${lbl}" has an invalid ${k}.` });
          }
        }
      }
    }
    for (const tgt of [merged.adminParams]) {   // body handled pre-overlay (above)
      if (tgt && typeof tgt === 'object') {
        const hasLegacyLoc = 'cebuFixedFeeCogs' in tgt || 'cebuPerPanelCogs' in tgt
                          || 'siargaoFixedFeeCogs' in tgt || 'siargaoPerPanelCogs' in tgt;
        if (hasLegacyLoc && !Array.isArray(tgt.deliveryLocations)) {
          tgt.deliveryLocations = [
            { id: 'cebu', label: 'Cebu',
              fixedFeeCogs: tgt.cebuFixedFeeCogs ?? 37736,
              perPanelCogs: tgt.cebuPerPanelCogs ?? 3740, available: true },
            { id: 'siargao', label: 'Siargao',
              fixedFeeCogs: tgt.siargaoFixedFeeCogs ?? 327053,
              perPanelCogs: tgt.siargaoPerPanelCogs ?? 5748, available: true },
          ];
        }
        delete tgt.cebuFixedFeeCogs; delete tgt.cebuFixedFee;
        delete tgt.cebuPerPanelCogs; delete tgt.cebuPerPanel;
        delete tgt.siargaoFixedFeeCogs; delete tgt.siargaoFixedFee;
        delete tgt.siargaoPerPanelCogs; delete tgt.siargaoPerPanel;
      }
    }
    // Don't accept duplicate or empty promo codes either.
    if (Array.isArray(merged.adminParams?.promoCodes)) {
      const seen = new Set();
      for (const p of merged.adminParams.promoCodes) {
        const c = String(p?.code || '').trim().toUpperCase();
        if (c === '') {
          return json(400, { error: 'Refusing to save: promo code with empty Code value.' });
        }
        if (seen.has(c)) {
          return json(400, { error: `Refusing to save: duplicate promo code "${c}".` });
        }
        seen.add(c);
        // v3-151 — type is optional and ABSENT reads as 'percent', so every
        // code saved before this release still saves. A present-but-unknown
        // type is rejected rather than coerced: silently reading a peso code
        // as a percentage would turn a PHP 25,000 discount into 2,500,000%.
        if (p?.type !== undefined && !PROMO_TYPE_IDS.includes(p.type)) {
          return json(400, { error: `Refusing to save: promo code "${c}" has an unknown type "${p.type}".` });
        }
        const d = Number(p?.discount);
        if (!Number.isFinite(d) || d < 0) {
          return json(400, { error: `Refusing to save: promo code "${c}" has an invalid discount.` });
        }
        // A percentage is a FRACTION; anything above 1 is a mis-entered
        // percentage (15 meaning 15%) that would zero out every quote it
        // touches. Peso amounts are unbounded here — the engine clamps them
        // to the package price at quote time.
        if ((p?.type === undefined || p.type === 'percent') && d > 1) {
          return json(400, { error: `Refusing to save: promo code "${c}" percentage must be a fraction between 0 and 1.` });
        }
      }
    }
    // quoteValidityDays must be a positive integer ≥ 1. Zero, negatives, and
    // non-integers (NaN, fractional days) would produce invalid "Valid until"
    // dates in the customer-facing header.
    if ('quoteValidityDays' in (merged.adminParams || {})) {
      const v = merged.adminParams.quoteValidityDays;
      if (!Number.isInteger(v) || v < 1) {
        return json(400, {
          error: 'Refusing to save: quoteValidityDays must be a positive integer (1 or more).',
        });
      }
    }
    // v3-79 — the flat-rate keys are dead (replaced by the surface anchors).
    // Strip them from the incoming body AND the merged blob so the first Save
    // after deploy permanently removes them from Blob storage, rather than
    // leaving orphans that look meaningful to whoever reads the blob next.
    for (const dead of ['baseRtoInterestRate', 'smallPackagePanelThreshold',
                        'smallPackageRiskPremiumBps']) {
      if (body.adminParams) delete body.adminParams[dead];
      if (merged.adminParams) delete merged.adminParams[dead];
    }

    // v3-89 — `ap_` MUST be declared before ANY validation block that reads it.
    // v3-83 inserted the margins block ABOVE the rate-surface block, which is where
    // `const ap_` lived — putting the reads in the CONST'S TEMPORAL DEAD ZONE.
    // `const` hoists but stays uninitialised, so `'grossMargin' in ap_` threw
    // ReferenceError, the function crashed, and Netlify returned HTTP 502.
    // EVERY ADMIN SAVE HAD BEEN FAILING SINCE v3-83. Declare it once, up here.
    const ap_ = merged.adminParams || {};

    // ─── Margins (v3-83) ──────────────────────────────────────────────────
    // These two drive EVERY direct purchase price in the app. A bad value here
    // doesn't degrade one number — it blanks or explodes the entire price list.
    //   grossMargin >= 1        -> divide by zero / negative price
    //   merchantDiscountRate such that (1.12 x (1-MDR)) - 0.12 <= 0  -> same
    // The MDR ceiling is 1 - 0.12/1.12 = 0.892857…; anything at or above it means
    // the acquirer's cut plus the VAT remittance exceeds the whole sale.
    const MDR_CEILING = 1 - (0.12 / 1.12);
    // v3-92 — gross margin is now a GENLINV curve over capacity. Validate the
    // three anchors (strictly increasing fractions in [0,1)), the three kWp
    // breakpoints (positive, strictly increasing), and the reference kWp. A
    // non-monotone or out-of-range set yields NaN / negative prices list-wide.
    if (['grossMarginMin','grossMarginMid','grossMarginMax'].some(k => k in ap_)) {
      const q1 = ap_.grossMarginMin, q2 = ap_.grossMarginMid, q3 = ap_.grossMarginMax;
      if (![q1, q2, q3].every(v => Number.isFinite(v) && v >= 0 && v < 1) || !(q1 < q2 && q2 < q3)) {
        return json(400, {
          error: 'Refusing to save: gross-margin anchors must be strictly increasing fractions in [0%, 100%): Min < Mid < Max.',
        });
      }
    }
    if (['grossMarginMinKwp','grossMarginMidKwp','grossMarginMaxKwp'].some(k => k in ap_)) {
      const x1 = ap_.grossMarginMinKwp, x2 = ap_.grossMarginMidKwp, x3 = ap_.grossMarginMaxKwp;
      if (![x1, x2, x3].every(v => Number.isFinite(v) && v > 0) || !(x1 < x2 && x2 < x3)) {
        return json(400, {
          error: 'Refusing to save: gross-margin capacity breakpoints must be positive, strictly increasing kWp: MinKwp < MidKwp < MaxKwp.',
        });
      }
    }
    // v3-191 — the three-phase curve anchors: identical monotonicity rules to
    // the single-phase set above, validated independently.
    if (['grossMarginMinTp','grossMarginMidTp','grossMarginMaxTp'].some(k => k in ap_)) {
      const q1 = ap_.grossMarginMinTp, q2 = ap_.grossMarginMidTp, q3 = ap_.grossMarginMaxTp;
      if (![q1, q2, q3].every(v => Number.isFinite(v) && v >= 0 && v < 1) || !(q1 < q2 && q2 < q3)) {
        return json(400, {
          error: 'Refusing to save: three-phase gross-margin anchors must be strictly increasing fractions in [0%, 100%): Min < Mid < Max.',
        });
      }
    }
    if (['grossMarginMinKwpTp','grossMarginMidKwpTp','grossMarginMaxKwpTp'].some(k => k in ap_)) {
      const x1 = ap_.grossMarginMinKwpTp, x2 = ap_.grossMarginMidKwpTp, x3 = ap_.grossMarginMaxKwpTp;
      if (![x1, x2, x3].every(v => Number.isFinite(v) && v > 0) || !(x1 < x2 && x2 < x3)) {
        return json(400, {
          error: 'Refusing to save: three-phase gross-margin capacity breakpoints must be positive, strictly increasing kWp: MinKwp < MidKwp < MaxKwp.',
        });
      }
    }
    // v3-191 — the per-phase panels-without-inverter margins. Same [0,1)
    // fraction rule as every other margin: a value >= 1 divides by zero and
    // blanks every panels-only price.
    for (const k of ['grossMarginNoInverterSp', 'grossMarginNoInverterTp']) {
      if (k in ap_) {
        const v = ap_[k];
        if (!Number.isFinite(v) || v < 0 || v >= 1) {
          return json(400, {
            error: 'Refusing to save: the panels-without-inverter margin must be a fraction between 0% and (strictly) 100% for each phase.',
          });
        }
      }
    }
    // v3-191 — the componentMargins table (B–Q). A malformed entry doesn't
    // degrade one number — the resolver would price an entire component group
    // at NaN or a >=1 margin, blanking or exploding its lines on every quote.
    // Validate shape and range on every entry present; ids beyond the known
    // set are refused so a typo'd key can't sit silently in the blob.
    if ('componentMargins' in ap_) {
      const KNOWN = ['B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q'];
      const cm = ap_.componentMargins;
      if (!cm || typeof cm !== 'object' || Array.isArray(cm)) {
        return json(400, { error: 'Refusing to save: componentMargins must be an object keyed by component letter (B–Q).' });
      }
      for (const [id, row] of Object.entries(cm)) {
        if (!KNOWN.includes(id)) {
          return json(400, { error: `Refusing to save: componentMargins has an unknown component id "${id}" — allowed ids are B through Q.` });
        }
        if (!row || typeof row !== 'object') {
          return json(400, { error: `Refusing to save: componentMargins.${id} must be an object.` });
        }
        const marginOk = (v) => Number.isFinite(v) && v >= 0 && v < 1;
        if (!marginOk(row.otherwise)) {
          return json(400, { error: `Refusing to save: componentMargins.${id}.otherwise must be a fraction between 0% and (strictly) 100%.` });
        }
        if (id !== 'N') {
          if (row.mode !== 'follow' && row.mode !== 'fixed') {
            return json(400, { error: `Refusing to save: componentMargins.${id}.mode must be "follow" or "fixed".` });
          }
          if (!marginOk(row.fixed)) {
            return json(400, { error: `Refusing to save: componentMargins.${id}.fixed must be a fraction between 0% and (strictly) 100%.` });
          }
        }
      }
    }
    // v3-199 — the free-delivery radius: a non-positive or non-finite radius
    // makes every Luzon quote chargeable from km 0 (or NaNs the charge), and
    // the T&C would print the same broken number via {{LUZON_FREE_KM}}.
    if ('luzonFreeTravelKm' in ap_) {
      const v = ap_.luzonFreeTravelKm;
      if (!Number.isFinite(v) || v <= 0 || v > 500) {
        return json(400, {
          error: 'Refusing to save: the Luzon free-delivery radius must be a positive number of kilometers (at most 500).',
        });
      }
    }
    if ('grossMarginReference' in ap_) {
      const v = ap_.grossMarginReference;
      if (!Number.isFinite(v) || v < 0 || v >= 1) {
        // v3-190 — same rule; message renamed with the param's move to FinCo.
        return json(400, { error: 'Refusing to save: assumed gross margin for preventive maintenance must be a fraction between 0% and (strictly) 100%.' });
      }
    }
    if ('merchantDiscountRate' in ap_) {
      const v = ap_.merchantDiscountRate;
      if (!Number.isFinite(v) || v < 0 || v >= MDR_CEILING) {
        return json(400, {
          error: `Refusing to save: merchant discount rate must be between 0% and ${(MDR_CEILING * 100).toFixed(1)}%. `
               + 'At or above that, the acquirer\'s cut plus the VAT remittance exceeds the entire sale and every price in the app would be zero or negative.',
        });
      }
    }

    // ─── RTO rate surface (v3-79) ─────────────────────────────────────────
    // The three anchors ARE the curve. If they are not strictly increasing the
    // generalized-lognormal is undefined: the skew ratio b = (q3-q2)/(q2-q1)
    // goes zero, negative, or divides by zero, and every rate in the grid comes
    // back NaN. That would price every quote in the app as NaN, so this is a
    // hard refuse — the client validates too, but this is the boundary that
    // actually protects production.
    const anchorKeys = ['rateAnchorMin', 'rateAnchorMid', 'rateAnchorMax'];
    if (anchorKeys.some(k => k in ap_)) {
      const [lo, mid, hi] = anchorKeys.map(k => ap_[k]);
      if (![lo, mid, hi].every(v => Number.isFinite(v) && v >= 0 && v < 1)) {
        return json(400, {
          error: 'Refusing to save: the three rate anchors must each be a number between 0% and 100%.',
        });
      }
      if (!(lo < mid && mid < hi)) {
        return json(400, {
          error: 'Refusing to save: rate anchors must be strictly increasing — min < mid < max. '
               + `Got min ${(lo * 100).toFixed(2)}%, mid ${(mid * 100).toFixed(2)}%, max ${(hi * 100).toFixed(2)}%.`,
        });
      }
    }
    if ('rateTenorWeight' in ap_) {
      const v = ap_.rateTenorWeight;
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        return json(400, {
          error: 'Refusing to save: tenor weight must be between 0 and 1.',
        });
      }
    }
    if ('rateStepPct' in ap_) {
      const v = ap_.rateStepPct;
      if (!Number.isFinite(v) || v < 0 || v > 0.05) {
        return json(400, {
          error: 'Refusing to save: rate step must be between 0 and 5 percentage points.',
        });
      }
    }
    // v3-100 — Documentary Stamp Tax rate (PRODUCT!C3, default 0.0075 = ₱1.50
    // per ₱200). A fraction ≥ 1 would tax more than the financed amount; NaN
    // would NaN the DST line and the summary total on every financed quote.
    if ('documentaryStampTaxRate' in ap_) {
      const v = ap_.documentaryStampTaxRate;
      if (!Number.isFinite(v) || v < 0 || v >= 1) {
        return json(400, {
          error: 'Refusing to save: Documentary Stamp Tax rate must be a fraction between 0% and 100%.',
        });
      }
    }

    // Quote Limits (v3-68). Sanity ranges — the client narrows dropdowns from
    // these values, so out-of-range saves would empty the Step 3 option lists
    // or produce an impossible panel floor.
    if ('minSystemKwp' in (merged.adminParams || {})) {
      const v = merged.adminParams.minSystemKwp;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        return json(400, {
          error: 'Refusing to save: minSystemKwp must be a number of 0 or more (0 = no minimum).',
        });
      }
    }
    // v3-75: tiered minimum DP. The client narrows Step 3A dropdowns from the
    // resolved tier, so a malformed table could empty the option list or make
    // the floor resolution ambiguous. Rules: 1–10 rows; row 0 anchored at
    // fromNetPrice 0 (there is always a base tier); thresholds strictly
    // ascending; every minDpPct a fraction in [0, 1] (v3-82: 100% is the highest
    // Step 3A option, so a floor above it would empty the list).
    if ('minDpTiers' in (merged.adminParams || {})) {
      const tiers = merged.adminParams.minDpTiers;
      if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 10) {
        return json(400, {
          error: 'Refusing to save: minDpTiers must be an array of 1 to 10 tiers.',
        });
      }
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        if (!t || typeof t !== 'object' ||
            typeof t.fromNetPrice !== 'number' || !Number.isFinite(t.fromNetPrice) || t.fromNetPrice < 0 ||
            typeof t.minDpPct !== 'number' || !Number.isFinite(t.minDpPct) || t.minDpPct < 0 || t.minDpPct > 1) {
          return json(400, {
            error: `Refusing to save: minDpTiers row ${i + 1} must have fromNetPrice ≥ 0 and minDpPct between 0 and 1 (0% and 100%).`,
          });
        }
      }
      if (tiers[0].fromNetPrice !== 0) {
        return json(400, {
          error: 'Refusing to save: the first minDpTiers row must have fromNetPrice 0 (base tier).',
        });
      }
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].fromNetPrice <= tiers[i - 1].fromNetPrice) {
          return json(400, {
            error: `Refusing to save: minDpTiers thresholds must be strictly ascending (row ${i + 1} must exceed row ${i}).`,
          });
        }
      }
    }
    // v3-181 — DU tariff inflation default. Same bounds the engine clamps to
    // and the two input steppers enforce: 0 <= r <= 0.10, on the 0.25% grid.
    // A value off the grid is accepted rather than rejected (an admin typing
    // 1.3% is expressing intent, and the engine is grid-agnostic) but the
    // BOUNDS are hard: a negative rate would compound savings downward past
    // degradation, and an unbounded one would produce a payback of months.
    if ('duRateInflationDefault' in (merged.adminParams || {})) {
      const v = merged.adminParams.duRateInflationDefault;
      if (!Number.isFinite(v) || v < 0 || v > 0.10) {
        return json(400, {
          error: 'Refusing to save: duRateInflationDefault must be a fraction between 0 and 0.10 (0% and 10%).',
        });
      }
    }
    // v3-187 — IRR/LCOE horizon default. MUST be one of the options the Step 4
    // dropdown offers: a default outside that set would leave the customer
    // looking at a horizon their own selector cannot reproduce, and the
    // <select> would render with no matching option.
    // This list is duplicated from src/data/adminParams.js because netlify
    // functions cannot import from src/; check-param-sync.sh diffs the two.
    const IRR_YEARS_OPTIONS = [10, 15, 20, 25, 30];
    if ('irrYearsDefault' in (merged.adminParams || {})) {
      const v = merged.adminParams.irrYearsDefault;
      if (!IRR_YEARS_OPTIONS.includes(v)) {
        return json(400, {
          error: `Refusing to save: irrYearsDefault must be one of ${IRR_YEARS_OPTIONS.join(', ')}.`,
        });
      }
    }
    // v3-183 — DU inflation reference inputs. Bounds are loose by design (any
    // published tariff point is legitimate), but the SHAPE is enforced: a
    // malformed date or a non-positive rate would otherwise reach the customer
    // surface, which resolves it to "no note" and silently drops the guidance.
    for (const k of ['duInflationDate1', 'duInflationDate2']) {
      if (k in (merged.adminParams || {})) {
        const v = merged.adminParams[k];
        if (v !== '' && !(typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v))) {
          return json(400, { error: `Refusing to save: ${k} must be a YYYY-MM month, e.g. 2016-07.` });
        }
      }
    }
    for (const k of ['duInflationRate1', 'duInflationRate2']) {
      if (k in (merged.adminParams || {})) {
        const v = merged.adminParams[k];
        if (v !== null && v !== '' && (!Number.isFinite(v) || v <= 0 || v > 1000)) {
          return json(400, { error: `Refusing to save: ${k} must be a rate per kWh greater than 0.` });
        }
      }
    }
    if ('duInflationSourceUrl' in (merged.adminParams || {})) {
      const v = merged.adminParams.duInflationSourceUrl;
      if (v && !/^https?:\/\//i.test(String(v))) {
        return json(400, { error: 'Refusing to save: duInflationSourceUrl must start with http:// or https://.' });
      }
    }
    if ('maxTenorMonths' in (merged.adminParams || {})) {
      const v = merged.adminParams.maxTenorMonths;
      if (!Number.isInteger(v) || v < 1 || v > 60) {
        return json(400, {
          error: 'Refusing to save: maxTenorMonths must be an integer between 1 and 60.',
        });
      }
    }
    // Step 1 Defaults (v3-70). Both are starting values pre-filled into the
    // calculator, so zero/negative/non-finite values would boot every fresh
    // session into a broken state (utilityRate divides the monthly bill).
    if ('defaultUtilityRate' in (merged.adminParams || {})) {
      const v = merged.adminParams.defaultUtilityRate;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        return json(400, {
          error: 'Refusing to save: defaultUtilityRate must be a number greater than 0 (₱/kWh).',
        });
      }
    }
    if ('defaultMonthlyBill' in (merged.adminParams || {})) {
      const v = merged.adminParams.defaultMonthlyBill;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        return json(400, {
          error: 'Refusing to save: defaultMonthlyBill must be a number greater than 0 (₱).',
        });
      }
    }
    // Step 3 Default (v3-159). Must sit on the 5% DP grid in [0, 1] — an
    // off-grid default would leave Step 3A's selector with no matching
    // option and the Mobile Flow slider between detents.
    if ('defaultDownPaymentPct' in (merged.adminParams || {})) {
      const v = merged.adminParams.defaultDownPaymentPct;
      const onGrid = typeof v === 'number' && Number.isFinite(v)
        && v >= 0 && v <= 1 && Math.abs(v * 20 - Math.round(v * 20)) < 1e-9;
      if (!onGrid) {
        return json(400, {
          error: 'Refusing to save: defaultDownPaymentPct must be a fraction between 0 and 1 on the 5% grid (e.g. 0.30).',
        });
      }
    }

    try {
      await store.setJSON(KEY, merged);
      return json(200, {
        ok: true,
        savedAt: new Date().toISOString(),
        role: claimedRole,
        appliedAdminKeys,
        ignoredAdminKeys,
        inventoryApplied,
      });
    } catch (err) {
      return json(500, { error: 'Write failed', detail: String(err) });
    }
  }

  return json(405, { error: 'Method not allowed' });
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function deepClone(v) {
  if (v == null) return null;
  return JSON.parse(JSON.stringify(v));
}
