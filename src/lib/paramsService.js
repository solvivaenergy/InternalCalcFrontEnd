// =============================================================================
// PARAMS SERVICE — fetches global parameter overrides on boot
// -----------------------------------------------------------------------------
// On app boot, load() fetches the saved parameter snapshot and merges it on
// top of the bundled defaults. The snapshot lives in the Supabase table
// public.app_parameters (one row) and is normally read through the backend's
// GET /api/parameters.
//
// LOAD CHAIN (2026-09-22). Until now a single failed fetch silently reset the
// app to the BUNDLED defaults — maintenance gate ON, 10/15/20% down-payment
// floors, stale margins — with nothing on screen but a console warning. It
// happened repeatedly for one rep whose browser could reach supabase.co but
// not onrender.com (the backend host), on prod and staging alike. load() now
// tries, in order, and records which one won in getLoadStatus():
//   1. backend   — GET ${API_BASE}/api/parameters with the session JWT
//                  (required since 2026-09-27), 8s timeout, one retry.
//   2. supabase  — the same row read straight through PostgREST with the
//                  signed-in user's session (RLS policy: backend repo,
//                  supabase/migrations/20260922_app_parameters_authenticated_read.sql).
//                  A different host, so a block or outage on the backend
//                  host alone no longer takes pricing down with it.
//   3. cache     — the last payload this device loaded successfully
//                  (localStorage). Stale, but far closer than the bundle.
//   4. defaults  — the bundled data files. Last resort.
// isLoadedFromServer() is true only for 1 and 2 (live data). App.jsx shows a
// banner for 3 and 4 and does NOT raise the maintenance gate for them.
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
// Anything the admin saves via PUT replaces the shared snapshot, which every
// device reads on its next load — so changes propagate globally.
// =============================================================================

import { ADMIN_PARAMS, BASELINE_RATE } from "../engine/data/adminParams.js";
import {
  PANEL_SETTINGS,
  INVERTERS_SINGLE_PHASE,
  INVERTERS_THREE_PHASE,
} from "../engine/data/inventory.js";
import { DEVICES } from "../engine/data/devices.js";
// The merge itself (legacy-blob migrations, COGS back-fill, derived prices)
// is engine/runtime.js since 2026-09-27, so the backend runs the identical
// code; this module fetches, caches, and writes the result into the live
// objects. runtime.js must stay imported before anything reads a price: it
// derives the bundled defaults' prices when it loads.
import {
  DEFAULTS,
  buildRuntime,
  applyRuntime,
  stripLegacyPriceKeys,
  stripLegacyRateKeys,
  migrateLegacyMinDp,
  migrateLegacyDeliveryLocations,
  seedPhaseAndComponentMargins,
} from "../engine/runtime.js";
import { getAccessToken, supabase } from "./supabaseClient.js";

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
  : "/.netlify/functions/parameters";
const AUDIT_API_URL = API_BASE
  ? `${API_BASE}/api/parameter-audit`
  : "/.netlify/functions/parameter-audit";

// ═══ v3-83 — DERIVE ON MODULE LOAD, BEFORE ANYTHING ELSE ═════════════════════
// `directPrice` / `panelDirectPrice` / `batteryUnitPrice` … ship as 0 in the data
// files: they are DERIVED, not authored. engine/runtime.js derives them the
// moment it loads and only then snapshots DEFAULTS — importing it above is what
// guarantees real prices during the first paint, before the fetch resolves,
// and that reset-to-defaults restores real prices too.
const ORIGINAL = DEFAULTS;

let _loadedFromServer = false;
const _subscribers = new Set();

// ─── load chain (see header) ────────────────────────────────────────────────
const BACKEND_TIMEOUT_MS = 8000;
const BACKEND_ATTEMPTS = 2;
const BACKEND_RETRY_DELAY_MS = 750;
const SUPABASE_TIMEOUT_MS = 6000;
const CACHE_KEY = "solviva_params_cache_v1";

// Where the live values came from on the most recent load(). `errors` keeps
// every failed step's message so the on-screen banner (and support) can see
// WHY a device is not on live data, instead of guessing from symptoms.
//   source: 'backend' | 'supabase' | 'cache' | 'defaults' | null (not loaded yet)
let _loadStatus = { source: null, cachedAt: null, errors: [] };

export function getLoadStatus() {
  return { ..._loadStatus, errors: _loadStatus.errors.slice() };
}

function errorMessage(err) {
  if (!err) return "unknown error";
  if (err.name === "AbortError") return "timed out";
  // Supabase/PostgREST errors are plain objects: { message, details, hint,
  // code } — any of which may be empty. Fall through to JSON rather than the
  // useless "[object Object]".
  let msg = err.message || err.details || err.hint || "";
  if (!msg) {
    msg = typeof err === "string" ? err : (() => {
      try { return JSON.stringify(err).slice(0, 200); } catch { return String(err); }
    })();
  }
  return err.code ? `${msg} (${err.code})` : msg;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    return await fetch(url, { ...opts, signal: ctrl?.signal });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Step 1 — the backend. One retry covers a transient blip or a backend that
// is still waking up; a hard block (proxy, extension) fails both fast.
async function loadFromBackend() {
  // Since 2026-09-27 the backend answers 401 without a signed-in user's JWT:
  // the row carries COGS and margins. load() only runs once a session exists
  // (App.jsx mounts CalculatorApp after auth), so the token is there. The
  // local-dev fallback session's placeholder token is ignored by the dev
  // backend, which reads a JSON file and skips the check.
  const token = await getAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let lastErr = null;
  for (let attempt = 1; attempt <= BACKEND_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(
        API_URL,
        { method: "GET", cache: "no-store", headers },
        BACKEND_TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < BACKEND_ATTEMPTS) await sleep(BACKEND_RETRY_DELAY_MS);
    }
  }
  throw new Error(`${errorMessage(lastErr)} after ${BACKEND_ATTEMPTS} attempts`);
}

