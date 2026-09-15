// =============================================================================
// CRM CONTACT — Odoo lead lookup client (story 043D)
// -----------------------------------------------------------------------------
// Turns a "Project Number" (an Odoo crm.lead id) into {name, email, mobile} so
// a rep can populate the Customer Details form instead of retyping it.
//
// The Odoo credential lives on the backend, never here: this bundle is served
// statically from GitHub Pages, so any VITE_ value is public. This module only
// calls our own Express service, authenticated with the caller's Supabase JWT.
// =============================================================================

import { getAccessToken } from "./supabaseClient.js";

// Same base resolution as paramsService.js:50-57, including the trailing-slash
// trim. Deliberately NOT falling back to a relative path: on GitHub Pages a
// relative /api/... returns the SPA's index.html with HTTP 200, which fails as
// an opaque JSON parse error rather than a clear "not configured" (the
// hard-coded /.netlify/functions path in lib/lead.js is the cautionary case).
const API_BASE = (
  import.meta.env.DEV
    ? "http://localhost:3000"
    : import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export const CRM_LOOKUP_CONFIGURED = !!API_BASE;

// Matches the backend's validator, so an obviously-bad entry never leaves the
// browser. Leading zeros are rejected.
export const PROJECT_NUMBER_RE = /^[1-9]\d{0,8}$/;

// Maps the backend's warning codes to something a rep can act on. Codes the UI
// has nothing useful to say about are omitted.
const WARNING_TEXT = {
  name_missing: "no contact name on the lead",
  email_missing: "no email on the lead",
  email_unparseable: "the email looks malformed — check it",
  phone_missing: "no phone number on the lead",
  phone_unnormalisable: "the phone number could not be read — enter it manually",
  phone_agent_blocklisted:
    "the only number on the lead is a Solviva agent's — enter the customer's",
};

export function describeWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];
  return warnings.map((w) => WARNING_TEXT[w]).filter(Boolean);
}

/**
 * Look up a lead. Resolves to { ok: true, contact } or { ok: false, error }.
 * Never throws — the caller renders `error` inline.
 */
export async function fetchCrmContact(projectNumber) {
  const value = String(projectNumber ?? "").trim();
  if (!PROJECT_NUMBER_RE.test(value)) {
    return { ok: false, error: "Enter a numeric Project Number." };
  }
  if (!API_BASE) {
    return { ok: false, error: "Lookup unavailable — backend not configured." };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (_) {
    token = null;
  }
  if (!token) {
    return { ok: false, error: "Session expired — sign in again." };
  }

  let res;
  try {
    res = await fetch(
      `${API_BASE}/api/crm-contact?projectNumber=${encodeURIComponent(value)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (_) {
    // Network error, CORS rejection, or a Render cold start that outran the
    // browser's patience.
    return { ok: false, error: "Lookup unavailable — try again shortly." };
  }

  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }

  if (!res.ok) {
    if (res.status === 404) {
      return { ok: false, error: `Project Number ${value} not found.` };
    }
    if (res.status === 401) {
      return { ok: false, error: "Session expired — sign in again." };
    }
    if (res.status === 400) {
      return { ok: false, error: "Enter a numeric Project Number." };
    }
    if (res.status === 429) {
      return { ok: false, error: "Too many lookups. Try again in a minute." };
    }
    // A missing Odoo credential is a deployment problem, not a blip — saying
    // "try again shortly" just sends someone hunting a network fault.
    if (res.status === 503 && body && body.code === "not_configured") {
      return {
        ok: false,
        error: "CRM lookup is not configured on the server — contact IT.",
      };
    }
    return { ok: false, error: "Lookup unavailable — try again shortly." };
  }

  return { ok: true, contact: body || {} };
}
