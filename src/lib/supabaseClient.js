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
        detectSessionInUrl: false,
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
