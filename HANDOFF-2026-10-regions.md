# Handoff — v3-231 · Regions: Manila / Cebu (2026-10-28)

Add-on to `HANDOFF.md` (per `HANDOFF_INPUT_GUIDE.md`). Source baseline:
`staging` at `167df2b` (v3-230). Backend baseline: `InternalCalcBackEnd`
`staging` at `7e2c69f` (regions + calc-engine 1.3.0; its own `HANDOFF.md`
has the server side). Target: staging only.

## Scope

Solviva opens a Cebu office. Cebu's costs, margins, COGS and logistics all
differ from Manila's and Cebu has its own reps, so ONE calculator now serves
two **regions** — `luzon` (label **Manila**, the original, byte-identical
behaviour) and `cebu` (label **Cebu**) — each with its OWN complete parameter
payload, and every account holds region access: Manila only, Cebu only, or both.

- **Region module** `src/lib/region.js` — ids, labels, colours;
  `regionsOf(session)` reads Supabase `app_metadata.regions` (missing ⇒
  `['luzon']`, the same default the backend and its RLS policy apply, so no
  account was backfilled); the active region is remembered per device
  (`localStorage.solviva_region_v1`).
- **Region stamp, switch and theme** (`src/components/RegionControls.jsx`,
  design pass after the first staging review): `<RegionStamp/>` — "MANILA
  calculator" / "CEBU calculator" with a map-pin, filled in the region's
  accent — sits under the logo in the desktop header and in the mobile header
  for EVERY account; `<RegionSwitch/>` — a labelled segmented control
  ("Quoting in  Manila | Cebu", active segment filled) — only for both-region
  accounts. Per-region `theme` in `region.js`: Manila keeps the calculator's
  green; Cebu uses the Solviva **lime accent `#d2ff1e`** (the brand kit's
  light green) for a 4px band along the top of the header, a light wash of
  the same lime on the header, the stamp and active switch segment (dark
  green text on lime, per the brand rule — never white on lime), the active
  quote-tab underline (dark green text), a lime top edge on the dark green
  live total bar, and the pills in tables/admin. The header's actions block
  wraps right-aligned so the quote/agent column keeps its width beside the
  switch. Logo: `public/logo-full-v3.png` from the
  brand kit's cropped transparent `logo-horizontal-green.png` (583×168),
  used by the header, login, reset-password, maintenance gate and mobile flow.
- **A quote belongs to one region.** Switching starts a NEW quote in the other
  region: a confirm dialog (same idiom as "Reset & lock") when Steps 1–4 or the
  contact were touched, then Steps 1–4, the issue date AND the customer contact
  (incl. the Odoo lead id) are dropped; `solviva_mode` / `solviva_agent`
  survive. The whole calculator remounts (`key={role:region}`) and loads the
  new region's payload behind the boot spinner, so nothing is ever priced on
  the previous region's numbers.
- **Per-region parameters** (`src/lib/paramsService.js`): `load({ region })`,
  `save(snapshot, role, region)`, `getAuditHistory(role, { limit, region })`
  send `?region=`; the backend echoes `region` and a mismatch (or a backend
  with no region support) fails the backend step for any non-Manila region so
  Cebu can never be priced on Manila's payload. `save()` refuses a target other
  than the region whose values are live. Cache is per region
  (`solviva_params_cache_v2_<region>`; the old v1 key is read once as Manila's
  and removed). Direct Supabase fallback reads `region_parameters` (Luzon falls
  back to `app_parameters` for one release).
- **Locations** `src/data/locations.js` (new): `LUZON_REGIONS` lifted verbatim
  out of `config.js`; new `CEBU_REGIONS` (mainland Cebu + bridged Lapu-Lapu and
  Cordova, 46 LGUs, km 0 — no hub yet); region-first `provincesOf / citiesOf /
  resolveLocation(regionId, …)`, `defaultLocationState(regionId)`,
  `pickerShape(regionId, adminParams)`. All five consumers updated (Step 2E,
  mobile Your Home, the contact form's cascade, `lead.js`, the PDF's
  installation site). The structural location id stays `'luzon'` for both
  regions ("the region's home mainland" to the engine); Cebu's picker is
  Province → City (its Region select is hidden) and shows no km / surcharge
  while the region has no dispatch hub.
- **One delivery sentence** `src/lib/locationCopy.js` for Step 2E and mobile,
  built from the live `deliveryRegionLabel / deliveryHubLabel /
  deliveryHubEnabled` (calc-engine 1.3.0) — the two hardcoded "Parañaque
  logistics hub" strings are gone.
- **Admin console**: `AdminShell` is keyed on the region and shows
  "Editing: <Region> parameters"; copy and the Save button name the region;
  saves go to that region. Engineering → Location gains "Service region label",
  "Delivery hub in service" (off ⇒ ₱0 delivery everywhere, no km, no Logistics
  clause; the radius/fee fields are inert) and "Logistics hub name"; the three
  Luzon-named fields are renamed generically. Maintenance mode stays GLOBAL
  (the backend mirrors `gateAuthEnabled` into every region row). Audit History
  filters Manila / Cebu / All and shows a region pill per event.
