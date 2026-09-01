// =============================================================================
// APP — top-level shell, tab navigation, state container
// =============================================================================

import React, { useState, useMemo, useEffect } from 'react';
import { ADMIN_PARAMS, DISCLAIMERS, PROPOSAL_CONTENT, optimizeBatteryPackage,
         availableBatteryPackages, availableDeliveryLocations } from '../data/adminParams.js';
import { DEVICES } from '../data/devices.js';
import { DEFAULTS, BRAND, AGENT, AUTH,
         INCLUDED_DC_CABLE_METERS, INCLUDED_AC_CABLE_METERS } from '../config.js';
import {
  computeRecommendedPanels, recommendInverters, buildPackageLineItems,
  computePaymentTerms, popularTenorsTable, systemSizing,
  availableInverters,
} from '../lib/calculations.js';
import {
  buildHourlyCurve, batteryDailyExcess, roundBatteryKwhToPackage,
  computeCashFlows, buildAnnex,
  firstPostInstallDueDate, optimizeSystem,
} from '../lib/schedule.js';
// pdfGenerator is imported dynamically inside handleGeneratePdf so the
// jsPDF + jspdf-autotable bundle (~140 KB gzipped) only loads when a rep
// actually clicks "Generate PDF". Keeps the customer-facing initial load
// lean — customers never see the button so they never trigger the import.
import * as paramsService from '../lib/paramsService.js';
import { isValidPhPhone, formatPhPhone } from '../lib/validation.js';
import { buildLeadPayload, submitLead, makeLeadRef, LEAD_CONSENT_TEXT } from '../lib/lead.js';

import MaintenanceGate, { readGatePass } from './MaintenanceGate.jsx';
import Calculator from './Calculator.jsx';
import Summary from './Summary.jsx';
import Schedule from './Schedule.jsx';
import AdminShell, { MaintenanceModeBlock } from './AdminShell.jsx';
import MobileFlow from './MobileFlow.jsx';
// ── Supabase user management (this deployment's replacement for upstream
// v3-207's shared-password AuthDialog sign-in). Identity and role come from
// Supabase Auth + public.user_roles; the staff-key password dialog is gone.
import Login from './Login.jsx';
import ChangePasswordDialog from './ChangePasswordDialog.jsx';
import ResetPassword from './ResetPassword.jsx';
import { supabase, fetchUserRole, ADMIN_ROLE_TO_ACCESS } from '../lib/supabaseClient.js';
import { fmt } from './ui.jsx';   // v3-123 — LiveTotalBar peso formatting

// v3-70: Step 1 defaults are now Product-settable (ADMIN_PARAMS
// .defaultUtilityRate / .defaultMonthlyBill). makeInitialState reads the
// object LIVE — paramsService mutates it in place — so any call after the
// params load (notably the Step 1 Reset button) uses the server values.
// The two constants below capture the BUNDLED defaults at module-import
// time, i.e. before paramsService.load() can have mutated them; they let
// the boot-race snap in the load().then() callback distinguish "still at
// the shipped default" from "user typed something".
const BUNDLED_DEFAULT_RATE = ADMIN_PARAMS.defaultUtilityRate;
const BUNDLED_DEFAULT_BILL = ADMIN_PARAMS.defaultMonthlyBill;
const BUNDLED_DEFAULT_DP   = ADMIN_PARAMS.defaultDownPaymentPct;  // v3-159
// v3-188 — BUGFIX, two of them, same cause. v3-181 (duRateInflation) and v3-187
// (irrYears) both seeded from ADMIN_PARAMS inside makeInitialState and assumed
// the live blob was already overlaid by then. IT IS NOT: makeInitialState runs
// in the useState initialiser on FIRST RENDER, while paramsService.load() is an
// effect that resolves afterwards. Both therefore read the BUNDLED value and
// ignored whatever FinCo had saved — reported by Pat for the IRR horizon
// (set to 20, still showed 25). duRateInflation had the identical defect and
// was merely invisible, because its seed is 0 and nobody had moved it yet.
//
// The v3-159 comment cited as precedent describes the OPPOSITE idiom to the one
// assumed: capture the bundled value here, then reconcile in the boot-race snap
// below once the fetch resolves. These two constants complete that pattern.
const BUNDLED_DEFAULT_IRR_YEARS = ADMIN_PARAMS.irrYearsDefault;        // v3-188
const BUNDLED_DEFAULT_DU_INFL   = ADMIN_PARAMS.duRateInflationDefault; // v3-188

export function makeInitialState(kind = 'all') {
  const step1 = {
    phase: 1,
    utilityRate: ADMIN_PARAMS.defaultUtilityRate,
    monthlyBill: ADMIN_PARAMS.defaultMonthlyBill,
    deviceRows: Array.from({ length: 2 }, () => ({
      deviceName: null, count: 1, onTime: null, offTime: null, daysPerWeek: null,
    })),
  };
  const step2 = {
    desiredSavingsPct: 0.5,
    // v3-110 — Step 2A optimization objective: 'panels' (default — the
    // standard W7 sizing, byte-identical to the pre-v3-110 pipeline) |
    // 'battery' | 'cost' (optimizeSystem sweep). A legitimate PUBLIC
    // customer choice — deliberately NOT reset by the customer-mode safety
    // net in Step2Packages. Additive with a safe default, so restored
    // pre-v3-110 sessions boot into 'panels' → no STATE_RECORD_VERSION bump.
    optimizationMode: 'panels',
    // v3-136 — "Size panels for peaks and batteries for valleys". When true
    // (and a sub-7-day device exists) the optimizeSystem sweep certifies
    // against corner days instead of the average day: savings on the max-load
    // day, absorb-all on the max-excess day. A PUBLIC customer choice
    // (locked decision 1) — not reset by the customer-mode safety net. At a
    // 100% target with a sub-7-day device the model FORCES it on (Variant B:
    // the average-week system cannot deliver a true 100%). Additive with a
    // safe default → no STATE_RECORD_VERSION bump (v3-110 precedent).
    conservativeSizing: false,
    panelCount: null,
    // Total cable meters — first INCLUDED_*_CABLE_METERS (config.js) are
    // bundled at no extra charge; only meters beyond that are billed.
    // v3-18 renamed from `additional*CableMeters` (which held the EXCESS
    // beyond the baseline) to plain `*CableMeters` (which holds the TOTAL),
    // because the UX shifted from "how many EXTRA meters" to "how much
    // cable is needed in TOTAL". State-version bump (line ~80) invalidates
    // any v3-17 sessions still holding the old field names.
    dcCableMeters: INCLUDED_DC_CABLE_METERS,
    acCableMeters: INCLUDED_AC_CABLE_METERS,
    rsdEnabled: false,
    rsdStandalonePanelCount: 3,
    selectedInverters: [null, null, null],
    // v3-175 — panels-only expansion (user-directed, Pat): new panels connect
    // to an inverter the customer already owns.
    // v3-204 — existingPanelCount REPLACED by existingKwp (Pat: homeowners
    // know their rated capacity; older panels had lower wattages, so a count
    // misprices the existing side). Field RENAME = schema break: a restored
    // session carrying the old count would merge into a state that no longer
    // reads it and silently disarm expansion mode → STATE_RECORD_VERSION
    // bumped 9→10 this release.
    expansionMode: false,
    existingKwp: null,
    existingInverterKw: null,
    batteryKwh: null,
    // v3-151 — the three bundled battery components the rep can drop from a
    // quote (Step 2A checkboxes). Default INCLUDED. New booleans with a safe
    // default, so a restored session picks them up through the
    // {...defaults, ...rest} merge and STATE_RECORD_VERSION stays put
    // (v3-110 precedent).
    batteryRackIncluded: true,
    batteryAtsIncluded: true,
    batteryCritLoadsIncluded: true,
    // v3-54: synthetic uuid identifying the active battery package from
    // adminParams.batteryPackages[]. null = use packages[0] (customer
    // default, math-parity with v3-53). Only the rep-mode Step 2 selector
    // sets a non-null value. Falls back to first available package if the
    // chosen id is later deleted by admin.
    batteryPackageId: null,
    netMeteringEnabled: false,
    // Roof Material (v3 — Excel CALCULATOR M36):
    //   'metal'    → ₱0 charge (no roof prep needed) — DEFAULT
    //   'asphalt'  → ₱9,200/kWp (Asphalt/Shingles/Tiled)
    //   'concrete' → ₱17,000/kWp
    roofMaterial: 'metal',
    // Location (v3 — Excel CALCULATOR M37 + Y39):
    //   'luzon'   → free if locationKm ≤ adminParams.luzonFreeTravelKm (v3-199), else fixed + per-km — DEFAULT
    //   'cebu'    → fixed + per-panel
    //   'siargao' → fixed + per-panel
    location: 'luzon',
    // v3-109 (cascade lineage, merged v3-114) — Luzon location is chosen via a
    // Region → City cascade (src/config.js LUZON_REGIONS) instead of a
    // free-typed km. The selected city's stored road-km from OUR PARAÑAQUE
    // LOGISTICS HUB (v3-114 origin rebase; was Km-0/Rizal Park) drives
    // locationKm, which still feeds the identical charge formula in
    // calculations.js (parity with workbook AA38). Defaults to NCR / Manila
    // (18 km — inside the 30 km free zone), so the default quote total is
    // unchanged (a ₱0 location line, exactly as before).
    locationRegion: 'NCR',
    locationCity: 'Manila',
    // Distance from the Parañaque hub (Luzon only). Derived from the selected
    // city above; held in state so calculations.js and workbook AA38 parity
    // are untouched.
    locationKm: 18,
    // v3-138 — rows gained `catalogId`: a pick from Anjon's Step 2F catalog,
    // or the 'other' sentinel for a free-form line (the old behavior). A row
    // restored from a pre-v3-138 session has no catalogId at all, which reads
    // as free-form and keeps its typed description + price — so this is NOT a
    // sessionStorage schema break and STATE_RECORD_VERSION stays put.
    // v3-149 — was a single blank 'other' row. 2F is optional and now starts
    // EMPTY: the rep sees only the "+ Add line item" button until they choose
    // to add something. An empty array is a valid value of the existing
    // variable-length schema (same rationale as the v3-74 five-rows-to-one
    // change), so STATE_RECORD_VERSION is unchanged and a session restored
    // from an older build keeps whatever rows it was carrying — those rows are
    // now individually removable.
    miscMaterials: [],
  };
  const step3 = {
    // v3-32: defaults flipped from {tenor: 60, downPaymentPct: 0.10}
    // (the 60-month RTO with 10% DP that mirrored the Excel model's
    // headline scenario) to {tenor: 1, downPaymentPct: 0.50} (1-month
    // direct-purchase with 50% pre-installation DP). The customer
    // view now hides the entire Step 3 payment-term section, so the
    // default is effectively *the* customer-facing payment scenario;
    // reps still see Step 3 and can adjust freely. STATE_RECORD_VERSION
    // bumped to 3 below so existing sessions don't restore the old
    // (60, 0.10) defaults from sessionStorage on first load post-deploy.
    // v3-100: tenor 1 → 0. Direct Purchase is now its own tenor-0 sentinel
    // (v5.1 "Direct Purch"); the default customer scenario is STILL a
    // Direct Purchase — only its encoding changed. Tenor 1 is now a real
    // interest-bearing 1-month term.
    // v3-159: the DP default is Product-settable (ADMIN_PARAMS
    // .defaultDownPaymentPct, shipped at 0.30 — supersedes the v3-32
    // hardcoded 0.50). Read LIVE for the same reason as the Step 1
    // defaults: Reset after boot uses the server value. If a quote's
    // minDpTiers floor exceeds it, the Step-3/Mobile clamp effects snap
    // the session up — the default never undercuts a tier minimum.
    // NO STATE_RECORD_VERSION bump: a defaults change is not a schema
    // change (locked rule); restored v3-158 sessions keep their 0.50.
    tenor: 0, downPaymentPct: ADMIN_PARAMS.defaultDownPaymentPct,
    promoCode: '',
  };
  if (kind === 'step1') return step1;
  if (kind === 'step2') return step2;
  if (kind === 'step3') return step3;
  // v3-181 — duRateInflation seeds from the FinCo default (ADMIN_PARAMS is
  // already overlaid with the live blob by the time makeInitialState runs, the
  // defaultDownPaymentPct idiom from v3-159). A customer's own adjustment then
  // rides in state for the session; Reset returns it to the FinCo default.
  return {
    ...step1, ...step2, ...step3,
    // v3-187 — seeded from the FinCo default rather than hardcoded. The
    // customer can still change it in Step 4; a restored session keeps
    // whatever THEY chose. No STATE_RECORD_VERSION bump: irrYears has been in
    // the record since v1 and only its starting value moves.
    irrYears: ADMIN_PARAMS.irrYearsDefault ?? 25,
    duRateInflation: ADMIN_PARAMS.duRateInflationDefault ?? 0,
  };
}

// ─── sessionStorage persistence keys & schema sentinel ────────────────────────
// Bumping CONTACT_RECORD_VERSION / STATE_RECORD_VERSION will invalidate any
// stale records from prior shapes — the next page load will fall through to
// defaults rather than crashing on a missing field.
const CONTACT_STORAGE_KEY = 'solviva_contact';
const STATE_STORAGE_KEY   = 'solviva_state';
const GENERATED_DATE_KEY  = 'solviva_generated_date';
// v3-203 — the four admin tab ids, valid as activeTab values only while
// adminAccess !== 'none'. Shared by App (content mount, bounce effect,
// LiveTotalBar suppression) and Tabs (strip composition). Order here IS the
// strip order after the divider.
const ADMIN_TAB_IDS = ['inventory', 'engineering', 'product', 'finco'];
// Labels for the admin half of the v3-203 tab strip. Order here IS the strip
// order. EVERY admin tier sees all four (v3-203 D2) — the read/write split is
// per-section inside each tab, not per-tab.
const ADMIN_TAB_META = [
  { id: 'inventory',   label: 'Inventory',   admin: true },
  { id: 'engineering', label: 'Engineering', admin: true },
  { id: 'product',     label: 'Product',     admin: true },
  { id: 'finco',       label: 'FinCo',       admin: true },
];

