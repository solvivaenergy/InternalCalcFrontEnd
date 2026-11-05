// =============================================================================
// LOCATIONS — serviceable areas per region: Region → Province → City → km
// -----------------------------------------------------------------------------
// v3-231 — lifted out of src/config.js (where LUZON_REGIONS and its helpers
// lived since v3-109) so a second region's table can sit beside it. Every
// helper takes the REGION ID FIRST (`luzon` | `cebu`, src/lib/region.js) and
// works on that region's table; nothing else about the cascade changed. The
// Luzon table below is byte-identical to the config.js original, comments and
// all — they belong with the data.
//
// The CEBU table (bottom) is the mainland service area the Cebu office starts
// with: mainland Cebu plus the two bridged LGUs, Lapu-Lapu (Mactan–Mandaue and
// Marcelo Fernan bridges) and Cordova (CCLEX). Islands with no bridge —
// Camotes (Poro, Tudela, San Francisco, Pilar) and Bantayan (Bantayan,
// Madridejos, Santa Fe) — are deliberately absent and fall to the "Other"
// location, the same rule Luzon applies to MIMAROPA and Batanes. Every Cebu
// km is 0: there is NO dispatch hub there yet, so the Cebu payload has
// `deliveryHubEnabled: false` and the engine prices every delivery at ₱0
// regardless. When a hub exists, measure each city/municipal hall from it on
// the v3-213 basis (Google Routes, DRIVE, fastest route, tolls allowed) and
// fill the km in — a data change, not a code change.
// =============================================================================

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
//                 TRAFFIC_UNAWARE, tolls ALLOWED (avoidTolls unset).
//
// BASIS (v3-213, product decision): the distance of the FASTEST route — the
// road a truck actually drives, expressways included — not the shortest.
// This reverses v3-209, which measured toll-free because that reproduced the
// old hand-estimated table (Cabanatuan 125 vs 125). Against the 196 entries
// the two bases differ by a mean of 3.4 km (max 36, Calauag 246→210); 99 got
// longer, 61 shorter, 36 unchanged, and three NCR/Cavite towns crossed the
// 30 km line into billable (Valenzuela 28→35, Tanza 29→34, Rosario 28→32).
// Keep THIS basis when adding entries, or the list silently ends up on two
// different bases.
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
    { name: 'Taguig',      province: null, km: 10 },
    { name: 'Las Piñas',   province: null, km: 12 },
    { name: 'Pasay City',  province: null, km: 12 },
    { name: 'Pateros',     province: null, km: 12 },
    { name: 'Makati',      province: null, km: 14 },
    { name: 'Mandaluyong', province: null, km: 14 },
    { name: 'Pasig',       province: null, km: 15 },
    { name: 'Manila',      province: null, km: 17 },
    { name: 'San Juan',    province: null, km: 20 },
    { name: 'Marikina',    province: null, km: 24 },
    { name: 'Quezon City', province: null, km: 27 },
    { name: 'Caloocan',    province: null, km: 28 },
    { name: 'Malabon',     province: null, km: 28 },
    { name: 'Navotas',     province: null, km: 28 },
    { name: 'Valenzuela',  province: null, km: 35 },
  ] },
  { code: 'III', label: 'Region III — Central Luzon', cities: [
    // Bulacan
    { name: 'Meycauayan',             province: 'Bulacan',  km: 40 },
    { name: 'Obando',                 province: 'Bulacan',  km: 41 },
    { name: 'Marilao',                province: 'Bulacan',  km: 42 },
    { name: 'Bocaue',                 province: 'Bulacan',  km: 45 },
    { name: 'Santa Maria',            province: 'Bulacan',  km: 48 },
    { name: 'Balagtas',               province: 'Bulacan',  km: 51 },
    { name: 'Pandi',                  province: 'Bulacan',  km: 53 },
    { name: 'San Jose Del Monte',     province: 'Bulacan',  km: 53 },
    { name: 'Bulacan',                province: 'Bulacan',  km: 56 },
    { name: 'Guiguinto',              province: 'Bulacan',  km: 58 },
    { name: 'Plaridel',               province: 'Bulacan',  km: 59 },
    { name: 'Malolos',                province: 'Bulacan',  km: 61 },
    { name: 'Norzagaray',             province: 'Bulacan',  km: 63 },
    { name: 'Paombong',               province: 'Bulacan',  km: 64 },
    { name: 'Angat',                  province: 'Bulacan',  km: 66 },
    { name: 'Bustos',                 province: 'Bulacan',  km: 66 },
    { name: 'Pulilan',                province: 'Bulacan',  km: 67 },
    { name: 'Baliwag',                province: 'Bulacan',  km: 69 },
    { name: 'Calumpit',               province: 'Bulacan',  km: 70 },
    { name: 'Hagonoy',                province: 'Bulacan',  km: 71 },
    { name: 'San Rafael',             province: 'Bulacan',  km: 73 },
    { name: 'Doña Remedios Trinidad', province: 'Bulacan',  km: 75 },
    { name: 'San Ildefonso',          province: 'Bulacan',  km: 80 },
    { name: 'San Miguel',             province: 'Bulacan',  km: 90 },
    // Pampanga
    { name: 'San Simon',              province: 'Pampanga', km: 76 },
    { name: 'Apalit',                 province: 'Pampanga', km: 81 },
    { name: 'Macabebe',               province: 'Pampanga', km: 81 },
    { name: 'Masantol',               province: 'Pampanga', km: 81 },
    { name: 'Sto. Tomas',             province: 'Pampanga', km: 82 },
    { name: 'San Fernando',           province: 'Pampanga', km: 83 },
    { name: 'Santa Ana',              province: 'Pampanga', km: 85 },
    { name: 'Minalin',                province: 'Pampanga', km: 86 },
    { name: 'Mexico',                 province: 'Pampanga', km: 88 },
    { name: 'San Luis',               province: 'Pampanga', km: 89 },
    { name: 'Bacolor',                province: 'Pampanga', km: 92 },
    { name: 'Arayat',                 province: 'Pampanga', km: 94 },
    { name: 'Santa Rita',             province: 'Pampanga', km: 96 },
    { name: 'Candaba',                province: 'Pampanga', km: 97 },
    { name: 'Guagua',                 province: 'Pampanga', km: 98 },
    { name: 'Angeles City',           province: 'Pampanga', km: 101 },
    { name: 'Lubao',                  province: 'Pampanga', km: 102 },
    { name: 'Sasmuan',                province: 'Pampanga', km: 104 },
    { name: 'Floridablanca',          province: 'Pampanga', km: 107 },
    { name: 'Porac',                  province: 'Pampanga', km: 108 },
    { name: 'Magalang',               province: 'Pampanga', km: 109 },
    { name: 'Mabalacat City',         province: 'Pampanga', km: 113 },
  ] },
  { code: 'IV-A', label: 'Region IV-A — CALABARZON', cities: [
    // Laguna
    { name: 'San Pedro',                province: 'Laguna',   km: 15 },
    { name: 'Santa Rosa',               province: 'Laguna',   km: 24 },
    { name: 'Biñan',                    province: 'Laguna',   km: 27 },
    { name: 'Cabuyao',                  province: 'Laguna',   km: 29 },
    { name: 'Calamba',                  province: 'Laguna',   km: 37 },
    { name: 'Los Baños',                province: 'Laguna',   km: 47 },
    { name: 'Bay',                      province: 'Laguna',   km: 54 },
    { name: 'Alaminos',                 province: 'Laguna',   km: 58 },
    { name: 'Calauan',                  province: 'Laguna',   km: 59 },
    { name: 'Pila',                     province: 'Laguna',   km: 67 },
    { name: 'San Pablo',                province: 'Laguna',   km: 67 },
    { name: 'Victoria',                 province: 'Laguna',   km: 67 },
    { name: 'Mabitac',                  province: 'Laguna',   km: 68 },
    { name: 'Santa Maria',              province: 'Laguna',   km: 71 },
    { name: 'Famy',                     province: 'Laguna',   km: 72 },
    { name: 'Siniloan',                 province: 'Laguna',   km: 73 },
    { name: 'Santa Cruz',               province: 'Laguna',   km: 76 },
    { name: 'Nagcarlan',                province: 'Laguna',   km: 77 },
    { name: 'Pagsanjan',                province: 'Laguna',   km: 79 },
    { name: 'Liliw',                    province: 'Laguna',   km: 80 },
    { name: 'Lumban',                   province: 'Laguna',   km: 81 },
    { name: 'Magdalena',                province: 'Laguna',   km: 84 },
    { name: 'Kalayaan',                 province: 'Laguna',   km: 85 },
    { name: 'Rizal',                    province: 'Laguna',   km: 85 },
    { name: 'Majayjay',                 province: 'Laguna',   km: 86 },
    { name: 'Cavinti',                  province: 'Laguna',   km: 87 },
    { name: 'Paete',                    province: 'Laguna',   km: 90 },
    { name: 'Pakil',                    province: 'Laguna',   km: 92 },
    { name: 'Pangil',                   province: 'Laguna',   km: 94 },
    { name: 'Luisiana',                 province: 'Laguna',   km: 97 },
    // Rizal
    { name: 'Taytay',                   province: 'Rizal',    km: 16 },
    { name: 'Angono',                   province: 'Rizal',    km: 20 },
    { name: 'Cainta',                   province: 'Rizal',    km: 21 },
    { name: 'Antipolo',                 province: 'Rizal',    km: 23 },
    { name: 'Binangonan',               province: 'Rizal',    km: 27 },
    { name: 'Teresa',                   province: 'Rizal',    km: 30 },
    { name: 'Cardona',                  province: 'Rizal',    km: 32 },
    { name: 'Morong',                   province: 'Rizal',    km: 36 },
    { name: 'San Mateo',                province: 'Rizal',    km: 39 },
    { name: 'Baras',                    province: 'Rizal',    km: 42 },
    { name: 'Tanay',                    province: 'Rizal',    km: 44 },
    { name: 'Rodriguez',                province: 'Rizal',    km: 45 },
    { name: 'Pililla',                  province: 'Rizal',    km: 48 },
    { name: 'Jala-Jala',                province: 'Rizal',    km: 62 },
    // Cavite
    { name: 'Carmona',                  province: 'Cavite',   km: 20 },
    { name: 'Bacoor',                   province: 'Cavite',   km: 24 },
    { name: 'Gen. Mariano Alvarez',     province: 'Cavite',   km: 24 },
    { name: 'Dasmariñas',               province: 'Cavite',   km: 25 },
    { name: 'Kawit',                    province: 'Cavite',   km: 27 },
    { name: 'Imus',                     province: 'Cavite',   km: 28 },
    { name: 'Noveleta',                 province: 'Cavite',   km: 29 },
    { name: 'Rosario',                  province: 'Cavite',   km: 32 },
    { name: 'General Trias',            province: 'Cavite',   km: 33 },
    { name: 'Tanza',                    province: 'Cavite',   km: 34 },
    { name: 'Cavite',                   province: 'Cavite',   km: 37 },
    { name: 'Silang',                   province: 'Cavite',   km: 43 },
    { name: 'Trece Martires',           province: 'Cavite',   km: 43 },
    { name: 'Naic',                     province: 'Cavite',   km: 46 },
    { name: 'Amadeo',                   province: 'Cavite',   km: 52 },
    { name: 'Tagaytay',                 province: 'Cavite',   km: 52 },
    { name: 'Ternate',                  province: 'Cavite',   km: 55 },
    { name: 'Indang',                   province: 'Cavite',   km: 57 },
    { name: 'Maragondon',               province: 'Cavite',   km: 58 },
    { name: 'Mendez',                   province: 'Cavite',   km: 60 },
    { name: 'Alfonso',                  province: 'Cavite',   km: 68 },
    { name: 'General Emilio Aguinaldo', province: 'Cavite',   km: 75 },
    { name: 'Magallanes',               province: 'Cavite',   km: 83 },
    // Batangas
    { name: 'Sto. Tomas',               province: 'Batangas', km: 45 },
    { name: 'Tanauan',                  province: 'Batangas', km: 49 },
    { name: 'Malvar',                   province: 'Batangas', km: 55 },
    { name: 'Balete',                   province: 'Batangas', km: 60 },
    { name: 'Talisay',                  province: 'Batangas', km: 61 },
    { name: 'Lipa',                     province: 'Batangas', km: 63 },
    { name: 'Mataasnakahoy',            province: 'Batangas', km: 69 },
    { name: 'Laurel',                   province: 'Batangas', km: 75 },
    { name: 'Cuenca',                   province: 'Batangas', km: 77 },
    { name: 'Padre Garcia',             province: 'Batangas', km: 77 },
    { name: 'Ibaan',                    province: 'Batangas', km: 79 },
    { name: 'San Jose',                 province: 'Batangas', km: 80 },
    { name: 'Calaca',                   province: 'Batangas', km: 81 },
    { name: 'Alitagtag',                province: 'Batangas', km: 83 },
    { name: 'Santa Teresita',           province: 'Batangas', km: 86 },
    { name: 'Rosario',                  province: 'Batangas', km: 87 },
    { name: 'Batangas City',            province: 'Batangas', km: 89 },
    { name: 'San Pascual',              province: 'Batangas', km: 90 },
    { name: 'Tuy',                      province: 'Batangas', km: 90 },
    { name: 'Bauan',                    province: 'Batangas', km: 92 },
    { name: 'Lian',                     province: 'Batangas', km: 92 },
    { name: 'Nasugbu',                  province: 'Batangas', km: 93 },
    { name: 'Taal',                     province: 'Batangas', km: 93 },
    { name: 'Lemery',                   province: 'Batangas', km: 94 },
    { name: 'San Nicolas',              province: 'Batangas', km: 94 },
    { name: 'Taysan',                   province: 'Batangas', km: 95 },
    { name: 'Agoncillo',                province: 'Batangas', km: 98 },
    { name: 'Balayan',                  province: 'Batangas', km: 98 },
    { name: 'San Juan',                 province: 'Batangas', km: 100 },
    { name: 'Mabini',                   province: 'Batangas', km: 103 },
    { name: 'San Luis',                 province: 'Batangas', km: 107 },
    { name: 'Calatagan',                province: 'Batangas', km: 116 },
    { name: 'Lobo',                     province: 'Batangas', km: 121 },
    // Quezon
    { name: 'Dolores',                  province: 'Quezon',   km: 76 },
    { name: 'Tiaong',                   province: 'Quezon',   km: 80 },
    { name: 'San Antonio',              province: 'Quezon',   km: 85 },
    { name: 'Candelaria',               province: 'Quezon',   km: 91 },
    { name: 'Lucban',                   province: 'Quezon',   km: 97 },
    { name: 'Sariaya',                  province: 'Quezon',   km: 104 },
    { name: 'Sampaloc',                 province: 'Quezon',   km: 114 },
    { name: 'Lucena',                   province: 'Quezon',   km: 118 },
    { name: 'Tayabas',                  province: 'Quezon',   km: 121 },
    { name: 'Pagbilao',                 province: 'Quezon',   km: 124 },
    { name: 'Infanta',                  province: 'Quezon',   km: 126 },
    { name: 'Mauban',                   province: 'Quezon',   km: 127 },
    { name: 'Real',                     province: 'Quezon',   km: 127 },
    { name: 'Padre Burgos',             province: 'Quezon',   km: 150 },
    { name: 'Atimonan',                 province: 'Quezon',   km: 156 },
    { name: 'Agdangan',                 province: 'Quezon',   km: 165 },
    { name: 'Plaridel',                 province: 'Quezon',   km: 168 },
    { name: 'Unisan',                   province: 'Quezon',   km: 175 },
    { name: 'Gumaca',                   province: 'Quezon',   km: 179 },
    { name: 'Pitogo',                   province: 'Quezon',   km: 196 },
    { name: 'Lopez',                    province: 'Quezon',   km: 199 },
    { name: 'Macalelon',                province: 'Quezon',   km: 203 },
    { name: 'Quezon',                   province: 'Quezon',   km: 206 },
    { name: 'Calauag',                  province: 'Quezon',   km: 210 },
    { name: 'General Luna',             province: 'Quezon',   km: 213 },
    { name: 'Buenavista',               province: 'Quezon',   km: 233 },
    { name: 'Guinayangan',              province: 'Quezon',   km: 234 },
    { name: 'Catanauan',                province: 'Quezon',   km: 238 },
    { name: 'Mulanay',                  province: 'Quezon',   km: 251 },
    { name: 'San Narciso',              province: 'Quezon',   km: 261 },
    { name: 'Tagkawayan',               province: 'Quezon',   km: 261 },
    { name: 'San Francisco',            province: 'Quezon',   km: 286 },
    { name: 'San Andres',               province: 'Quezon',   km: 292 },
  ] },
];

