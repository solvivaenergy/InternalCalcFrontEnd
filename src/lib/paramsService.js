// =============================================================================
// PARAMS SERVICE — fetches global parameter overrides from the backend
// -----------------------------------------------------------------------------
// On app boot, fetches saved overrides from the Netlify Function at
//   /.netlify/functions/parameters
// and merges them on top of the bundled defaults.
//
// IMPORTANT IMPLEMENTATION DETAIL: We mutate the exported objects from
//   src/data/adminParams.js  (ADMIN_PARAMS)
//   src/data/inventory.js    (PANEL_SETTINGS, INVERTERS_SINGLE_PHASE, INVERTERS_THREE_PHASE)
//   src/data/devices.js      (DEVICES)
// in place so existing static imports across calculations.js, schedule.js,
// and the components see the live values without needing to thread params
// through every function call. ES module exports are shared references, so
// this works.
//
// Anything the admin saves via PUT replaces what's in Netlify Blobs storage,
// which is shared across ALL users globally — so changes propagate to every
// device that loads the app afterward.
//
// Local-dev fallback: if the function isn't reachable (e.g. running
// `vite dev` locally without `netlify dev`), we just use bundled defaults
// and disable saving. The Admin UI will detect the read-only state.
// =============================================================================

import { ADMIN_PARAMS, BASELINE_RATE, deriveThreePhaseCablingTiers } from '../data/adminParams.js';
import { deriveDirectPrices, cogsFromDirect, normalizeComponentMargins } from './calculations.js';
import {
  PANEL_SETTINGS,
  INVERTERS_SINGLE_PHASE,
  INVERTERS_THREE_PHASE,
} from '../data/inventory.js';
import { DEVICES } from '../data/devices.js';
import { getAccessToken } from './supabaseClient.js';

