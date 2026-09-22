// =============================================================================
// SUPABASE CLIENT — single shared browser client for auth + role lookup
// -----------------------------------------------------------------------------
// Replaces the legacy env-var password model (see src/config.js AUTH). The
// landing page is now a Supabase login form; on success we read the user's
// role from public.user_roles and route accordingly.
//
// Configure on Netlify (Site config → Environment variables) and locally in
// .env.local:
//   VITE_SUPABASE_URL       — https://<project-ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY  — the project's public anon key (safe to ship;
//                             row-level security is the real boundary)
//
// The anon key is designed to be embedded in client bundles — unlike a
// service-role key, it grants no privileges beyond what RLS policies allow.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

// v3-214 — capture an OAuth error bounce BEFORE the client is created. When a
// Google sign-up is refused (e.g. by the Postgres domain guard), Supabase sends
// the browser back to redirectTo with #error=...&error_description=... in the
// hash. createClient({ detectSessionInUrl: true }) reads and CLEARS that hash
// during its own initialisation, which happens before React mounts and long
// before <Login /> could look at it — so the message has to be lifted off the
// URL here, at import time, and parked in sessionStorage for Login to show.
export const SSO_URL_ERROR_KEY = "solviva_sso_url_error";
try {
  const h = typeof window !== "undefined" ? window.location.hash || "" : "";
  if (h.includes("error_description=")) {
    const desc = new URLSearchParams(h.replace(/^#/, "")).get("error_description") || "";
    if (desc) sessionStorage.setItem(SSO_URL_ERROR_KEY, desc);
    // Clean the URL ourselves rather than relying on the SDK to: the error
    // has been parked, and a lingering #error=... would re-show on refresh.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
} catch (_) {
  /* sessionStorage unavailable — the SDK will still clear the hash; no message */
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const HAS_SUPABASE_CONFIG = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!HAS_SUPABASE_CONFIG) {
  // Surfaced loudly in dev so a missing .env.local is obvious rather than a
  // cryptic runtime failure on the first auth call.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Falling back to a local no-auth mode so the app can still render.",
  );
}

let localSession = null;
const authListeners = new Set();
let realAuthSubscription = null;

const notifyAuthListeners = (event, session) => {
  for (const listener of authListeners) {
    listener(event, session);
  }
};

const fallbackAuth = {
  getSession: async () => ({ data: { session: localSession } }),
  onAuthStateChange: (callback) => {
    authListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe() {
            authListeners.delete(callback);
          },
        },
      },
    };
  },
  signInWithPassword: async ({ email, password }) => {
    if (!email || !password) {
      return {
        data: { session: null },
        error: { message: "Please enter your email and password." },
      };
    }

    localSession = {
      access_token: "local-dev-token",
      user: { id: "local-user", email },
    };
    notifyAuthListeners("SIGNED_IN", localSession);
    return { data: { session: localSession }, error: null };
  },
  signOut: async () => {
    localSession = null;
    notifyAuthListeners("SIGNED_OUT", null);
    return { error: null };
  },
};

const fallbackFrom = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({ data: null, error: null }),
    }),
  }),
});

const realSupabase = HAS_SUPABASE_CONFIG
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Implicit flow + URL detection so a password-reset link works even
        // when opened in a different browser/device than the one that
        // requested it, and fires a PASSWORD_RECOVERY auth event on return.
        flowType: "implicit",
        detectSessionInUrl: true,
      },
    })
  : null;

