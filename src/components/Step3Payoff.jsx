// =============================================================================
// STEP 3 PAYOFF GRAPHIC (v3-191)
// -----------------------------------------------------------------------------
// Sits under Step 3 in the left column. Answers, at a glance, the thing Step 3
// actually raises: what am I paying each month, what am I saving, and when does
// the paying stop?
//
// FOUR INPUTS, all already on screen: down payment and tenor (Step 3), the IRR
// period and the assumed DU rate increase (Step 4). Every one of them changes
// the picture, so the graphic is never stale relative to the controls around it.
//
// ⚠ IT READS THE ENGINE, IT DOES NOT RE-DERIVE ANYTHING.
// The per-year savings come straight from `model.cashFlows.cashflows[y].duSavings`
// — the same array Step 4's tiles and the PDF are built from — divided by 12.
// Re-implementing the AB9:AB37 recurrence here would have been three lines and
// would have created a second definition of the savings curve, free to drift
// from the one the quote is priced on. Same reasoning as v3-181's smoke finding:
// a copy of the model is not the model.
//
// ⚠ THE DIRECTION SENTENCE IS A CLAIM ABOUT A SIGN, AND THE SIGN IS NOT OBVIOUS.
// Whether the monthly saving rises or falls is NOT "is inflation zero". It is
// the sign of (1 - degradation)(1 + inflation) - 1, which crosses at
// inflation = degradation/(1-degradation) — 0.5025% at the standard 0.5%
// degradation. So 0.25% still DECLINES (₱8,800 → ₱8,284 over 25 years) and
// 0.75% is the first reachable step on the 0.25% grid that actually climbs.
// A first pass of this panel asserted "0.25% outpaces panel ageing, so it
// climbs" on a customer-facing screen; it was caught in mockup. The crossover
// is the same constant v3-181 pinned in gate 8.15 and is now used, not just
// documented.
// =============================================================================

import React from 'react';
import { COLORS, fmt } from './ui.jsx';
import { buildPayoffModel } from '../lib/payoff.js';

// Bars stay side by side while there is room for a readable pair; past that the
// payment is drawn as a narrower overlay in the same slot rather than as a
// second bar too thin to see. (Mobile changes the ENCODING instead — see
// MobileFlow: at 25 years in a phone card the overlay would be 3.6px.)
const PAIRED_MIN_SLOT_PX = 22;