// ─── Cebu (v3-231) — mainland + bridged Mactan; km 0 until a hub exists ───────
// One "region" entry so the picker collapses to Province → City (there is a
// single province, "Cebu", so the Province control shows one option and the
// Region control is hidden — see pickerShape()). Cebu City first: it is the
// `cities[0]` fallback resolveLocation lands on, and the default quote site.
// Then the other cities, then the municipalities, each alphabetical.
export const CEBU_REGIONS = [
  { code: 'CEBU', label: 'Cebu', cities: [
    // Cities
    { name: 'Cebu City',     province: 'Cebu', km: 0 },
    { name: 'Bogo',          province: 'Cebu', km: 0 },
    { name: 'Carcar',        province: 'Cebu', km: 0 },
    { name: 'Danao',         province: 'Cebu', km: 0 },
    { name: 'Lapu-Lapu',     province: 'Cebu', km: 0 },   // Mactan — bridged
    { name: 'Mandaue',       province: 'Cebu', km: 0 },
    { name: 'Naga',          province: 'Cebu', km: 0 },
    { name: 'Talisay',       province: 'Cebu', km: 0 },
    { name: 'Toledo',        province: 'Cebu', km: 0 },
    // Municipalities (mainland)
    { name: 'Alcantara',     province: 'Cebu', km: 0 },
    { name: 'Alcoy',         province: 'Cebu', km: 0 },
    { name: 'Alegria',       province: 'Cebu', km: 0 },
    { name: 'Aloguinsan',    province: 'Cebu', km: 0 },
    { name: 'Argao',         province: 'Cebu', km: 0 },
    { name: 'Asturias',      province: 'Cebu', km: 0 },
    { name: 'Badian',        province: 'Cebu', km: 0 },
    { name: 'Balamban',      province: 'Cebu', km: 0 },
    { name: 'Barili',        province: 'Cebu', km: 0 },
    { name: 'Boljoon',       province: 'Cebu', km: 0 },
    { name: 'Borbon',        province: 'Cebu', km: 0 },
    { name: 'Carmen',        province: 'Cebu', km: 0 },
    { name: 'Catmon',        province: 'Cebu', km: 0 },
    { name: 'Compostela',    province: 'Cebu', km: 0 },
    { name: 'Consolacion',   province: 'Cebu', km: 0 },
    { name: 'Cordova',       province: 'Cebu', km: 0 },   // Mactan — CCLEX
    { name: 'Daanbantayan',  province: 'Cebu', km: 0 },
    { name: 'Dalaguete',     province: 'Cebu', km: 0 },
    { name: 'Dumanjug',      province: 'Cebu', km: 0 },
    { name: 'Ginatilan',     province: 'Cebu', km: 0 },
    { name: 'Liloan',        province: 'Cebu', km: 0 },
    { name: 'Malabuyoc',     province: 'Cebu', km: 0 },
    { name: 'Medellin',      province: 'Cebu', km: 0 },
    { name: 'Minglanilla',   province: 'Cebu', km: 0 },
    { name: 'Moalboal',      province: 'Cebu', km: 0 },
    { name: 'Oslob',         province: 'Cebu', km: 0 },
    { name: 'Pinamungajan',  province: 'Cebu', km: 0 },
    { name: 'Ronda',         province: 'Cebu', km: 0 },
    { name: 'Samboan',       province: 'Cebu', km: 0 },
    { name: 'San Fernando',  province: 'Cebu', km: 0 },
    { name: 'San Remigio',   province: 'Cebu', km: 0 },
    { name: 'Santander',     province: 'Cebu', km: 0 },
    { name: 'Sibonga',       province: 'Cebu', km: 0 },
    { name: 'Sogod',         province: 'Cebu', km: 0 },
    { name: 'Tabogon',       province: 'Cebu', km: 0 },
    { name: 'Tabuelan',      province: 'Cebu', km: 0 },
    { name: 'Tuburan',       province: 'Cebu', km: 0 },
  ] },
];

