// =============================================================================
// SOLVIVA SOLAR CALCULATOR — CONFIG
// -----------------------------------------------------------------------------
// Edit values here to change branding or adjust defaults without hunting
// through the rest of the codebase.
//
// PASSWORDS: read from Netlify environment variables at build time:
//   VITE_AUDIT_PASSWORD         — 1st-level: view-only access to Inventory & Admin
//                                 (formerly VITE_VIEW_PASSWORD; renamed to
//                                 better reflect read-only audit usage)
//   VITE_SUPERADMIN_PASSWORD    — Super Admin: full edit access (everything)
//   VITE_ENGINEERING_PASSWORD   — Engineering Team: edits Inventory + technical
//                                 sections of Admin Parameters (Solar Panel &
//                                 Mounting, Variable Charges, Roof Material,
//                                 Location / Delivery, Cabling, Battery Package,
//                                 Schedule Constants, Maintenance Mode)
//   VITE_PRODUCT_PASSWORD       — Product Team: edits commercial sections of
//                                 Admin Parameters (Quote Validity, Interest
//                                 Rates, Promo Codes, Maintenance Mode)
//   VITE_REP_PASSWORD           — Rep mode: unlocks the full sales-rep view
//                                 (panel/battery/inverter overrides, RSD,
//                                 roof material, location km input, misc
//                                 materials, cable meters, Summary tab). The
//                                 calculator defaults to the simplified
//                                 customer-facing view; reps click the lock
//                                 icon in the footer to enter this password.
//                                 Persists in sessionStorage (survives reloads,
//                                 clears on tab close — shared-laptop safe).
//   VITE_MAINTENANCE_PASSWORD   — Maintenance-mode password. When set AND the
//                                 admin "Restrict access" toggle is ON, the
//                                 calculator shows an "Under Maintenance" notice
//                                 and requires this password before access.
//                                 When the env var is unset, the maintenance
//                                 gate is fully disabled at the bundle level
//                                 (no password value exists in the JS).
//
// To rotate passwords:
//   1. Netlify: Site configuration → Environment variables → edit values
//   2. Trigger a redeploy (Deploys → Trigger deploy → Deploy site)
//
// SECURITY NOTE: These passwords are inlined into the client-side JavaScript
// bundle. A determined person CAN recover them with browser developer tools.
// This is the same security model as the original .xlsm macro password. It's
// "good enough to keep honest people honest" — fine for an internal/agent
// tool, NOT fine if this ever becomes a public web app handling real money.
// For a public version, real auth would require a backend server.
//
// LOCAL DEVELOPMENT: copy `.env.example` to `.env.local` and fill in values.
// =============================================================================

// Helper that reads an env var with a fallback so local development still
// works when Netlify env vars aren't present.
function envOrFallback(name, fallback) {
  const v = import.meta.env[name];
  if (v == null || v === "") {
    if (typeof console !== "undefined") {
      console.warn(
        `[Solviva config] ${name} not set; using development fallback.`,
      );
    }
    return fallback;
  }
  return v;
}

export const AUTH = {
  // View-only access (1st-level password) — env var named
  // VITE_AUDIT_PASSWORD on Netlify; the internal identifier stays
  // `viewPassword` and the role string stays `'view'` (renaming the
  // env var was an operational/ergonomic change only — the role
  // string is part of the saved-blob auth header, see HANDOFF.md
  // entry for v3-16 for the precedent).
  viewPassword: envOrFallback("VITE_AUDIT_PASSWORD", "dev-view"),

  // Full edit access — Super Admin (can edit anything)
  editPassword: envOrFallback("VITE_SUPERADMIN_PASSWORD", "dev-edit"),

  // Engineering Team — can edit Inventory + technical Admin Parameters sections
  // (see src/lib/permissions.js for the exact allowlist)
  engineeringPassword: envOrFallback("VITE_ENGINEERING_PASSWORD", "dev-eng"),

  // Product Team — can edit commercial Admin Parameters sections only
  // (see src/lib/permissions.js for the exact allowlist)
  productPassword: envOrFallback("VITE_PRODUCT_PASSWORD", "dev-prod"),

  // Rep mode — unlocks the full sales-rep calculator view. Without this,
  // visitors see the customer-facing view (recommended panels/battery only,
  // no overrides, no Summary tab, simplified location, no RSD/roof/misc).
  // Persisted in sessionStorage as `solviva_mode` so reps don't re-enter on
  // every reload, but clears on tab close for shared-laptop safety.
  repPassword: envOrFallback("VITE_REP_PASSWORD", "dev-rep"),

  // Maintenance-mode password. When set AND the admin "Restrict access"
  // toggle is ON, customers see an "Under Maintenance" notice and must
  // enter this password to access the calculator. Read directly (not via
  // envOrFallback) so an unset/empty value cleanly means "feature
  // disabled" without a misleading "missing env var" console warning.
  // To fully disable maintenance mode and strip the password from the
  // JS bundle, unset this env var on Netlify and redeploy.
  testingPassword: import.meta.env.VITE_MAINTENANCE_PASSWORD || "",
};

