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
//     as InfoTooltip popovers anchored to each tile's label ⓘ icon; the
//     monthly tile reads its own DISCLAIMERS.monthlySavingsNote (v3-201).
//     The prior "What do these numbers mean?" <details> collapsible is GONE.
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
import {
  computeDuInflationReference, duInflationSentence, nearestDuStep, buildDuTariffNote,
} from '../lib/duInflation.js';
import { IRR_YEARS_OPTIONS } from '../data/adminParams.js';

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

export default function Step4Returns({ state, updateState, model, disclaimers, adminParams, mode = 'rep' }) {
  const { cashFlows } = model;

  // paybackNote indices: 0-3 are per-metric definitions, 4 is the
  // DU tariff assumptions note. Defensive against shorter arrays in case
  // an admin trims the list — only what exists is shown.
  const notes = disclaimers?.paybackNote || [];
  const paybackTip = tooltipFor(notes[0]);
  const irrTip     = tooltipFor(notes[1]);
  const lcoeTip    = tooltipFor(notes[2]);
  const duTip      = tooltipFor(notes[3]);
  // v3-201 — the monthly tile has its OWN definition (DISCLAIMERS.
  // monthlySavingsNote), replacing v3-181's reuse of notes[3]. That reuse
  // claimed the tile was the DU Savings "expressed per month"; it is the
  // uninflated first-year base month (Schedule J45), and the borrowed copy
  // was wrong on all three of its claims for this tile (cumulative /
  // selected period / degradation-adjusted). Defensive optional chaining:
  // an older persisted disclaimers object without the key shows no tooltip
  // rather than the wrong one.
  const monthlyTip = tooltipFor(disclaimers?.monthlySavingsNote);
  // v3-181 — the flat-rate note is only true at 0%. Above it, swap to the
  // variant that names the customer's own assumed rate.
  const duRate = cashFlows.duRateInflation || 0;
  const duTariffNote = duRate > 0
    ? (buildDuTariffNote(disclaimers, duRate, 'calculator') || notes[4])
    : notes[4];

  return (
    <SectionCard
      accent="Step 4"
      title="Review your investment returns"
      subtitle="See how your solar investment performs across multiple measures of value."
    >
      {/* v3-175 — an EXPANSION quote's returns are the INCREMENTAL returns of
          the expansion itself: savings simulate the NEW panels only (the bill
          entered is already net of the customer's existing solar) and the cost
          side is this order's price (no inverter, marginal cabling). Correct
          by construction — no engine change — but worth one line so nobody
          reads the IRR as their whole rooftop's return. */}
      {model.expansionActive && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6,
                      background: '#F0F9FF', border: '1px solid #BAE6FD',
                      color: '#075985', fontSize: 12.5, lineHeight: 1.5 }}>
          Returns shown are for <strong>this expansion order</strong> — the new panels measured
          against their own cost. Your existing system&rsquo;s output and cost are not included.
        </div>
      )}

      {/* ─── IRR period selector ─── */}
      <div style={styles.irrPeriodRow}>
        <span style={styles.irrPeriodLabel}>Calculate IRR &amp; LCOE over:</span>
        <select
          value={state.irrYears}
          onChange={e => updateState({ irrYears: Number(e.target.value) })}
          style={styles.irrPeriodSelect}>
          {IRR_YEARS_OPTIONS.map(y => (
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
        {/* v3-181 — Estimated Savings per Month, immediately BEFORE the total.
            This is Schedule J45: the UNINFLATED base month, since the assumed
            increase compounds only from year 2. It therefore does NOT move
            with the stepper below, which is correct and is why the tile says
            "today". */}
        <StatTile
          label="Estimated Savings per Month"
          value={fmt.peso(cashFlows.monthlyDuSavings)}
          sub="At today's DU rate, before any assumed annual increase."
          color={COLORS.brandGreen}
          large stacked
          tooltip={monthlyTip}
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

      {/* ─── Assumed annual DU rate increase (v3-181) ────────────────────
          Mirrors CALCULATOR!AF53. Drives Schedule AB9:AB37 and the v5.3
          payback formula X3 — so payback, IRR and total savings all move
          together with it. LCOE provably cannot: it measures the cost of the
          energy the system produces, not the price of grid electricity. */}
      {/* v3-184 — ONE block: the adjuster and the historical reference that
          informs it read as a single control, not two stacked cards. The
          reference is GUIDANCE ONLY and never moves the rate on its own; it is
          omitted entirely when the FinCo inputs are absent or invalid. */}
      <DuInflationControl
        value={duRate}
        onChange={v => updateState({ duRateInflation: v })}
        params={adminParams}
      />

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

// ─── DU inflation stepper (v3-181) ───────────────────────────────────────────
// A customer-facing control on a financing document, so the bounds are hard and
// enforced HERE as well as in the engine and (for the default) server-side:
//   floor 0.00%  — a negative rate would compound savings down past
//                  degradation and overstate nothing, but it is not a claim any
//                  customer should be able to put on a proposal;
//   ceiling 10.00% — beyond this the projected savings stop being defensible;
//   step 0.25%   — Pat's grid.
// Float arithmetic is done in BASIS POINTS and converted once, so twelve taps
// of "+" lands on exactly 0.03 rather than 0.030000000000000006.
export const DU_STEP_BP  = 25;      // 0.25%
export const DU_MIN_BP   = 0;
export const DU_MAX_BP   = 1000;    // 10.00%

export function clampDuRateBp(bp) {
  return Math.min(DU_MAX_BP, Math.max(DU_MIN_BP, Math.round(bp / DU_STEP_BP) * DU_STEP_BP));
}

// ─── Assumed DU rate increase — adjuster + reference, ONE block (v3-184) ─────
// v3-183 shipped these as two adjacent cards (a cream stepper box and a blue
// reference box). They are one idea — the control and the evidence for setting
// it — so they are now one bordered block with an internal divider: same
// surface as the metric tiles above, with the reference as an inset panel
// rather than a second card competing with it.
//
// The reference half is ADVISORY. It never moves the customer's rate on its
// own, it says "history, not a forecast" in those words (a specific claim about
// a named third party sits on a financing screen and Solviva must not read as
// forecasting utility tariffs), and because the derived rate is almost never ON
// the 0.25% grid (4.90% is not) one action offers the nearest reachable step.
// It renders NOTHING when the FinCo reference inputs are absent or invalid —
// a half-built sentence there would be worse than silence.
function DuInflationControl({ value, onChange, params }) {
  const bp = clampDuRateBp(Math.round((value || 0) * 10000));
  const atMin = bp <= DU_MIN_BP;
  const atMax = bp >= DU_MAX_BP;

  // v3-184 — the bound hint used to render whenever the value SAT on a bound,
  // which meant every customer was shown "Minimum 0.00%." on first load: a
  // warning about a limit they had not approached, on the default value. It now
  // appears only once the customer has actually pushed against a bound, so it
  // reads as feedback rather than as a caution about doing nothing.
  const [bumped, setBumped] = React.useState(null);
  const set = (nextBp) => {
    const clamped = clampDuRateBp(nextBp);
    if (clamped === bp) { setBumped(nextBp < bp ? 'min' : 'max'); return; }
    setBumped(null);
    onChange(clamped / 10000);
  };

  const btn = (disabled) => ({
    width: 40, height: 40, border: 'none',
    backgroundColor: disabled ? '#EEF2F7' : COLORS.inputTint,
    color: disabled ? '#9CA3AF' : COLORS.brandGreen,
    fontSize: 20, fontWeight: 700, lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  });

  const ref = computeDuInflationReference(params);
  const sentence = duInflationSentence(params, ref);
  const showRef = Boolean(ref && sentence);
  const step = showRef ? nearestDuStep(ref.nominal) : null;
  const atGuide = showRef && Math.abs((value || 0) - step) < 1e-9;
  const url = params?.duInflationSourceUrl;

  const hint = (atMax && bumped === 'max') ? 'Maximum 10.00%.'
             : (atMin && bumped === 'min') ? 'Minimum 0.00%.'
             : '';

  return (
    <div style={styles.duBlock}>
      {/* ── the adjuster ── */}
      <div style={styles.duBlockTop}>
        <div style={{ flex: 1, minWidth: 210 }}>
          <div style={styles.duStepLabel}>Assumed annual DU rate increase</div>
          <div style={styles.duStepSub}>
            Adjusts payback, IRR and total savings. Levelized Cost of Energy is unaffected.
          </div>
          {hint && <div style={styles.duStepHint}>{hint}</div>}
        </div>
        <div style={styles.duStepper}>
          <button type="button" onClick={() => set(bp - DU_STEP_BP)} disabled={atMin}
                  style={btn(atMin)} aria-label="Decrease assumed annual DU rate increase by 0.25%">
            &minus;
          </button>
          <div style={styles.duStepValue}
               role="spinbutton"
               aria-valuemin={DU_MIN_BP / 100}
               aria-valuemax={DU_MAX_BP / 100}
               aria-valuenow={bp / 100}
               aria-valuetext={`${(bp / 100).toFixed(2)} percent`}
               aria-label="Assumed annual DU rate increase">
            {(bp / 100).toFixed(2)}%
          </div>
          <button type="button" onClick={() => set(bp + DU_STEP_BP)} disabled={atMax}
                  style={btn(atMax)} aria-label="Increase assumed annual DU rate increase by 0.25%">
            +
          </button>
        </div>
      </div>

      {/* ── the reference, inset under a divider in the SAME block ── */}
      {showRef && (
        <div style={styles.duBlockRef}>
          <div>
            <strong>For reference:</strong> {sentence}{' '}
            That works out to about <strong>{(ref.nominal * 100).toFixed(2)}% a year</strong>{' '}
            over {Math.round(ref.years)} years.
            {url && (
              <>
                {' '}
                <a href={url} target="_blank" rel="noopener noreferrer" style={styles.duGuideLink}>
                  View the source
                </a>.
              </>
            )}
          </div>
          <div style={styles.duGuideFine}>
            This is history, not a forecast, and it is not applied automatically —
            your assumed rate stays where you set it.
          </div>
          {atGuide ? (
            <div style={styles.duGuideFine}>
              <strong>Your setting matches this reference.</strong>
            </div>
          ) : (
            <button type="button" style={styles.duGuideBtn}
                    onClick={() => { setBumped(null); onChange(step); }}>
              Use {(step * 100).toFixed(2)}% — the nearest step
            </button>
          )}
        </div>
      )}
    </div>
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
  duStepLabel: {
    fontSize: 12.5, fontWeight: 600, letterSpacing: 0.4,
    color: '#4B5563', textTransform: 'uppercase',
  },
  duStepSub: {
    fontSize: 11.5, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 2,
  },
  duStepHint: { fontSize: 11, color: COLORS.warning, marginTop: 5 },
  duStepper: {
    display: 'flex', alignItems: 'center',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8,
    overflow: 'hidden', backgroundColor: '#FFFFFF',
  },
  duStepValue: {
    minWidth: 86, textAlign: 'center', fontSize: 17, fontWeight: 700,
    fontVariantNumeric: 'tabular-nums', color: COLORS.textBody,
  },
  // v3-184 — ONE block replacing the v3-183 pair. Outer surface matches the
  // metric tiles above so the adjuster reads as the last row of that stack;
  // the reference sits inset beneath a divider rather than in its own card.
  duBlock: {
    marginTop: 9, borderRadius: 9, backgroundColor: '#F5F2EA',
    border: '1px solid #E8E2D3', overflow: 'hidden',
  },
  duBlockTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 14, flexWrap: 'wrap', padding: '14px 18px',
  },
  duBlockRef: {
    borderTop: '1px solid #E1DAC8', backgroundColor: '#FBFAF6',
    padding: '12px 18px 14px',
    fontSize: 12, color: '#4A5A50', lineHeight: 1.65,
  },
  duGuideLink: { color: COLORS.brandGreen, fontWeight: 600 },
  duGuideFine: { fontSize: 11.5, marginTop: 6 },
  duGuideBtn: {
    marginTop: 9, background: '#FFFFFF', border: `1px solid ${COLORS.brandGreen}`,
    color: COLORS.brandGreen, font: 'inherit', fontSize: 11.5, fontWeight: 700,
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
  },
  duTariffNote: {
    fontSize: 12,
    color: COLORS.textBody,
    lineHeight: 1.6,
    padding: '8px 0',
    marginTop: 4,
  },
};