// ─── Per-region lookup ────────────────────────────────────────────────────────
export const LOCATION_TABLES = Object.freeze({ luzon: LUZON_REGIONS, cebu: CEBU_REGIONS });

// The region table for a region id; an unknown id falls back to Luzon so no
// caller can land on undefined (the id is validated upstream in region.js).
export function regionsFor(regionId) {
  return LOCATION_TABLES[regionId] || LUZON_REGIONS;
}

// ─── Three-level location cascade: region → province → city (v3-210) ────────
// `cities` stays a FLAT array so nothing that already reads region.cities
// breaks; the province is a field on each entry and the province list is
// derived. NCR entries carry province: null (the serviceable list marks it
// N/A), so provincesOf('luzon', 'NCR') is empty and the UI hides the control
// instead of rendering a pointless one-item dropdown.

export function provincesOf(regionId, regionCode) {
  const r = regionsFor(regionId).find((x) => x.code === regionCode);
  if (!r) return [];
  return [...new Set(r.cities.map((c) => c.province).filter(Boolean))];
}

// City names are deliberately BARE: "Rosario" exists in both Cavite and
// Batangas, and the province selection is what separates them. Every lookup
// must therefore key on the (province, name) PAIR — a name-only find would
// silently return the wrong town and price the wrong distance.
export function citiesOf(regionId, regionCode, province) {
  const r = regionsFor(regionId).find((x) => x.code === regionCode);
  if (!r) return [];
  return province
    ? r.cities.filter((c) => c.province === province)
    : r.cities.filter((c) => !c.province);
}