const authApi = {
  getSession: async () => {
    if (!realSupabase) return fallbackAuth.getSession();
    try {
      const result = await realSupabase.auth.getSession();
      if (result?.data?.session) {
        localSession = result.data.session;
        return result;
      }
      return fallbackAuth.getSession();
    } catch (error) {
      console.warn(
        "[supabase] getSession failed, using local fallback:",
        error,
      );
      return fallbackAuth.getSession();
    }
  },
  onAuthStateChange: (callback) => {
    authListeners.add(callback);
    if (realSupabase && !realAuthSubscription) {
      try {
        realAuthSubscription = realSupabase.auth.onAuthStateChange(
          (event, session) => {
            if (session) {
              localSession = session;
            } else if (event === "SIGNED_OUT") {
              localSession = null;
            }
            notifyAuthListeners(event, session ?? localSession);
          },
        );
      } catch (error) {
        console.warn(
          "[supabase] onAuthStateChange failed, using local fallback:",
          error,
        );
      }
    }
    return {
      data: {
        subscription: {
          unsubscribe() {
            authListeners.delete(callback);
            if (
              authListeners.size === 0 &&
              realAuthSubscription?.data?.subscription
            ) {
              realAuthSubscription.data.subscription.unsubscribe();
              realAuthSubscription = null;
            }
          },
        },
      },
    };
  },
  signInWithPassword: async (params) => {
    if (!realSupabase) return fallbackAuth.signInWithPassword(params);
    try {
      const result = await realSupabase.auth.signInWithPassword(params);
      if (result?.error) {
        return result;
      }
      localSession = result?.data?.session ?? null;
      if (localSession) {
        notifyAuthListeners("SIGNED_IN", localSession);
      }
      return result;
    } catch (error) {
      return {
        data: { session: null, user: null },
        error: {
          message: error?.message || "Sign in failed. Please try again.",
        },
      };
    }
  },
  signOut: async () => {
    if (!realSupabase) return fallbackAuth.signOut();
    try {
      const result = await realSupabase.auth.signOut();
      localSession = null;
      notifyAuthListeners("SIGNED_OUT", null);
      return result;
    } catch (error) {
      console.warn("[supabase] signOut failed, using local fallback:", error);
      return fallbackAuth.signOut();
    }
  },
  updateUser: async (attributes) => {
    if (!realSupabase) {
      return {
        data: { user: null },
        error: {
          message: "Password change is unavailable in local no-auth mode.",
        },
      };
    }
    try {
      return await realSupabase.auth.updateUser(attributes);
    } catch (error) {
      return {
        data: { user: null },
        error: { message: error?.message || "Failed to update the account." },
      };
    }
  },
  resetPasswordForEmail: async (email, options) => {
    if (!realSupabase) {
      return {
        data: null,
        error: {
          message: "Password reset is unavailable in local no-auth mode.",
        },
      };
    }
    try {
      return await realSupabase.auth.resetPasswordForEmail(email, options);
    } catch (error) {
      return {
        data: null,
        error: {
          message: error?.message || "Failed to send the reset email.",
        },
      };
    }
  },
  // v3-214 — OAuth redirect (Google SSO). This facade only exposes what is
  // listed here, so the method has to be forwarded explicitly; without this
  // entry every environment, staging included, looked like no-auth mode.
  signInWithOAuth: async (params) => {
    if (!realSupabase) {
      return {
        data: { provider: params?.provider ?? null, url: null },
        error: {
          message: "Google sign-in is unavailable in local no-auth mode.",
        },
      };
    }
    try {
      // On success the SDK navigates away; the promise resolves with the
      // authorize URL and no error. The session arrives on return through
      // detectSessionInUrl + the onAuthStateChange bridge above.
      return await realSupabase.auth.signInWithOAuth(params);
    } catch (error) {
      return {
        data: { provider: params?.provider ?? null, url: null },
        error: {
          message: error?.message || "Google sign-in failed. Please try again.",
        },
      };
    }
  },
};

export const supabase = {
  auth: authApi,
  from: (...args) => {
    if (!realSupabase) return fallbackFrom();
    try {
      return realSupabase.from(...args);
    } catch (error) {
      console.warn("[supabase] from() failed, using local fallback:", error);
      return fallbackFrom();
    }
  },
};

// Canonical role vocabulary stored in public.user_roles.role. Kept here so the
// router (App.jsx) and the role lookup below agree on one spelling.
export const ROLES = Object.freeze({
  ADMIN: "admin",
  ENGINEERING: "engineering",
  PRODUCT: "product",
  INVENTORY: "inventory",
  // v3-180 — FinCo Admin: the financing entity's own parameters (financing
  // limits, interest rates, returns assumptions, DU inflation reference).
  // Requires supabase/migrations/20260901_add_finco_role.sql to be applied.
  FINCO: "finco",
  VIEW: "view",
  REP: "rep",
  CUSTOMER: "customer",
});

// Roles that land in the AdminShell editor (mapped to the calculator's
// internal accessLevel vocabulary, where Super Admin is 'edit').
export const ADMIN_ROLE_TO_ACCESS = Object.freeze({
  admin: "edit",
  engineering: "engineering",
  product: "product",
  inventory: "inventory",
  finco: "finco",
  view: "view",
});

