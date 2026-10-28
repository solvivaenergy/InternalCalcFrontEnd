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
// =============================================================================

export const REGIONS = Object.freeze([
  {
    id: 'luzon',
    label: 'Manila',
    shortLabel: 'MNL',
    // The existing rep-pill amber (App.jsx repPillBtn) — Manila is "home".
    colour: { fg: '#854F0B', bg: '#FAEEDA', border: '#FAC775' },
  },
  {
    id: 'cebu',
    label: 'Cebu',
    shortLabel: 'CEB',
    // Distinct teal (product decision): the prices themselves do not reveal
    // which region produced them, so the badge must.
    colour: { fg: '#0B4F6C', bg: '#E0F2F8', border: '#7CC4DC' },
  },
]);
export const DEFAULT_REGION = 'luzon';
export const REGION_IDS = Object.freeze(REGIONS.map(r => r.id));

const STORAGE_KEY = 'solviva_region_v1';

export const isRegionId = (x) => REGION_IDS.includes(x);
export const regionMeta = (id) => REGIONS.find(r => r.id === id) || REGIONS[0];
export const regionLabel = (id) => regionMeta(id).label;

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
