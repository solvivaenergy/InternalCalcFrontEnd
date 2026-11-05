// =============================================================================
// REGION — which office's calculator this is (v3-231)
// -----------------------------------------------------------------------------
// One calculator serves more than one office. Each region has its OWN complete
// parameter payload on the backend (margins, COGS, inventory, logistics, FinCo
// — everything), and every account holds region access in Supabase
// `app_metadata.regions`: Manila only, Cebu only, or both. This module is the
// only place that knows what a region is; everything else asks it.
//
//   • ids are internal and never change: `luzon` stays `luzon` because every
//     saved quote, the engine's structural location id and the backend's
//     legacy row already use it. Labels are what people see.
//   • `regionsOf(session)` — the account's regions, canonical order; missing
//     ⇒ ['luzon'] (every account that predates regions is a Manila account;
//     the backend and the RLS policy apply the same rule, so nothing was
//     backfilled).
//   • the active region is remembered per DEVICE (localStorage), because a
//     rep with both regions works one office at a time; the quote record in
//     sessionStorage carries its own region and wins on restore (App.jsx).
//   • PLANNED_BRANCHES are offices that do not exist yet. They appear in the
//     "Pricing branch" dropdown, disabled, so every rep sees what is coming;
//     they are NOT regions — no payload, no access flag, never active, and
//     the backend's allowlist (src/regions.js there) does not know them.
// =============================================================================

// `colour` is the soft pill used in tables and the admin badge; `theme` is
// the page colour applied while that region is active, from the three-colour
// design the product owner signed off (2026-11-01):
//   accent    the branch colour — the dropdown's dot and border, the 4px band
//             along the top of the header, the "{Region} pricing" pill in the
//             live total bar, the mobile stamp. Manila dark green, Cebu lime,
//             Davao blue (not open yet).
//   onAccent  text on the accent fill (dark green on lime — the brand rule:
//             never white text on lime, never lime text on white).
//   ink       the branch colour as TEXT on white: active tab text and
//             underline, live-bar figures, the price-list badge. Cebu's ink is
//             dark green, because lime cannot be read on white.
//   tint      the accent at ~8–20% on white — the live total bar's ground and
//             the price-list badge.
// The PRIMARY fill of the whole calculator (buttons, toggles, table header
// rows) and the live bar's tokens are CSS variables that index.html sets per
// region from data-region on <html>; the values there mirror these.
export const REGIONS = Object.freeze([
  {
    id: 'luzon',
    label: 'Manila',
    shortLabel: 'MNL',
    colour: { fg: '#854F0B', bg: '#FAEEDA', border: '#FAC775' },
    theme: { accent: '#1F522B', onAccent: '#FFFFFF', ink: '#1F522B', tint: '#EEF4EC' },
  },
  {
    id: 'cebu',
    label: 'Cebu',
    shortLabel: 'CEB',
    colour: { fg: '#1F522B', bg: '#F1FFB8', border: '#D2FF1E' },
    theme: { accent: '#D2FF1E', onAccent: '#1F522B', ink: '#1F522B', tint: '#F7FFD1' },
  },
]);

// Not open yet: listed in the dropdown, disabled ("coming soon"). Davao takes
// the brand blue when it opens; until then nothing in the app is blue.
export const PLANNED_BRANCHES = Object.freeze([
  {
    id: 'davao',
    label: 'Davao',
    shortLabel: 'DVO',
    colour: { fg: '#004E92', bg: '#E8F1FA', border: '#9CC5EE' },
    theme: { accent: '#006AC6', onAccent: '#FFFFFF', ink: '#006AC6', tint: '#E8F1FA' },
  },
]);

// Everything the "Pricing branch" dropdown lists, in order.
export const BRANCHES = Object.freeze([...REGIONS, ...PLANNED_BRANCHES]);

export const DEFAULT_REGION = 'luzon';
export const REGION_IDS = Object.freeze(REGIONS.map(r => r.id));

const STORAGE_KEY = 'solviva_region_v1';

export const isRegionId = (x) => REGION_IDS.includes(x);
export const isPlannedBranch = (x) => PLANNED_BRANCHES.some(b => b.id === x);
export const regionMeta = (id) => REGIONS.find(r => r.id === id) || REGIONS[0];
export const branchMeta = (id) => BRANCHES.find(b => b.id === id) || REGIONS[0];
export const regionLabel = (id) => regionMeta(id).label;
export const regionTheme = (id) => regionMeta(id).theme;

// Supabase auth app_metadata.regions → canonical, deduplicated, non-empty.
export function regionsOf(session) {
  const raw = session?.user?.app_metadata?.regions;
  const list = Array.isArray(raw) ? raw.filter(isRegionId) : [];
  const ordered = REGION_IDS.filter(id => list.includes(id));
  return ordered.length ? ordered : [DEFAULT_REGION];
}

// The region to open: this device's last-used one if the account still holds
// it, else Manila if allowed, else the first allowed region.
export function getActiveRegion(allowed = [DEFAULT_REGION]) {
  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) { /* storage unavailable */ }
  if (stored && allowed.includes(stored)) return stored;
  return allowed.includes(DEFAULT_REGION) ? DEFAULT_REGION : allowed[0];
}

export function setActiveRegion(id) {
  if (!isRegionId(id)) return;
  try { localStorage.setItem(STORAGE_KEY, id); } catch (_) { /* ignore */ }
}

// Inline style for a region badge / active toggle segment.
export const regionPillStyle = (meta) => ({
  color: meta.colour.fg,
  backgroundColor: meta.colour.bg,
  border: `1px solid ${meta.colour.border}`,
});
