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
import { formatPhPhone } from "./validation.js";

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
  salesperson_unavailable:
    "Odoo did not return the assigned salesperson, so the Solviva Agent details are your own",
  // v3-231 — lead↔region guard (warning only; the backend compares the lead's
  // address, or its Odoo company once a region has one, with the calculator
  // you are quoting in).
  lead_region_mismatch:
    "the lead's address is in the OTHER region — check you are quoting in the right calculator",
  lead_region_unknown:
    "the lead has no province or city in Odoo, so its region could not be checked",
  lead_company_mismatch:
    "the lead belongs to the other region's Odoo company — check you are quoting in the right calculator",
};

export function describeWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];
  return warnings.map((w) => WARNING_TEXT[w]).filter(Boolean);
}

// v3-233 — who the Solviva Agent is (user decision 2026-11-12):
//   • a lead is loaded (Generate Proposal in Odoo, or a Project Number search)
//     AND it has an assigned salesperson  → that salesperson, from Odoo;
//   • the lead has no salesperson, or no lead is loaded → the signed-in
//     calculator account (v3-232's rule, now the fallback).
// Either way the rep cannot edit what the source supplied.
//
// The lookup's `salesperson` block is { source: 'lead' | 'calculator-user' |
// 'none', name, email, mobile, warnings[] }. Only 'lead' is the ASSIGNED
// salesperson; 'calculator-user' is the backend standing the caller's own Odoo
// user in for an unassigned lead, which here means "use the signed-in account".
//
// Returns the agent record to apply, or null when the signed-in account should
// be used. `odoo` records what Odoo supplied (those fields are locked in the
// form) and which lead it belongs to (so unlinking the lead reverts the agent).
//
// The number is printed AS IT IS IN ODOO (user decision 2026-11-12): no
// reformatting and no validation, and "NA" when the salesperson has none. So
// the mobile is always supplied by the source and always locked; nobody types
// an Odoo salesperson's number in the calculator. `phoneRaw` is the stored
// value; a backend that predates it only sends the normalised `mobile`.
export const AGENT_PHONE_NA = "NA";

export function agentFromSalesperson(salesperson, leadId) {
  if (!salesperson || salesperson.source !== "lead" || !salesperson.name) return null;
  const email = salesperson.email || "";
  const phone = salesperson.phoneRaw
    || (salesperson.mobile ? formatPhPhone(salesperson.mobile) : "")
    || AGENT_PHONE_NA;
  return {
    name: salesperson.name,
    email,
    phone,
    odoo: { leadId: Number(leadId), name: salesperson.name, email, phone },
  };
}

// The agent record for the signed-in account. `prev` keeps what the rep typed
// into a field the account lacks, unless `prev` was an Odoo salesperson (their
// values must not leak into the account's record).
export function agentFromAccount(account, prev) {
  const typed = prev && !prev.odoo ? prev : {};
  return {
    name:  account?.name  || typed.name  || "",
    email: account?.email || typed.email || "",
    phone: account?.phone || typed.phone || "",
    odoo: null,
  };
}

// Rep-facing notes about the agent block after a lookup, in the same
// "· note; note" trail as describeWarnings(). `applied` is what
// agentFromSalesperson() returned. A null `salesperson` (Odoo could not
// answer) is covered by the salesperson_unavailable warning.
export function describeAgentNotes(salesperson, applied) {
  if (!salesperson) return [];
  if (!applied) {
    return ["the lead has no assigned salesperson in Odoo, so the Solviva Agent details are your own"];
  }
  const notes = [];
  if (applied.phone === AGENT_PHONE_NA) notes.push(`${applied.name} has no contact number in Odoo, so the proposal will show “NA” — add it to their Odoo user`);
  if (!applied.email) notes.push(`${applied.name} has no email in Odoo — enter it under Solviva Agent details`);
  return notes;
}

/**
 * Look up a lead. Resolves to { ok: true, contact } or { ok: false, error }.
 * Never throws — the caller renders `error` inline. `region` (v3-231) is the
 * calculator the rep is quoting in, so the backend can warn when the lead's
 * address belongs to the other one.
 */
export async function fetchCrmContact(projectNumber, region = "luzon") {
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
      `${API_BASE}/api/crm-contact?projectNumber=${encodeURIComponent(value)}&region=${encodeURIComponent(region)}`,
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
