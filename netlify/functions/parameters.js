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
//          • Header  x-solviva-role           — 'edit' | 'engineering' | 'product'
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
//
// Storage:
//   Netlify Blobs key-value store, store name "solviva-config",
//   key "parameters". Persists across deployments and is global to the site.
//
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
const EDIT_ROLES = new Set(['edit', 'engineering', 'product']);

// Per-role admin-section allowlist. Mirrors src/lib/permissions.js.
// 'edit' (Super Admin) is wildcard, handled separately.
const ROLE_ADMIN_SECTIONS = {
  engineering: new Set([
    'solarPanel',
    'variableCharges',
    'roofMaterial',
    'location',
    'cabling',
    'batteryPackage',
    'standaloneCharges',
    'fixedOverhead',
    'scheduleConstants',
    'maintenance',
  ]),
  product: new Set([
    'quoteValidity',
    'quoteLimits',      // v3-68 — min system size / min DP / max tenor
    'step1Defaults',    // v3-70 — default utility rate / monthly bill
    'interestRates',
    'promoCodes',
    'maintenance',
  ]),
};

const ROLE_INVENTORY_ACCESS = {
  // Wildcard for 'edit' handled separately.
  engineering: true,
  product: false,
};

// ADMIN_PARAMS key → section. Mirrors src/lib/permissions.js.
const PARAM_KEY_TO_SECTION = {
  // Interest Rates
  baseRtoInterestRate:           'interestRates',
  smallPackagePanelThreshold:    'interestRates',
  smallPackageRiskPremiumBps:    'interestRates',
  earlyPayoffDiscountRate:       'interestRates',
  // Solar Panel & Mounting
  mountingSupportFloorPrice:     'solarPanel',
  mountingSupportPctOfPanels:    'solarPanel',
  // Variable Charges
  additionalDcCablePerMeter:     'variableCharges',
  additionalAcCablePerMeter:     'variableCharges',
  laborInstallationPerKwp:       'variableCharges',
  rsdVariablePerPanel:           'variableCharges',
  rsdFixedTransmitter:           'variableCharges',
  // Roof Material
  roofAsphaltPerKwp:             'roofMaterial',
  roofConcretePerKwp:            'roofMaterial',
  // Location / Delivery
  cebuFixedFee:                  'location',
  cebuPerPanel:                  'location',
  siargaoFixedFee:               'location',
  siargaoPerPanel:               'location',
  luzonOver30FixedFee:           'location',
  luzonOver30PerKm:              'location',
  // Cabling
  cablingTiers:                  'cabling',
  cablingTiersThreePhase:        'cabling',   // NEW v3-62 — 3-phase tier table
  // Battery Packages (v3-54: replaces 6 flat keys with a single array)
  batteryPackages:               'batteryPackage',
  // Standalone Retrofit Charges
  rsdStandaloneLaborPerPanel:    'standaloneCharges',
  rsdStandaloneLaborMobilization:'standaloneCharges',
  inverterStandaloneLaborPerUnit:'standaloneCharges',
  inverterStandaloneMobilization:'standaloneCharges',
  // Fixed Overhead
  fixedOverheadDeliveryLogistics:'fixedOverhead',
  fixedOverheadWarehouse:        'fixedOverhead',
  fixedOverheadCustoms:          'fixedOverhead',
  fixedOverheadSafetySupervision:'fixedOverhead',
  fixedOverheadTesting:          'fixedOverhead',
  // Schedule Constants
  kWhPerKwpPerDay:               'scheduleConstants',
  batteryEfficiency:             'scheduleConstants',
  batteryDepthOfDischarge:       'scheduleConstants',
  panelAnnualDegradation:        'scheduleConstants',
  lcoeNpvDiscountRate:           'scheduleConstants',
  maintenanceInflationRate:      'scheduleConstants',
  netMeteringEfficiency:         'scheduleConstants',
  preventiveMaintenancePerPanel: 'scheduleConstants',
  preventiveMaintenancePerVisit: 'scheduleConstants',
  minDaysToFirstPostInstallPayment: 'scheduleConstants',
  // Promo Codes
  promoCodes:                    'promoCodes',
  // Quote Validity
  quoteValidityDays:             'quoteValidity',
  // Quote Limits (v3-68)
  minSystemKwp:                  'quoteLimits',
  minDpTiers:                    'quoteLimits',   // v3-75 — replaces scalar minDownPaymentPct
  maxTenorMonths:                'quoteLimits',
  // Step 1 Defaults (v3-70)
  defaultUtilityRate:            'step1Defaults',
  defaultMonthlyBill:            'step1Defaults',
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
    // Battery packages: at least one package must exist; calculations.js
    // assumes there's always an active package to compute costs from.
    if (Array.isArray(merged.adminParams?.batteryPackages)
        && merged.adminParams.batteryPackages.length === 0) {
      return json(400, {
        error: 'Refusing to save: at least one battery package must remain.',
      });
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
    // ascending; every minDpPct a fraction in [0, 0.5] (50% is the highest
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
            typeof t.minDpPct !== 'number' || !Number.isFinite(t.minDpPct) || t.minDpPct < 0 || t.minDpPct > 0.5) {
          return json(400, {
            error: `Refusing to save: minDpTiers row ${i + 1} must have fromNetPrice ≥ 0 and minDpPct between 0 and 0.5 (0% and 50%).`,
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