// v3-203 — Staff Sign-in key glyph (approved option E): the Solviva radiant
// sun simplified to eight rays as the key head (the logo's twelve V-chevrons
// don't survive 12px rendering), open center per the logo, toothed shaft, no
// closed bow. Hand-authored inline SVG — deliberately NOT the logo PNG, so
// it inherits currentColor like the other header stroke icons. Brand mark on
// a public surface → in Lili's v3-203 review bundle.
function StaffKeyIcon({ height = 13 }) {
  const width = Math.round(height * 48 / 30);
  return (
    <svg width={width} height={height} viewBox="0 0 48 30" fill="none"
         stroke="currentColor" strokeWidth="2.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="15" x2="26.5" y2="15" />
      <line x1="19.66" y1="20.66" x2="22.84" y2="23.84" />
      <line x1="14" y1="23" x2="14" y2="27.5" />
      <line x1="8.34" y1="20.66" x2="5.16" y2="23.84" />
      <line x1="6" y1="15" x2="1.5" y2="15" />
      <line x1="8.34" y1="9.34" x2="5.16" y2="6.16" />
      <line x1="14" y1="7" x2="14" y2="2.5" />
      <line x1="19.66" y1="9.34" x2="22.84" y2="6.16" />
      <path d="M29 15h17m-5 0v5m-5-5v4" />
    </svg>
  );
}

// `solviva_mode` is sessionStorage-persisted so a rep who reloads stays in
// rep mode, but a tab/browser close drops them back to customer mode (right
// default for shared-laptop scenarios). Schema-versioned for forward-compat.
const MODE_STORAGE_KEY    = 'solviva_mode';
const MODE_RECORD_VERSION = 1;
const CONTACT_RECORD_VERSION = 2;   // v3-61: added installAddress
// v3-18 BUMP: cable input semantics changed (was "additional meters beyond
// the baseline" → now "total meters required") and field names were renamed
// (additional*CableMeters → *CableMeters). Existing v1 sessions would fall
// through silently because the new field names don't exist — but bumping is
// belt-and-suspenders, also ensures the new defaults (30 / 10 / 30 km)
// surface for everyone on first load post-deploy.
//
// v3-32 BUMP: Step 3 defaults flipped from (tenor: 60, downPaymentPct: 0.10)
// to (tenor: 1, downPaymentPct: 0.50) so the customer-facing view defaults
// to direct-purchase with 50% pre-installation DP. Without this bump,
// existing sessions would restore the old defaults from sessionStorage
// and bypass the new customer-view assumption.
//
// v3-51 BUMP: Step 3 tenor input switched from a free-form NumberInput (1-60
// integer) to a 13-value dropdown ({1, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48,
// 54, 60}). Existing sessions holding a non-listed tenor (e.g. 7, 11, 23)
// would render the dropdown in an empty/blank state until the user clicks
// it. The bump wipes those sessions to defaults so every user post-deploy
// lands on a valid Select option. Also covers the DP% dropdown's new 11-value
// set ({0, 5, 10, ..., 50} — old set was missing 45%).
// v3-54 BUMP: new state field `batteryPackageId` (synthetic uuid) selects
// the active battery package from adminParams.batteryPackages[]. Existing v4
// sessions lack the field; bumping to v5 wipes them to defaults so the new
// selector renders cleanly. Customer-mode users see no change (the field
// stays null; resolution falls back to packages[0] which is bit-exact
// v3-53's "5 kWh" pack).
//
// v3-100 BUMP: tenor 0 = Direct Purchase; tenor 1 is now an interest-bearing
// 1-month term (v5.1 split "Direct Purch" from the numeric 1-month tenor).
// Saved sessions hold tenor 1 — which since v3-32 has been the DEFAULT and
// MEANT Direct Purchase. Restoring them unchanged would silently reprice the
// most common saved scenario into a ~17–22% 1-month loan; the version wipe
// returns them to the new defaults (tenor 0 — the same Direct Purchase
// intent, correctly encoded).
// v3-181 — 8 -> 9. A GENUINE schema change, unlike v3-151/v3-159: the record
// gains `duRateInflation`, a customer-set field that CHANGES THE RETURNS SHOWN.
// A restored v8 session has no such key, and the `{...defaults, ...rest}` merge
// would leave the new default in place — harmless today, since the seed is 0
// and 0 reproduces v3-180 exactly. The bump is nonetheless correct and
// deliberate: the moment FinCo raises the default above 0, a v8 session
// restored WITHOUT the wipe would show returns computed at one rate beside a
// note describing another. Bumping now costs one reset; not bumping costs a
// silent contradiction on a customer's screen later.
const STATE_RECORD_VERSION   = 10;  // v3-204: existingPanelCount → existingKwp rename

// ─── PDF proposal requirements (v3-61) ───────────────────────────────────────
// The PDF proposal is rep-mode-only and prints both parties' details plus an
// acceptance/signature page. Before it can be generated, every agent and
// customer field — including the customer's proposed installation address —
// must be populated and valid. These helpers gate Generate PDF and drive the
// required-field validation in ContactEditForm.
const isEmailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());
function customerDetailsComplete(c) {
  return !!c && !!c.name?.trim() && isEmailValid(c.email)
      && isValidPhPhone(c.mobile) && !!c.installAddress?.trim();
}
function agentDetailsComplete(a) {
  return !!a && !!a.name?.trim() && isEmailValid(a.email) && isValidPhPhone(a.phone);
}
function pdfDetailsComplete(contact, agent) {
  return customerDetailsComplete(contact) && agentDetailsComplete(agent);
}

// ─── Auth wrapper (default export) ────────────────────────────────────────────
// THIS DEPLOYMENT DIVERGES FROM UPSTREAM v3-207 HERE, and only here.
// Upstream gates staff access behind a shared-password AuthDialog (the "staff
// key"). This build uses Supabase instead: the landing page is a login form,
// and once a session exists the user's role comes from public.user_roles.
// Everything below the wrapper — every v3-143…v3-207 feature — is unchanged.
export default function App() {
  // session: undefined = still checking; null = signed out; object = signed in
  const [session, setSession] = useState(undefined);
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  // Set when the user arrives from a password-reset email link. Takes over the
  // UI (shows ResetPassword) even though a temporary recovery session exists.
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data?.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(next ?? null);
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, []);

  // Resolve the role whenever the signed-in user changes.
  useEffect(() => {
    let mounted = true;
    const userId = session?.user?.id;
    if (!userId) { setRole(null); return; }
    setRoleLoading(true);
    fetchUserRole(userId).then((r) => {
      if (!mounted) return;
      setRole(r);
      setRoleLoading(false);
    });
    return () => { mounted = false; };
  }, [session?.user?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange clears session → Login renders.
  };

  // A password-reset link takes precedence over every other view.
  if (recovery) {
    return (
      <ResetPassword onDone={async () => {
        setRecovery(false);
        await supabase.auth.signOut();
      }} />
    );
  }
  if (session === undefined || (session && roleLoading) || (session && !role)) {
    return <BootSplash />;
  }
  if (!session) {
    return <Login />;
  }
  // Identity of the signed-in sales rep, used to auto-populate the Solviva
  // Agent details fields. display_name + mobile are stored in user_metadata by
  // the backend rep-seeding script; email comes from the auth account itself.
  const repIdentity = role === 'rep' && session.user ? {
    uid:   session.user.id,
    name:  session.user.user_metadata?.display_name || '',
    email: session.user.email || '',
    phone: session.user.user_metadata?.mobile || '',
  } : null;
  return <CalculatorApp key={role} role={role} repIdentity={repIdentity} onSignOut={handleSignOut} />;
}

// Minimal centered splash used while the session/role resolve, matching the
// in-app "Loading…" treatment so there's no visual flash on refresh.
function BootSplash() {
  return (
    <div style={styles.app}>
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 12,
      }}>
        <img src="/logo-sun-v2.png" alt="Solviva" width="48" height="48"
             style={{ opacity: 0.7 }} />
        <div style={{ fontSize: 13, color: '#6B7280' }}>Loading…</div>
      </div>
    </div>
  );
}