// Step 2 — the same row, read directly through Supabase with the signed-in
// user's session. Needs the authenticated-read policy from the backend repo's
// 20260922 migration; without it PostgREST returns no row rather than an
// error, which we report as such so a missing policy is diagnosable.
// Bounded by SUPABASE_TIMEOUT_MS: when supabase.co is unreachable too, the
// client's own retries would otherwise hold the boot spinner for ~7s more
// before the cache/defaults step. (The no-config facade lacks abortSignal —
// hence the guard.)
async function loadFromSupabase() {
  let query = supabase
    .from("app_parameters")
    .select("payload")
    .eq("id", true);
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), SUPABASE_TIMEOUT_MS) : null;
  if (ctrl && typeof query.abortSignal === "function") {
    query = query.abortSignal(ctrl.signal);
  }
  let data, error;
  try {
    ({ data, error } = await query.maybeSingle());
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (error) throw error;
  if (!data || !data.payload || typeof data.payload !== "object") {
    throw new Error("no readable row (not signed in, or read policy not applied)");
  }
  return data.payload;
}

// Step 3 — last good payload on this device. Best-effort: storage may be
// unavailable or cleared, and a corrupt entry is treated as absent.
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.payload !== "object" || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(serializedPayload) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      `{"savedAt":${JSON.stringify(new Date().toISOString())},"payload":${serializedPayload}}`,
    );
  } catch {
    // Quota / private mode / disabled storage — the cache is a bonus, not a need.
  }
}

// Load once at boot (and again from the banner's Retry). Always returns the
// current snapshot; never throws. See the header for the four-step chain.
export async function load() {
  const errors = [];
  let payload = null;
  let source = null;

  try {
    payload = await loadFromBackend();
    source = "backend";
  } catch (err) {
    errors.push(`backend: ${errorMessage(err)}`);
  }

  if (!payload) {
    try {
      payload = await loadFromSupabase();
      source = "supabase";
    } catch (err) {
      errors.push(`supabase: ${errorMessage(err)}`);
    }
  }

  if (payload) {
    // Serialise BEFORE applyOverrides: it strips legacy keys from the object
    // in place, and the cache should hold exactly what the server sent.
    const serialized = JSON.stringify(payload);
    try {
      applyOverrides(payload);
      _loadedFromServer = true;
      _loadStatus = { source, cachedAt: null, errors };
      writeCache(serialized);
      // Live data, but not from the first choice: say so, and say why. This
      // is the only trace of a backend that is blocked on one device once the
      // fallback hides the symptom — support needs it in the console.
      if (errors.length && typeof console !== "undefined") {
        console.info(`[paramsService] loaded from ${source}; earlier steps failed:`, errors);
      }
      notify();
      return getSnapshot();
    } catch (err) {
      errors.push(`apply(${source}): ${errorMessage(err)}`);
      payload = null;
    }
  }

  // No live data. Prefer this device's last good copy over the bundle.
  _loadedFromServer = false;
  const cached = readCache();
  if (cached) {
    try {
      applyOverrides(cached.payload);
      _loadStatus = { source: "cache", cachedAt: cached.savedAt || null, errors };
    } catch (err) {
      errors.push(`apply(cache): ${errorMessage(err)}`);
      resetToDefaults();
      _loadStatus = { source: "defaults", cachedAt: null, errors };
    }
  } else {
    resetToDefaults();
    _loadStatus = { source: "defaults", cachedAt: null, errors };
  }
  if (typeof console !== "undefined") {
    console.warn(
      `[paramsService] load() failed; falling back to ${_loadStatus.source}:`,
      errors,
    );
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
      return { ok: false, error: "Not signed in — please log in again." };
    }
    const res = await fetch(API_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-solviva-role": role || "",
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

export async function getAuditHistory(role, limit = 100) {
  try {
    const token = await getAccessToken();
    if (!token)
      return { ok: false, error: "Not signed in — please log in again." };
    const res = await fetch(
      `${AUDIT_API_URL}?limit=${encodeURIComponent(limit)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-solviva-role": role || "",
        },
        cache: "no-store",
      },
    );
    const body = await res.json().catch(() => []);
    if (!res.ok)
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    return { ok: true, events: Array.isArray(body) ? body : [] };
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
    invertersThreePhase: deepClone(INVERTERS_THREE_PHASE),
    devices: deepClone(DEVICES),
  };
}

export function isLoadedFromServer() {
  return _loadedFromServer;
}

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

// The legacy-blob migrations (v3-54/75/116/191), the COGS back-fill (v3-85)
// and the derived-price pass (v3-83) are engine/runtime.js buildRuntime()
// since 2026-09-27 — pure, so the backend runs the identical merge. The
// helpers stay exported from here for the smoke harness.
export {
  stripLegacyPriceKeys,
  stripLegacyRateKeys,
  migrateLegacyMinDp,
  migrateLegacyDeliveryLocations,
  seedPhaseAndComponentMargins,
};

// Apply server-supplied overrides by MUTATING the imported objects.
// This is what makes calculations.js see the live values without refactor.
function applyOverrides(overrides) {
  applyRuntime(buildRuntime(ORIGINAL, overrides));
}

function resetToDefaults() {
  applyRuntime(buildRuntime(ORIGINAL, null));
}

export { BASELINE_RATE };