// Fetch the signed-in user's role from public.user_roles. Returns a role
// string, defaulting to 'customer' when no row exists (safest least-privilege
// fallback — a brand-new auth user with no assigned role sees only the
// customer calculator).
export async function fetchUserRole(userId) {
  if (!userId) return ROLES.CUSTOMER;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    const metadataRole = user?.app_metadata?.role || user?.user_metadata?.role;
    if (Object.values(ROLES).includes(metadataRole)) {
      return metadataRole;
    }
  } catch (error) {
    console.warn("[supabase] metadata role lookup failed:", error);
  }
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[supabase] role lookup failed:", error.message);
    return ROLES.CUSTOMER;
  }
  return data?.role || ROLES.CUSTOMER;
}

// Current access token (JWT) for the active session, or '' when signed out.
// Used by paramsService to authenticate admin writes to the backend.
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

// Email of the signed-in user, or '' when signed out. Used by the
// change-password flow to re-authenticate before setting a new password.
export async function getCurrentUserEmail() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.email || "";
}

// Change the signed-in user's password. Supabase's updateUser() acts on the
// active session, so no user id is needed here.
export async function updateUserPassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

// Send a password-reset email. The link returns the user to `redirectTo`
// (which must be allowlisted in Supabase Auth → URL Configuration → Redirect
// URLs), where the app detects the recovery session (PASSWORD_RECOVERY event)
// and shows the reset-password screen.
export async function sendPasswordReset(email, redirectTo) {
  return supabase.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );
}

// ─── Google Workspace SSO (v3-214) ──────────────────────────────────────────
// solvivaenergy.com is hosted on Google Workspace (its MX records point at
// aspmx.l.google.com), so "SSO" here is Sign in with Google restricted to that
// domain. Google always returns a VERIFIED email, and Supabase links a new
// OAuth identity to an existing auth.users row when the verified email
// matches — so the 40 existing @solvivaenergy.com password accounts keep their
// user_id, their app_metadata.role and their user_roles row. No data migration
// is needed for existing reps; they simply gain a second way in.
//
// Domain restriction happens in THREE layers, because only one of them is
// actually enforceable from here:
//   1. Google Cloud: the OAuth app should be created as user type "Internal",
//      which makes Google itself refuse any account outside the Workspace.
//      Strongest control; configured in the Google Cloud console, not in code.
//   2. Postgres: a BEFORE INSERT trigger on auth.users rejects a Google
//      sign-up whose email domain is not allow-listed (backend repo,
//      supabase/migrations/20260918_sso_google_domain_guard.sql). This is the
//      layer this codebase can guarantee.
//   3. This client: `hd` below is only a HINT to Google's account chooser and
//      isSsoAllowedEmail() is a UX check in App.jsx — neither is a security
//      boundary, and both exist so a wrong account gets a clear message rather
//      than an opaque database error.
export const SSO_ALLOWED_DOMAINS = Object.freeze(["solvivaenergy.com"]);

export function isSsoAllowedEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  return SSO_ALLOWED_DOMAINS.includes(domain);
}

// Kicks off the Google redirect. Resolves to { error } the way the other auth
// calls do; the page navigates away on success, and detectSessionInUrl +
// onAuthStateChange pick the session up on return, so nothing else is needed.
// Asks GoTrue's public settings endpoint whether a provider is switched on.
// Returns true/false, or null when the answer is unknown (offline, no config,
// slow) — callers treat null as "go ahead and let the redirect decide".
async function isProviderEnabled(provider) {
  if (!HAS_SUPABASE_CONFIG || typeof fetch !== "function") return null;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 3000) : null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const flag = json?.external?.[provider];
    return typeof flag === "boolean" ? flag : null;
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function signInWithGoogle() {
  // Pre-flight. A provider that is not yet enabled makes /auth/v1/authorize
  // answer with a raw JSON 400 — the browser would land on that page rather
  // than come back here with a message. Only a definite "false" short-circuits.
  if ((await isProviderEnabled("google")) === false) {
    return {
      data: { provider: "google", url: null },
      error: {
        message:
          "Google sign-in is not enabled for this environment yet. " +
          "Use your email and password, or ask an admin to enable the Google provider in Supabase.",
      },
    };
  }
  // The facade's signInWithOAuth answers for the no-config fallback itself.
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Back to the app root; must be on Supabase's redirect allow-list.
      redirectTo: window.location.origin,
      queryParams: {
        hd: SSO_ALLOWED_DOMAINS[0],
        prompt: "select_account",
      },
    },
  });
}

// One-shot message channel from App.jsx's post-sign-in domain check to the
// Login screen. sessionStorage rather than state because the rejection signs
// the user out, which unmounts everything and remounts <Login /> fresh.
export const SSO_REJECT_KEY = "solviva_sso_rejected";