- **Users tab**: a Regions checkbox pair in Create and Edit (at least one;
  editable for yourself — that is how the first Super Admin grants themself
  Cebu) and a Regions column.
- **Proposal PDF**: `{{DELIVERY_HUB}}` token; the Logistics Add-On heading +
  clause (`requiresHub`) are dropped when the region has no hub; the
  installation site uses the region's table. Manila's clause now reads "from
  the Parañaque hub" (was "from Parañaque city"). The Inclusions paragraph's
  delivery item reads the live radius and hub ("Free delivery (within 33 km of
  the Parañaque hub)"; was the literal "within 30km of KM 0") and is plain
  "Free delivery" for a region with no hub (Cebu).
- **Backward compatibility**: `STATE_RECORD_VERSION` 13 → 14 MIGRATES a v13
  record (stamps it `luzon`) instead of wiping it; a record from another region
  is dropped only when the account no longer holds that region. Engine
  parity: 46/46 scenarios identical on the staging and production payloads.

- **Brand palette across the calculator** (so Manila's green and Cebu's lime
  sit on one brand system): token swap of the pre-kit palette to the Solviva
  kit — dark green `#1f512a` (was `#25543A` / `#1f522b`), mid green `#50890a`
  (was `#3B7B5A`), body `#212121`, secondary `#475467`, muted `#667085`,
  borders `#e4e7ec`, page `#fcfcfc` (cream tints → neutral `#f2f4f7`), the
  legacy Solviva orange `#E87722` → brand blue `#006ac6`, and the mobile
  flow's own green scale onto the same values (`index.html` theme/body/focus
  colours too). Functional colours (amber rep pill, warnings, errors,
  success, input tint), the charts and the Figma-based PDF are unchanged.

- **Logo variants, width, motion** (second design pass): the header keeps
  the kit's green logo on its light background; the footer is a brand
  dark-green band with the kit's LIME logo (`public/logo-full-lime-v3.png`);
  the loading splashes use the sunburst mark alone (`public/logo-mark-v3.png`).
  Content cap raised 1200 → 1440 px (header, tabs, main, footer, banners).
  Motion in `index.html`: the app fades in after sign-in or a region switch
  (`.app-root`), tab content fades up on a tab change (`.tab-pane`, keyed so
  the four parameter tabs share one key and `AdminShell` keeps its unsaved
  drafts — it animates its own inner pane), the confirm dialog pops in over
  a fading overlay (`.sv-overlay` / `.sv-dialog`), the parameter and Odoo
  banners fade up (`.sv-fade-up`), buttons and tabs get colour transitions;
  all off under `prefers-reduced-motion`.

- **Cebu in lime, app-wide** (third design pass, from the user's design
  system): the calculator's PRIMARY fill is the CSS variable `--sv-primary`
  (+ `--sv-on-primary`, `--sv-on-primary-muted/-soft`) set in `index.html`
  from `data-region` on `<html>` (App.jsx writes it when the region resolves
  or switches). Manila = dark green `#1F522B` + white text; Cebu = lime
  `#D2FF1E` + dark-green text. Every filled button, the phase toggle, table
  header rows, the live total bar, Generate PDF, the recommendation pill,
  underlines, the focus ring and the mobile flow's fills follow it
  (`COLORS.primary` / `COLORS.onPrimary` in ui.jsx; literal fills were
  rewritten to the variable). Dark-green TEXT on light grounds stays dark
  green in both regions (lime text on white is unreadable). Cebu's header is a
  dark-green surface with the chartreuse logo, white meta text and
  light-bordered buttons (the design system's dark-green ⇄ chartreuse
  pairing); it goes light while the contact form is open. Logos are the
  design system's master SVGs trimmed to the artwork
  (`public/logo-horizontal-{dark-green,chartreuse,white}.svg`); the footer
  stays dark green with the chartreuse logo. Dark green aligned to the design
  system's `#1F522B`.

- **Numbers you read, on Cebu** (fourth pass): a second token pair,
  `--sv-tile-*` (StatTile background/border/figure/label/sub) and
  `--sv-hero-*` (the Step 3E price card), in `index.html` /
  `COLORS.tile* / hero*`. Manila: light tiles, dark-green figures, dark-green
  hero card with a white figure (unchanged look). Cebu: dark-green tiles with
  lime figures and light labels; the hero card keeps its dark green with a
  lime figure; the Summary's Total Package Price row and the mobile price
  hero / monthly card follow the same tokens. A StatTile with an `aside`
  (Step 2A battery panel) stays light in both regions. Every explicit
  `color={COLORS.brandGreen}` on a StatTile became `COLORS.tileFg`; an
  emphasised word inside a tile label (Step 4 "SAVINGS") uses
  `COLORS.tileStrong` (body black on Manila, white on Cebu) — never
  `textBody`, which vanished on the dark tile. Rule of thumb from here:
  controls = `primary`/`onPrimary`, read-only figures = `tile*`, the one hero
  card = `hero*`.