function CalculatorApp({ role, repIdentity, onSignOut }) {
  // Role → access routing. ADMIN_ROLE_TO_ACCESS maps the DB role ('admin',
  // 'engineering', 'product', 'inventory', 'finco') onto the calculator's
  // internal access levels; 'rep' opens the full sales-rep calculator and
  // everyone else gets the customer view.
  const initialAdminAccess = ADMIN_ROLE_TO_ACCESS[role] || 'none';
  const isAdminRole = initialAdminAccess !== 'none';
  // Customer contact — persisted to sessionStorage so a page reload preserves
  // it (the customer skips re-entering their details), but a browser close
  // clears it (so a shared device doesn't leak the previous customer's info
  // to the next visitor).
  //
  // We track two flags alongside the contact:
  //   • restoredFromStorage — true if we read a valid record on mount.
  //     Used by the ContactGate to render the "Welcome back" headline and
  //     by the in-app banner to show the one-time restoration toast.
  //   • restoreBannerShown  — set after the banner has been displayed once
  //     so toggling tabs / re-renders don't keep re-triggering it.
  const [contact, setContactRaw] = useState(() => {
    const EMPTY = { name: '', email: '', mobile: '', installAddress: '' };
    try {
      const raw = sessionStorage.getItem(CONTACT_STORAGE_KEY);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw);
      if (parsed._v !== CONTACT_RECORD_VERSION) {
        sessionStorage.removeItem(CONTACT_STORAGE_KEY);
        return EMPTY;
      }
      return {
        name:   parsed.name   || '',
        email:  parsed.email  || '',
        mobile: parsed.mobile || '',
        installAddress: parsed.installAddress || '',
      };
    } catch (_) {
      return EMPTY;
    }
  });

  // Wrap the contact setter so any update also writes through to sessionStorage.
  // v3-51: with the contact gate gone, this only fires from the header's
  // Edit-contact-details dialog (rep workflow). Customers who never edit
  // contact details end up with an empty contact object — fine; calculator
  // works regardless.
  const setContact = (next) => {
    setContactRaw(next);
    try {
      if (next && next.name && next.email && next.mobile && next.installAddress) {
        sessionStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify({
          ...next, _v: CONTACT_RECORD_VERSION,
        }));
      }
    } catch (_) { /* ignore */ }
  };

  // Agent info: starts from config defaults, but agents can override per-device
  // via the header Edit dialog. Persisted in localStorage so each agent only
  // has to fill in their info once per browser session.
  const [agent, setAgent] = useState(() => {
    // Persistence: sessionStorage, not localStorage. Survives reloads within
    // the same browser session but is cleared automatically when the tab/
    // browser closes — handles the shared-laptop case where one agent's
    // info shouldn't carry into another agent's later session.
    // DEPLOYMENT DIVERGENCE: record version 3 (upstream ships 2). When a sales
    // rep is signed in, their own name/email/mobile become the default agent
    // identity, pulled from their Supabase account rather than typed in. The
    // stored record also carries the rep's uid so one rep's edits never leak
    // into another rep's session on a shared device.
    const AGENT_RECORD_VERSION = 3;
    const repDefault = repIdentity
      ? {
          name:  repIdentity.name || '',
          email: repIdentity.email || AGENT.email,
          phone: repIdentity.phone ? formatPhPhone(repIdentity.phone) : '',
        }
      : { name: AGENT.name, email: AGENT.email, phone: AGENT.phone };
    try {
      // One-time cleanup: prior versions stored agent details in localStorage.
      // Wipe any stale record so it doesn't persist past today's deploy.
      localStorage.removeItem('solviva_agent');

      const saved = sessionStorage.getItem('solviva_agent');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Reuse a saved record only when it matches the current format AND the
        // signed-in rep (uid). For non-rep views (no repIdentity) any
        // current-format record is fine.
        const sameUser = !repIdentity || parsed.uid === repIdentity.uid;
        if (parsed._v === AGENT_RECORD_VERSION && sameUser) {
          // Use saved values as-stored; do NOT use `||` fallback to AGENT
          // defaults, because that would resurrect old defaults whenever
          // the agent intentionally clears a field.
          return {
            name:  parsed.name  ?? repDefault.name,
            email: parsed.email ?? repDefault.email,
            phone: parsed.phone ?? repDefault.phone,
          };
        }
        // Stale record (old format or a different rep) — wipe it and fall
        // through to the rep/config defaults.
        sessionStorage.removeItem('solviva_agent');
      }
    } catch (_) { /* ignore */ }
    return repDefault;
  });
  const updateAgent = (a) => {
    setAgent(a);
    try {
      // Persist with version sentinel + the signed-in rep's uid so future
      // loads can tell whose edits these were.
      sessionStorage.setItem('solviva_agent', JSON.stringify({
        ...a, uid: repIdentity?.uid ?? null, _v: 3,
      }));
    } catch (_) { /* ignore */ }
  };

  const [editingContacts, setEditingContacts] = useState(false);

  // Global parameter overrides — fetched from Netlify Blobs on app boot.
  // While paramsLoading=true we show a brief spinner. Once loaded, the
  // imported ADMIN_PARAMS / PANEL_SETTINGS / etc. objects are mutated in
  // place by paramsService, so the rest of the app sees the live values
  // without explicit prop threading.
  const [paramsLoading, setParamsLoading] = useState(true);
  const [paramsLoadedFromServer, setParamsLoadedFromServer] = useState(false);
  const [paramsRev, setParamsRev] = useState(0);   // bumps on each save to force re-render
  useEffect(() => {
    let mounted = true;
    paramsService.load().then(() => {
      if (!mounted) return;
      setParamsLoading(false);
      setParamsLoadedFromServer(paramsService.isLoadedFromServer());
      // v3-70: boot-race snap for the Product-settable Step 1 defaults.
      // First render ran before this fetch resolved, so a brand-new session
      // booted on the BUNDLED defaults. If a field still equals the bundled
      // default and the server default differs, move it — the user hasn't
      // touched it. Anything else (including restored sessions holding old
      // defaults like 14.5) is left alone. Known, accepted edge: a user who
      // deliberately typed exactly the bundled default is indistinguishable
      // from an untouched field and would be snapped.
      setState(s => {
        const patch = {};
        if (s.utilityRate === BUNDLED_DEFAULT_RATE
            && ADMIN_PARAMS.defaultUtilityRate !== BUNDLED_DEFAULT_RATE) {
          patch.utilityRate = ADMIN_PARAMS.defaultUtilityRate;
        }
        if (s.monthlyBill === BUNDLED_DEFAULT_BILL
            && ADMIN_PARAMS.defaultMonthlyBill !== BUNDLED_DEFAULT_BILL) {
          patch.monthlyBill = ADMIN_PARAMS.defaultMonthlyBill;
        }
        // v3-159 — same snap for the Step 3 DP default.
        if (s.downPaymentPct === BUNDLED_DEFAULT_DP
            && ADMIN_PARAMS.defaultDownPaymentPct !== BUNDLED_DEFAULT_DP) {
          patch.downPaymentPct = ADMIN_PARAMS.defaultDownPaymentPct;
        }
        // v3-188 — the two FinCo-owned defaults need the same snap. Without it
        // makeInitialState's seed is permanently the bundled value and the
        // FinCo setting never reaches a customer. Same "untouched field only"
        // rule: a session already holding something else — a restored session,
        // or a customer who has moved the control — is left alone.
        if (s.irrYears === BUNDLED_DEFAULT_IRR_YEARS
            && ADMIN_PARAMS.irrYearsDefault !== BUNDLED_DEFAULT_IRR_YEARS) {
          patch.irrYears = ADMIN_PARAMS.irrYearsDefault;
        }
        if (s.duRateInflation === BUNDLED_DEFAULT_DU_INFL
            && ADMIN_PARAMS.duRateInflationDefault !== BUNDLED_DEFAULT_DU_INFL) {
          patch.duRateInflation = ADMIN_PARAMS.duRateInflationDefault;
        }
        return Object.keys(patch).length ? { ...s, ...patch } : s;
      });
    });
    const unsub = paramsService.subscribe(() => {
      if (!mounted) return;
      setParamsRev(r => r + 1);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  // Calculator state (Steps 1-4) — also persisted to sessionStorage so a
  // page reload restores the customer's inputs along with their contact info.
  // We merge any saved record on top of fresh defaults so newly-added fields
  // (e.g. v3.7 added roofMaterial / location) fall back gracefully on records
  // saved by an older build of the app.
  const [state, setState] = useState(() => {
    const defaults = makeInitialState('all');
    try {
      const raw = sessionStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (parsed._v !== STATE_RECORD_VERSION) {
        sessionStorage.removeItem(STATE_STORAGE_KEY);
        return defaults;
      }
      const { _v, ...rest } = parsed;
      return { ...defaults, ...rest };
    } catch (_) {
      return defaults;
    }
  });

  // v3-51: ContactGate is gone. Customers land directly on the calculator
  // unless maintenance mode is active (see passwordRequired derivation
  // below, gated by MaintenanceGate). The prior `gateAcknowledged` flag
  // (which tracked whether the customer had clicked through the contact
  // form) is no longer relevant.

  // Write state through to sessionStorage on every change. This includes
  // step-reset clicks, recommendation-pill clicks, and free-form input edits
  // — basically anything that mutates `state`. The cost is negligible (one
  // JSON.stringify + one localStorage write per keystroke) and the win is
  // that a customer who reloads mid-form returns to exactly where they were.
  useEffect(() => {
    try {
      sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({
        ...state, _v: STATE_RECORD_VERSION,
      }));
    } catch (_) { /* ignore */ }
  }, [state]);

  // generatedDate is held in sessionStorage too so that "Valid until" stays
  // anchored to the original quote-creation moment across reloads. Without
  // this, every reload would reset the validity window — which is wrong if
  // the customer is just refreshing their browser.
  const [generatedDate] = useState(() => {
    try {
      const raw = sessionStorage.getItem(GENERATED_DATE_KEY);
      if (raw) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d;
      }
    } catch (_) { /* ignore */ }
    const fresh = new Date();
    try {
      sessionStorage.setItem(GENERATED_DATE_KEY, fresh.toISOString());
    } catch (_) { /* ignore */ }
    return fresh;
  });
  const validUntil = useMemo(() => {
    const d = new Date(generatedDate);
    // Read from the live ADMIN_PARAMS (mutated in place by paramsService once
    // it loads). Fallback to DEFAULTS in case of a stale blob missing the key.
    const days = ADMIN_PARAMS.quoteValidityDays ?? DEFAULTS.quoteValidityDays;
    d.setDate(d.getDate() + days);
    return d;
    // paramsRev is bumped after paramsService.load() and after each save,
    // so we recompute when the live value changes globally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedDate, paramsRev]);

  const [activeTab, setActiveTab] = useState('calculator');
  // v3-117 — component-price reveal on the Summary tab (Engineering /
  // Product / Audit / Super Admin only). Lifted to App so Generate PDF can
  // FORCE it hidden during the html2canvas snapshot — the PDF must never
  // show the component-price breakdown (user directive). Not persisted:
  // resets on reload, privacy-conservative.
  const [summaryPricesShown, setSummaryPricesShown] = useState(false);
  // v3-177 — financing-detail reveal on the Summary tab (EIR row + column,
  // Post-Install Balance row, TOTAL AMOUNT DUE row + column). Same four admin
  // passwords, same lifted-state reason: Generate PDF FORCES it hidden for the
  // snapshot, so a proposal can never carry the financed total or the EIR
  // whatever an admin has toggled on screen. Not persisted — resets on reload.
  const [summaryFinancingShown, setSummaryFinancingShown] = useState(false);
  // v3-203 — adminPage is GONE. The four admin surfaces are now tabs inside
  // the ONE tab strip (activeTab ∈ calculator/summary/schedule/inventory/
  // engineering/product/finco); adminAccess !== 'none' is what reveals the
  // admin group.
  //
  // DEPLOYMENT DIVERGENCE: upstream seeds this to 'none' and raises it when a
  // staff password is accepted. Here the Supabase role decides it at sign-in,
  // so it is seeded from the role and never re-entered in-app. Sign-out (not a
  // password prompt) is the way out.
  const [adminAccess, setAdminAccess] = useState(initialAdminAccess);

  // ─── Mode: 'customer' (default, simplified public view) | 'rep' (full sales-
  //     rep view with all overrides). Persisted to sessionStorage so a reload
  //     keeps a rep in rep mode; tab close clears it (shared-laptop safe).
  //
  // The rep-mode lock lives in the footer (separate from the Admin entry).
  // When a user clicks it, we open AuthDialog in rep-only mode; on success
  // we flip to 'rep' and persist. The header shows a small "Rep mode" pill
  // with a "Lock" button to return to customer mode.
  // DEPLOYMENT DIVERGENCE: a signed-in rep or admin starts in 'rep' (the full
  // view) because Supabase already established who they are — upstream had to
  // wait for a password. A signed-in staff user can still drop to the customer
  // view via the header pill's Lock, and that choice persists in
  // sessionStorage exactly as upstream.
  const [mode, setMode] = useState(() => {
    try {
      const raw = sessionStorage.getItem(MODE_STORAGE_KEY);
      if (!raw) return (role === 'rep' || isAdminRole) ? 'rep' : 'customer';
      const parsed = JSON.parse(raw);
      if (parsed._v !== MODE_RECORD_VERSION) {
        sessionStorage.removeItem(MODE_STORAGE_KEY);
        return (role === 'rep' || isAdminRole) ? 'rep' : 'customer';
      }
      return parsed.mode === 'rep' ? 'rep' : 'customer';
    } catch (_) { return (role === 'rep' || isAdminRole) ? 'rep' : 'customer'; }
  });
  // Persist mode through every change. 'customer' is the default so we clear
  // the key entirely rather than write the default value — keeps storage clean.
  const updateMode = (next) => {
    setMode(next);
    try {
      if (next === 'rep') {
        sessionStorage.setItem(MODE_STORAGE_KEY, JSON.stringify({
          mode: 'rep', _v: MODE_RECORD_VERSION,
        }));
      } else {
        sessionStorage.removeItem(MODE_STORAGE_KEY);
      }
    } catch (_) { /* ignore */ }
  };

  // v3-203 — unified Staff Sign-in dialog visibility. Opens from the sun-key
  // glyph (header, footer, and the maintenance gate's fixed corner). One
  // dialog for every tier: rep/maintenance passwords flip mode to 'rep';
  // admin passwords flip mode to 'rep' AND set adminAccess to their level
  // (Pat's ruling: Audit included — every staff tier sees all seven tabs).

  // Lock-confirm dialog visibility — opens when a rep clicks the "Lock"
  // button on the rep-mode pill in the header. On confirm, we reset the
  // entire calculator to defaults (Steps 1–4) and flip mode back to
  // 'customer'. Customer contact, agent, and generatedDate are preserved
  // — the rep was talking to a real lead, so their identity stays.
  //
  // The reset is necessary because rep mode exposes inputs that don't
  // exist in customer mode (panel/battery overrides, RSD, inverter
  // selections, roof material, location km, misc materials). Without a
  // reset, leftover rep-mode values would silently distort the customer-
  // mode total and produce inconsistent numbers between the two views.
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  // v3-51 maintenance-gate unlock flag. Hoisted to the top of App so it sits
  // before the early-returns for paramsLoading/admin/rep auth — React's
  // rules-of-hooks require hook order to be stable across renders.
  // gateUnlocked is a render-cycle re-trigger after the user successfully
  // enters a password (the readGatePass() check would still return false
  // on the same render that called writeGatePass without this).
  const [gateUnlocked, setGateUnlocked] = useState(false);

  // ─── Mobile Flow detection (v3-157) ────────────────────────────────────────
  // The phone-first public view activates when BOTH hold:
  //   1. narrow viewport (< 640px — tablets land above this and keep the
  //      full UI, user decision 2) AND a coarse primary pointer (a resized
  //      desktop window keeps the full UI), OR the ?view=mobile QA override
  //      (user decision 3 — lets desktop reviewers walk the flow).
  //   2. mode === 'customer' — an authenticated rep keeps the full UI even
  //      on a phone (user decision 1); the check lives at the render site.
  // Width half re-evaluates on resize/orientation; the pointer media query
  // and the query param are stable for the life of the page.
  const detectPhoneViewport = () => {
    if (typeof window === 'undefined') return false;
    try {
      if (new URLSearchParams(window.location.search).get('view') === 'mobile') return true;
    } catch (_) { /* fine */ }
    const coarse = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    return coarse && window.innerWidth < 640;
  };
  const [phoneViewport, setPhoneViewport] = useState(detectPhoneViewport);
  useEffect(() => {
    const onResize = () => setPhoneViewport(detectPhoneViewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  const handleLockConfirm = () => {
    setState(makeInitialState('all'));   // wipe Steps 1-4 to defaults
    updateMode('customer');               // flip mode (clears solviva_mode in storage)
    setAdminAccess('none');               // v3-203 — locking drops admin access too
    setLockConfirmOpen(false);
  };

  // ─── PDF generation (rep-mode only) ────────────────────────────────────────
  // Triggered from the "Generate PDF" pill button in the rep-mode tab bar
  // (right of the Schedule of Payments tab). Compiles the live state +
  // computed model + customer/agent details into an A4 proposal PDF that
  // closes with the office's standard Terms & Conditions and Warranties
  // and Coverage table. Customer acceptance is handled separately via the
  // executed Solar Photovoltaic System Contract (per office direction —
  // the PDF is informational/quoting only).
  //
  // We track `pdfGenerating` so the button can show a "Generating…" state
  // while jspdf builds the document. Generation is fast (<1s for a typical
  // 7-page output) but the button feedback prevents accidental double-clicks
  // and gives the rep a beat to confirm something happened.
  //
  // The handler reads from the same `state`/`model`/`contact`/`agent`/
  // `generatedDate`/`validUntil` that the live Calculator/Summary/Schedule
  // views render from, so the PDF is guaranteed to match what the customer
  // sees on-screen without any duplicated calculation paths.
  // ─── PDF generation with snapshot capture (v3-48) ───────────────────────
  // Page 3 ("Visualizing your system") and page 4 ("Quote Summary") render
  // as PNG snapshots of the live React components rather than re-drawn SVG.
  // The capture flow:
  //   1. Save current tab + NM state
  //   2. Switch to Calculator tab (mounts Visualizing block) + force NM on
  //   3. Wait ~400ms for Recharts to mount + measure
  //   4. html2canvas the [data-pdf-capture="visualizing"] root → PNG dataURL
  //   5. Switch to Summary tab; wait
  //   6. html2canvas the [data-pdf-capture="summary"] root → PNG dataURL
  //   7. Restore original tab + original NM state
  //   8. Call generateProposalPdf with both dataURLs
  // Whole flow runs behind the "Generating..." button state — invisible to user.
  const [pdfGenerating, setPdfGenerating] = useState(false);
  // v3-61: when the rep clicks Generate PDF with incomplete details, we open
  // the contact dialog in "required for PDF" mode. If pdfGatePending is set,
  // a successful save auto-resumes generation (see effect below).
  const [pdfGateRequired, setPdfGateRequired] = useState(false);
  const [pdfGatePending, setPdfGatePending] = useState(false);
  const handleGeneratePdf = async () => {
    if (pdfGenerating) return;
    // Hard requirement: all agent + customer fields (incl. install address)
    // must be valid. If not, open the details dialog with the missing fields
    // flagged and resume automatically once they're saved.
    if (!pdfDetailsComplete(contact, agent)) {
      setPdfGateRequired(true);
      setPdfGatePending(true);
      setEditingContacts(true);
      return;
    }
    setPdfGenerating(true);
    const originalTab = activeTab;
    try {
      const html2canvasModule = await import('html2canvas');
      const html2canvas = html2canvasModule.default || html2canvasModule;

      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const captureByAttr = async (attrValue) => {
        const el = document.querySelector(`[data-pdf-capture="${attrValue}"]`);
        if (!el) {
          console.warn(`[pdf-capture] no element matching data-pdf-capture="${attrValue}"`);
          return null;
        }
        try {
          const canvas = await html2canvas(el, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            // v3-51: skip any element with the `.no-pdf-capture` class when
            // snapshotting. Currently used by the Summary tab's
            // Expand/Collapse pill button so it doesn't appear in the PDF.
            // (The PDF still reflects whichever view — collapsed or
            // expanded — is on screen at generation time.)
            ignoreElements: (node) => node.classList?.contains('no-pdf-capture'),
          });
          return canvas.toDataURL('image/png');
        } catch (err) {
          console.error(`[pdf-capture] html2canvas failed for ${attrValue}`, err);
          return null;
        }
      };

      // Step 1-4: Calculator tab → snapshot Visualizing
      // v3-127 — NM is NO LONGER forced on for the capture (user-directed):
      // the PDF mirrors the calculator exactly. NM unchecked → 3 coverage
      // bars, no NM legend chip, no NM savings note, no CFEI/NM disclosure
      // (all already gated on-screen by nmEnabledEffective/showNm).
      setActiveTab('calculator');
      await sleep(450);
      const visualizingPng = await captureByAttr('visualizing');

      // Step 5-6: Summary tab → snapshot Summary
      // v3-117 — force the component-price reveal OFF for the snapshot: the
      // PDF never shows the per-line price breakdown, whatever an admin has
      // toggled on screen. Restored with the other state after capture.
      // v3-177 — the financing-detail reveal is force-hidden for the snapshot
      // for the same reason: page 4 must match the customer-facing Summary, so
      // the EIR and TOTAL AMOUNT DUE can never reach a proposal through an
      // admin who happened to be unlocked on screen.
      const originalPricesShown = summaryPricesShown;
      const originalFinancingShown = summaryFinancingShown;
      setSummaryPricesShown(false);
      setSummaryFinancingShown(false);
      setActiveTab('summary');
      await sleep(450);
      const summaryPng = await captureByAttr('summary');

      // Step 7: Restore
      setSummaryPricesShown(originalPricesShown);
      setSummaryFinancingShown(originalFinancingShown);
      setActiveTab(originalTab);

      // Step 8: Build PDF
      const { generateProposalPdf } = await import('../lib/pdfGenerator.js');
      await generateProposalPdf({
        state, model, contact, agent, generatedDate, validUntil,
        brand: BRAND, adminParams: ADMIN_PARAMS, disclaimers: DISCLAIMERS,
        proposalContent: PROPOSAL_CONTENT,
        snapshots: { visualizing: visualizingPng, summary: summaryPng },
      });
    } catch (err) {
      console.error('[generateProposalPdf]', err);
      // Restore on error
      setActiveTab(originalTab);
      alert('PDF generation failed: ' + (err?.message || 'unknown error') +
            '\n\nIf this keeps happening, please flag it to the dev team.');
    } finally {
      setPdfGenerating(false);
    }
  };

  // v3-61: resume (or abandon) a gate-triggered PDF once the details dialog
  // closes. If the rep completed all fields, generation resumes automatically;
  // if they cancelled with fields still missing, we just clear the pending flag.
  useEffect(() => {
    if (!pdfGatePending || editingContacts) return;
    setPdfGatePending(false);
    setPdfGateRequired(false);
    if (pdfDetailsComplete(contact, agent)) handleGeneratePdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfGatePending, editingContacts, contact, agent]);

  // If a customer-mode user somehow has activeTab === 'summary' or 'schedule'
  // (e.g. a rep was just on one of those, then locked back to customer mode),
  // bounce them to Calculator since both tabs are hidden in customer mode.
  //
  // v3-56 — also bounce when the negative-balance Step 3 state hides those
  // tabs (DP discount exceeds balance owed; Step 3C shows a yellow callout
  // asking the rep/customer to lower DP or shorten tenor). The actual effect
  // is defined just after `model` is constructed below (it depends on
  // `model.terms.negativeBalance` so it can't be hoisted above the useMemo).

  const model = useMemo(() => {
    const phase = state.phase === 3 ? 'three' : 'single';
    // v3-106 — availability forcing happens HERE, at the top of the model,
    // so every downstream consumer (pricing, schedule, annex, PDF, lead
    // payload) inherits it from one place:
    //   • RSD out of stock  → rsdEnabled forced OFF in the pricing inputs
    //     (a stale session's true can't price an unavailable device).
    //   • Panels out of stock (per phase) → recommendedPanelCount is already
    //     0 from computeRecommendedPanels; the rep's panelCount override is
    //     ALSO ignored (forced 0) below.
    //   • Batteries all out of stock → batteryKwh forced 0 below.
    const rsdInStock = ADMIN_PARAMS.rsdAvailable !== false;
    // v3-116 — a persisted session may hold a delivery-location id that has
    // since been deleted or marked out of stock. Force it back to 'luzon'
    // (v3-106 "availability never blocks the flow") so pricing, Summary, PDF
    // and the lead payload never see a dead id; the 2E Select then shows
    // Luzon main island with its region/city cascade.
    const effectiveLocation =
      state.location === 'luzon' || state.location === 'other'
        ? state.location
        : (availableDeliveryLocations(ADMIN_PARAMS).some(l => l.id === state.location)
            ? state.location : 'luzon');
    const inputs = { ...state, phase, deviceLibrary: DEVICES,
                     location: effectiveLocation,
                     rsdEnabled: rsdInStock ? state.rsdEnabled : false };
    const recommended = computeRecommendedPanels(inputs, ADMIN_PARAMS);
    const panelsAvailable = recommended.panelsAvailable !== false;
    // v3-110 — Step 2A optimization objective. 'panels' (default) keeps the
    // v3-109 pipeline BYTE-IDENTICAL: recommendation = W7 (workbook parity)
    // + the v3-71 battery auto-optimizer, untouched below. 'battery' / 'cost'
    // derive the recommendation from the optimizeSystem sweep instead. With
    // panels out of stock every mode collapses to the v3-106 zero-array path
    // (a sweep over a forced-0 array is meaningless), so sweepActive gates on
    // panelsAvailable.
    const optimizationMode =
      state.optimizationMode === 'battery' || state.optimizationMode === 'cost'
        ? state.optimizationMode : 'panels';
    // v3-130 — EVERY mode's recommendation now comes from the sweep. Mode
    // 'panels' is the sim-certified minimum array with store-all-excess
    // battery (user decision (a), reversing v3-110's "Mode 1 = W7"); W7
    // remains the panels-out-of-stock fallback and everything else it feeds.
    const sweepActive = panelsAvailable;
    // v3-136 — peaks-and-valleys sizing. hasSub7Device mirrors
    // buildHourlyCurve's row-validity gate (name + count + both times) so the
    // checkbox never renders for a row the sim would skip anyway.
    // conservativeLocked = Variant B: at a 100% target with a sub-7-day
    // device, conservative certification is FORCED — an average-week system
    // cannot deliver a true 100% (the daily cap stops light-day surplus from
    // offsetting appliance-day shortfall), so that claim must not be
    // quotable. The user's own checkbox choice is preserved in state and
    // restored when the lock releases.
    const hasSub7Device = (state.deviceRows || []).some(r =>
      r && r.deviceName && r.count && r.onTime != null && r.offTime != null
        // v3-137 — 1–6 days only: an unset/0-day row contributes zero load
        // (dwFrac 0), so it must not summon the checkbox/caveat (user-
        // reported: a fresh row with days/wk "—" fired the control).
        && (r.daysPerWeek || 0) >= 1 && (r.daysPerWeek || 0) < 7);
    const conservativeLocked =
      hasSub7Device && (state.desiredSavingsPct || 0) >= 1 - 1e-9;
    const conservativeSizing =
      hasSub7Device && (conservativeLocked || !!state.conservativeSizing);
    const recSweep = sweepActive
      ? optimizeSystem(optimizationMode, inputs, ADMIN_PARAMS, recommended,
                       { conservative: conservativeSizing })
      : null;
    const recPanelCount = recSweep ? recSweep.panelCount
                                   : recommended.recommendedPanelCount;
    const panelCount = panelsAvailable ? (state.panelCount ?? recPanelCount) : 0;
    const systemKwp = panelCount * recommended.panelWatts / 1000;
    const recInverters = recommendInverters(systemKwp, phase);
    // v3-106 — a persisted session may hold an inverter pick that has since
    // gone out of stock. State stores a COPY of the inverter object, so its
    // own `available` field is stale; match by ratedKw against the LIVE
    // in-stock list instead, and fall back to the slot's recommendation.
    const inStockKw = new Set(availableInverters(phase).map(i => i.ratedKw));
    // v3-175 — a panels-only EXPANSION order carries no inverter at all: the
    // three slots are forced empty regardless of any earlier pick, so the
    // quote can never price an inverter the customer told us they don't need.
    // This is a FLAG, not a per-slot null — null already means "use the
    // recommendation" (the fallback below), which is precisely why "— None —"
    // in the 2C dropdown could never zero a slot before this release.
    const expansionActive = !!state.expansionMode
      && (state.existingKwp || 0) > 0 && panelCount > 0;
    const effectiveInverters = expansionActive
      ? [null, null, null]
      : state.selectedInverters.map((sel, i) => {
          const chosen = sel ?? recInverters[i] ?? null;
          return (chosen && !inStockKw.has(chosen.ratedKw))
            ? (recInverters[i] ?? null)
            : chosen;
        });
    const sizing = systemSizing(panelCount, recommended.panelWatts, effectiveInverters, phase);
    const recommendedObj = { ...recommended, systemKwp, recommendedPanelCount: recPanelCount };
    const stateForBattRec = { ...inputs, panelCount, selectedInverters: effectiveInverters, batteryKwh: 0 };
    // v3-71: the battery package is now an OUTPUT of the recommendation, not
    // an input to it. Pipeline:
    //   1. Probe the hourly curve with no battery → raw daily excess solar.
    //   2. optimizeBatteryPackage() picks the package that stores ALL of
    //      that excess at the lowest total cost (units + racks + ATS +
    //      critical-loads + labor; labor branch follows hasSolar).
    //   3. recBatteryKwh = excess rounded UP to the AUTO winner's unit size
    //      — this is what the Recommended tile displays, pinned to the
    //      optimizer regardless of any rep package override.
    //   4. activeBatteryPackage = the rep's explicit pick (if any and still
    //      existing — a deleted id silently falls back to auto) else the
    //      auto winner. Pricing, the kWh ladder, and the annex all follow
    //      the ACTIVE package.
    //   5. activeRecBatteryKwh = excess re-rounded to the ACTIVE package's
    //      unit size — the "recommended value on the active ladder". It's
    //      what state.batteryKwh === null falls back to, and what the
    //      Selected tile's override/amber/snap-back logic compares against
    //      (recBatteryKwh may not exist on an overridden pack's ladder).
    // v3-106 — the optimizer + resolver already skip out-of-stock packages;
    // here we (a) require an explicit rep pick to still be IN STOCK (else it
    // silently falls back to auto, same as a deleted id), and (b) force
    // batteryKwh to 0 when EVERY package is out of stock so the placeholder
    // package's prices never reach a line item.
    const inStockBatteryPackages = availableBatteryPackages(ADMIN_PARAMS);
    const anyBatteryInStock = inStockBatteryPackages.length > 0;
    const explicitBatteryPackage = state.batteryPackageId
      ? inStockBatteryPackages.find(p => p.id === state.batteryPackageId) || null
      : null;
    let autoBatteryPackage, recBatteryKwh, activeBatteryPackage,
        activeRecBatteryKwh, batteryKwh, optimization;
    if (!sweepActive) {
      // ── Panels-out-of-stock ONLY (v3-130): every in-stock mode now takes
      //    its recommendation — battery included — from the sweep branch
      //    below, so Mode 1's certified config is exactly what the quote
      //    prices (the v3-71 recomputation could round a boundary-case
      //    battery below what the certification used).
      const dailyExcess = batteryDailyExcess(stateForBattRec, ADMIN_PARAMS, recommendedObj);
      autoBatteryPackage = optimizeBatteryPackage(ADMIN_PARAMS, dailyExcess, panelCount > 0);
      recBatteryKwh = anyBatteryInStock
        ? roundBatteryKwhToPackage(dailyExcess, autoBatteryPackage)
        : 0;
      activeBatteryPackage = explicitBatteryPackage || autoBatteryPackage;
      activeRecBatteryKwh = explicitBatteryPackage
        ? roundBatteryKwhToPackage(dailyExcess, activeBatteryPackage)
        : recBatteryKwh;
      batteryKwh = anyBatteryInStock ? (state.batteryKwh ?? activeRecBatteryKwh) : 0;
      optimization = { mode: 'panels', feasible: true, achievedPct: null,
                       targetPct: state.desiredSavingsPct };
    } else {
      // ── v3-130: ALL in-stock modes route here. 'battery'/'cost' size the
      //    battery to the TARGET; 'panels' starts from the v3-71 store-all-
      //    excess rec and steps up only at rounding boundaries — the sweep's
      //    certified config IS the recommendation, battery included.
      autoBatteryPackage = recSweep.batteryPackage
        || optimizeBatteryPackage(ADMIN_PARAMS, 0, panelCount > 0);
      recBatteryKwh = anyBatteryInStock ? recSweep.batteryKwh : 0;
      // Active recommendation adapts to live overrides — a pinned array
      // (panel override) and/or a pinned package — mirroring how the
      // mode-'panels' excess probe follows the overridden array. Re-running
      // the sweep constrained yields the recommended kWh ON THE ACTIVE
      // LADDER (activeRecBatteryKwh semantics, v3-71).
      const constrained = (panelsAvailable && state.panelCount != null)
        || explicitBatteryPackage != null;
      const activeSweep = constrained
        ? optimizeSystem(optimizationMode, inputs, ADMIN_PARAMS, recommended, {
            fixedPanelCount: (panelsAvailable && state.panelCount != null) ? panelCount : null,
            restrictPackageId: explicitBatteryPackage ? explicitBatteryPackage.id : null,
            conservative: conservativeSizing,   // v3-136 — overrides certify at the same corner
          })
        : recSweep;
      activeBatteryPackage = explicitBatteryPackage
        || activeSweep.batteryPackage
        || autoBatteryPackage;
      activeRecBatteryKwh = anyBatteryInStock ? activeSweep.batteryKwh : 0;
      batteryKwh = anyBatteryInStock ? (state.batteryKwh ?? activeRecBatteryKwh) : 0;
      // The amber notice + PDF caveat read the UNCONSTRAINED sweep — the
      // recommendation's own feasibility, not an override's.
      optimization = { mode: optimizationMode, feasible: recSweep.feasible,
                       achievedPct: recSweep.achievedPct,
                       targetPct: recSweep.targetPct };
    }
    // fullState carries the RESOLVED package id so the calc chain
    // (calculations.js resolveBatteryPackage call sites) prices the auto
    // winner without knowing the optimizer exists. Downstream consumers
    // never see a null batteryPackageId.
    const fullState = { ...inputs, panelCount, selectedInverters: effectiveInverters, batteryKwh,
                        batteryPackageId: activeBatteryPackage.id };
    const pkg = buildPackageLineItems(fullState, ADMIN_PARAMS, null);
    const terms = computePaymentTerms(fullState, ADMIN_PARAMS, pkg);
    // v3-100 — Direct Purchase IS a separate option now (v5.1 split it from the
    // 1-month tenor): tenor 0, 0% interest, no DST, balance due in full upon
    // installation. Lili's "%" column stays % of the NET PRICE; the two
    // milestones are the DP at signing and the balance upon installation.
    const dpTerms = computePaymentTerms({ ...fullState, tenor: 0 }, ADMIN_PARAMS, pkg);
    const directPurchase = {
      dpPct: fullState.downPaymentPct,
      dpAmount: dpTerms.dpTotalCharge,
      monthly: dpTerms.customerMonthlyPmt,
      total: dpTerms.summaryTotalDue,   // = totalAmountDue for a Direct Purchase (dst 0)
      rate: dpTerms.rtoRate,
      financeCharge: dpTerms.totalInterest,
    };
    const popularTenors = popularTenorsTable(fullState, ADMIN_PARAMS, pkg);
    const schedule = buildHourlyCurve(fullState, ADMIN_PARAMS, recommendedObj);
    const cashFlows = computeCashFlows(fullState, ADMIN_PARAMS, schedule, terms,
                                       recommendedObj, state.irrYears);
    // Install date is back-derived so the first post-installation payment
    // due date falls at least `minDaysToFirstPostInstallPayment` days after
    // the quote's generation date. Engineering Admin tunes this floor based
    // on Solviva's installation queue + capacity. The 15th/30th payment
    // rounding rule in buildAnnex's dueDateForMonth() can shift first-payment
    // by a few days depending on the calendar, so we walk install date
    // forward one day at a time until the rounded first-payment date clears
    // the threshold. Bounded by max+1 days as a safety guard against infinite
    // loops if the param somehow lands at a non-numeric value.
    const minDays = ADMIN_PARAMS.minDaysToFirstPostInstallPayment ?? 44;
    const targetFirstPaymentMs = generatedDate.getTime() + minDays * 86400000;
    const installDate = new Date(generatedDate);
    installDate.setDate(installDate.getDate() + 14);  // seed: prior hardcoded value
    for (let guard = 0; guard < 200; guard++) {
      const candidateFirst = firstPostInstallDueDate(installDate);
      if (candidateFirst.getTime() >= targetFirstPaymentMs) break;
      installDate.setDate(installDate.getDate() + 1);
    }
    const annex = buildAnnex(fullState, ADMIN_PARAMS, terms, installDate);
    return {
      recommended, recPanelCount, panelCount, systemKwp,
      recInverters, effectiveInverters, sizing, expansionActive,
      recBatteryKwh, batteryKwh, activeBatteryPackage,
      autoBatteryPackage, activeRecBatteryKwh,
      // v3-110 — the Step 2A objective + the sweep's feasibility verdict
      // (drives the amber notice, the PDF disclosure line, and the lead
      // payload). mode 'panels' is always feasible:true / achievedPct null.
      optimizationMode, optimization,
      // v3-136 — peaks-and-valleys sizing. `conservativeSizing` is the
      // EFFECTIVE value (state OR the 100%-target Variant-B lock);
      // `conservativeLocked` drives the disabled checkbox + lock copy;
      // `hasSub7Device` gates the whole control (hidden when every device
      // runs 7 days — the corners equal the average day). Consumed by the
      // Step 2A checkbox block, the PDF disclosure suffix, and the lead
      // payload.
      hasSub7Device, conservativeSizing, conservativeLocked,
      // v3-106 — stock flags for the Step 2 UI (out-of-stock notices).
      panelsAvailable, anyBatteryInStock, rsdInStock,
      pkg, terms, popularTenors, directPurchase, schedule, cashFlows, annex, installDate,
    };
  }, [state, generatedDate, paramsRev]);

  // v3-56 — auto-bounce away from Summary/Schedule tabs when they're hidden.
  // Two triggers:
  //   1. mode === 'customer' (Summary + Schedule are rep-only) — e.g. a rep
  //      was just on one of those tabs, then locked back to customer mode.
  //   2. model.terms.negativeBalance (DP discount exceeds balance owed) —
  //      the tabs disappear from the tab strip; if the rep was already
  //      viewing one of them when they changed Step 3 inputs to trigger
  //      this state, land them back on Calculator where the 3C callout
  //      explains what to adjust.
  // v3-117 — Summary + Schedule are PUBLIC (user decision 1): the
  // customer-mode trigger is gone; only the negativeBalance bounce remains
  // (the tabs still hide when the math would render nonsense).
  // v3-203 — a THIRD trigger: the four admin tab ids are valid activeTab
  // values only while adminAccess !== 'none'. If access drops while an admin
  // tab is showing (admin Sign out, or the header Lock), land on Calculator.
  useEffect(() => {
    if (model.terms.negativeBalance &&
        (activeTab === 'summary' || activeTab === 'schedule')) {
      setActiveTab('calculator');
    }
    // Bounce off the admin tabs only when the user holds no admin access at
    // all. Per-tab gating is deliberately absent (v3-203 D2): every admin tier
    // may OPEN every admin tab; what differs is whether its sections are
    // editable or read-only.
    if (adminAccess === 'none' && ADMIN_TAB_IDS.includes(activeTab)) {
      setActiveTab('calculator');
    }
  }, [activeTab, model.terms.negativeBalance, adminAccess]);

  const resetStep1 = () => setState(s => ({ ...s, ...makeInitialState('step1') }));
  const resetStep2 = () => setState(s => ({ ...s, ...makeInitialState('step2') }));
  const resetStep3 = () => setState(s => ({ ...s, ...makeInitialState('step3') }));
  const updateState = (patch) => setState(s => ({ ...s, ...patch }));

  const today = new Date();
  const quoteExpired = today > validUntil;

  // v3-203 — one sign-in path for every staff tier (D1). v3-205 remade it
  // as a VIEW SWITCHER (Pat): the key is always visible and whichever
  // password is submitted is the view you get. 'rep' also CLEARS admin
  // access — entering the rep password from an admin view is the
  // return-to-rep-view path with all calculator inputs intact.
  // v3-207 — the v3-205 empty-submit → public exit is REMOVED (Pat): the
  // retained "Go back to Public View" pill is the sole public exit, so the
  // key switches between staff views only and the dialog never reports
  // 'public'. Admin "Sign out" (AdminShell) still drops admin access and
  // keeps rep mode; the bounce effect walks the user off a hidden admin tab.
  // DEPLOYMENT DIVERGENCE: upstream's staff-key password dialog
  // (handleStaffKeyClick / handleStaffAuth) is removed — Supabase decides the
  // tier at sign-in, so there is nothing to re-enter. AdminShell's "Sign out"
  // therefore signs the user out of Supabase entirely rather than merely
  // dropping adminAccess in memory.
  const handleAdminLogout = () => { onSignOut(); };

  // Show a brief loading screen while parameters fetch on first load.
  // Without this, customers might see stale defaults for a flash before
  // server overrides take effect — confusing if a price has been changed.
  if (paramsLoading) {
    return (
      <div style={styles.app}>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column', gap: 12,
        }}>
          <img src="/logo-sun-v2.png" alt="Solviva" width="48" height="48"
               style={{ opacity: 0.7 }} />
          <div style={{ fontSize: 13, color: '#6B7280' }}>Loading…</div>
        </div>
      </div>
    );
  }

  // DEPLOYMENT DIVERGENCE: upstream v3-203's unified staff sign-in dialog is
  // removed here — <Login /> in the auth wrapper above is the single sign-in
  // surface, and admin content still renders as tabs inside the main layout
  // (v3-203 D2/D3), so Calculator / Summary / Schedule stay visible throughout.

  // Maintenance-mode gate (v3-51). Three-signal activation, same as v3-50
  // ContactGate's passwordRequired derivation:
  //   1. AUTH.testingPassword set (VITE_MAINTENANCE_PASSWORD present)
  //   2. ADMIN_PARAMS.gateAuthEnabled === true (admin toggle on)
  //   3. sessionStorage GATE_PASS_KEY === '1' is NOT set (no in-session auth)
  // The customer-data-collection form that used to gate access in v3-50 is
  // GONE — customers land directly on the calculator when maintenance mode
  // is off. The Header's "Edit contact details" button stays available so
  // a rep can capture customer info later if needed (defaults to empty).
  // gateUnlocked state is declared at the top of App alongside other hooks.
  // v3-203 — adminAccess bypass: the old admin branch rendered BEFORE this
  // gate, so an authenticated admin always reached the admin pages during
  // maintenance. Same reach now that admin lives inside the main layout.
  // No security delta: every admin password is already in the gate's own
  // accept set. Plain rep mode does NOT bypass (unchanged — reps unlock the
  // gate itself, which takes the same passwords).
  const passwordRequired = !!AUTH.testingPassword
                        && (ADMIN_PARAMS.gateAuthEnabled ?? true)
                        && !readGatePass()
                        && !gateUnlocked
                        && adminAccess === 'none';
  if (passwordRequired) {
    return (
      <>
        <MaintenanceGate
          onUnlock={() => setGateUnlocked(true)}
          agent={agent}
          brand={BRAND}
        />
        <FooterFixed onSignOut={onSignOut} />
      </>
    );
  }

  // ─── Mobile Flow (v3-157) — the phone-first public view ────────────────────
  // Customer mode only: an authenticated rep keeps the full UI on any device
  // (user decision 1). Sits AFTER the maintenance gate and admin routes so
  // both still apply on phones, and after the staffAuthOpen early return so
  // the flow's "Sales rep? Sign in" link opens the same AuthDialog.
  if (mode === 'customer' && phoneViewport) {
    return (
      <MobileFlow
        state={state}
        updateState={updateState}
        model={model}
        adminParams={ADMIN_PARAMS}
        contact={contact}
        setContact={setContact}
      />
    );
  }

  return (
    <div style={styles.app}>
      <Header brand={BRAND} contact={contact} setContact={setContact}
              agent={agent} updateAgent={updateAgent}
              generatedDate={generatedDate} validUntil={validUntil}
              quoteExpired={quoteExpired}
              editing={editingContacts} setEditing={setEditingContacts}
              requireForPdf={pdfGateRequired}
              mode={mode} onLockMode={() => setLockConfirmOpen(true)}
              adminAccess={adminAccess}
              onSignOut={onSignOut}
              leadState={state} leadModel={model} />
      <LandscapeReminder />
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab} mode={mode}
            adminAccess={adminAccess}
            negativeBalance={model.terms.negativeBalance}
            onGeneratePdf={handleGeneratePdf} pdfGenerating={pdfGenerating} />
      <main className="app-main" style={styles.main}>
        {activeTab === 'calculator' && (
          <Calculator state={state} updateState={updateState} model={model}
                      adminParams={ADMIN_PARAMS} disclaimers={DISCLAIMERS}
                      mode={mode}
                      resetStep1={resetStep1} resetStep2={resetStep2} resetStep3={resetStep3}
                      onContactRep={() => {
                        // v3-98 — the contact form renders inside the header at
                        // the TOP of the page. A customer clicking the Step 2A
                        // link is scrolled down mid-page, so without this the
                        // form opens above the viewport and the click looks dead.
                        setEditingContacts(true);
                        if (typeof window !== 'undefined') {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }} />
        )}
        {activeTab === 'summary' && !model.terms.negativeBalance && (
          <Summary state={state} model={model} adminParams={ADMIN_PARAMS}
                   updateState={updateState}
                   contact={contact} agent={agent}
                   generatedDate={generatedDate} validUntil={validUntil}
                   pricesShown={summaryPricesShown}
                   onPricesShown={setSummaryPricesShown}
                   financingShown={summaryFinancingShown}
                   onFinancingShown={setSummaryFinancingShown} />
        )}
        {activeTab === 'schedule' && !model.terms.negativeBalance && (
          <Schedule model={model} state={state}
                    contact={contact} generatedDate={generatedDate} />
        )}
        {/* v3-203 (D3) — the four admin surfaces render HERE, inside the same
            main container as the calculator tabs, instead of the deleted
            full-page admin branch. MaintenanceModeBlock stays visible on all
            four admin tabs (v3-54 placement, one level down). AdminShell
            props carried over unchanged, incl. the v3-178 RESOLVED panel
            count (model.panelCount, never state.panelCount). */}
        {adminAccess !== 'none' && ADMIN_TAB_IDS.includes(activeTab) && (
          <>
            <MaintenanceModeBlock
              accessLevel={adminAccess}
              savingDisabled={!paramsLoadedFromServer}
            />
            <AdminShell
              tab={activeTab}
              accessLevel={adminAccess}
              onLogout={handleAdminLogout}
              savingDisabled={!paramsLoadedFromServer}
              calcPanelCount={model.panelCount}
            />
          </>
        )}
      </main>
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab} mode={mode}
            adminAccess={adminAccess}
            negativeBalance={model.terms.negativeBalance}
            position="bottom" />
      {/* v3-123 — spacer keeps the tab strip + page end visible above the
          fixed LiveTotalBar at full scroll.
          v3-124 — the bar now shows on ALL tabs (user-directed; was
          Calculator-only). On Summary/Schedule a tap first switches back to
          the Calculator, then scrolls to Step 3 once the anchor exists.
          Still hidden under negativeBalance and from PDF snapshots.
          v3-203 — hidden on the four ADMIN tabs (parity with the deleted
          admin branch, which never had the bar; a quote total floating over
          parameter editors would also collide with AdminShell's own save
          affordances). */}
      {!model.terms.negativeBalance && !ADMIN_TAB_IDS.includes(activeTab) && (
        <>
          <div className="live-total-spacer" aria-hidden="true" />
          <LiveTotalBar
            terms={model.terms}
            cashFlows={model.cashFlows}
            irrYears={state.irrYears}
            utilityRate={state.utilityRate}
            onJumpToPricing={() => {
              const jump = () => {
                const el = document.getElementById('step3-pricing');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              };
              if (activeTab !== 'calculator') {
                setActiveTab('calculator');
                setTimeout(jump, 80);   // let the Calculator mount first
              } else {
                jump();
              }
            }}
          />
        </>
      )}
      <Footer brand={BRAND}
              mode={mode} adminAccess={adminAccess}
              onSignOut={onSignOut} />
      {lockConfirmOpen && (
        <ConfirmDialog
          title="Return to customer view?"
          message="This will reset the calculator (Steps 1–4) so the customer view starts from scratch. Customer contact details and agent info will be kept."
          confirmLabel="Reset & lock"
          cancelLabel="Stay in staff mode"
          onConfirm={handleLockConfirm}
          onCancel={() => setLockConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function Header({ brand, contact, setContact, agent, updateAgent, adminAccess,
                  generatedDate, validUntil, quoteExpired,
                  editing, setEditing, requireForPdf,
                  mode, onLockMode, onSignOut, leadState, leadModel }) {
  const fmt = (d) => d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  // Supabase account controls (this deployment only).
  const [showChangePw, setShowChangePw] = useState(false);

  if (editing) {
    return (
      <header style={styles.header}>
        <div className="header-inner" style={{ ...styles.headerInner, alignItems: 'flex-start' }}>
          <img src="/logo-full-v2.png" alt="Solviva Energy" style={styles.logo} className="header-logo" />
          <div style={{ flex: 1 }}>
            <ContactEditForm
              contact={contact} setContact={setContact}
              agent={agent} updateAgent={updateAgent}
              mode={mode} requireAll={requireForPdf}
              leadState={leadState} leadModel={leadModel}
              onDone={() => setEditing(false)}
            />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header style={styles.header}>
      <div className="header-inner" style={styles.headerInner}>
        <img src="/logo-full-v2.png" alt="Solviva Energy" style={styles.logo} className="header-logo" />
        <div className="header-meta" style={styles.headerMeta}>
          <div style={styles.metaRow}>
            <strong>Quote for:</strong> {contact.name || '—'}
            {contact.email && <><span style={styles.metaSep}>·</span><span style={styles.metaMuted}>{contact.email}</span></>}
            {contact.mobile && <><span style={styles.metaSep}>·</span><span style={styles.metaMuted}>{contact.mobile}</span></>}
          </div>
          <div style={styles.metaRow}>
            {agent.name ? (
              <>
                <strong>Solviva Agent:</strong> {agent.name}
                {agent.email && <><span style={styles.metaSep}>·</span><span style={styles.metaMuted}>{agent.email}</span></>}
                {agent.phone && <><span style={styles.metaSep}>·</span><span style={styles.metaMuted}>{agent.phone}</span></>}
              </>
            ) : (
              <>
                <strong>Solviva Customer Support:</strong>
                {agent.email && <><span style={styles.metaSep}>·</span><span style={styles.metaMuted}>{agent.email}</span></>}
                {agent.phone && <><span style={styles.metaSep}>·</span><span style={styles.metaMuted}>{agent.phone}</span></>}
              </>
            )}
          </div>
          <div style={styles.metaRow}>
            <span style={styles.metaMuted}>Generated {fmt(generatedDate)}</span>
            <span style={styles.metaSep}>·</span>
            <span style={quoteExpired ? styles.metaExpired : styles.metaMuted}>
              {quoteExpired ? 'EXPIRED' : `Valid until ${fmt(validUntil)}`}
            </span>
          </div>
        </div>
        <div className="header-actions" style={styles.headerActions} data-no-print="true">
          {mode === 'rep' && onLockMode && (
            <button onClick={onLockMode}
                    style={styles.repPillBtn}
                    title="Return to customer view"
                    aria-label="Go back to Public View">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round"
                   aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Go back to Public View
            </button>
          )}
          {/* DEPLOYMENT DIVERGENCE: upstream v3-203/205 put a staff-key glyph
              here that opened the shared-password dialog. Under Supabase the
              tier is already known, so the slot carries account controls —
              change password and sign out — instead of a view switcher. */}
          {onSignOut && (
            <button
              onClick={() => setShowChangePw(true)}
              style={styles.signOutBtn}
              title="Change password"
            >
              Change password
            </button>
          )}
          {onSignOut && (
            <button
              onClick={onSignOut}
              style={styles.signOutBtn}
              title="Sign out"
            >
              Sign out
            </button>
          )}
          <button onClick={() => setEditing(true)} style={styles.editBtn}>
            {mode === 'customer' ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                     strokeLinejoin="round" aria-hidden="true"
                     style={{ verticalAlign: '-2px', marginRight: 6 }}>
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                Talk to a Solviva Rep
              </>
            ) : (
              <>✎ Edit contact details</>
            )}
          </button>
        </div>
      </div>
      {showChangePw && <ChangePasswordDialog onClose={() => setShowChangePw(false)} />}
    </header>
  );
}

// Inline edit form shown when editing is true. Lets agents correct typos
// and lets the agent fill in their own contact info.
//
// v3-52: agent block is now REP-MODE-ONLY. In customer view, only the
// customer details block is shown — customers shouldn't be able to edit
// Solviva's agent identity (it's not their data). Save validation also
// loosened: previously required all-three-agent-fields-empty OR
// all-three-filled, which TRAPPED reps because the config defaults
// pre-populated agent email + phone but not name, leaving the form in
// a permanently unsavable state. Now `canSave = customerValid` alone;
// the customer-facing render already handles agent.name === '' by
// falling back to "Solviva Customer Support" automatically.
function ContactEditForm({ contact, setContact, agent, updateAgent, mode, requireAll = false,
                           leadState, leadModel, onDone }) {
  const [draftCustomer, setDraftCustomer] = useState(contact);
  const [draftAgent, setDraftAgent] = useState(agent);
  // When the form is opened by the PDF gate (requireAll), surface validation
  // immediately so the rep can see exactly which fields are missing.
  const [showErrors, setShowErrors] = useState(requireAll);
  const isCustomer = mode === 'customer';

  // v3-97 — the "talk to a Solviva rep" lead flow: a customer opening the form
  // via the header button or the Step 2A link (never the rep editor, never the
  // PDF gate). It shows the reminder + a required DPA consent checkbox, requires
  // the install address, and submits a lead to Solviva instead of just saving.
  const isLeadFlow = isCustomer && !requireAll;
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('idle'); // idle | sending | sent | error

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

  // Per-field validity (used for inline error styling).
  const err = {
    custName:  !draftCustomer.name?.trim(),
    custEmail: !validEmail(draftCustomer.email),
    custMobile: !isValidPhPhone(draftCustomer.mobile),
    // Install address is required at the PDF gate AND in the lead flow (it's the
    // authoritative "where" Solviva receives); optional for ordinary rep edits.
    custAddress: (requireAll || isLeadFlow) && !draftCustomer.installAddress?.trim(),
    agentName:  !draftAgent.name?.trim(),
    agentEmail: !validEmail(draftAgent.email),
    agentPhone: !isValidPhPhone(draftAgent.phone),
  };

  const customerValid = !err.custName && !err.custEmail && !err.custMobile && !err.custAddress;
  // Agent details are required only when the PDF gate opened this form.
  const agentValid = !requireAll || isCustomer
    || (!err.agentName && !err.agentEmail && !err.agentPhone);
  // The lead flow additionally requires DPA consent.
  const canSave = customerValid && agentValid && (!isLeadFlow || consentGiven);

  const save = async () => {
    if (!canSave) { setShowErrors(true); return; }
    setContact(draftCustomer);
    // Only persist agent edits in rep mode — customer mode doesn't render
    // the agent block, so draftAgent === agent (initial value) and this
    // is a no-op, but the explicit guard makes intent clear.
    if (!isCustomer) updateAgent(draftAgent);

    // v3-97 — the lead flow submits to Solviva rather than just closing.
    if (isLeadFlow) {
      setSubmitStatus('sending');
      try {
        const now = new Date();
        const payload = buildLeadPayload({
          state: leadState,
          model: leadModel,
          contact: draftCustomer,
          submittedAt: now.toISOString(),
          reference: makeLeadRef(now, draftCustomer),
          adminParams: ADMIN_PARAMS,   // v3-125 — dynamic-location labels
        });
        await submitLead(payload);
        setSubmitStatus('sent');   // show the success panel; onDone on "Done"
      } catch (_) {
        setSubmitStatus('error');  // let them retry
      }
      return;
    }

    onDone();
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 600, color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4,
  };
  const inputStyle = {
    fontSize: 13, padding: '7px 10px', width: '100%',
    border: '1px solid #9DB7DD', borderRadius: 6, backgroundColor: '#DBEAFE',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
  // Red outline + tint when a field is invalid and errors are being shown.
  const inp = (isErr) => (showErrors && isErr)
    ? { ...inputStyle, border: '1px solid #DC2626', backgroundColor: '#FEF2F2' }
    : inputStyle;
  const errMsg = (isErr, text) => (showErrors && isErr)
    ? <span style={{ fontSize: 10.5, color: '#DC2626', marginTop: 3, display: 'block' }}>{text}</span>
    : null;
  const groupTitle = {
    fontSize: 12, fontWeight: 700, color: '#25543A', textTransform: 'uppercase',
    letterSpacing: 0.7, margin: '0 0 8px',
  };

  // v3-97 — success confirmation after a lead is submitted. Replaces the form.
  if (isLeadFlow && submitStatus === 'sent') {
    return (
      <div style={{
        background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8,
        padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: '#DCFCE7',
          color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }} aria-hidden="true">✓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
            Thanks — your request is on its way to Solviva.
          </div>
          <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.55 }}>
            A representative will reach out using the details you provided.
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={onDone}
                    style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600,
                             background: '#25543A', border: 'none', borderRadius: 6,
                             color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
    {isLeadFlow && (
      <div style={{
        background: '#F7F4ED', borderLeft: '3px solid #25543A',
        borderRadius: '4px 8px 8px 4px', padding: '12px 16px', marginBottom: 16,
        fontSize: 13, color: '#25543A', lineHeight: 1.6,
      }}>
        Talk to a Solviva representative — complete your contact details and proposed
        installation address below. The calculator settings you've chosen (panels, battery,
        inverter, and payment terms) are sent along so your rep can pick up where you left
        off, so it's worth a quick check that what the calculator shows is what you want.
        A Solviva representative will reach out using the details below.
      </div>
    )}
    {requireAll && (
      <div style={{
        background: '#FEF3C7', border: '1px solid #FBBF24', borderRadius: 6,
        padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#92400E',
        fontWeight: 600,
      }}>
        Complete all agent and customer details below — including the installation
        address — to generate the PDF proposal. The PDF will resume automatically once saved.
      </div>
    )}
    <div className="contact-edit-grid" style={{
      display: 'grid',
      // v3-52: customer mode hides the agent block, so the grid collapses
      // to a single column. Otherwise the Customer Details block would sit
      // cramped on the left half with dead space on the right.
      gridTemplateColumns: isCustomer ? '1fr' : '1fr 1fr',
      gap: 24,
    }}>
      <div>
        <div style={groupTitle}>Customer details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span style={labelStyle}>Name</span>
            <input style={inp(err.custName)} value={draftCustomer.name}
                   onChange={e => setDraftCustomer({ ...draftCustomer, name: e.target.value })}
                   placeholder="Juan dela Cruz" />
            {errMsg(err.custName, 'Customer name is required.')}
          </div>
          <div>
            <span style={labelStyle}>Email</span>
            <input style={inp(err.custEmail)} type="email" value={draftCustomer.email}
                   onChange={e => setDraftCustomer({ ...draftCustomer, email: e.target.value })}
                   placeholder="1ofthecross@jerusalem.com" />
            {errMsg(err.custEmail, 'Enter a valid email address.')}
          </div>
          <div>
            <span style={labelStyle}>Mobile number</span>
            <input style={inp(err.custMobile)} type="tel" value={draftCustomer.mobile}
                   onChange={e => setDraftCustomer({ ...draftCustomer, mobile: formatPhPhone(e.target.value) })}
                   placeholder="0917-867-5309" />
            {errMsg(err.custMobile, 'Enter a valid PH mobile number.')}
          </div>
          <div>
            <span style={labelStyle}>Proposed installation address</span>
            <textarea style={{ ...inp(err.custAddress), minHeight: 54, resize: 'vertical' }}
                   value={draftCustomer.installAddress || ''}
                   onChange={e => setDraftCustomer({ ...draftCustomer, installAddress: e.target.value })}
                   placeholder="Unit/house no., street, barangay, city, province, ZIP" />
            {errMsg(err.custAddress, 'Installation address is required for the proposal.')}
          </div>
        </div>
      </div>

      {/* v3-52: Solviva Agent block is REP-MODE-ONLY. Customers shouldn't
          be able to edit Solviva's agent identity — it's not their data.
          v3-61: when opened by the PDF gate (requireAll) the agent fields
          become required and are no longer labelled "optional". */}
      {!isCustomer && (
      <div>
        <div style={groupTitle}>Solviva Agent details{requireAll ? '' : ' (optional)'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <span style={labelStyle}>Name</span>
            <input style={inp(requireAll && err.agentName)} value={draftAgent.name}
                   onChange={e => setDraftAgent({ ...draftAgent, name: e.target.value })}
                   placeholder="Customer Service" />
            {requireAll && errMsg(err.agentName, 'Agent name is required.')}
          </div>
          <div>
            <span style={labelStyle}>Email</span>
            <input style={inp(requireAll && err.agentEmail)} type="email" value={draftAgent.email}
                   onChange={e => setDraftAgent({ ...draftAgent, email: e.target.value })}
                   placeholder="agent@solvivaenergy.com" />
            {requireAll && errMsg(err.agentEmail, 'Enter a valid email address.')}
          </div>
          <div>
            <span style={labelStyle}>Mobile</span>
            <input style={inp(requireAll && err.agentPhone)} type="tel" value={draftAgent.phone}
                   onChange={e => setDraftAgent({ ...draftAgent, phone: formatPhPhone(e.target.value) })}
                   placeholder="0917-123-4567" />
            {requireAll && errMsg(err.agentPhone, 'Enter a valid PH mobile number.')}
          </div>
        </div>
        {!requireAll && (
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6, fontStyle: 'italic' }}>
            If left blank, customers will see Solviva Customer Support's contact info instead.
            Cleared when this browser session ends.
          </div>
        )}
      </div>
      )}

      {isLeadFlow && (
        <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                          fontSize: 12.5, color: '#374151', lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={consentGiven}
                   onChange={e => setConsentGiven(e.target.checked)}
                   style={{ marginTop: 2, width: 16, height: 16, accentColor: '#25543A',
                            cursor: 'pointer', flexShrink: 0 }} />
            <span>{LEAD_CONSENT_TEXT}</span>
          </label>
          {showErrors && !consentGiven && (
            <span style={{ fontSize: 10.5, color: '#DC2626', marginTop: 4, display: 'block', paddingLeft: 26 }}>
              Please agree before submitting.
            </span>
          )}
        </div>
      )}

      {isLeadFlow && submitStatus === 'error' && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#B91C1C',
                      background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6,
                      padding: '8px 12px' }}>
          Couldn't send your request just now. Please try again in a moment.
        </div>
      )}

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onDone}
                style={{ padding: '8px 16px', fontSize: 13, background: 'transparent',
                         border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151',
                         cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
        {(() => {
          const sending = submitStatus === 'sending';
          const disabled = !canSave || sending;
          const label = isLeadFlow
            ? (sending ? 'Sending…' : submitStatus === 'error' ? 'Try again' : 'Send to Solviva')
            : (requireAll ? 'Save & generate PDF' : 'Save changes');
          return (
            <button onClick={save} disabled={disabled}
                    style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600,
                             background: disabled ? '#9CA3AF' : '#25543A', border: 'none',
                             borderRadius: 6, color: 'white', cursor: disabled ? 'not-allowed' : 'pointer',
                             fontFamily: 'inherit' }}>
              {label}
            </button>
          );
        })()}
      </div>
    </div>
    </div>
  );
}

// v3-177 — the bar's first cell is now TOTAL PRICE, not Total Amount Due.
// Everything below about placement, visibility and the other four cells still
// holds; only the leading figure and its label changed.
// v3-123 — live Total Amount Due bar (user-approved mockup + decisions A-D):
// pinned to the BOTTOM viewport edge on the Calculator tab in BOTH modes;
// shows the DST-inclusive summaryTotalDue ALONE (no monthly subtext); tap
// scrolls to Step 3 · Pricing; hidden on Summary/Schedule (redundant — the
// figure is the page content there), under negativeBalance (nonsense math),
// and from PDF snapshots (.no-pdf-capture). Reads terms live from the model,
// so it reprices on every input change for free. A spacer in the document
// flow (rendered by App alongside this bar) keeps the bottom tab strip and
// page content from hiding underneath the fixed bar at full scroll.
// v3-128 — the bar now carries TWO live figures (user-directed): Total
// Amount Due (left) and Total Savings Over {irrYears} Years (right) —
// cashFlows.totalDuSavings, the same Schedule!Z46-parity cumulative figure
// Step 4 displays, over the same customer-adjustable horizon. Both reprice
// on every input change.
function LiveTotalBar({ terms, cashFlows, irrYears, utilityRate, onJumpToPricing }) {
  // v3-161 — FIVE live figures: IRR added between Payback and Cost/kWh,
  // mirroring Step 4's Payback → IRR → LCOE ordering (user-directed).
  // v3-129 — FOUR live figures (user-approved mockup incl. the bold utility
  // rate): Total Amount Due · Payback Period · System Cost/kWh vs the
  // customer's OWN utility rate (1B, not hardcoded) · Savings over the
  // Step-4 horizon. 2×2 on narrow viewports via .live-total-grid CSS.
  // v3-177 — the first cell was the DST-inclusive Total Amount Due. It is now
  // the TOTAL PRICE, reading `terms.netDirectPrice` for the same reason the
  // Step 3E card does: netDirectPrice === totalDirect when no promo code is
  // applied, and IS the discounted figure when one is, so user decision 1(b)
  // needs no branch. There is no sub-line here to name a discount — the number
  // simply moves when a code is entered, which is the correct behaviour.
  const total = terms.netDirectPrice;
  if (!(total > 0)) return null;
  const pm = cashFlows?.paybackMonths;
  const payback = Number.isFinite(pm)
    ? (() => {
        const y = Math.floor(pm / 12), mo = pm - y * 12;
        return y === 0 ? `${mo} mos`
             : mo === 0 ? `${y} yr${y === 1 ? '' : 's'}`
             : `${y} yr${y === 1 ? '' : 's'} ${mo} mos`;
      })()
    : '\u2014';
  const lcoe = cashFlows?.lcoe;
  const irr = cashFlows?.irr;   // v3-161 — fifth cell, mirroring Step 4's order
  const savings = cashFlows?.totalDuSavings;
  const rate = Number(utilityRate);
  return (
    <div
      className="no-pdf-capture live-total-grid"
      role="button"
      tabIndex={0}
      onClick={onJumpToPricing}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onJumpToPricing(); }}
      title="Jump to Step 3 · Pricing"
      style={styles.liveTotalBar}
    >
      <span className="live-total-cell" style={styles.liveTotalCell}>
        <span style={styles.liveTotalLabel}>Your Total<br />Price</span>
        <span style={styles.liveTotalValue}>{fmt.peso(total)}</span>
      </span>
      <span className="live-total-cell" style={styles.liveTotalCell}>
        <span style={styles.liveTotalLabel}>Your Payback<br />Period</span>
        <span style={styles.liveTotalValue}>{payback}</span>
      </span>
      <span className="live-total-cell" style={styles.liveTotalCell}>
        <span style={styles.liveTotalLabel}>Your Annual<br />Return (IRR)</span>
        <span style={styles.liveTotalValue}>{irr != null ? fmt.pct(irr, 1) : '\u2014'}</span>
      </span>
      <span className="live-total-cell" style={styles.liveTotalCell}>
        <span style={styles.liveTotalLabel}>
          Your System's Cost/kWh vs<br />
          <strong style={styles.liveTotalRateBold}>
            {'\u20B1'}{Number.isFinite(rate) ? rate.toFixed(2) : '\u2014'}
          </strong>{' '}to Utility
        </span>
        <span style={styles.liveTotalValue}>
          {fmt.pesoCents(lcoe)}
          <span style={styles.liveTotalUnit}> /kWh</span>
        </span>
      </span>
      <span className="live-total-cell" style={styles.liveTotalCell}>
        <span style={styles.liveTotalLabel}>Your Savings<br />Over {irrYears} Years</span>
        <span style={styles.liveTotalValue}>{savings > 0 ? fmt.peso(savings) : '\u2014'}</span>
      </span>
    </div>
  );
}

