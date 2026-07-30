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

export const supabase = HAS_SUPABASE_CONFIG
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : { auth: fallbackAuth };

// Canonical role vocabulary stored in public.user_roles.role. Kept here so the
// router (App.jsx) and the role lookup below agree on one spelling.
export const ROLES = Object.freeze({
  ADMIN: "admin",
  ENGINEERING: "engineering",
  PRODUCT: "product",
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
  view: "view",
});

// Fetch the signed-in user's role from public.user_roles. Returns a role
// string, defaulting to 'customer' when no row exists (safest least-privilege
// fallback — a brand-new auth user with no assigned role sees only the
// customer calculator).
export async function fetchUserRole(userId) {
  if (!userId) return ROLES.CUSTOMER;
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
