// =============================================================================
// USERS SERVICE — Super Admin account management client (v3-215, v3-218)
// -----------------------------------------------------------------------------
// Lists, creates, edits, archives and restores calculator accounts through the
// backend's /api/users. Everything privileged happens server-side:
// supabase.auth.admin.* needs the service-role key, and production's
// user_roles has no INSERT policy for the browser client — so this module only
// ever sends the caller's own JWT.
//
// Same { ok, ... } shape as paramsService.save / crmContact.fetchCrmContact:
// never throws, the caller renders `error` inline.
// =============================================================================

import { getAccessToken, ADMIN_ROLE_TO_ACCESS } from "./supabaseClient.js";
import { roleLabel } from "./permissions.js";

// Same base resolution as paramsService.js / crmContact.js, including the
// trailing-slash trim and the deliberate absence of a relative-path fallback
// (on GitHub Pages a relative /api/... returns index.html with HTTP 200).
const API_BASE = (
  import.meta.env.DEV
    ? "http://localhost:3000"
    : import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export const USER_MANAGEMENT_CONFIGURED = !!API_BASE;

// Everything an admin may assign — mirrors ASSIGNABLE_ROLES in the backend's
// src/usersService.js, which is the boundary; this list only drives the form.
// Order is the <select> order: the common case (a new rep) first, the most
// powerful role last so it is never the accidental default.
export const ROLE_OPTIONS = Object.freeze([
  { value: "rep",         hint: "Full sales calculator with Summary, Schedule and PDF. No admin tabs." },
  { value: "view",        hint: "Opens every admin tab read-only. Cannot save parameters." },
  { value: "engineering", hint: "Edits Inventory + Engineering sections; reads the rest." },
  { value: "product",     hint: "Edits Product sections (margins, validity, promos); reads the rest." },
  { value: "inventory",   hint: "Edits the Inventory tab only." },
  { value: "finco",       hint: "Edits financing limits + interest rates only." },
  { value: "admin",       hint: "Super Admin: edits everything, sees Audit History and this page." },
]);

// DB-role → label. Reuses permissions.js's ROLE_LABELS for the admin tiers so
// the Users table names roles exactly as the admin header does ('admin' shows
// as "Management"); 'rep'/'customer' are not admin tiers and are named here.
export function userRoleLabel(role) {
  if (role === "rep") return "Sales Rep";
  if (role === "customer") return "Customer";
  const access = ADMIN_ROLE_TO_ACCESS[role];
  return access ? roleLabel(access) : role || "Unknown";
}

// 16 chars, 55-symbol alphabet without I/O/i/l/o/0/1 (~92 bits). Same
// construction as the backend's generatePassword; runs here so the admin can
// see the password BEFORE submitting and hand it over from the success panel.
export function generatePassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const limit = alphabet.length * Math.floor(256 / alphabet.length);
  const out = [];
  const bytes = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (out.length >= length) break;
      if (b < limit) out.push(alphabet[b % alphabet.length]);
    }
  }
  return out.join("");
}

async function authHeaders() {
  let token = "";
  try {
    token = await getAccessToken();
  } catch (_) {
    token = "";
  }
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function readError(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body?.error || fallback || `HTTP ${res.status}`;
}

// One fetch wrapper for every route: config + session checks, JSON body,
// backend `error` surfaced verbatim, network failure as a friendly line.
// Resolves to { ok: true, body } or { ok: false, error }.
async function request(path, { method = "GET", body } = {}, fallbackError) {
  if (!API_BASE) {
    return { ok: false, error: "User management unavailable — backend not configured." };
  }
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: "Session expired — sign in again." };
  try {
    const init = { method, headers, cache: "no-store" };
    if (body !== undefined) {
      init.headers = { ...headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${path}`, init);
    if (!res.ok) return { ok: false, error: await readError(res, fallbackError) };
    return { ok: true, body: await res.json().catch(() => ({})) };
  } catch (_) {
    return { ok: false, error: "Could not reach the server — try again shortly." };
  }
}

/**
 * Resolves to { ok: true, users, actorId } or { ok: false, error }. `actorId`
 * is the caller's own auth user id, so the table can mark "you" and hide the
 * actions the backend refuses on one's own account.
 */
export async function listUsers() {
  const r = await request("/api/users", {}, "Could not load users.");
  if (!r.ok) return r;
  return {
    ok: true,
    users: Array.isArray(r.body?.users) ? r.body.users : [],
    actorId: r.body?.actorId || null,
  };
}

/**
 * Create an account. `input` is { email, role, displayName?, mobile?,
 * password? | ssoOnly? }. Resolves to { ok: true, user } or { ok: false, error }.
 */
export async function createUser(input) {
  const r = await request("/api/users", { method: "POST", body: input }, "Could not create the user.");
  return r.ok ? { ok: true, user: r.body?.user || null } : r;
}

/**
 * Edit an account. `patch` holds only the fields to change out of
 * { role, displayName, mobile }; send null (or "") to clear name/mobile.
 * Resolves to { ok: true, user } or { ok: false, error }.
 */
export async function updateUser(id, patch) {
  const r = await request(
    `/api/users/${encodeURIComponent(id)}`,
    { method: "PATCH", body: patch },
    "Could not update the user.",
  );
  return r.ok ? { ok: true, user: r.body?.user || null } : r;
}

/**
 * Archive = the account can no longer sign in; role and details are kept so
 * it can be restored. Resolves to { ok: true, user } or { ok: false, error }.
 */
export async function archiveUser(id) {
  const r = await request(
    `/api/users/${encodeURIComponent(id)}/archive`,
    { method: "POST" },
    "Could not archive the user.",
  );
  return r.ok ? { ok: true, user: r.body?.user || null } : r;
}

/** Lift an archive. Resolves to { ok: true, user } or { ok: false, error }. */
export async function restoreUser(id) {
  const r = await request(
    `/api/users/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
    "Could not restore the user.",
  );
  return r.ok ? { ok: true, user: r.body?.user || null } : r;
}