export const DEFAULTS = {
  // Bundled fallback for the number of days a generated quote is valid.
  // The live source-of-truth lives in ADMIN_PARAMS.quoteValidityDays (set
  // in src/data/adminParams.js, persisted via the global parameters API).
  // This DEFAULTS value is only used in three cases:
  //   1. On page load before paramsService finishes its boot fetch.
  //   2. As a fallback when the saved blob is missing the key (e.g. on a
  //      brand-new deployment with nothing saved yet, or a stale blob
  //      written before quoteValidityDays was added to ADMIN_PARAMS).
  //   3. In local dev when the parameters Function is unreachable.
  quoteValidityDays: 30,
};

// Cable-baseline constants. The Step 2A cable inputs ask the customer for
// the TOTAL cable required (panels-to-inverter for DC, inverter-to-CB-panel
// for AC). The first INCLUDED_*_CABLE_METERS are bundled into the base
// quote at no extra charge; only meters beyond the included baseline are
// billed at the per-meter rate (admin-editable, src/data/adminParams.js).
//
// Centralised here so the UI label, the input default, and the calc all
// reference the same number — change one place and all three follow.
export const INCLUDED_DC_CABLE_METERS = 30;
export const INCLUDED_AC_CABLE_METERS = 10;

// Sentinel stored in state.selectedInverters[i] when the rep EXPLICITLY picks
// "— None —" for a slot. Distinct from `null`, which means "untouched → use the
// recommendation". Lets all three slots be None (inverter-less battery-only or
// panels-only supply) without the model snapping the slot back to the
// recommended inverter. Resolved to `null` (no inverter) in effectiveInverters.
export const NO_INVERTER = "none";

// Land-travel-distance threshold (Luzon location surcharge). The first
// LUZON_FREE_TRAVEL_KM kilometers from the Parañaque logistics hub
// (DB Schenker / DSV warehouse) are included; only distance beyond that
// triggers the per-km charge. Set as a default so a blank/0 value doesn't
// appear to silently undercharge — the customer must type their actual distance.
export const LUZON_FREE_TRAVEL_KM = 33;

