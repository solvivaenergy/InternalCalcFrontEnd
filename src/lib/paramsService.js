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
import {
  PANEL_SETTINGS,
  INVERTERS_SINGLE_PHASE,
  INVERTERS_THREE_PHASE,
} from '../data/inventory.js';
import { DEVICES } from '../data/devices.js';

const API_URL = '/.netlify/functions/parameters';

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
// `password` is whatever password the active session was authed with
// (super-admin / engineering / product). `role` is the matching role string —
// the server uses BOTH to (a) authenticate the password against the
// corresponding env var and (b) enforce the section-allowlist for that role.
export async function save(snapshot, password, role) {
  try {
    const res = await fetch(API_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-solviva-edit-password': password || '',
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

    Object.assign(ADMIN_PARAMS, overrides.adminParams);

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

