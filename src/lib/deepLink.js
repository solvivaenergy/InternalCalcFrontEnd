// =============================================================================
// DEEP LINK — Odoo → calculator hand-off (story 064A)
// -----------------------------------------------------------------------------
// The "Generate Proposal" button on an Odoo opportunity opens
//     https://<calculator>/?leadId=<crm.lead id>
// App.jsx consumes the id once the rep is signed in and runs the same lookup
// the Project Number search does (story 043D), so Customer Details fill in
// without retyping.
//
// WHY THE ID IS PARKED IN sessionStorage AT IMPORT TIME
//   A rep who is not signed in lands on the login screen, and Google SSO
//   returns to the bare origin (supabaseClient.js signInWithGoogle uses
//   window.location.origin as redirectTo), which drops the query string. The
//   OAuth round-trip stays in the same tab, and sessionStorage survives that,
//   so the id is lifted off the URL here — before React mounts — and read back
//   after sign-in. The URL is cleaned so a reload or a copied link does not
//   re-trigger the lookup.
// =============================================================================

export const PENDING_LEAD_KEY = "solviva_pending_lead_id";
export const LEAD_ID_PARAM = "leadId";
// Same shape the backend's /api/crm-contact validator accepts.
export const LEAD_ID_RE = /^[1-9]\d{0,8}$/;

export function captureLeadIdFromUrl(win = typeof window !== "undefined" ? window : null) {
  if (!win) return null;
  try {
    const params = new URLSearchParams(win.location.search || "");
    const raw = (params.get(LEAD_ID_PARAM) || "").trim();
    if (!raw) return null;
    if (LEAD_ID_RE.test(raw)) {
      try { win.sessionStorage.setItem(PENDING_LEAD_KEY, raw); } catch (_) { /* storage blocked */ }
    }
    params.delete(LEAD_ID_PARAM);
    const rest = params.toString();
    win.history.replaceState(null, "", win.location.pathname + (rest ? `?${rest}` : "") + (win.location.hash || ""));
    return LEAD_ID_RE.test(raw) ? Number(raw) : null;
  } catch (_) {
    return null;
  }
}

// Read AND clear the parked id, so the lookup runs exactly once.
export function consumePendingLeadId(win = typeof window !== "undefined" ? window : null) {
  if (!win) return null;
  try {
    const raw = win.sessionStorage.getItem(PENDING_LEAD_KEY);
    if (raw == null) return null;
    win.sessionStorage.removeItem(PENDING_LEAD_KEY);
    return LEAD_ID_RE.test(raw) ? Number(raw) : null;
  } catch (_) {
    return null;
  }
}

export function peekPendingLeadId(win = typeof window !== "undefined" ? window : null) {
  if (!win) return null;
  try {
    const raw = win.sessionStorage.getItem(PENDING_LEAD_KEY);
    return raw != null && LEAD_ID_RE.test(raw) ? Number(raw) : null;
  } catch (_) {
    return null;
  }
}

// Import-time capture. Runs before any React component mounts.
captureLeadIdFromUrl();