function Tabs({ activeTab, setActiveTab, mode, position = 'top',
                adminAccess = 'none',
                negativeBalance, onGeneratePdf, pdfGenerating }) {
  // Summary AND Schedule tabs are rep-only — in customer mode the formal
  // line-item quote (Summary) AND the year-by-year payment schedule are both
  // hidden so the rep follows up with the detailed breakdown after lead capture.
  //
  // v3-56 — even in rep mode, both tabs are hidden when terms.negativeBalance
  // is true (DP discount exceeds balance owed; Step 3 monthly payment would
  // be negative). The downstream consumers (Summary line items, Schedule of
  // Payments rows, ANNEX early-payoff math) all derive from terms and would
  // produce nonsense. Hiding the tabs forces the rep back to Step 3 where
  // the yellow 3C callout suggests lowering DP or shortening tenor.
  // v3-117 — Summary + Schedule are public (user decision 1); only the
  // negativeBalance guard hides them now. Generate PDF stays REP-ONLY
  // (user decision A) via showPdfBtn below.
  const quoteTabsAvailable = !negativeBalance;
  // v3-203 (D2) — ONE strip for everything. The four admin tabs join the
  // three calculator tabs (after a hairline divider) whenever ANY admin tier
  // is signed in — deliberately not role-gated, same visibility model as the
  // deleted AdminTabs (v3-54: every admin role sees all four tabs; the
  // sections gate themselves read-only). Labels render in the brand gold so
  // the settings group reads apart from the quote group at a glance.
  const tabs = [
    { id: 'calculator', label: 'Calculator' },
    ...(quoteTabsAvailable ? [
      { id: 'summary', label: 'Summary' },
      { id: 'schedule', label: 'Schedule of Payments' },
    ] : []),
    // v3-203 (D2) — every admin tier sees ALL FOUR admin tabs; the strip is
    // deliberately NOT role-gated (same model as the deleted AdminTabs, v3-54).
    // Access control happens one level down: each tab renders every section,
    // and sections outside the role's allowlist come up READ-ONLY via
    // canEditAdminSection() / canEditInventory(). So Engineering can read the
    // Product and FinCo tabs but not edit them, and vice versa. The backend
    // re-enforces the same allowlist on PUT /api/parameters, so read-only here
    // is a UI affordance over a real server-side boundary, not the boundary.
    ...(adminAccess !== 'none' ? ADMIN_TAB_META : []),
  ];
  const navStyle = position === 'bottom' ? styles.tabsBottom : styles.tabs;
  const tabBaseStyle = position === 'bottom' ? styles.tabBottom : styles.tab;
  const tabActiveStyle = position === 'bottom' ? styles.tabActiveBottom : styles.tabActive;
  const tabAdminActiveStyle = position === 'bottom'
    ? styles.tabAdminActiveBottom : styles.tabAdminActive;
  // Generate PDF button is rep-only and rendered only on the TOP tab bar
  // (not duplicated at the bottom — would clutter and the top is where the
  // rep's eye returns when navigating between tabs). v3-56 — disabled when
  // negativeBalance is true (PDF compiles Summary + Schedule pages, both of
  // which would render nonsense from the negative-monthly math).
  const showPdfBtn = mode === 'rep' && position === 'top' && onGeneratePdf;
  const pdfDisabled = pdfGenerating || negativeBalance;
  const pdfTitle = negativeBalance
    ? 'PDF unavailable — adjust the Step 3 down payment or tenor so the balance is positive.'
    : 'Generate a PDF proposal compiling all three tabs plus the standard Terms & Conditions and Warranties';
  const firstAdminIdx = tabs.findIndex(t => t.admin);
  return (
    <nav style={navStyle}>
      <div className="tabs-inner" style={styles.tabsInner}>
        {tabs.map((t, i) => (
          <React.Fragment key={t.id}>
            {i === firstAdminIdx && (
              <span style={styles.tabGroupDivider} aria-hidden="true" />
            )}
            <button onClick={() => setActiveTab(t.id)}
                    className="tab-btn"
                    style={{
                      ...tabBaseStyle,
                      ...(t.admin ? styles.tabAdmin : {}),
                      ...(activeTab === t.id
                        ? (t.admin ? tabAdminActiveStyle : tabActiveStyle)
                        : {}),
                    }}>
              {t.label}
            </button>
          </React.Fragment>
        ))}
        {showPdfBtn && (
          <button onClick={onGeneratePdf}
                  disabled={pdfDisabled}
                  className="generate-pdf-btn"
                  title={pdfTitle}
                  style={{
                    ...styles.generatePdfBtn,
                    ...(pdfDisabled ? styles.generatePdfBtnBusy : {}),
                  }}>
            <span aria-hidden="true" style={{ marginRight: 6, fontSize: 13 }}>
              {pdfGenerating ? '\u23F3' : '\u2B07'}
            </span>
            {pdfGenerating ? 'Generating…' : 'Generate PDF'}
          </button>
        )}
      </div>
    </nav>
  );
}

