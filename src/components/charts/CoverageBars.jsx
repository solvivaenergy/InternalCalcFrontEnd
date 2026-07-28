// =============================================================================
// COVERAGE BARS — "how much of your bill comes from each source"
// -----------------------------------------------------------------------------
// Rows: No Solar · Solar Only · Solar w/ Batteries · (Solar w/ Batt. & Net
// Met. — only when showNm). Each row is a stacked horizontal bar of Grid /
// Solar / Battery / Net-Metering proportions (0-1 → %).
//
// v3-127 — REWRITTEN from Recharts SVG to plain divs. Reason: the PDF's
// "Visualizing your system" page is an html2canvas snapshot of this chart,
// and html2canvas mis-renders the Recharts stacked-<rect> SVG with per-layer
// horizontal offsets (user-reported: segments drift apart / bars misalign in
// the generated PDF). Plain flex divs with %-width segments capture
// pixel-faithfully. Visual parity kept: 170px right-aligned label column,
// 0/25/50/75/100% tick row, square legend chips, same palette. The Recharts
// hover tooltip is replaced by a native title= per segment (shows
// "Source — NN.N%" on hover).
//
// With NM off the 4th bar is dropped entirely — it's structurally identical
// to bar 3 when no net-metering credits are calculated (pre-v3-127 behavior,
// unchanged).
// =============================================================================

import React from 'react';
import { fmt, COLORS } from '../ui.jsx';

const COLOR_GRID = '#DC2626';     // red
const COLOR_SOLAR = '#F59E0B';    // amber
const COLOR_BATT = '#10B981';     // emerald
const COLOR_NM = '#3B82C4';       // blue

const SERIES = [
  { key: 'grid',        label: 'Grid',         color: COLOR_GRID },
  { key: 'solar',       label: 'Solar',        color: COLOR_SOLAR },
  { key: 'battery',     label: 'Battery',      color: COLOR_BATT },
  { key: 'netMetering', label: 'Net Metering', color: COLOR_NM },
];

export default function CoverageBars({ bars, showNm = false }) {
  const sourceBars = showNm ? bars : bars.slice(0, 3);
  const series = showNm ? SERIES : SERIES.slice(0, 3);

  return (
    <div>
      <div style={styles.chart}>
        {sourceBars.map(b => (
          <div key={b.name} style={styles.row}>
            <div style={styles.label}>{b.name}</div>
            <div style={styles.track}>
              {series.map(s => {
                const pct = (b[s.key] || 0) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={s.key}
                    title={`${s.label} — ${fmt.num(pct, 1)}%`}
                    style={{ ...styles.segment, width: `${pct}%`,
                             backgroundColor: s.color }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {/* Tick row — aligned to the track via the same fixed label offset. */}
        <div style={styles.row}>
          <div style={styles.label} aria-hidden="true" />
          <div style={styles.tickRow}>
            {[0, 25, 50, 75, 100].map(t => (
              <span key={t} style={{ ...styles.tick, left: `${t}%` }}>{t}%</span>
            ))}
          </div>
        </div>
      </div>
      <div style={styles.legend}>
        {series.map(s => (
          <span key={s.key} style={styles.legendItem}>
            <span style={{ ...styles.legendChip, backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const styles = {
  chart: { padding: '16px 24px 0 0' },
  row: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 14,
  },
  label: {
    width: 170,
    flex: '0 0 170px',
    paddingRight: 12,
    textAlign: 'right',
    fontSize: 12,
    color: COLORS.textBody,
  },
  track: {
    flex: 1,
    display: 'flex',
    height: 22,
    borderLeft: '1px solid #CCCCCC',
  },
  segment: { height: '100%' },
  tickRow: {
    flex: 1,
    position: 'relative',
    height: 16,
    borderTop: '1px solid #CCCCCC',
  },
  tick: {
    position: 'absolute',
    top: 2,
    transform: 'translateX(-50%)',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  legend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 18,
    paddingTop: 8,
    fontSize: 12,
    color: COLORS.textBody,
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  legendChip: { width: 10, height: 10, display: 'inline-block' },
};
