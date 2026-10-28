// =============================================================================
// REGION CONTROLS — the stamp that says which calculator this is, and the
// switch between them (v3-231)
// -----------------------------------------------------------------------------
// Two pieces, both driven by src/lib/region.js:
//   • <RegionStamp/>  — "MANILA calculator" / "CEBU calculator", filled in the
//     region's accent with a map-pin. Rendered under the logo in the desktop
//     header and in the mobile flow's header, for EVERY account — it is the
//     one place that always names the region, whether or not the account can
//     switch. (The user asked for a clear stamp: a quote's numbers never say
//     which office priced them.)
//   • <RegionSwitch/> — a segmented control, "Quoting in  [⌖ Manila] [⌖ Cebu]",
//     the active segment filled in its region's accent. Rendered only for an
//     account with more than one region; a single-region account gets nothing
//     to tap by accident.
// =============================================================================

import React from 'react';
import { regionMeta } from '../lib/region.js';

export function PinIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function RegionStamp({ region, compact = false }) {
  const m = regionMeta(region);
  return (
    <span aria-label="Quoting region" title={`You are in the ${m.label} calculator`}
          style={{ ...styles.stamp, ...(compact ? styles.stampCompact : {}), backgroundColor: m.theme.accent }}>
      <PinIcon size={compact ? 10 : 11} />
      <span style={styles.stampRegion}>{m.label}</span>
      {!compact && <span style={styles.stampWord}>calculator</span>}
    </span>
  );
}

export function RegionSwitch({ regions, active, onSwitch }) {
  if (!Array.isArray(regions) || regions.length < 2) return null;
  return (
    <div style={styles.switchWrap} role="group" aria-label="Switch calculator region" data-no-print="true">
      <span style={styles.switchCaption}>Quoting in</span>
      <div style={styles.segmented}>
        {regions.map(id => {
          const m = regionMeta(id);
          const on = id === active;
          return (
            <button key={id} type="button" aria-pressed={on}
                    title={on ? `You are quoting in ${m.label}` : `Switch to the ${m.label} calculator`}
                    onClick={() => { if (!on && onSwitch) onSwitch(id); }}
                    style={{ ...styles.segment, ...(on ? { backgroundColor: m.theme.accent, color: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' } : {}) }}>
              <PinIcon size={11} />
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  stamp: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px 4px 8px', borderRadius: 6,
    color: '#FFFFFF', fontSize: 10.5, fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.2,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  stampCompact: { padding: '3px 8px 3px 7px', fontSize: 10, gap: 5 },
  stampRegion: {},
  stampWord: { opacity: 0.8, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'none', fontSize: 10.5 },
  switchWrap: { display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  switchCaption: {
    fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: '#6B7280', whiteSpace: 'nowrap',
  },
  segmented: {
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: 3, borderRadius: 999,
    backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB',
  },
  segment: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 999, border: 'none',
    backgroundColor: 'transparent', color: '#4B5563',
    fontSize: 12, fontWeight: 600, letterSpacing: 0.2, lineHeight: 1.2,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    transition: 'background-color 150ms, color 150ms',
  },
};