## Files touched

New: `src/lib/region.js`, `src/data/locations.js`, `src/lib/locationCopy.js`,
this file. Changed: `src/config.js` (table + helpers removed), `src/lib/
{paramsService,permissions,lead,odooQuotation,crmContact,usersService,
pdfGenerator}.js`, `src/components/{App,Calculator,Step2Packages,MobileFlow,
AdminShell,AdminShared,EngineeringTab,ProductTab,AuditHistory,UserManagement,
ParamsSourceBanner}.jsx`, `netlify/functions/parameters.js` (mirror),
`package.json` (3.231.0; `@solviva/calc-engine` → `calc-engine-v1.3.0`
tarball), `package-lock.json`, `HANDOFF.md` (one row).

## Behavior changes

- Manila: byte-identical pricing; the header gains a badge (one region) or a
  toggle (both); admin copy names the region; Engineering → Location fields
  renamed; the proposal's Logistics clause says "from the Parañaque hub".
- Cebu: own payload; every delivery ₱0 (no hub yet); Province → City picker;
  "Location / Delivery — Cebu" on the Summary; no Logistics clause on the PDF;
  installation site "…, Cebu City, Cebu".

## Data contract changes

- `GET/PUT /api/parameters?region=`, `GET /api/parameter-audit?region=|all`,
  `GET /api/crm-contact?…&region=`; `region` in the `POST /api/odoo/quotation`
  body; `regions[]` on `/api/users` (list / POST / PATCH). New statuses:
  `403 region_forbidden`, `404 region_not_seeded`, `503 region_not_provisioned`.
  New warning codes: `lead_region_mismatch`, `lead_region_unknown`,
  `lead_company_mismatch`.
- Supabase: `region_parameters` (RLS scoped to the JWT's `app_metadata.regions`),
  `parameter_audit_events.region`.
- Engine 1.3.0 parameters registered under `location` in `permissions.js` and
  the netlify mirror: `deliveryRegionLabel`, `deliveryHubLabel`,
  `deliveryHubEnabled`, `odooCompanyId`. `check-param-sync.sh` is broken on
  the current map formatting independently of this change (fails on
  `ROLE_ADMIN_SECTIONS` / `IRR_YEARS_OPTIONS` against `167df2b` too); the three
  maps were compared directly with a node one-liner instead: the four new keys
  agree everywhere. That comparison also shows PRE-EXISTING drift this change
  does not touch — the six `grossMarginBattery*` keys are in `permissions.js`
  but not the netlify mirror, and the six `grossMarginSolar*/Misc*` anchors are
  in the backend but not the frontend — worth a tidy-up of its own.
- Lead payload (`lib/lead.js`) gains top-level `region`; the location label
  reads `deliveryRegionLabel`.

## Validation

- `npm run build` clean (v3-231); `bash lint-no-undef.sh` CLEAN; direct
  three-way `PARAM_KEY_TO_SECTION` comparison: the four new keys present and
  identical in all three maps (see the drift note above).
- `src/data/locations.js`: 46 Cebu LGUs, no duplicates; Luzon 3 regions /
  196 cities untouched; `resolveLocation('cebu', 'NCR', null, 'Manila')`
  (a stale Manila triple on Cebu) resolves to Cebu City; `pickerShape('cebu',
  { deliveryHubEnabled: false })` → no Region select, no km.
- Staging checklist (browser, after Pages deploys): both-regions user sees
  Manila | Cebu; switch with a touched quote ⇒ confirm ⇒ fresh Cebu quote,
  Province "Cebu" → "Cebu City", no km sentence, Summary "Location / Delivery
  — Cebu" ₱0; admin "Editing: Cebu parameters", a Cebu save leaves Manila
  unchanged (SQL on `region_parameters`); Audit History Cebu / All; Users tab
  Regions column + checkboxes; Cebu-only user: badge only, no toggle; v13
  `solviva_state` record restores as Manila; Cebu PDF without the Logistics
  clause, Manila PDF with "from the Parañaque hub".

## Deployment

- No new environment variables. `npm ci` fetches the 1.3.0 tarball from the
  backend repo's GitHub release (`calc-engine-v1.3.0`).
- Order: backend migration + backend `staging` (done, `7e2c69f`) → engine tag
  (done) → this frontend on `staging` (Pages via `deploy-staging.yml`).
- First-time setup: grant Cebu to the first accounts in the Users tab (or
  `PATCH /api/users/:id {"regions":["luzon","cebu"]}`). Existing accounts are
  Manila by default.
- Follow-ups: drop the `app_parameters` fallbacks (frontend + backend mirror)
  one release after the migration has run everywhere; the real Cebu delivery
  charge and hub are data (Engineering → Location); Cebu `odooCompanyId` once
  Finance has the Odoo branch; VECO inflation figures from FinCo.