// v3-203 — AdminTabs is GONE: the four admin tabs are composed inside Tabs
// above (see the D2 comment there), which preserved its v3-54 not-role-gated
// visibility model.

// LandscapeReminder — a subtle bar shown only on small viewports in portrait
// orientation. Reacts dynamically to orientation changes (rotating the phone
// hides it without a reload). Always visible while the condition holds —
// not dismissible, since dismissing would just re-trigger the moment the
// user navigates anywhere.
function LandscapeReminder() {
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    // Combined media query: narrow viewport AND portrait orientation.
    const mq = window.matchMedia('(max-width: 767px) and (orientation: portrait)');
    const update = () => setIsPortraitMobile(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  if (!isPortraitMobile) return null;

  return (
    <div style={landscapeReminderStyles.outer} role="status" aria-live="polite">
      <div style={landscapeReminderStyles.inner}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="#854F0B" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <polyline points="21 3 21 8 16 8" />
        </svg>
        <span>Rotate your device to landscape for the best experience.</span>
      </div>
    </div>
  );
}

const landscapeReminderStyles = {
  outer: {
    backgroundColor: '#FAEEDA',
    borderBottom: '1px solid #FAC775',
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#854F0B',
    lineHeight: 1.4,
  },
};

// ConfirmDialog — modal overlay used by the "Lock" button in the rep-mode
// pill to confirm before resetting the calculator. Generic enough to reuse
// elsewhere if we add more destructive actions later.
//
// Visual treatment uses the brand-green confirm button and a neutral-text
// cancel button (consistent with AuthDialog's row), plus an amber accent
// strip on the left to signal "this action is destructive."
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
                          onConfirm, onCancel }) {
  return (
    <div style={confirmStyles.overlay} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div style={confirmStyles.card}>
        <div style={confirmStyles.accentStripe} aria-hidden="true" />
        <div style={confirmStyles.body}>
          <h2 id="confirm-title" style={confirmStyles.title}>{title}</h2>
          <p style={confirmStyles.message}>{message}</p>
          <div style={confirmStyles.buttonRow}>
            <button onClick={onCancel} style={confirmStyles.cancelButton}>
              {cancelLabel}
            </button>
            <button onClick={onConfirm} style={confirmStyles.confirmButton} autoFocus>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const confirmStyles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    backgroundColor: 'rgba(31, 58, 95, 0.45)',  // accentDark @ 45%
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 460,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 12px 32px rgba(31, 58, 95, 0.18)',
    display: 'flex',
    overflow: 'hidden',
  },
  accentStripe: {
    width: 4,
    backgroundColor: '#FAC775',  // amber — matches rep pill border
    flexShrink: 0,
  },
  body: {
    padding: '28px 28px 24px',
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#25543A',           // brandGreen
    margin: '0 0 8px',
  },
  message: {
    fontSize: 14,
    color: '#374151',
    margin: '0 0 20px',
    lineHeight: 1.55,
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 500,
    backgroundColor: 'transparent',
    color: '#6B7280',
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmButton: {
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    backgroundColor: '#25543A',  // brandGreen
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

function Footer({ brand, mode, adminAccess = 'none', onSignOut }) {
  return (
    <footer style={styles.footer}>
      <div className="footer-inner" style={styles.footerInner}>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          © 2026 {brand.legalEntity}. An AboitizPower Company.
        </div>
        {/* DEPLOYMENT DIVERGENCE: upstream's footer staff key is replaced by a
            plain sign-out, shown only in the customer view (in rep/admin views
            the header already carries the account controls). */}
        {mode === 'customer' && adminAccess === 'none' && onSignOut && (
          <button
            onClick={onSignOut}
            style={styles.signOutBtn}
            className="desktop-only-admin"
            title="Sign out"
          >
            Sign out
          </button>
        )}
      </div>
    </footer>
  );
}

// FooterFixed is shown on the maintenance gate to provide a staff entry
// without a full header (v3-203: one key glyph → unified Staff Sign-in; an
// admin password signs in past the gate, since adminAccess bypasses it).
//
// Hidden on mobile via the desktop-only-admin CSS class — admin features
// are desktop-only per product direction.
function FooterFixed({ onSignOut }) {
  // DEPLOYMENT DIVERGENCE: upstream's gate-corner staff key becomes a sign-out
  // — the maintenance gate is reached only while signed in under Supabase.
  return (
    <div className="desktop-only-admin" style={styles.footerFixed}>
      {onSignOut && (
        <button onClick={onSignOut} style={styles.agentLink} title="Sign out">
          Sign out
        </button>
      )}
    </div>
  );
}

const styles = {
  app: {
    fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
    backgroundColor: '#F7F4ED', minHeight: '100vh', color: '#1F2937',
  },
  header: { backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E1D6', padding: '20px 0' },
  headerInner: {
    maxWidth: 1200, margin: '0 auto', padding: '0 24px',
    display: 'flex', alignItems: 'center', gap: 32,
  },
  logo: { height: 56, width: 'auto' },
  headerMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  metaSep: { opacity: 0.4 },
  metaMuted: { color: '#6B7280' },
  metaExpired: { color: '#B91C1C', fontWeight: 600, letterSpacing: 0.5 },
  headerActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  editBtn: {
    background: 'transparent', border: '1px solid #D1D5DB', borderRadius: 6,
    padding: '6px 12px', fontSize: 12, fontWeight: 500, color: '#6B7280',
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  // Rep-mode pill in the header — small, muted, with an inline Lock button.
  // Uses an amber treatment so it reads as "you're in a privileged state"
  // without being alarming. The Lock button inside the pill returns to
  // customer view (clears sessionStorage flag).
  repPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 4px 4px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#854F0B',
    backgroundColor: '#FAEEDA',
    border: '1px solid #FAC775',
    borderRadius: 999,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  // Same visual as repPill but as a clickable button — single-action pill
  // shown in the header that returns the rep to the public/customer view.
  repPillBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: '#854F0B',
    backgroundColor: '#FAEEDA',
    border: '1px solid #FAC775',
    borderRadius: 999,
    letterSpacing: 0.3,
    flexShrink: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  repPillLockBtn: {
    background: '#FFFFFF',
    border: '1px solid #FAC775',
    borderRadius: 999,
    padding: '2px 9px',
    fontSize: 11,
    fontWeight: 600,
    color: '#854F0B',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginLeft: 2,
  },
  // Supabase account controls (Change password / Sign out) — this deployment's
  // replacement for the upstream staff-key glyph. Same discreet treatment.
  signOutBtn: {
    background: 'transparent', border: '1px solid #D1D5DB', borderRadius: 6,
    padding: '6px 12px', fontSize: 12, fontWeight: 500, color: '#6B7280',
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  // v3-203 — Staff Sign-in key button (header + footer). Same discreet
  // treatment the old Rep lock had: hairline border, muted stroke; glyph
  // only per Pat — the title/aria-label carry the words.
  staffKeyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: '1px solid #D1D5DB',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 500,
    color: '#6B7280',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 0.3,
  },
  tabs: { backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E1D6' },
  // Bottom-of-page tab variant. Active indicator moves to the top edge so the
  // green line visually anchors the active tab to the content above it
  // (where the user just was) rather than to whatever lies further down.
  // Hairline above to detach from the main content; nothing below since the
  // footer separator handles that.
  // v3-123 — live Total Amount Due bar.
  liveTotalBar: {
    position: 'fixed',
    left: 0, right: 0, bottom: 0,
    zIndex: 40,
    padding: '8px 14px',
    backgroundColor: '#25543A',
    color: '#FFFFFF',
    cursor: 'pointer',
    boxShadow: '0 -2px 8px rgba(0,0,0,0.12)',
  },
  liveTotalCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '0 10px',
    minWidth: 0,
  },
  liveTotalLabel: {
    fontSize: 9.5,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    // rgba (not opacity) so the bold rate below can restore FULL white —
    // a child can override inherited color, but never a parent's opacity.
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 1.35,
  },
  liveTotalRateBold: {      // v3-129 — user-directed emphasis on the utility rate
    fontSize: 13,
    fontWeight: 700,
    color: '#FFFFFF',
  },
  liveTotalValue: {
    fontSize: 18,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  liveTotalUnit: {
    fontSize: 12,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.8)',
  },
  tabsBottom: {
    backgroundColor: '#FFFFFF',
    borderTop: '1px solid #E5E1D6',
    marginTop: 32,
  },
  // v3-203 — flexWrap added: seven tabs + the Generate PDF pill can exceed
  // 1200px; wrapping to a second row beats horizontal clipping. Sub-1200px
  // customer view is unaffected (three tabs never wrapped anyway).
  tabsInner: { maxWidth: 1200, margin: '0 auto', padding: '0 24px',
               display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'stretch' },
  tab: {
    background: 'transparent', border: 'none', padding: '14px 22px',
    fontSize: 14, fontWeight: 500, color: '#6B7280', cursor: 'pointer',
    borderBottom: '3px solid transparent', transition: 'all 150ms',
  },
  tabActive: { color: '#25543A', borderBottom: '3px solid #25543A', fontWeight: 600 },
  // Bottom-tab variants — same typography, indicator on top edge instead.
  tabBottom: {
    background: 'transparent', border: 'none', padding: '14px 22px',
    fontSize: 14, fontWeight: 500, color: '#6B7280', cursor: 'pointer',
    borderTop: '3px solid transparent', transition: 'all 150ms',
  },
  tabActiveBottom: { color: '#25543A', borderTop: '3px solid #25543A', fontWeight: 600 },
  // v3-203 — admin tab variants (D2): brand-gold label so the settings group
  // reads apart from the green-accented quote tabs. Active state deepens the
  // gold and moves the same 3px indicator into gold. Slightly tighter
  // horizontal padding so the seven-tab strip fits one row on most desktops.
  tabAdmin: { color: '#A97E22', padding: '14px 16px' },
  tabAdminActive: { color: '#8A6516', borderBottom: '3px solid #A97E22', fontWeight: 600 },
  tabAdminActiveBottom: { color: '#8A6516', borderTop: '3px solid #A97E22', fontWeight: 600 },
  // Hairline between the quote group and the admin group. Self-stretching in
  // the flex row; 1px divider color matches the strip borders.
  tabGroupDivider: {
    width: 1, alignSelf: 'stretch', margin: '8px 8px',
    backgroundColor: '#E5E1D6', flexShrink: 0,
  },
  // Generate PDF pill button — rep-only, sits at the right edge of the top
  // tab bar (marginLeft: auto pushes it past the left-aligned tab buttons).
  // Visual treatment: solid Solviva green pill, white text, slight hover/
  // disabled state for the busy phase. Distinct from the tab buttons so it
  // reads as an action, not a tab.
  generatePdfBtn: {
    marginLeft: 'auto',
    alignSelf: 'center',
    background: '#25543A',
    border: 'none',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 0.2,
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'background 150ms',
    flexShrink: 0,
  },
  generatePdfBtnBusy: {
    background: '#6B7280',
    cursor: 'wait',
  },
  main: { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' },
  footer: { borderTop: '1px solid #E5E1D6', backgroundColor: '#FFFFFF', marginTop: 40 },
  footerInner: {
    maxWidth: 1200, margin: '0 auto', padding: '20px 24px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  footerFixed: { position: 'fixed', bottom: 16, right: 16, zIndex: 10, display: 'flex', gap: 8 },
  agentLink: {
    background: 'transparent', border: 'none',
    color: '#9CA3AF', fontSize: 11, fontWeight: 500,
    cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit', borderRadius: 4,
  },
};
