// =============================================================================
// STEP 4 — REVIEW YOUR INVESTMENT RETURNS
// -----------------------------------------------------------------------------
// Four key metrics:
//   • Simple Payback Period (CALCULATOR AH52)
//   • IRR over selected period (CALCULATOR AH54)
//   • LCOE (CALCULATOR AH56)
//   • Total DU Savings (CALCULATOR AH58)
//
// v3-51:
//   • Tiles render in `stacked` variant (label-left / value-right rows) so
//     they compress cleanly into the narrower right column of the
//     side-by-side Step 3 + Step 4 desktop layout.
//   • Per-metric explanations from DISCLAIMERS.paybackNote[0..3] surface
//     as InfoTooltip popovers anchored to each tile's label ⓘ icon. The
//     prior "What do these numbers mean?" <details> collapsible is GONE.
//   • The 5th paybackNote entry (italic "A note on DU tariff assumptions")
//     surfaces as a standalone block below the tiles, above the
//     full-width Disclaimer callout.
//
// `disclaimers.paybackNote` shape (from adminParams.js):
//   [
//     { term: "Simple Payback Period", rest: "..." },
//     { term: "Solar Investment IRR (...)", rest: "..." },
//     { term: "Levelized Cost of Energy (LCOE)", rest: "..." },
//     { term: "Distribution Utility (DU) Savings", rest: "..." },
//     { term: "A note on DU tariff assumptions:", italic: true, rest: "..." },
//   ]
//
// PDF behavior is UNCHANGED: pdfGenerator.js still renders all 5 paragraphs
// as bullets on the proposal page — that's a different surface where
// hover-tooltips can't exist, so verbose footnotes make sense there.
// =============================================================================

import React from 'react';
import {
  SectionCard, StatTile, COLORS, fmt, CalloutBox,
} from './ui.jsx';

// Build the tooltip content for one metric from its paybackNote entry.
// Bold term + the explanation prose, inside a small text container that
// reads as a definition tooltip.
function tooltipFor(entry) {
  if (!entry) return null;
  return (
    <span style={{ fontSize: 13, lineHeight: 1.55 }}>
      <strong>{entry.term}</strong>
      {entry.rest}
    </span>
  );
}

export default function Step4Returns({ state, updateState, model, disclaimers, mode = 'rep' }) {
  const { cashFlows } = model;

  // paybackNote indices: 0-3 are per-metric definitions, 4 is the
  // DU tariff assumptions note. Defensive against shorter arrays in case
  // an admin trims the list — only what exists is shown.
  const notes = disclaimers?.paybackNote || [];
  const paybackTip = tooltipFor(notes[0]);
  const irrTip     = tooltipFor(notes[1]);
  const lcoeTip    = tooltipFor(notes[2]);
  const duTip      = tooltipFor(notes[3]);
  const duTariffNote = notes[4];

  return (
    <SectionCard
      accent="Step 4"
      title="Review your investment returns"
      subtitle="See how your solar investment performs across multiple measures of value."
    >
      {/* ─── IRR period selector ─── */}
      <div style={styles.irrPeriodRow}>
        <span style={styles.irrPeriodLabel}>Calculate IRR &amp; LCOE over:</span>
        <select
          value={state.irrYears}
          onChange={e => updateState({ irrYears: Number(e.target.value) })}
          style={styles.irrPeriodSelect}>
          {[10, 15, 20, 25, 30].map(y => (
            <option key={y} value={y}>{y} years</option>
          ))}
        </select>
      </div>

      {/* ─── 4 key metrics, stacked rows (label-left / value-right) ─── */}
      <div style={styles.metricsStack}>
        <StatTile
          label="Simple Payback Period"
          value={cashFlows.paybackLabel}
          color={COLORS.brandGreen}
          large stacked
          tooltip={paybackTip}
        />
        <StatTile
          label={`Internal Rate of Return (${state.irrYears}-yr)`}
          value={cashFlows.irr !== null ? fmt.pct(cashFlows.irr, 1) : '—'}
          color={COLORS.brandGreen}
          large stacked
          tooltip={irrTip}
        />
        <StatTile
          label="Levelized Cost of Energy"
          value={`${fmt.pesoCents(cashFlows.lcoe)}/kWh`}
          sub={`Compare to your current ${fmt.pesoCents(state.utilityRate)}/kWh`}
          color={COLORS.brandGreen}
          large stacked
          tooltip={lcoeTip}
        />
        <StatTile
          label={
            <>
              Total Distribution Utility{' '}
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.textBody,
                letterSpacing: 1,
              }}>
                SAVINGS
              </span>
              {' '}({state.irrYears}-yr)
            </>
          }
          value={fmt.peso(cashFlows.totalDuSavings)}
          color={COLORS.brandGreen}
          large stacked
          tooltip={duTip}
        />
      </div>

      {/* ─── DU tariff assumptions note (standalone, no card border) ─── */}
      {duTariffNote && (
        <div style={styles.duTariffNote}>
          <em>
            <strong>{duTariffNote.term}</strong>
            {duTariffNote.rest}
          </em>
        </div>
      )}

      {/* ─── Disclaimer callout (full-width, unchanged from v3-50) ─── */}
      <div style={{ marginTop: 16 }}>
        <CalloutBox kind="info">
          <strong>Disclaimer.</strong> {disclaimers.irrDisclaimerBefore}
          <strong style={{ color: '#E87722' }}>
            {disclaimers.irrDisclaimerHighlight}
          </strong>
          {disclaimers.irrDisclaimerAfter}
        </CalloutBox>
      </div>
    </SectionCard>
  );
}

const styles = {
  irrPeriodRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  irrPeriodLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.textBody,
  },
  irrPeriodSelect: {
    fontSize: 14,
    padding: '6px 12px',
    border: `1px solid ${COLORS.inputBorder}`,
    borderRadius: 6,
    backgroundColor: COLORS.inputTint,
    fontFamily: 'inherit',
  },
  // Vertical stack of StatTile rows. Each row's own marginBottom (from
  // statStyles.tileStacked) handles inter-row spacing; this container
  // just clears below the IRR period selector.
  metricsStack: {
    marginTop: 4,
    marginBottom: 20,
  },
  // DU tariff assumptions note — italic, full-width, no card chrome.
  // Sits between the metric stack and the blue Disclaimer band as a
  // distinct visual beat: not as prominent as the Disclaimer but more
  // visible than a small footnote.
  duTariffNote: {
    fontSize: 12,
    color: COLORS.textBody,
    lineHeight: 1.6,
    padding: '8px 0',
    marginTop: 4,
  },
};