// Parameters endpoint. When VITE_API_BASE_URL is set (production), the admin
// pipeline reads/writes the Supabase-backed Express service at
// `${base}/api/parameters` — the SAME store the quote engine reads, so admin
// edits reflect in quotes. When unset (local dev without the backend), we fall
// back to the legacy Netlify Function + Netlify Blobs path so the calculator
// still boots. Trailing slashes on the base are trimmed to avoid `//api`.
const API_BASE = (
  import.meta.env.DEV
    ? "http://localhost:3000"
    : import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");
const API_URL = API_BASE
  ? `${API_BASE}/api/parameters`
  : '/.netlify/functions/parameters';

// ═══ v3-83 — DERIVE ON MODULE LOAD, BEFORE ANYTHING ELSE ═════════════════════
// `directPrice` / `panelDirectPrice` / `batteryUnitPrice` … ship as 0 in the data
// files: they are DERIVED, not authored. applyOverrides() re-derives them after a
// server load — but if the server is unreachable, or during the first paint
// before the fetch resolves, applyOverrides never runs and EVERY PRICE IN THE APP
// WOULD BE ₱0. Derive the code defaults immediately, at import time.
//
// Placed BEFORE the ORIGINAL snapshot below so that reset-to-defaults restores
// real prices too, not zeros.
deriveDirectPrices(ADMIN_PARAMS, PANEL_SETTINGS, INVERTERS_SINGLE_PHASE, INVERTERS_THREE_PHASE, ADMIN_PARAMS.grossMarginReference);

// Snapshot of original defaults — captured at module load time so we can
// always compute "the current state" (defaults + applied overrides) and
// also reset to defaults on demand without re-importing.
const ORIGINAL = {
  adminParams: deepClone(ADMIN_PARAMS),
  panelSettings: deepClone(PANEL_SETTINGS),
  invertersSinglePhase: deepClone(INVERTERS_SINGLE_PHASE),
  invertersThreePhase:  deepClone(INVERTERS_THREE_PHASE),
  devices: deepClone(DEVICES),
};

let _loadedFromServer = false;
const _subscribers = new Set();

// Load once at boot. Always returns the current snapshot — falls back to
// defaults if the network is unreachable.
export async function load() {
  try {
    const res = await fetch(API_URL, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const overrides = await res.json();
    applyOverrides(overrides);
    _loadedFromServer = true;
  } catch (err) {
    // Local dev or network failure → defaults stay in place. Save will be
    // disabled but the calculator still works. We log for diagnostics; the
    // UI surfaces the unreachable state via isLoadedFromServer() = false.
    if (typeof console !== 'undefined') {
      console.warn('[paramsService] load() failed; falling back to defaults:', err);
    }
    resetToDefaults();
    _loadedFromServer = false;
  }
  notify();
  return getSnapshot();
}

// Save the entire merged snapshot. Returns { ok, error? }.
// Authenticates via the current Supabase session's JWT (Bearer token). The
// server verifies the token, looks up the caller's role in `user_roles`, and
// enforces the section-allowlist for that role. `role` is still sent for
// server-side logging / defensive checks, but the JWT is the source of truth.
//
// NOTE: upstream v3-207 passed a shared password here
// (`save(snapshot, password, role)`); this deployment authenticates per-user
// through Supabase instead, so the password argument is gone.
export async function save(snapshot, role) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { ok: false, error: 'Not signed in — please log in again.' };
    }
    const res = await fetch(API_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-solviva-role': role || '',
      },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    applyOverrides(snapshot);
    notify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// Get the current snapshot (live values).
export function getSnapshot() {
  return {
    adminParams: deepClone(ADMIN_PARAMS),
    panelSettings: deepClone(PANEL_SETTINGS),
    invertersSinglePhase: deepClone(INVERTERS_SINGLE_PHASE),
    invertersThreePhase:  deepClone(INVERTERS_THREE_PHASE),
    devices: deepClone(DEVICES),
  };
}

export function isLoadedFromServer() { return _loadedFromServer; }

// Subscribe to changes (used by App after a save persists, so all subscribed
// components re-render with the new live values).
export function subscribe(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}
function notify() {
  for (const fn of _subscribers) fn(getSnapshot());
}

// ─── helpers ────────────────────────────────────────────────────────────────

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

// v3-75: migrate a blob's legacy scalar minDownPaymentPct (v3-68) to the
// tiered minDpTiers array IN PLACE on the supplied adminParams override
// object, then strip the legacy key. Pure with respect to module state
// (mutates only its argument) and EXPORTED so the release smoke harness can
// exercise the migration directly. Rules:
//   • legacy scalar present + finite + > 0 + no tier array → synthesize
//     [{ fromNetPrice: 0, minDpPct: <legacy> }] (preserves the floor exactly)
//   • legacy scalar 0 / absent / invalid → nothing to preserve; the bundled
//     default (or the blob's own minDpTiers) stands
//   • an existing minDpTiers array ALWAYS wins over the scalar
//   • the legacy key is deleted in every case
// v3-79 — drop the flat-rate keys the surface replaced. A pre-v3-79 blob still
// carries them; without this they'd be Object.assign'd onto ADMIN_PARAMS as
// stray properties that nothing reads — harmless, but confusing to anyone
// debugging the live params.
// v3-83 — direct purchase prices are DERIVED from COGS and must never be read
// from a stored blob. A pre-v3-83 blob still carries them; without this they'd
// be Object.assign'd back on and then (correctly) overwritten by
// deriveDirectPrices — but stripping them keeps the live params honest and stops
// anyone debugging the blob from thinking they still mean anything.
export function stripLegacyPriceKeys(ap) {
  const DERIVED = [
    // v3-92 — the flat grossMargin scalar is dead (replaced by the capacity curve).
    'grossMargin',
    'mountingSupportFloorPrice', 'additionalDcCablePerMeter', 'additionalAcCablePerMeter',
    'laborInstallationPerKwp', 'rsdVariablePerPanel', 'rsdFixedTransmitter',
    'roofAsphaltPerKwp', 'roofConcretePerKwp', 'cebuFixedFee', 'cebuPerPanel',
    'siargaoFixedFee', 'siargaoPerPanel', 'luzonOver30FixedFee', 'luzonOver30PerKm',
    'rsdStandaloneLaborPerPanel', 'rsdStandaloneLaborMobilization',
    'inverterStandaloneLaborPerUnit', 'inverterStandaloneMobilization',
    'fixedOverheadDeliveryLogistics', 'fixedOverheadWarehouse', 'fixedOverheadCustoms',
    'fixedOverheadSafetySupervision', 'fixedOverheadTesting',
    'preventiveMaintenancePerPanel', 'preventiveMaintenancePerVisit',
  ];
  for (const k of DERIVED) delete ap[k];
  return ap;
}

export function stripLegacyRateKeys(ap) {
  delete ap.baseRtoInterestRate;
  delete ap.smallPackagePanelThreshold;
  delete ap.smallPackageRiskPremiumBps;
  return ap;
}

export function migrateLegacyMinDp(ap) {
  if (!ap || typeof ap !== 'object') return ap;
  const legacy = ap.minDownPaymentPct;
  if (
    typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0 &&
    !Array.isArray(ap.minDpTiers)
  ) {
    ap.minDpTiers = [{ fromNetPrice: 0, minDpPct: legacy }];
  }
  delete ap.minDownPaymentPct;
  return ap;
}

// v3-116 — legacy-blob migration (v3-54/v3-75 pattern): the four Cebu/Siargao
// scalars became the deliveryLocations array. A pre-v3-116 blob's live values
// seed the two rows EXACTLY (zero drift across the deploy boundary); the
// scalars (COGS and stale derived) are stripped in every case; an existing
// deliveryLocations array in a post-v3-116 blob always wins. Exported for the
// smoke harness (migrateLegacyMinDp precedent).
export function migrateLegacyDeliveryLocations(ap) {
  if (!ap || typeof ap !== 'object') return;
  const hasLegacy = 'cebuFixedFeeCogs' in ap || 'cebuPerPanelCogs' in ap
                 || 'siargaoFixedFeeCogs' in ap || 'siargaoPerPanelCogs' in ap;
  if (hasLegacy && !Array.isArray(ap.deliveryLocations)) {
    const def = ADMIN_PARAMS.deliveryLocations || [];
    const d = (id) => def.find(l => l.id === id) || {};
    ap.deliveryLocations = [
      { id: 'cebu', label: 'Cebu',
        fixedFeeCogs: ap.cebuFixedFeeCogs ?? d('cebu').fixedFeeCogs,
        perPanelCogs: ap.cebuPerPanelCogs ?? d('cebu').perPanelCogs,
        fixedFee: 0, perPanel: 0, available: true },
      { id: 'siargao', label: 'Siargao',
        fixedFeeCogs: ap.siargaoFixedFeeCogs ?? d('siargao').fixedFeeCogs,
        perPanelCogs: ap.siargaoPerPanelCogs ?? d('siargao').perPanelCogs,
        fixedFee: 0, perPanel: 0, available: true },
    ];
  }
  delete ap.cebuFixedFeeCogs;  delete ap.cebuFixedFee;
  delete ap.cebuPerPanelCogs;  delete ap.cebuPerPanel;
  delete ap.siargaoFixedFeeCogs; delete ap.siargaoFixedFee;
  delete ap.siargaoPerPanelCogs; delete ap.siargaoPerPanel;
}

// v3-191 — legacy-blob seed for the phase-split margin curve, the per-phase
// panels-without-inverter margins, and the componentMargins object
// (v3-54/75/116 migration pattern). A pre-v3-191 blob priced every quote off
// ONE curve (its single-phase keys) with non-full-system orders at ITS OWN
// grossMarginMax — so, to guarantee ZERO price drift across the deploy
// boundary, every missing v3-191 key seeds from the BLOB'S values, never the
// bundled defaults:
//   • each missing Tp anchor ← the blob's single-phase counterpart
//   • each missing no-inverter margin ← the blob's grossMarginMax
//   • a missing componentMargins ← all-follow with fixed/otherwise = the
//     blob's grossMarginMax (normalizeComponentMargins does exactly this
//     when handed the blob's grossMarginMax — see calculations.js)
// A blob that already carries the keys wins untouched. Runs on the OVERRIDE
// object before Object.assign; the seeded keys persist to Blob storage on
// the next admin Save. Exported for the smoke harness.
export function seedPhaseAndComponentMargins(ap) {
  if (!ap || typeof ap !== 'object') return ap;
  const TP_FROM_SP = {
    grossMarginMinKwpTp: 'grossMarginMinKwp',
    grossMarginMidKwpTp: 'grossMarginMidKwp',
    grossMarginMaxKwpTp: 'grossMarginMaxKwp',
    grossMarginMinTp:    'grossMarginMin',
    grossMarginMidTp:    'grossMarginMid',
    grossMarginMaxTp:    'grossMarginMax',
  };
  for (const [tpKey, spKey] of Object.entries(TP_FROM_SP)) {
    if (!Number.isFinite(ap[tpKey]) && Number.isFinite(ap[spKey])) ap[tpKey] = ap[spKey];
  }
  if (Number.isFinite(ap.grossMarginMax)) {
    if (!Number.isFinite(ap.grossMarginNoInverterSp)) ap.grossMarginNoInverterSp = ap.grossMarginMax;
    if (!Number.isFinite(ap.grossMarginNoInverterTp)) ap.grossMarginNoInverterTp = ap.grossMarginMax;
    if (!ap.componentMargins || typeof ap.componentMargins !== 'object') {
      normalizeComponentMargins(ap);   // seeds all ids from ap.grossMarginMax
    }
  }
  // A blob with NO grossMarginMax at all (fresh install, empty blob) carries
  // no margin state to preserve — the bundled defaults stand.
  return ap;
}

// Apply server-supplied overrides by MUTATING the imported objects.
// This is what makes calculations.js see the live values without refactor.
function applyOverrides(overrides) {
  resetToDefaults();
  if (!overrides || typeof overrides !== 'object') return;

  // v3-54 legacy-blob migration: the 6 flat battery keys
  // (batteryPer5kWhPrice, batteryRackPer3Cap, batteryAtsPrice,
  // batteryCriticalLoadsMaterials, batteryLaborWithSolarInstall,
  // batteryStandaloneLabor) were replaced by a single batteryPackages array.
  // If a stored Netlify Blob still has the old flat keys, rebuild a
  // single-element batteryPackages array preserving the legacy values
  // exactly. This guarantees zero math drift across the v3-53 → v3-54
  // deploy boundary. The legacy keys are stripped from the override so they
  // don't leak through Object.assign onto ADMIN_PARAMS.
  if (overrides.adminParams && typeof overrides.adminParams === 'object') {
    const ap = overrides.adminParams;
    migrateLegacyDeliveryLocations(ap);   // v3-116 — before the clone captures
    seedPhaseAndComponentMargins(ap);     // v3-191 — before the clone captures
    const hasLegacyKeys = (
      'batteryPer5kWhPrice' in ap ||
      'batteryRackPer3Cap' in ap ||
      'batteryAtsPrice' in ap ||
      'batteryCriticalLoadsMaterials' in ap ||
      'batteryLaborWithSolarInstall' in ap ||
      'batteryStandaloneLabor' in ap
    );
    if (hasLegacyKeys && !Array.isArray(ap.batteryPackages)) {
      // Build a single legacy-equivalent package using the blob's values,
      // falling back to current defaults for any missing field.
      const def = ADMIN_PARAMS.batteryPackages?.[0] || {};
      ap.batteryPackages = [{
        id: def.id || 'pkg5kwh01',
        label: def.label || '5 kWh',
        batteryUnitKwh: 5,
        batteryRackCapacity: 3,
        batteryUnitPrice:        ap.batteryPer5kWhPrice           ?? def.batteryUnitPrice,
        batteryRackPrice:        ap.batteryRackPer3Cap            ?? def.batteryRackPrice,
        atsPrice:                ap.batteryAtsPrice               ?? def.atsPrice,
        criticalLoadsMaterials:  ap.batteryCriticalLoadsMaterials ?? def.criticalLoadsMaterials,
        laborWithSolarInstall:   ap.batteryLaborWithSolarInstall  ?? def.laborWithSolarInstall,
        standaloneLabor:         ap.batteryStandaloneLabor        ?? def.standaloneLabor,
      }];
    }
    // Strip the legacy keys regardless (whether we migrated them or there
    // are also batteryPackages alongside them — the new key wins).
    delete ap.batteryPer5kWhPrice;
    delete ap.batteryRackPer3Cap;
    delete ap.batteryAtsPrice;
    delete ap.batteryCriticalLoadsMaterials;
    delete ap.batteryLaborWithSolarInstall;
    delete ap.batteryStandaloneLabor;

    // v3-75 legacy-blob migration: the scalar minDownPaymentPct (v3-68) was
    // replaced by the tiered minDpTiers array. A stored blob carrying a
    // nonzero legacy floor and no tier table rebuilds a single-row tier
    // preserving the floor exactly — zero behavior drift across the
    // v3-74 → v3-75 deploy boundary. The legacy key is stripped either way
    // so it doesn't leak through Object.assign onto ADMIN_PARAMS (the
    // v3-54 battery-keys pattern). Server-side mirror in
    // netlify/functions/parameters.js migrates + strips on PUT so the first
    // Save post-deploy removes the scalar from Blob storage permanently.
    migrateLegacyMinDp(ap);
    stripLegacyRateKeys(ap);
    stripLegacyPriceKeys(ap);
  }

  if (overrides.adminParams) {
    // CRITICAL: snapshot the override's arrays BEFORE Object.assign runs.
    // Object.assign copies properties shallowly, so after the assign,
    // ADMIN_PARAMS.cablingTiers and overrides.adminParams.cablingTiers point
    // to the SAME array. The previous code then did
    //   ADMIN_PARAMS.cablingTiers.length = 0
    //   for (const t of overrides.adminParams.cablingTiers) ...
    // which empties the shared array, then iterates an empty array.
    // Result: cablingTiers becomes []. cablingTotalPct() then crashes with
    // "Cannot read properties of undefined (reading 'dcCablePct')".
    // Same bug existed for promoCodes — and now applies equally to
    // batteryPackages (v3-54).
    // Fix: clone the source arrays into local refs first, then assign without
    // aliasing.
    const tiersFromOverride = Array.isArray(overrides.adminParams.cablingTiers)
      ? overrides.adminParams.cablingTiers.map(t => ({ ...t }))
      : null;
    const tiers3pFromOverride = Array.isArray(overrides.adminParams.cablingTiersThreePhase)
      ? overrides.adminParams.cablingTiersThreePhase.map(t => ({ ...t }))
      : null;
    const promosFromOverride = Array.isArray(overrides.adminParams.promoCodes)
      ? overrides.adminParams.promoCodes.map(p => ({ ...p }))
      : null;
    const battPkgsFromOverride = Array.isArray(overrides.adminParams.batteryPackages)
      ? overrides.adminParams.batteryPackages.map(p => ({ ...p }))
      : null;
    const minDpTiersFromOverride = Array.isArray(overrides.adminParams.minDpTiers)
      ? overrides.adminParams.minDpTiers.map(t => ({ ...t }))
      : null;
    const deliveryLocationsFromOverride = Array.isArray(overrides.adminParams.deliveryLocations)
      ? overrides.adminParams.deliveryLocations.map(l => ({ ...l }))
      : null;
    // v3-138 — misc catalog. Same treatment as deliveryLocations: an EMPTY
    // saved array is a valid state (Step 2F falls back to free-form only), so
    // assign whenever the override carried the key rather than gating on
    // length the way minDpTiers does.
    const miscCatalogFromOverride = Array.isArray(overrides.adminParams.miscCatalog)
      ? overrides.adminParams.miscCatalog.map(m => ({ ...m }))
      : null;
    // v3-191 — componentMargins is a NESTED object: the same aliasing hazard
    // as the arrays above (Object.assign copies the reference, after which
    // ADMIN_PARAMS.componentMargins and the override point at ONE object and
    // any in-place edit corrupts both). Deep-clone per entry.
    const componentMarginsFromOverride =
      overrides.adminParams.componentMargins && typeof overrides.adminParams.componentMargins === 'object'
        ? Object.fromEntries(Object.entries(overrides.adminParams.componentMargins)
            .map(([k, v]) => [k, { ...(v || {}) }]))
        : null;

    Object.assign(ADMIN_PARAMS, overrides.adminParams);

    if (componentMarginsFromOverride) {
      ADMIN_PARAMS.componentMargins = componentMarginsFromOverride;
    }

    if (tiersFromOverride) {
      ADMIN_PARAMS.cablingTiers = tiersFromOverride;
    }
    if (tiers3pFromOverride && tiers3pFromOverride.length > 0) {
      ADMIN_PARAMS.cablingTiersThreePhase = tiers3pFromOverride;
    } else if (tiersFromOverride) {
      // v3-62 MIGRATION SEED: saved blob predates cablingTiersThreePhase (or
      // carries an empty array). Derive the 3-phase table from the blob's
      // LIVE single-phase tiers via the uplift factors so the seed tracks any
      // admin customizations — not from the bundled code defaults. It becomes
      // a persisted, independently-editable key on the next admin Save.
      ADMIN_PARAMS.cablingTiersThreePhase = deriveThreePhaseCablingTiers(tiersFromOverride);
    }
    // (No override at all → bundled default from adminParams.js stands.)
    if (promosFromOverride) {
      ADMIN_PARAMS.promoCodes = promosFromOverride;
    }
    if (battPkgsFromOverride) {
      ADMIN_PARAMS.batteryPackages = battPkgsFromOverride;
    }
    if (minDpTiersFromOverride && minDpTiersFromOverride.length > 0) {
      ADMIN_PARAMS.minDpTiers = minDpTiersFromOverride;
    }
    if (deliveryLocationsFromOverride) {
      // Empty array is a VALID saved state (dropdown = Luzon + Other only),
      // unlike minDpTiers — assign whenever the override carried the key.
      ADMIN_PARAMS.deliveryLocations = deliveryLocationsFromOverride;
    }
    if (miscCatalogFromOverride) {
      ADMIN_PARAMS.miscCatalog = miscCatalogFromOverride;
    }
    // (No/empty override → bundled default [{fromNetPrice:0, minDpPct:0}]
    // stands, or the legacy migration's synthesized single-row tier if the
    // blob carried the old scalar.)
  }
  if (overrides.panelSettings) {
    if (overrides.panelSettings.singlePhase) {
      Object.assign(PANEL_SETTINGS.singlePhase, overrides.panelSettings.singlePhase);
    }
    if (overrides.panelSettings.threePhase) {
      Object.assign(PANEL_SETTINGS.threePhase, overrides.panelSettings.threePhase);
    }
  }
  if (Array.isArray(overrides.invertersSinglePhase)) {
    INVERTERS_SINGLE_PHASE.length = 0;
    for (const i of overrides.invertersSinglePhase) {
      INVERTERS_SINGLE_PHASE.push({ ...i });
    }
  }
  if (Array.isArray(overrides.invertersThreePhase)) {
    INVERTERS_THREE_PHASE.length = 0;
    for (const i of overrides.invertersThreePhase) {
      INVERTERS_THREE_PHASE.push({ ...i });
    }
  }
  if (Array.isArray(overrides.devices)) {
    DEVICES.length = 0;
    for (const d of overrides.devices) {
      DEVICES.push({ ...d });
    }
  }

  // ═══ v3-85 — BACK-FILL COGS FROM A PRE-v3-83 BLOB ══════════════════════════
  // THE BUG THIS FIXES: the blocks above REPLACE the inverter arrays and the
  // batteryPackages array WHOLESALE (`INVERTERS_SINGLE_PHASE.length = 0`, then
  // push the blob's items). A pre-v3-83 blob's entries carry `directPrice` but
  // NO `cogs` — so after a server load every inverter had `cogs: undefined`,
  // deriveDirectPrices computed ₱0, and the app shipped FREE INVERTERS. Battery
  // packages rendered a blank COGS column while quietly keeping a stale price.
  //
  // (adminParams SCALARS were never affected: Object.assign only overwrites keys
  // the override actually has, and a legacy blob has no *Cogs keys, so the code
  // defaults survived. Only the two wholesale ARRAY replacements lose data.)
  //
  // RESOLUTION ORDER, per item:
  //   1. COGS already present            -> keep it (a post-v3-83 blob).
  //   2. Match a code default by ratedKw / package id -> take ITS COGS. This is
  //      the normal path and makes Anjon's sheet the source of truth.
  //   3. No match (a SKU an admin ADDED that Anjon never costed) -> BACK-SOLVE
  //      from the stored price, so it keeps the price it had rather than zeroing.
  const backfillInverters = (live, defaults, label) => {
    for (const inv of live) {
      if (Number.isFinite(inv.cogs) && inv.cogs > 0) continue;
      const def = defaults.find(d => d.ratedKw === inv.ratedKw);
      inv.cogs = def && Number.isFinite(def.cogs) && def.cogs > 0
        ? def.cogs
        : cogsFromDirect(inv.directPrice, ADMIN_PARAMS, ADMIN_PARAMS.grossMarginReference);
      if (!(inv.cogs > 0)) {
        console.warn(`[Solviva params] ${label} ${inv.ratedKw}kW has neither COGS nor a usable price.`);
      }
    }
  };
  backfillInverters(INVERTERS_SINGLE_PHASE, ORIGINAL.invertersSinglePhase, 'single-phase inverter');
  backfillInverters(INVERTERS_THREE_PHASE,  ORIGINAL.invertersThreePhase,  'three-phase inverter');

  for (const key of ['singlePhase', 'threePhase']) {
    const ps = PANEL_SETTINGS[key];
    if (ps && !(Number.isFinite(ps.panelCogs) && ps.panelCogs > 0)) {
      ps.panelCogs = ORIGINAL.panelSettings[key]?.panelCogs
                  || cogsFromDirect(ps.panelDirectPrice, ADMIN_PARAMS, ADMIN_PARAMS.grossMarginReference);
    }
  }

  const BATT_COGS = {
    batteryUnitCogs: 'batteryUnitPrice',
    batteryRackCogs: 'batteryRackPrice',
    atsCogs: 'atsPrice',
    criticalLoadsMaterialsCogs: 'criticalLoadsMaterials',
    laborWithSolarInstallCogs: 'laborWithSolarInstall',
    standaloneLaborCogs: 'standaloneLabor',
  };
  for (const pkg of ADMIN_PARAMS.batteryPackages || []) {
    const def = (ORIGINAL.adminParams.batteryPackages || []).find(d => d.id === pkg.id);
    for (const [cogsKey, priceKey] of Object.entries(BATT_COGS)) {
      if (Number.isFinite(pkg[cogsKey])) continue;   // 0 is legitimate (16 kWh rack)
      pkg[cogsKey] = Number.isFinite(def?.[cogsKey])
        ? def[cogsKey]
        : cogsFromDirect(pkg[priceKey], ADMIN_PARAMS, ADMIN_PARAMS.grossMarginReference);
    }
  }

  // ═══ v3-83 — DERIVE EVERY DIRECT PURCHASE PRICE FROM COGS ═══════════════════
  // MUST be the last thing applyOverrides does. Engineering enters COGS; Product
  // sets grossMargin / merchantDiscountRate; every `directPrice`,
  // `panelDirectPrice`, `mountingSupportFloorPrice`, `batteryUnitPrice` … is
  // computed from them and written back onto the live objects.
  //
  // Doing it HERE, rather than inside calculations.js, is what keeps the pricing
  // engine untouched: buildPackageLineItems still reads `directPrice` exactly as
  // it always has and has no idea COGS exists.
  //
  // Runs after Object.assign, so a stored blob's COGS overrides are already in
  // place — and any STALE directPrice values a pre-v3-83 blob still carries are
  // overwritten here rather than silently winning.
  // v3-191 — shape-harden componentMargins first (missing ids, bad modes,
  // non-finite margins all repair from the LIVE grossMarginMax) so the quote
  // resolver never reads a malformed entry. Boot derivation itself still
  // prices every key at the scalar reference margin, exactly as pre-v3-191.
  normalizeComponentMargins(ADMIN_PARAMS);
  deriveDirectPrices(ADMIN_PARAMS, PANEL_SETTINGS, INVERTERS_SINGLE_PHASE, INVERTERS_THREE_PHASE, ADMIN_PARAMS.grossMarginReference);

}

function resetToDefaults() {
  // Reset ADMIN_PARAMS to original
  for (const k of Object.keys(ADMIN_PARAMS)) {
    delete ADMIN_PARAMS[k];
  }
  Object.assign(ADMIN_PARAMS, deepClone(ORIGINAL.adminParams));

  // Reset panel settings
  Object.assign(PANEL_SETTINGS.singlePhase, ORIGINAL.panelSettings.singlePhase);
  Object.assign(PANEL_SETTINGS.threePhase,  ORIGINAL.panelSettings.threePhase);

  // Reset inverter arrays
  INVERTERS_SINGLE_PHASE.length = 0;
  for (const i of ORIGINAL.invertersSinglePhase) {
    INVERTERS_SINGLE_PHASE.push({ ...i });
  }
  INVERTERS_THREE_PHASE.length = 0;
  for (const i of ORIGINAL.invertersThreePhase) {
    INVERTERS_THREE_PHASE.push({ ...i });
  }

  DEVICES.length = 0;
  for (const d of ORIGINAL.devices) {
    DEVICES.push({ ...d });
  }
}

export { BASELINE_RATE };