export default function Step3Payoff({ state, model, adminParams }) {
  // v3-192 — every derived value, and in particular the direction sentence,
  // comes from the shared model so desktop and mobile cannot disagree.
  const p = buildPayoffModel({ state, model, adminParams });
  if (!p) return null;
  const {
    years, monthlySave, pmt, payYears, directPurchase,
    headline, subtitle, horizonNote, totalOverHorizon, anyShortfall, anySurplus, showEndMarker,
  } = p;

  // ── geometry ──
  const X0 = 46, X1 = 516, YB = 182, YT = 34;
  const slot = (X1 - X0) / years;
  const paired = slot >= PAIRED_MIN_SLOT_PX;
  const bw = paired ? slot * 0.36 : slot * 0.62;
  const maxV = Math.max(...monthlySave, directPurchase ? 0 : pmt) * 1.16;
  const h = (v) => (v / maxV) * (YB - YT);
  const labelEvery = slot >= 30 ? 1 : slot >= 18 ? 2 : slot >= 12 ? 5 : 10;

  const bars = [];
  for (let y = 0; y < years; y++) {
    const x = X0 + y * slot;
    const gx = x + (paired ? slot * 0.10 : (slot - bw) / 2);
    const hs = h(monthlySave[y]);
    bars.push(
      <rect key={`s${y}`} x={gx.toFixed(1)} y={(YB - hs).toFixed(1)}
            width={bw.toFixed(1)} height={hs.toFixed(1)} rx="2" fill="#3B7B5A" />
    );
    if (!directPurchase && y < payYears) {
      const hp = h(pmt);
      // Amber-orange when the payment is above the saving that year. This is
      // the COMMON case, not an edge case — on most down-payment/tenor
      // combinations the payment exceeds the monthly saving — so it is styled
      // as information rather than as a warning.
      const over = monthlySave[y] < pmt;
      const fill = over ? '#D98A4A' : '#E3C89A';
      bars.push(paired
        ? <rect key={`p${y}`} x={(gx + bw + 2).toFixed(1)} y={(YB - hp).toFixed(1)}
                width={bw.toFixed(1)} height={hp.toFixed(1)} rx="2" fill={fill} />
        : <rect key={`p${y}`} x={(gx + bw * 0.28).toFixed(1)} y={(YB - hp).toFixed(1)}
                width={(bw * 0.44).toFixed(1)} height={hp.toFixed(1)} rx="1.5" fill={fill} />
      );
    }
    if ((y + 1) % labelEvery === 0 || y === 0) {
      bars.push(
        <text key={`t${y}`} x={(x + slot / 2).toFixed(1)} y={YB + 15}
              fontSize="9" fill="#9CA3AF" textAnchor="middle">{y + 1}</text>
      );
    }
  }

  const markerX = X0 + payYears * slot;

  return (
    <div style={styles.card}>
      <div style={styles.head}>
        {headline}
      </div>
      <div style={styles.sub}>
        {subtitle}
      </div>

      <svg viewBox="0 0 540 214" width="100%" role="img"
           aria-label={
             `Monthly bill savings by year over ${years} years, from `
             + `${fmt.peso(monthlySave[0])} in year one to ${fmt.peso(monthlySave[years - 1])} `
             + `in year ${years}`
             + (directPurchase ? '. There is no monthly payment.'
                               : `, against a fixed monthly payment of ${fmt.peso(pmt)} `
                                 + `that ends after year ${payYears}.`)
           }>
        <line x1={X0} y1={YB} x2={X1} y2={YB} stroke="#D8D2C4" />
        {bars}
        {showEndMarker && (
          <g>
            <line x1={markerX.toFixed(1)} y1={YT - 8} x2={markerX.toFixed(1)} y2={YB}
                  stroke={COLORS.warning} strokeWidth="1.2" strokeDasharray="3 3" />
            <text x={(markerX + 5).toFixed(1)} y={YT} fontSize="10" fontWeight="700"
                  fill={COLORS.warning}>payments end</text>
          </g>
        )}
        <text x={X0} y={YT - 14} fontSize="10.5" fontWeight="700" fill={COLORS.brandGreen}>
          {fmt.peso(monthlySave[0])}/mo saved in year 1
        </text>
        <text x={X1} y={YT - 14} textAnchor="end" fontSize="10.5" fontWeight="700"
              fill={COLORS.brandGreen}>
          {fmt.peso(monthlySave[years - 1])}/mo by year {years}
        </text>
        <text x={X0} y={YB + 31} fontSize="9.5" fill="#9CA3AF">year</text>
      </svg>

      {/* v3-197 (user-directed, Pat) — the legend names BOTH payment shades:
          dark amber is a year whose payment EXCEEDS that year's saving, light
          amber a year it does not. The old single swatch coloured itself
          `anyShortfall ? dark : light`, so a chart containing both shades
          legended only the dark one. Each entry appears only when its case
          exists in the payment window (flags from the shared model, the same
          comparison the bar fill makes). The total line moves ONTO the legend
          row, right-aligned, cutting one text row from the card so the chart
          bottoms out roughly level with Step 4.
          v3-198 (user-directed, Pat) — the row is a GRID, not flex
          space-between: the total owns a fixed top-right cell, so the legend
          entries can change count or wrap inside their own column without
          dragging the total around — it sits in the same place whether one,
          two, or three entries render. */}
      <div style={styles.legendRow}>
        <div style={styles.legend}>
          <span><i style={{ ...styles.key, background: '#3B7B5A' }} />Saved each month</span>
          {!directPurchase && anyShortfall && (
            <span><i style={{ ...styles.key, background: '#D98A4A' }} />
              Paid each month ({'>'} saved)
            </span>
          )}
          {!directPurchase && anySurplus && (
            <span><i style={{ ...styles.key, background: '#E3C89A' }} />
              Paid each month ({'≤'} saved)
            </span>
          )}
        </div>
        <div style={styles.total}>
          Total saved over {years} years: <strong>{fmt.peso(totalOverHorizon)}</strong>.{horizonNote}
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: COLORS.surfaceCard, borderRadius: 12,
    border: `1px solid ${COLORS.divider}`, padding: '20px 22px', marginTop: 16,
  },
  head: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: COLORS.brandGreen,
    textTransform: 'uppercase', marginBottom: 3,
  },
  sub: { fontSize: 12, color: COLORS.textMuted, marginBottom: 12, lineHeight: 1.5 },
  legendRow: {
    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start',
    columnGap: 14, marginTop: 8,
  },
  legend: {
    display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11,
    color: '#4B5563',
  },
  key: {
    display: 'inline-block', width: 10, height: 10, borderRadius: 2,
    marginRight: 5, verticalAlign: -1,
  },
  total: {
    fontSize: 11, color: COLORS.textMuted, lineHeight: 1.55, fontStyle: 'italic',
    textAlign: 'right', whiteSpace: 'nowrap', paddingTop: 1,
  },
};
