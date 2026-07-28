// =============================================================================
// ENERGY VISUALS — between Step 2 and Step 3
// -----------------------------------------------------------------------------
// Holds the two visual charts that depend on Steps 1 + 2 inputs:
//   • Radiance Curve — 24-hour view of consumption layered with coverage from
//     solar / battery / net-metering, with celestial symbols (moon, sunrise,
//     sun, sunset, moon) above the chart and a dynamic green sentence below.
//   • Energy Use Coverage — stacked bar chart across 4 scenarios (No Solar,
//     Solar Only, Solar w/ Batteries, Solar w/ Batt. + Net-Metering).
//
// Net-metering checkbox lives next to the Energy Use Coverage chart so its
// visual effect (the 4th bar lights up green) is immediately clear.
// =============================================================================

import React from 'react';
import { Checkbox, CalloutBox, InfoTooltip, COLORS, fmt } from './ui.jsx';
import { ADMIN_PARAMS } from '../data/adminParams.js';
import RadianceCurve from './charts/RadianceCurve.jsx';
import CoverageBars from './charts/CoverageBars.jsx';

export default function EnergyVisuals({ state, updateState, model, disclaimers, mode = 'rep' }) {
  const { schedule, batteryKwh, systemKwp } = model;
  const isCustomer = mode === 'customer';

  // Build the dynamic green sentence:
  //   "20.2-kWp Solar [w/ 25-kWh Batteries] [& Net-Metering] covers X% of energy consumption."
  // Coverage % depends on which features are active.
  // v3-38: in customer mode, net metering is FORCIBLY suppressed in the UI even
  // if state.netMeteringEnabled is true (e.g. a rep had it on, then locked back
  // to customer mode — sessionStorage preserves the flag). Customer view hides
  // the NM checkbox, the 4th coverage bar, and all NM mentions, since the
  // recommended battery is sized to absorb daily excess solar — net metering
  // doesn't add measurable value at the recommended config, and exposing the
  // toggle invites confusion. `nmEnabledEffective` is the single source of
  // truth used throughout this component for "should we show NM-related UI".
  const hasBattery = batteryKwh > 0;
  const nmEnabledEffective = !isCustomer && !!state.netMeteringEnabled;
  const hasNm = nmEnabledEffective;

  // ─── Build the headline sentence ─────────────────────────────────────
  // Two-line structure (v3-45):
  //   Line 1: "<config> covers <%> of your energy consumption."
  //   Line 2: "You save <peso>/month!"
  // Both lines have ONE supersized 32px number; surrounding prose is 16px.
  //
  // Why two lines: when net-metering is enabled, the config label grows to
  // e.g. "10.1-kWp Solar w/ 10-kWh Batteries & Net-Metering", which makes a
  // single-line sentence overflow 1024px laptops no matter how aggressively
  // we trim. Splitting into two short lines is robust across every config
  // (small/large kWp, with/without battery, with/without NM) and structurally
  // clean: line 1 is "what's happening with your energy", line 2 is "what
  // it means in pesos". Two clean ideas, two lines, supersized numbers
  // anchor each line visually so the eye picks them up at a glance.
  //
  // The savings figure tracks the same NM-on/off branching as coverage %:
  //   - hasNm  → use monthlyPesoSavingsBattNm  (matches "& Net-Metering" label
  //              and the NM portion of coverage)
  //   - !hasNm → use monthlyPesoSavingsBatt    (battery + solar only — also
  //              the correct fallback when no battery, since with batteryKwh=0
  //              the schedule lib's afterBatt collapses to afterPanels and
  //              this number becomes solar-only savings)
  // Customer mode never has NM (nmEnabledEffective forces false above), so
  // customers always see the non-NM figure regardless of state flags.
  const monthlySavings = hasNm
    ? schedule.monthlyPesoSavingsBattNm
    : schedule.monthlyPesoSavingsBatt;

  let coveragePct;
  let configLabel = `${fmt.num(systemKwp, 1)}-kWp Solar`;
  if (hasBattery && hasNm) {
    coveragePct = schedule.coverageBars[3].solar
                + schedule.coverageBars[3].battery
                + schedule.coverageBars[3].netMetering;
    configLabel += ` w/ ${batteryKwh}-kWh Batteries & Net-Metering`;
  } else if (hasBattery) {
    coveragePct = schedule.coverageBars[2].solar
                + schedule.coverageBars[2].battery;
    configLabel += ` w/ ${batteryKwh}-kWh Batteries`;
  } else if (hasNm) {
    // Solar + NM but no battery: solar (F40) + the NM portion above battery (F52-F40)
    // Since with no battery, F51 = F40, so F52 - F40 represents net-metering credits.
    const nmOnly = Math.max(0, schedule.coverageBars[3].netMetering
                  + schedule.coverageBars[3].battery);
    coveragePct = schedule.coverageBars[1].solar + nmOnly;
    configLabel += ` w/ Net-Metering`;
  } else {
    coveragePct = schedule.coverageBars[1].solar;
  }
  // Pre-format the two supersized number tokens; surrounding prose is
  // built inline in the JSX below.
  const headlinePctText  = fmt.pct(coveragePct, 1);
  const headlinePesoText = fmt.peso(monthlySavings);

  return (
    <div style={styles.section} data-pdf-capture="visualizing">
      <h2 style={styles.sectionTitle}>Visualizing your system</h2>
      <p style={styles.sectionSubtitle}>
        Based on your consumption and the package you've configured above, here's how
        your home's energy story plays out across a typical day and across configurations.
      </p>

      {/* ─── Radiance Curve ─── */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <h3 style={styles.chartTitle}>
            Radiance Curve
          </h3>
          {/* v3-76: tooltip expanded per user direction — the v3-72
              inverter-vs-kWp copy (peak POWER expectations) now shares the
              popover with seasonal ENERGY-yield expectations. The two heat/
              derating paragraphs were merged into one to keep the 340px
              popover from getting too tall. The 5.0 / 3.4 kWh-per-kWp range
              is Solviva FIELD DATA (observed daily averages: bright summer
              months vs the rainy and cooler months — the dip is driven
              mainly by cloud cover, not temperature, so the copy says
              "rainy and cooler" rather than just "cooler") and is
              deliberately hardcoded. The conservative year-round average is
              INTERPOLATED LIVE from ADMIN_PARAMS.kWhPerKwpPerDay (the
              paramsService in-place-mutation pattern — the same live object
              calculations.js prices from), so the sentence can never drift
              from what the model actually assumes when Engineering edits
              the yield. If the param is ever set OUTSIDE the observed
              3.4–5.0 band, the copy will read oddly ("conservative average
              of 5.5" beside "up to 5.0 observed") — at that point the copy
              is the least of the problems, but it's the one drift scenario.
              The v3-72 "roughly half your kWp" claim stays: peak radiance
              ratio 0.132 × 3.8 = 0.5016 ≈ half. */}
          <InfoTooltip
            ariaLabel="What your system actually produces"
            content={
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 700, color: COLORS.brandGreen, marginBottom: 6 }}>
                  What your system actually produces
                </div>
                <p style={{ margin: '0 0 8px' }}>
                  Your kWp figure is a lab rating — measured at full midday sun with
                  cool 25&nbsp;°C panels. Real output runs lower and follows the sun:
                  near zero at sunrise and sunset, highest around noon. Heat (a big
                  factor here in the Philippines), dust, and cabling and inverter
                  losses trim it further — expect a clear-day midday peak of{' '}
                  <strong>roughly half your kWp rating</strong>.
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  Seasons and weather matter too. Solviva systems have produced daily
                  averages of up to <strong>5.0&nbsp;kWh per kWp</strong> in the bright
                  summer months, easing to around <strong>3.4</strong> through the
                  rainy and cooler months. This calculator uses a conservative
                  year-round average of{' '}
                  <strong>
                    {Number((ADMIN_PARAMS.kWhPerKwpPerDay).toFixed(1))}&nbsp;kWh per
                    kWp per day
                  </strong>{' '}
                  — so in many months your system will outperform the projections
                  shown here.
                </p>
                <p style={{ margin: 0 }}>
                  An inverter reading below your kWp number is normal, not a fault.
                </p>
              </div>
            }
          />
        </div>
        <RadianceCurve
          rows={schedule.rows}
          totals={schedule.totals}
        />

        {/* Dynamic green headline — TWO lines, each anchoring its own
            supersized number:
              Line 1: "<config> covers <%> of your energy consumption."
              Line 2: "You save <peso>/month!"
            Stacked as two separate div blocks (not <br/> in one block) so
            the line break is structural — never depends on character count
            or viewport width. Robust across every config (NM on/off,
            battery sizes, kWp values). On narrower viewports each line can
            still wrap naturally if needed; on desktop both lines fit
            comfortably. */}
        <div className="headline-sentence-wrap" style={styles.headlineSentence}>
          <div style={styles.headlineLine}>
            <span style={styles.headlineProse}>{configLabel} covers </span>
            <span style={styles.headlinePct}>{headlinePctText}</span>
            <span style={styles.headlineProse}> of your energy consumption.</span>
          </div>
          <div style={styles.headlineLine2}>
            <span style={styles.headlineProse}>You save </span>
            <span style={styles.headlinePct}>{headlinePesoText}</span>
            <span style={styles.headlineProse}>/month!</span>
          </div>
        </div>
      </div>

      {/* ─── Energy Use Coverage ─── */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <h3 style={styles.chartTitle}>Energy Use Coverage</h3>
        </div>
        <p style={styles.chartSubtitle}>
          How much of your monthly bill comes from each source under different configurations.
        </p>
        {/* v3-77: the 4th bar (Solar w/ Batt. & Net Met.) only renders when net
            metering is actually enabled. With NM off it duplicates bar 3 with an
            empty blue segment — noise. `nmEnabledEffective` is already forced
            false in customer mode, so the customer view is unchanged. */}
        <CoverageBars bars={schedule.coverageBars} showNm={nmEnabledEffective} />

        {/* Net-metering toggle sits directly under the Coverage Bars chart so the
            visual effect of toggling it (the 4th bar growing green) is obvious.
            v3-38: hidden entirely in customer mode — the toggle has no useful
            effect at the recommended battery size and adds confusion. */}
        {!isCustomer && (
          <div style={styles.nmToggleRow}>
            <Checkbox
              checked={state.netMeteringEnabled}
              onChange={v => updateState({ netMeteringEnabled: v })}
              label="Calculate with net metering (sell excess solar back to the grid)"
            />
          </div>
        )}

        <div style={styles.coverageNote}>
          With your current configuration, expected monthly savings:{' '}
          <strong>{fmt.peso(schedule.monthlyPesoSavingsBatt)}</strong>
          {nmEnabledEffective && schedule.incrementalNmSavings > 0 && (
            <> + <strong>{fmt.peso(schedule.incrementalNmSavings)}</strong> from net metering
              = <strong>{fmt.peso(schedule.monthlyPesoSavingsBattNm)}</strong></>
          )}
        </div>

        {/* When net metering is enabled but yields no incremental savings,
            tell the customer why instead of leaving them to wonder. The most
            common reason: the battery package is large enough to absorb all
            excess solar, leaving nothing to sell back to the grid.
            v3-38: gated behind nmEnabledEffective so the explainer never fires
            in customer mode (where the toggle is hidden). */}
        {nmEnabledEffective
            && schedule.incrementalNmSavings <= 0
            && batteryKwh > 0 && (
          <div style={styles.nmExplainer}>
            <strong>Net metering would generate no incremental savings here.</strong>{' '}
            Your {batteryKwh}-kWh battery package is expected to absorb all available
            excess solar energy — there's nothing left over to sell back to the grid.
            Net metering becomes valuable when daily solar production
            exceeds what your batteries can store.
          </div>
        )}
        {nmEnabledEffective
            && schedule.incrementalNmSavings <= 0
            && batteryKwh === 0 && (
          <div style={styles.nmExplainer}>
            <strong>Net metering yields no savings here</strong> because your
            current configuration produces no excess solar to sell back to the grid.
          </div>
        )}

        {/* CFEI / Net-Metering legal disclosure. Required whenever the
            customer opts into net metering, since net-metering applications
            depend on the CFEI and Solviva does not handle either process.
            Surfaced inline (not behind a `<details>`) so the customer
            actually reads it before reaching Step 3 / signing.
            v3-38: gated behind nmEnabledEffective — never surfaces in
            customer mode (consistent with the other NM-suppression rules). */}
        {nmEnabledEffective && disclaimers?.cfeiDisclaimer && (
          <div style={styles.cfeiBlock}>
            <CalloutBox kind="warn">
              {(() => {
                // First paragraph is the heading; the rest are body paragraphs.
                const [heading, ...body] = disclaimers.cfeiDisclaimer.split('\n\n');
                return (
                  <>
                    <div style={styles.cfeiHeading}>{heading}</div>
                    {body.map((para, i) => (
                      <p key={i} style={styles.cfeiPara}>{para}</p>
                    ))}
                  </>
                );
              })()}
            </CalloutBox>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.textBody,
    margin: '0 0 4px',
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    margin: '0 0 20px',
    lineHeight: 1.5,
  },
  chartCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 12,
    border: `1px solid ${COLORS.divider}`,
    padding: '24px 28px',
    marginBottom: 20,
  },
  chartHeader: {
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.brandGreen,
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chartSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    margin: '0 0 14px',
  },
  coverageNote: {
    marginTop: 12,
    padding: '10px 14px',
    backgroundColor: COLORS.brandCream,
    borderRadius: 6,
    fontSize: 13,
    color: COLORS.textBody,
    lineHeight: 1.6,
  },
  headlineSentence: {
    marginTop: 12,
    padding: '16px 20px',
    background: '#ECFDF5',
    border: `1px solid #A7F3D0`,
    borderRadius: 6,
    color: '#065F46',
    textAlign: 'center',
    lineHeight: 1.3,
    // v3-44: nowrap removed (was forcing single-line on desktop, with a
    // mobile media query overriding). v3-45: two-line structure makes any
    // single-line constraint moot — line breaks are now structural via
    // headlineLine + headlineLine2 div blocks. Each line wraps naturally
    // on viewports too narrow to fit it; centered text-align keeps wraps
    // looking clean. The .headline-sentence-wrap classname is retained
    // for backward compatibility with the (now no-op) mobile CSS rule.
  },
  // v3-45: each headline line is its own block so the line break is
  // structural, never dependent on character count or viewport width.
  // Line 1 = config + coverage %; line 2 = "You save <peso>/month!".
  // 6px gap between lines to visually pair them as related but distinct
  // beats — line 1 is "what's happening", line 2 is "what it means".
  headlineLine: {
    // First line — no top margin (the parent's padding handles top inset).
  },
  headlineLine2: {
    marginTop: 6,
  },
  headlineProse: {
    fontSize: 16,
    fontWeight: 600,
  },
  headlinePct: {
    fontSize: 32,
    fontWeight: 700,
    verticalAlign: '-2px',
    margin: '0 4px',
  },
  nmToggleRow: {
    marginTop: 14,
    padding: '10px 14px',
    backgroundColor: '#F9FAFB',
    border: `1px dashed ${COLORS.divider}`,
    borderRadius: 6,
  },
  nmExplainer: {
    marginTop: 10,
    padding: '10px 14px',
    backgroundColor: '#FEF3C7',
    border: '1px solid #FCD34D',
    borderRadius: 6,
    fontSize: 12,
    color: '#78350F',
    lineHeight: 1.55,
  },
  // CFEI/Net-Metering disclosure block — wraps the CalloutBox with vertical
  // breathing room so it stands as its own legal beat between the net-metering
  // controls above and Step 3 below.
  cfeiBlock: {
    marginTop: 16,
  },
  // Bold orange heading inside the CFEI callout — matches the screenshot
  // reference where the section title leads in a warning amber.
  cfeiHeading: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 8,
  },
  // Each body paragraph of the disclosure.
  cfeiPara: {
    margin: '0 0 8px',
    fontSize: 12,
    lineHeight: 1.55,
  },
};