// ---------------------------------------------------------------------------
// Luzon main-island Region → City → road-km table (v3-109 cascade; distances
// REBASED v3-114).
//
// Replaces the free-typed "distance from the Parañaque hub" input. The
// rep/customer picks a region and a chartered city; the city's `km` is written to
// state.locationKm, which feeds the SAME charge formula in calculations.js
// (parity with workbook CALCULATOR!AA38). The picker is purely a front-end
// that yields a km — the pricing math is unchanged.
//
// v3-114 — ORIGIN CHANGED (user-directed): distances are one-way road km from
// SOLVIVA'S PARAÑAQUE LOGISTICS HUB (DB Schenker / now DSV, West Service Rd,
// Parañaque; 14.4717 N, 121.0450 E) — the actual dispatch point — no longer the
// symbolic Km-0 / Rizal Park marker. Customer/rep copy says "our Parañaque
// logistics hub"; the facility name lives only in this comment.
// POLICY B (user-directed): TRUE distances everywhere, INCLUDING NCR — any
// city > LUZON_FREE_TRAVEL_KM (33) from the hub is billable, so far-north NCR
// (Malabon / Navotas) and Antipolo now carry the charge, while the southern
// belt (Carmona, Biñan, Santa Rosa, General Trias) sits INSIDE the free zone.
// Valenzuela sits exactly ON 33 → free (billable is strictly > 33).
//
// Scope is deliberately the ROAD-CONNECTED mainland only ("Luzon main island").
// Island provinces (MIMAROPA — Palawan/Mindoro/Marinduque/Romblon; plus
// Batanes, Catanduanes, Masbate) are NOT road-reachable and fall to the
// "Other" location (rep enters sea/air freight as a 2F line; customer sees the
// "contact your representative" note).
//
// ⚠️ ALL km VALUES ARE DRAFT — Google-Maps-informed estimates, re-based
// v3-114, for ANJON to verify against Google Maps routes from the Parañaque
// hub before treating as final. Only cities beyond 33 km are billable, so
// precision matters only for those; ≤33 km resolves to a ₱0 location line
// regardless of the exact figure.
export const LUZON_REGIONS = [
  {
    code: "NCR",
    label: "NCR — Metro Manila",
    cities: [
      { name: "Parañaque", km: 3 },
      { name: "Las Piñas", km: 7 },
      { name: "Muntinlupa", km: 8 },
      { name: "Pasay", km: 12 },
      { name: "Taguig", km: 12 },
      { name: "Makati", km: 14 },
      { name: "Manila", km: 18 },
      { name: "Mandaluyong", km: 18 },
      { name: "Pasig", km: 19 },
      { name: "San Juan", km: 20 },
      { name: "Quezon City", km: 24 },
      { name: "Marikina", km: 25 },
      { name: "Caloocan", km: 28 },
      { name: "Malabon", km: 31 },
      { name: "Navotas", km: 32 },
      { name: "Valenzuela", km: 33 },
    ],
  },
  {
    code: "III",
    label: "Region III — Central Luzon",
    cities: [
      { name: "Meycauayan", km: 38 },
      { name: "San Jose del Monte", km: 45 },
      { name: "Malolos", km: 58 },
      { name: "San Fernando (Pampanga)", km: 82 },
      { name: "San Miguel (Bulacan)", km: 86 },
      { name: "Angeles City", km: 95 },
      { name: "Gapan", km: 100 },
      { name: "Mabalacat", km: 100 },
      { name: "Cabanatuan", km: 125 },
      { name: "Tarlac City", km: 135 },
      { name: "Balanga", km: 140 },
      { name: "Olongapo", km: 140 },
      { name: "Palayan", km: 145 },
      { name: "Science City of Muñoz", km: 165 },
      { name: "San Jose City", km: 175 },
    ],
  },
  {
    code: "IV-A",
    label: "Region IV-A — CALABARZON",
    cities: [
      { name: "San Pedro", km: 12 },
      { name: "Bacoor", km: 13 },
      { name: "Imus", km: 16 },
      { name: "Biñan", km: 20 },
      { name: "Cainta", km: 20 },
      { name: "Carmona", km: 22 },
      { name: "Dasmariñas", km: 24 },
      { name: "Santa Rosa", km: 26 },
      { name: "General Trias", km: 27 },
      { name: "Cavite City", km: 30 },
      { name: "Cabuyao", km: 31 },
      { name: "Antipolo", km: 35 },
      { name: "Calamba", km: 37 },
      { name: "Tagaytay", km: 45 },
      { name: "Santo Tomas", km: 48 },
      { name: "Tanauan", km: 53 },
      { name: "Lipa", km: 68 },
      { name: "San Pablo", km: 73 },
      { name: "Batangas City", km: 98 },
      { name: "Lucena", km: 125 },
      { name: "Tayabas", km: 130 },
    ],
  },
  {
    code: "I",
    label: "Region I — Ilocos",
    cities: [
      { name: "Urdaneta", km: 200 },
      { name: "San Carlos (Pangasinan)", km: 210 },
      { name: "Dagupan", km: 220 },
      { name: "Alaminos", km: 250 },
      { name: "San Fernando (La Union)", km: 280 },
      { name: "Candon", km: 350 },
      { name: "Vigan", km: 410 },
      { name: "Batac", km: 470 },
      { name: "Laoag", km: 490 },
    ],
  },
  {
    code: "II",
    label: "Region II — Cagayan Valley",
    cities: [
      { name: "Santiago", km: 340 },
      { name: "Cauayan", km: 360 },
      { name: "Ilagan", km: 390 },
      { name: "Tuguegarao", km: 490 },
    ],
  },
  {
    code: "CAR",
    label: "CAR — Cordillera",
    cities: [
      { name: "Baguio", km: 260 },
      { name: "Tabuk", km: 350 },
    ],
  },
  {
    code: "V",
    label: "Region V — Bicol",
    cities: [
      { name: "Naga", km: 390 },
      { name: "Iriga", km: 410 },
      { name: "Ligao", km: 440 },
      { name: "Legazpi", km: 460 },
      { name: "Tabaco", km: 480 },
      { name: "Sorsogon City", km: 540 },
    ],
  },
];

export const AGENT = {
  // Default contact info shown in the header and on the contact gate.
  //
  // Out of the box this is Solviva's GENERAL customer support contact —
  // there's no specific person, so `name` is empty. The contact gate and
  // header treat empty `name` as a signal to label this block as
  // "Solviva Customer Support" instead of "Your Solviva Agent: <name>".
  //
  // When an agent fills in their own details via the header's Edit button,
  // their info replaces this on their device for the current browser
  // session (persisted to sessionStorage under the key `solviva_agent`,
  // cleared automatically when the tab/browser closes).
  name: "", // empty → "Solviva Customer Support"
  email: "hello@solvivaenergy.com",
  phone: "0917-802-8948",
};

export const BRAND = {
  companyName: "Solviva Energy",
  // Legal entity used in the copyright notice. Distinct from companyName
  // because companyName is the casual brand surface (used in greetings,
  // taglines, headers) while legalEntity is the registered corporate
  // name that holds the copyright. Update both if the entity changes.
  // v3-43: Per office direction, legal entity name updated from "Solviva
  // Energy Incorporated" to "Solviva Energy Corporation". Used in the
  // copyright notice (Footer + ContactGate) and in the proposal PDF
  // (T&C pages, Conforme, page footers, signature block label).
  legalEntity: "Solviva Energy Corporation",
  primaryColor: "#E87722", // Solviva orange (matches Excel disclaimer headers)
  accentBlue: "#3B82C4", // for solar/day
  accentDark: "#1F3A5F", // for night
  inputTint: "#DBEAFE", // light blue used in Excel for user-input cells
};