// Resolves a possibly-stale (region, province, city) triple to real entries
// of the given region's table, falling back one level at a time. Restored
// sessions, a region switch and the removal of a location all flow through
// here, so no caller can land on undefined.
export function resolveLocation(regionId, regionCode, province, cityName) {
  const table = regionsFor(regionId);
  const region = table.find((r) => r.code === regionCode) || table[0];
  const provinces = provincesOf(regionId, region.code);
  const prov = provinces.length
    ? provinces.includes(province)
      ? province
      : provinces[0]
    : null;
  const cities = citiesOf(regionId, region.code, prov);
  const city = cities.find((c) => c.name === cityName) || cities[0];
  return { region, province: prov, provinces, cities, city };
}

// The location fields a fresh quote starts with in a region. Luzon keeps the
// historical NCR / Manila / 18 km (inside the free radius, so the default
// quote's ₱0 delivery line is unchanged); Cebu starts at Cebu City, km 0.
// The structural location id stays 'luzon' for BOTH — it means "the region's
// home mainland" to the engine (calc-engine 1.3.0), not the island.
export function defaultLocationState(regionId) {
  if (regionId === 'cebu') {
    return {
      location: 'luzon',
      locationRegion: 'CEBU',
      locationProvince: 'Cebu',
      locationCity: 'Cebu City',
      locationKm: 0,
    };
  }
  return {
    location: 'luzon',
    locationRegion: 'NCR',
    locationProvince: null,
    locationCity: 'Manila',
    locationKm: 18,
  };
}

// What the three location pickers (Step 2E, mobile Your Home, the contact
// form) show for a region, so they cannot disagree: the Region select only
// when the table has more than one region; the km / surcharge wording only
// while the region has a dispatch hub (the engine prices ₱0 without one).
export function pickerShape(regionId, adminParams) {
  return {
    showRegionSelect: regionsFor(regionId).length > 1,
    showKm: adminParams?.deliveryHubEnabled !== false,
  };
}
