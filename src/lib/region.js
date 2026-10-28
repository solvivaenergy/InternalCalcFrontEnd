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

// `colour` is the soft pill used in tables and the admin badge; `theme` is
// the page accent applied while that region is active — the header band and
// wash, the stamp, the active switch segment, the active tab indicator and
// the live total bar. Manila's theme is the calculator's green, so Manila
// looks exactly as before. Cebu takes the Solviva LIME ACCENT (#d2ff1e, the
// brand kit's light green) so a rep can tell at a glance, from any corner of
// the screen, which calculator they are in (the prices do not say). Brand
// rule: lime is a BACKGROUND colour with dark green text on it — never white
// text on lime, never lime text on white — hence `onAccent` / `tabText`, and
// the live total bar keeps a dark green fill with a lime edge instead of a
// lime fill. The wash is lime at ~15% on white; nothing is outside the kit.
//   accent    fill of the band, stamp and active segment; the tab underline
//   onAccent  text colour on that fill
//   tabText   active quote-tab text (must read on white)
//   headerBg  header background while the region is active
//   barBg / barEdge   live total bar fill and (optional) top edge
export const REGIONS = Object.freeze([
  {
    id: 'luzon',
    label: 'Manila',
    shortLabel: 'MNL',
    colour: { fg: '#854F0B', bg: '#FAEEDA', border: '#FAC775' },
    theme: {
      accent: '#25543A', onAccent: '#FFFFFF', tabText: '#25543A',
      headerBg: '#FFFFFF', barBg: '#25543A', barEdge: null,
    },
  },
  {
    id: 'cebu',
    label: 'Cebu',
    shortLabel: 'CEB',
    colour: { fg: '#1f512a', bg: '#F1FFB8', border: '#d2ff1e' },
    theme: {
      accent: '#d2ff1e', onAccent: '#1f512a', tabText: '#1f512a',
      headerBg: '#FAFFE6', barBg: '#1f512a', barEdge: '#d2ff1e',
    },
  },
]);
export const DEFAULT_REGION = 'luzon';
export const REGION_IDS = Object.freeze(REGIONS.map(r => r.id));

const STORAGE_KEY = 'solviva_region_v1';

export const isRegionId = (x) => REGION_IDS.includes(x);
export const regionMeta = (id) => REGIONS.find(r => r.id === id) || REGIONS[0];
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
