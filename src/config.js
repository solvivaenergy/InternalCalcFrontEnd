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
//                                 Admin Parameters (Quote Validity, Quote
//                                 Limits, Step 1/3 Defaults, Gross Margin,
//                                 Promo Codes, Maintenance Mode). Interest
//                                 Rates left this role in v3-180.
//   VITE_FINCO_PASSWORD         — FinCo Admin (v3-180): the financing entity's
//                                 own parameters, ahead of separating FinCo
//                                 from OpCo into two companies. Edits the
//                                 FinCo tab ONLY — Financing Limits (minimum
//                                 down-payment tiers, maximum tenor) and the
//                                 whole Interest Rates section. Sees every
//                                 other tab read-only.
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
  if (v == null || v === '') {
    if (typeof console !== 'undefined') {
      console.warn(`[Solviva config] ${name} not set; using development fallback.`);
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
  viewPassword: envOrFallback('VITE_AUDIT_PASSWORD', 'dev-view'),

  // Full edit access — Super Admin (can edit anything)
  editPassword: envOrFallback('VITE_SUPERADMIN_PASSWORD', 'dev-edit'),

  // Engineering Team — can edit Inventory + technical Admin Parameters sections
  // (see src/lib/permissions.js for the exact allowlist)
  engineeringPassword: envOrFallback('VITE_ENGINEERING_PASSWORD', 'dev-eng'),

  // Product Team — can edit commercial Admin Parameters sections only
  // (see src/lib/permissions.js for the exact allowlist)
  productPassword: envOrFallback('VITE_PRODUCT_PASSWORD', 'dev-prod'),

  // FinCo Admin (v3-180) — the financing entity's parameters: Financing Limits
  // (minimum down payment tiers + maximum tenor) and Interest Rates. Super
  // Admin retains the wildcard and can still edit these; FinCo can edit
  // nothing else. See src/lib/permissions.js for the exact allowlist.
  fincoPassword: envOrFallback('VITE_FINCO_PASSWORD', 'dev-finco'),

  // Rep mode — unlocks the full sales-rep calculator view. Without this,
  // visitors see the customer-facing view (recommended panels/battery only,
  // no overrides, no Summary tab, simplified location, no RSD/roof/misc).
  // Persisted in sessionStorage as `solviva_mode` so reps don't re-enter on
  // every reload, but clears on tab close for shared-laptop safety.
  repPassword: envOrFallback('VITE_REP_PASSWORD', 'dev-rep'),

  // Maintenance-mode password. When set AND the admin "Restrict access"
  // toggle is ON, customers see an "Under Maintenance" notice and must
  // enter this password to access the calculator. Read directly (not via
  // envOrFallback) so an unset/empty value cleanly means "feature
  // disabled" without a misleading "missing env var" console warning.
  // To fully disable maintenance mode and strip the password from the
  // JS bundle, unset this env var on Netlify and redeploy.
  testingPassword: import.meta.env.VITE_MAINTENANCE_PASSWORD || '',
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

// Land-travel-distance threshold (Luzon location surcharge). The first
// v3-199 — the free radius is now the adminParams.luzonFreeTravelKm
// PARAMETER (Engineering console). This constant is only the bundled default
// and the ?? fallback for partial params objects; every runtime consumer
// (engine, Step 2 sentence, mobile wording) reads the param. Distance beyond
// the radius triggers the per-km charge on the excess.
export const LUZON_FREE_TRAVEL_KM = 30;

// ---------------------------------------------------------------------------
// Luzon main-island Region → City → road-km table (v3-109 cascade; distances
// REBASED v3-114).
//
// Replaces the free-typed "distance from Rizal Park" input. The rep/customer
// picks a region and a city/municipality (v3-200 — San Miguel and Cainta
// are municipalities; the chartered-city-only scope is relaxed); the
// selection's `km` is written to
// state.locationKm, which feeds the SAME charge formula in calculations.js
// (parity with workbook CALCULATOR!AA38). The picker is purely a front-end
// that yields a km — the pricing math is unchanged.
//
// v3-114 — ORIGIN CHANGED (user-directed): distances are one-way road km from
// SOLVIVA'S PARAÑAQUE LOGISTICS HUB (DB Schenker, West Service Rd, Parañaque;
// 14.4717 N, 121.0450 E) — the actual dispatch point — no longer the symbolic
// Km-0 / Rizal Park marker. Customer/rep copy says "our Parañaque logistics
// hub"; the facility name lives only in this comment.
// POLICY B (user-directed): TRUE distances everywhere, INCLUDING NCR — any
// city beyond the free radius (param; default 30) is billable, so far-north NCR
// (Malabon / Navotas / Valenzuela) and Antipolo now carry the charge, while
// the southern belt (Carmona, Biñan, Santa Rosa, General Trias) moved INSIDE
// the free zone. Cavite City sits exactly ON 30 → free (billable is strictly
// > 30).
//
// Scope is deliberately the ROAD-CONNECTED mainland only ("Luzon main island").
// Island provinces (MIMAROPA — Palawan/Mindoro/Marinduque/Romblon; plus
// Batanes, Catanduanes, Masbate) are NOT road-reachable and fall to the
// "Other" location (rep enters sea/air freight as a 2F line; customer sees the
// "contact your representative" note).
//
// SOURCE OF THE LIST (v3-209). The 196 entries are exactly the "Serviceable
// Location List" supplied by Sales — NCR + Bulacan/Pampanga + CALABARZON —
// minus two groups that cannot carry a road km:
//   • the 8 island municipalities (Tingloy; and Alabat, Burdeos, Jomalig,
//     Panukulan, Patnanungan, Perez, Polillo in Quezon), confirmed NOT
//     serviceable; and
//   • General Nakar, which Google returns NO ROUTE for on every phrasing
//     while its neighbour Infanta resolves fine — left out rather than given
//     a fabricated figure.
// Both groups fall to the "Other" location. Regions I, II, CAR and V, plus
// Nueva Ecija/Tarlac/Bataan/Zambales, were REMOVED: they are outside the
// serviceable footprint, and offering them let a rep quote a job ops cannot
// deliver.
//
// HOW THE km WERE MEASURED (all three legs pinned — do not mix bases):
//   origin      = the hub coordinate below (14.4717, 121.0450)
//   destination = each town's CITY or MUNICIPAL HALL, not the bare place name.
//                 A bare name resolves to Google's own locality centroid, which
//                 sat up to 9 km off the hall (Cabanatuan) and shifted Tayabas
//                 by 11 km by changing which highway was chosen.
//   routing     = Google Routes API computeRouteMatrix, DRIVE,
//                 TRAFFIC_UNAWARE, avoidTolls: true.
//
// avoidTolls matters: WITH tolls the API returns the distance of the FASTEST
// route, which sends trucks out via NLEX/SCTEX and inflated Cabanatuan to
// 176 km. Toll-free reproduced the previous hand-estimated table almost
// exactly (Cabanatuan 125 vs 125, Olongapo 139 vs 140, Malolos 57 vs 58),
// which is how we know that table was itself built toll-free. Keep this basis
// when adding entries, or the list silently ends up on two different bases.
//
// Only cities beyond the free radius are billable, so precision matters most
// between ~26 and ~34 km; ≤30 km resolves to a ₱0 location line regardless.
// Two figures still want a human check: Quezon (Quezon) at 207 km — an
// ambiguous name, three phrasings agreed on 207 but one returned 924 km
// (Mindanao) — and the hub coordinate itself, which sits 1 km from West
// Service Road but ~6 km from where "DB Schenker" geocodes.
export const LUZON_REGIONS = [
  { code: 'NCR', label: 'NCR — Metro Manila', cities: [
    // Metro Manila (no province)
    { name: 'Parañaque',   province: null, km: 6 },
    { name: 'Muntinlupa',  province: null, km: 9 },
    { name: 'Taguig',      province: null, km: 9 },
    { name: 'Las Piñas',   province: null, km: 12 },
    { name: 'Pasay City',  province: null, km: 12 },
    { name: 'Pateros',     province: null, km: 12 },
    { name: 'Makati',      province: null, km: 14 },
    { name: 'Mandaluyong', province: null, km: 15 },
    { name: 'Manila',      province: null, km: 16 },
    { name: 'Pasig',       province: null, km: 16 },
    { name: 'San Juan',    province: null, km: 20 },
    { name: 'Quezon City', province: null, km: 23 },
    { name: 'Caloocan',    province: null, km: 24 },
    { name: 'Marikina',    province: null, km: 24 },
    { name: 'Malabon',     province: null, km: 26 },
    { name: 'Navotas',     province: null, km: 26 },
    { name: 'Valenzuela',  province: null, km: 28 },
  ] },
  { code: 'III', label: 'Region III — Central Luzon', cities: [
    // Bulacan
    { name: 'Meycauayan',             province: 'Bulacan',  km: 34 },
    { name: 'Obando',                 province: 'Bulacan',  km: 34 },
    { name: 'Marilao',                province: 'Bulacan',  km: 39 },
    { name: 'Bocaue',                 province: 'Bulacan',  km: 42 },
    { name: 'Balagtas',               province: 'Bulacan',  km: 46 },
    { name: 'Bulacan',                province: 'Bulacan',  km: 46 },
    { name: 'Santa Maria',            province: 'Bulacan',  km: 46 },
    { name: 'Guiguinto',              province: 'Bulacan',  km: 48 },
    { name: 'San Jose Del Monte',     province: 'Bulacan',  km: 50 },
    { name: 'Pandi',                  province: 'Bulacan',  km: 51 },
    { name: 'Plaridel',               province: 'Bulacan',  km: 56 },
    { name: 'Malolos',                province: 'Bulacan',  km: 57 },
    { name: 'Pulilan',                province: 'Bulacan',  km: 59 },
    { name: 'Paombong',               province: 'Bulacan',  km: 60 },
    { name: 'Norzagaray',             province: 'Bulacan',  km: 62 },
    { name: 'Bustos',                 province: 'Bulacan',  km: 63 },
    { name: 'Baliwag',                province: 'Bulacan',  km: 65 },
    { name: 'Calumpit',               province: 'Bulacan',  km: 65 },
    { name: 'Angat',                  province: 'Bulacan',  km: 66 },
    { name: 'Hagonoy',                province: 'Bulacan',  km: 67 },
    { name: 'San Rafael',             province: 'Bulacan',  km: 70 },
    { name: 'Doña Remedios Trinidad', province: 'Bulacan',  km: 75 },
    { name: 'San Ildefonso',          province: 'Bulacan',  km: 77 },
    { name: 'San Miguel',             province: 'Bulacan',  km: 86 },
    // Pampanga
    { name: 'Apalit',                 province: 'Pampanga', km: 71 },
    { name: 'San Simon',              province: 'Pampanga', km: 73 },
    { name: 'Macabebe',               province: 'Pampanga', km: 77 },
    { name: 'Masantol',               province: 'Pampanga', km: 77 },
    { name: 'Sto. Tomas',             province: 'Pampanga', km: 80 },
    { name: 'San Fernando',           province: 'Pampanga', km: 81 },
    { name: 'Minalin',                province: 'Pampanga', km: 85 },
    { name: 'Santa Ana',              province: 'Pampanga', km: 85 },
    { name: 'San Luis',               province: 'Pampanga', km: 86 },
    { name: 'Bacolor',                province: 'Pampanga', km: 88 },
    { name: 'Mexico',                 province: 'Pampanga', km: 88 },
    { name: 'Santa Rita',             province: 'Pampanga', km: 92 },
    { name: 'Arayat',                 province: 'Pampanga', km: 94 },
    { name: 'Guagua',                 province: 'Pampanga', km: 94 },
    { name: 'Candaba',                province: 'Pampanga', km: 95 },
    { name: 'Lubao',                  province: 'Pampanga', km: 98 },
    { name: 'Sasmuan',                province: 'Pampanga', km: 100 },
    { name: 'Angeles City',           province: 'Pampanga', km: 103 },
    { name: 'Floridablanca',          province: 'Pampanga', km: 103 },
    { name: 'Porac',                  province: 'Pampanga', km: 104 },
    { name: 'Magalang',               province: 'Pampanga', km: 105 },
    { name: 'Mabalacat City',         province: 'Pampanga', km: 113 },
  ] },
  { code: 'IV-A', label: 'Region IV-A — CALABARZON', cities: [
    // Laguna
    { name: 'San Pedro',                province: 'Laguna',   km: 13 },
    { name: 'Biñan',                    province: 'Laguna',   km: 21 },
    { name: 'Santa Rosa',               province: 'Laguna',   km: 21 },
    { name: 'Cabuyao',                  province: 'Laguna',   km: 26 },
    { name: 'Calamba',                  province: 'Laguna',   km: 37 },
    { name: 'Los Baños',                province: 'Laguna',   km: 44 },
    { name: 'Bay',                      province: 'Laguna',   km: 51 },
    { name: 'Calauan',                  province: 'Laguna',   km: 56 },
    { name: 'Alaminos',                 province: 'Laguna',   km: 59 },
    { name: 'Pila',                     province: 'Laguna',   km: 64 },
    { name: 'Victoria',                 province: 'Laguna',   km: 64 },
    { name: 'Mabitac',                  province: 'Laguna',   km: 68 },
    { name: 'San Pablo',                province: 'Laguna',   km: 68 },
    { name: 'Santa Maria',              province: 'Laguna',   km: 71 },
    { name: 'Famy',                     province: 'Laguna',   km: 72 },
    { name: 'Nagcarlan',                province: 'Laguna',   km: 73 },
    { name: 'Santa Cruz',               province: 'Laguna',   km: 73 },
    { name: 'Siniloan',                 province: 'Laguna',   km: 73 },
    { name: 'Pagsanjan',                province: 'Laguna',   km: 75 },
    { name: 'Liliw',                    province: 'Laguna',   km: 77 },
    { name: 'Pangil',                   province: 'Laguna',   km: 77 },
    { name: 'Pakil',                    province: 'Laguna',   km: 79 },
    { name: 'Magdalena',                province: 'Laguna',   km: 80 },
    { name: 'Rizal',                    province: 'Laguna',   km: 81 },
    { name: 'Paete',                    province: 'Laguna',   km: 82 },
    { name: 'Majayjay',                 province: 'Laguna',   km: 83 },
    { name: 'Cavinti',                  province: 'Laguna',   km: 84 },
    { name: 'Kalayaan',                 province: 'Laguna',   km: 86 },
    { name: 'Lumban',                   province: 'Laguna',   km: 90 },
    { name: 'Luisiana',                 province: 'Laguna',   km: 93 },
    // Rizal
    { name: 'Taytay',                   province: 'Rizal',    km: 16 },
    { name: 'Cainta',                   province: 'Rizal',    km: 19 },
    { name: 'Angono',                   province: 'Rizal',    km: 20 },
    { name: 'Antipolo',                 province: 'Rizal',    km: 23 },
    { name: 'Binangonan',               province: 'Rizal',    km: 27 },
    { name: 'Teresa',                   province: 'Rizal',    km: 30 },
    { name: 'San Mateo',                province: 'Rizal',    km: 31 },
    { name: 'Cardona',                  province: 'Rizal',    km: 32 },
    { name: 'Morong',                   province: 'Rizal',    km: 36 },
    { name: 'Rodriguez',                province: 'Rizal',    km: 37 },
    { name: 'Baras',                    province: 'Rizal',    km: 42 },
    { name: 'Tanay',                    province: 'Rizal',    km: 44 },
    { name: 'Pililla',                  province: 'Rizal',    km: 48 },
    { name: 'Jala-Jala',                province: 'Rizal',    km: 62 },
    // Cavite
    { name: 'Bacoor',                   province: 'Cavite',   km: 18 },
    { name: 'Imus',                     province: 'Cavite',   km: 19 },
    { name: 'Carmona',                  province: 'Cavite',   km: 21 },
    { name: 'Kawit',                    province: 'Cavite',   km: 23 },
    { name: 'Gen. Mariano Alvarez',     province: 'Cavite',   km: 24 },
    { name: 'Dasmariñas',               province: 'Cavite',   km: 26 },
    { name: 'Noveleta',                 province: 'Cavite',   km: 26 },
    { name: 'Rosario',                  province: 'Cavite',   km: 28 },
    { name: 'Tanza',                    province: 'Cavite',   km: 29 },
    { name: 'Cavite',                   province: 'Cavite',   km: 33 },
    { name: 'General Trias',            province: 'Cavite',   km: 33 },
    { name: 'Silang',                   province: 'Cavite',   km: 38 },
    { name: 'Naic',                     province: 'Cavite',   km: 42 },
    { name: 'Trece Martires',           province: 'Cavite',   km: 42 },
    { name: 'Ternate',                  province: 'Cavite',   km: 50 },
    { name: 'Amadeo',                   province: 'Cavite',   km: 51 },
    { name: 'Maragondon',               province: 'Cavite',   km: 53 },
    { name: 'Indang',                   province: 'Cavite',   km: 56 },
    { name: 'Tagaytay',                 province: 'Cavite',   km: 57 },
    { name: 'Mendez',                   province: 'Cavite',   km: 58 },
    { name: 'Alfonso',                  province: 'Cavite',   km: 66 },
    { name: 'Magallanes',               province: 'Cavite',   km: 70 },
    { name: 'General Emilio Aguinaldo', province: 'Cavite',   km: 73 },
    // Batangas
    { name: 'Sto. Tomas',               province: 'Batangas', km: 46 },
    { name: 'Tanauan',                  province: 'Batangas', km: 50 },
    { name: 'Malvar',                   province: 'Batangas', km: 53 },
    { name: 'Talisay',                  province: 'Batangas', km: 56 },
    { name: 'Balete',                   province: 'Batangas', km: 63 },
    { name: 'Lipa',                     province: 'Batangas', km: 64 },
    { name: 'Laurel',                   province: 'Batangas', km: 67 },
    { name: 'Mataasnakahoy',            province: 'Batangas', km: 72 },
    { name: 'Padre Garcia',             province: 'Batangas', km: 80 },
    { name: 'Cuenca',                   province: 'Batangas', km: 81 },
    { name: 'Ibaan',                    province: 'Batangas', km: 81 },
    { name: 'San Jose',                 province: 'Batangas', km: 81 },
    { name: 'Rosario',                  province: 'Batangas', km: 84 },
    { name: 'Calaca',                   province: 'Batangas', km: 86 },
    { name: 'Batangas City',            province: 'Batangas', km: 93 },
    { name: 'Lemery',                   province: 'Batangas', km: 94 },
    { name: 'San Pascual',              province: 'Batangas', km: 94 },
    { name: 'Taal',                     province: 'Batangas', km: 95 },
    { name: 'Tuy',                      province: 'Batangas', km: 95 },
    { name: 'Taysan',                   province: 'Batangas', km: 96 },
    { name: 'Agoncillo',                province: 'Batangas', km: 97 },
    { name: 'Lian',                     province: 'Batangas', km: 97 },
    { name: 'San Luis',                 province: 'Batangas', km: 97 },
    { name: 'Nasugbu',                  province: 'Batangas', km: 99 },
    { name: 'San Juan',                 province: 'Batangas', km: 100 },
    { name: 'San Nicolas',              province: 'Batangas', km: 100 },
    { name: 'Santa Teresita',           province: 'Batangas', km: 101 },
    { name: 'Balayan',                  province: 'Batangas', km: 103 },
    { name: 'Alitagtag',                province: 'Batangas', km: 104 },
    { name: 'Bauan',                    province: 'Batangas', km: 111 },
    { name: 'Mabini',                   province: 'Batangas', km: 119 },
    { name: 'Calatagan',                province: 'Batangas', km: 122 },
    { name: 'Lobo',                     province: 'Batangas', km: 124 },
    // Quezon
    { name: 'Dolores',                  province: 'Quezon',   km: 77 },
    { name: 'Tiaong',                   province: 'Quezon',   km: 81 },
    { name: 'San Antonio',              province: 'Quezon',   km: 83 },
    { name: 'Candelaria',               province: 'Quezon',   km: 92 },
    { name: 'Lucban',                   province: 'Quezon',   km: 94 },
    { name: 'Sariaya',                  province: 'Quezon',   km: 106 },
    { name: 'Tayabas',                  province: 'Quezon',   km: 109 },
    { name: 'Sampaloc',                 province: 'Quezon',   km: 111 },
    { name: 'Lucena',                   province: 'Quezon',   km: 119 },
    { name: 'Mauban',                   province: 'Quezon',   km: 124 },
    { name: 'Pagbilao',                 province: 'Quezon',   km: 125 },
    { name: 'Infanta',                  province: 'Quezon',   km: 126 },
    { name: 'Real',                     province: 'Quezon',   km: 127 },
    { name: 'Padre Burgos',             province: 'Quezon',   km: 152 },
    { name: 'Atimonan',                 province: 'Quezon',   km: 158 },
    { name: 'Agdangan',                 province: 'Quezon',   km: 167 },
    { name: 'Plaridel',                 province: 'Quezon',   km: 170 },
    { name: 'Unisan',                   province: 'Quezon',   km: 176 },
    { name: 'Gumaca',                   province: 'Quezon',   km: 181 },
    { name: 'Pitogo',                   province: 'Quezon',   km: 197 },
    { name: 'Lopez',                    province: 'Quezon',   km: 201 },
    { name: 'Macalelon',                province: 'Quezon',   km: 205 },
    { name: 'Quezon',                   province: 'Quezon',   km: 207 },
    { name: 'General Luna',             province: 'Quezon',   km: 214 },
    { name: 'Buenavista',               province: 'Quezon',   km: 234 },
    { name: 'Guinayangan',              province: 'Quezon',   km: 236 },
    { name: 'Catanauan',                province: 'Quezon',   km: 239 },
    { name: 'Calauag',                  province: 'Quezon',   km: 246 },
    { name: 'Mulanay',                  province: 'Quezon',   km: 253 },
    { name: 'San Narciso',              province: 'Quezon',   km: 262 },
    { name: 'Tagkawayan',               province: 'Quezon',   km: 263 },
    { name: 'San Francisco',            province: 'Quezon',   km: 287 },
    { name: 'San Andres',               province: 'Quezon',   km: 293 },
  ] },
];

// ─── Three-level location cascade: region → province → city (v3-210) ────────
// `cities` stays a FLAT array so nothing that already reads region.cities
// breaks; the province is a field on each entry and the province list is
// derived. NCR entries carry province: null (the serviceable list marks it
// N/A), so provincesOf('NCR') is empty and the UI hides the control instead of
// rendering a pointless one-item dropdown.

export function provincesOf(regionCode) {
  const r = LUZON_REGIONS.find((x) => x.code === regionCode);
  if (!r) return [];
  return [...new Set(r.cities.map((c) => c.province).filter(Boolean))];
}

// City names are deliberately BARE: "Rosario" exists in both Cavite and
// Batangas, and the province selection is what separates them. Every lookup
// must therefore key on the (province, name) PAIR — a name-only find would
// silently return the wrong town and price the wrong distance.
export function citiesOf(regionCode, province) {
  const r = LUZON_REGIONS.find((x) => x.code === regionCode);
  if (!r) return [];
  return province
    ? r.cities.filter((c) => c.province === province)
    : r.cities.filter((c) => !c.province);
}

// Resolves a possibly-stale (region, province, city) triple to real entries,
// falling back one level at a time. Restored sessions and the removal of a
// location both flow through here, so no caller can land on undefined.
export function resolveLocation(regionCode, province, cityName) {
  const region =
    LUZON_REGIONS.find((r) => r.code === regionCode) || LUZON_REGIONS[0];
  const provinces = provincesOf(region.code);
  const prov = provinces.length
    ? provinces.includes(province)
      ? province
      : provinces[0]
    : null;
  const cities = citiesOf(region.code, prov);
  const city = cities.find((c) => c.name === cityName) || cities[0];
  return { region, province: prov, provinces, cities, city };
}


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
  name:  '',                              // empty → "Solviva Customer Support"
  email: 'hello@solvivaenergy.com',
  phone: '0917-802-8948',
};

export const BRAND = {
  companyName: 'Solviva Energy',
  // Legal entity used in the copyright notice. Distinct from companyName
  // because companyName is the casual brand surface (used in greetings,
  // taglines, headers) while legalEntity is the registered corporate
  // name that holds the copyright. Update both if the entity changes.
  // v3-43: Per office direction, legal entity name updated from "Solviva
  // Energy Incorporated" to "Solviva Energy Corporation". Used in the
  // copyright notice (Footer + ContactGate) and in the proposal PDF
  // (T&C pages, Conforme, page footers, signature block label).
  legalEntity: 'Solviva Energy Corporation',
  primaryColor: '#E87722',  // Solviva orange (matches Excel disclaimer headers)
  accentBlue: '#3B82C4',    // for solar/day
  accentDark: '#1F3A5F',    // for night
  inputTint: '#DBEAFE',     // light blue used in Excel for user-input cells
};
