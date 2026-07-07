import { getSupabaseClient } from "./supabaseClient.js";

export const APP_ROLES = ["edit", "engineering", "product", "view"];

export function normalizeRole(role) {
  if (role === "admin") return "edit";
  return APP_ROLES.includes(role) ? role : null;
}

export function roleLabelForSupabase(role) {
  switch (role) {
    case "edit":
    case "admin":
      return "Super Admin";
    case "engineering":
      return "Engineering";
    case "product":
      return "Product";
    case "view":
      return "View only";
    default:
      return "Unknown";
  }
}

export async function resolveUserRole(user) {
  if (!user) return "none";

  const directRole = normalizeRole(
    user.app_metadata?.role || user.user_metadata?.role,
  );
  if (directRole) return directRole;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!error && data?.role) {
    return normalizeRole(data.role) || "view";
  }

  return "view";
}

export async function getActiveSession() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function signOutSupabase() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
