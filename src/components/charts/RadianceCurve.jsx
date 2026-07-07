// =============================================================================
// RADIANCE CURVE — 24-hour energy chart matching the Excel original
// -----------------------------------------------------------------------------
// This chart visualizes a single day of consumption vs. solar production.
// It does NOT include battery or net-metering coverage — those scenarios are
// shown separately in the Energy Use Coverage stacked-bar chart below.
//
// Layers (bottom → top):
//   1. Baseload area (slate-blue) — constant 24-hour baseline consumption
//   2. Major Devices area (orange) — stacked above baseload for the hours
//      when listed devices are running (= total consumption when both stacked)
//   3. Excess Solar area (yellow-green) — the part of the solar production
//      bell curve that sits ABOVE the consumption stack (i.e. the unused
//      solar that would either charge a battery, feed back to grid via NM,
//      or be wasted if neither is configured)
//
// Plus on top: green "Solar Coverage of Energy Use" line — the portion of
// each hour's consumption that's directly covered by solar production.
//
// Above the chart: a celestial-arc timeline with 5 symbols (moon → sunrise →
// sun → sunset → moon) following a parabolic path — the sun at the apex,
// moons near the horizon.
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fmt, COLORS, RADIANCE_CURVE_INFO } from '../ui.jsx';
import { assetPath } from '../../lib/assetPath.js';

// Color palette (v3-37: unified palette so the same hue serves as text in the
// new Radiance Curve tooltip, as the chart stroke, and as the legend swatch
// border. The stroke/voice color is the canonical reference for each
// category; the fill is a lighter tint of the same hue. Solar Coverage is
// line-only so it just uses its single color):
//
//                  Stroke / voice (text, legend, tooltip)   Fill (chart only)
const COLOR_BASELOAD          = '#B8C9E3';   // light blue fill — baseload
const COLOR_BASELOAD_STROKE   = '#4A6FA5';   // canonical baseload "voice"
const COLOR_DEVICES           = '#F4B860';   // light orange fill — major devices
const COLOR_DEVICES_STROKE    = '#B8730D';   // canonical major-devices "voice"
const COLOR_EXCESS_SOLAR      = '#C9E089';   // light green fill — excess solar
const COLOR_EXCESS_STROKE     = '#6FA830';   // canonical excess-solar "voice"
const COLOR_COVERAGE_LN       = '#1F8A4C';   // dark green line — solar coverage

export default function RadianceCurve({ rows, totals }) {
  // ─── Viewport tracking for legend layout ─────────────────────────────────
  // Desktop renders the legend vertically on the right of the chart, in the
  // same top-down order the data stacks visually (Excess Solar at top of the
  // stack → Solar Coverage line on top of all). Mobile reverts to a horizontal
  // bottom legend so the chart itself gets full width.
  // ─── Viewport tracking ────────────────────────────────────────────────────
  // We track TWO independent viewport flags:
  //
  //   isMobile          — narrow OR short viewports. Triggers the bottom-
  //                       horizontal legend layout (so the chart gets full
  //                       width). Catches phone portrait (narrow) AND phone
  //                       landscape (short, even though width > 767px).
  //
  //   isShortViewport   — short viewports only (max-height: 500px). When
  //                       true, the celestial timeline and chart heights
  //                       compress so the whole radiance card has a chance
  //                       of fitting in one phone-landscape screen without
  //                       scrolling.
  const [isMobile, setIsMobile] = useState(false);
  const [isShortViewport, setIsShortViewport] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    // "Compact" viewport — phone in portrait OR landscape. Either dimension
    // small enough that we should prioritize chart width over a side legend.
    const mqCompact = window.matchMedia('(max-width: 767px), (max-height: 500px)');
    const mqShort   = window.matchMedia('(max-height: 500px)');
    const update = () => {
      setIsMobile(mqCompact.matches);
      setIsShortViewport(mqShort.matches);
    };
    update();
    const subscribe = (mq) => {
      if (mq.addEventListener) mq.addEventListener('change', update);
      else mq.addListener(update);
    };
    const unsubscribe = (mq) => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
    subscribe(mqCompact); subscribe(mqShort);
    return () => { unsubscribe(mqCompact); unsubscribe(mqShort); };
  }, []);

  // ─── Build chart data ─────────────────────────────────────────────────────
  // 'Excess Solar' is computed as max(0, solar − totalLoad) and stacked on
  // the same stackId as Baseload + Major Devices, so the visual top of the
  // stack equals max(totalLoad, solar) — which is exactly what the Excel
  // chart shows.
  const baseData = rows.map(r => ({
    hour: r.hourLabel,
    'Baseload':       Number(r.baseLoad.toFixed(3)),
    'Major Devices':  Number(r.devicesLoad.toFixed(3)),
    'Excess Solar':   Number(Math.max(0, r.solar - r.totalLoad).toFixed(3)),
    'Solar Coverage': Number(r.solarUsed.toFixed(3)),
  }));
  // Append a 25th point that duplicates hour 0's values, labeled "12MN".
  // This closes the visual loop — the chart x-axis runs from 12MN at hour 0
  // through to 12MN again at hour 24, making the 24-hour cycle explicit.
  const data = [
    ...baseData,
    { ...baseData[0], hour: '12MN' },
  ];

  // ─── Y-axis domain ────────────────────────────────────────────────────────
  // Recharts' default auto-scaling rounds up to a "nice" tick that often
  // leaves nearly half the chart empty. We compute the actual maximum stacked
  // value (baseload + devices + excess solar) and snap up to a clean tick
  // boundary so the Y-axis labels are still readable round numbers.
  const peakValue = data.reduce((max, d) => {
    const stacked = (d['Baseload'] || 0) + (d['Major Devices'] || 0) + (d['Excess Solar'] || 0);
    const coverage = d['Solar Coverage'] || 0;
    return Math.max(max, stacked, coverage);
  }, 0);
  // niceMax: round up `peakValue * 1.1` (10% headroom) to a clean step. We
  // pick the step based on magnitude so small data (~1 kWh) gets 0.5 steps
  // while large data (~50 kWh) gets steps of 5 or 10.
  const niceMax = (raw) => {
    if (raw <= 0) return 1;
    const padded = raw * 1.1;
    let step = 1;
    if (padded < 1)       step = 0.2;
    else if (padded < 5)  step = 0.5;
    else if (padded < 20) step = 2;
    else if (padded < 50) step = 5;
    else                  step = 10;
    return Math.ceil(padded / step) * step;
  };
  const yMax = niceMax(peakValue);

  // Pre-compute coverage % for the inline annotation.
  // Matches Excel CALCULATOR cells:
  //   solarCoveragePctOfProduction = solarUsed / totalSolar
  //   solarCoveragePctOfUse        = solarUsed / totalLoad
  const pctOfProduction = totals.solar > 0 ? totals.solarUsed / totals.solar : 0;
  const pctOfUse        = totals.totalLoad > 0 ? totals.solarUsed / totals.totalLoad : 0;

  // v3-43: Recharts auto-legend has been retired. The four colored words
  // ("blue / orange / dark green line / light green") inside the always-
  // visible RADIANCE_CURVE_INFO explainer (rendered to the right of the
  // chart on desktop, collapsible below the chart on mobile) now serve as
  // the legend. The chip-and-keyword treatment in the explainer carries the
  // same chart fill + voice-stroke color pairing the old Legend used, so
  // visual continuity is preserved without the duplicate legend block.
  //
  // chartMargin: right is small now (24px) since the explainer is OUTSIDE
  // the chart's SVG via an outer flex container — the chart no longer needs
  // to reserve internal space for a vertical legend. This gains ~108px of
  // plot area on desktop while still leaving a 24px breathing pad against
  // the explainer column.
  const chartMargin = { top: 12, right: 24, left: 0, bottom: 6 };

  // ─── Celestial track alignment ───────────────────────────────────────────
  // We measure the chart's actual first-tick and last-tick positions after
  // render and use them to position the celestial timeline. This avoids any
  // brittle calibration against Recharts' internal padding/margin behavior,
  // which can vary across versions and viewport sizes.
  //
  // chartContainerRef wraps both the celestial track and the chart, so all
  // measurements share a common coordinate system.
  const chartContainerRef = useRef(null);
  const [trackBounds, setTrackBounds] = useState({ left: 60, right: 24 });

  // Re-measure on every render that could move the chart: viewport changes,
  // legend layout flip, data changes, etc. Recharts mounts asynchronously,
  // so we use a small delayed measurement plus a ResizeObserver.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const measure = () => {
      const container = chartContainerRef.current;
      if (!container) return;
      const ticks = container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick');
      if (ticks.length < 2) return;
      const first = ticks[0].getBoundingClientRect();
      const last  = ticks[ticks.length - 1].getBoundingClientRect();
      const cont  = container.getBoundingClientRect();
      const firstCx = (first.x + first.width / 2) - cont.x;
      const lastCx  = (last.x + last.width / 2) - cont.x;
      const rightOffset = cont.width - lastCx;
      setTrackBounds({ left: firstCx, right: rightOffset });
    };
    // Initial measurement after the chart has rendered. Recharts' layout
    // settles in two phases — the SVG mounts, then the legend/axes get sized
    // and the plot area shifts. We measure twice (50ms + 250ms) to catch the
    // final state without flickering, plus a ResizeObserver for any later
    // changes (window resize, font swap, etc).
    const t1 = setTimeout(measure, 50);
    const t2 = setTimeout(measure, 250);
    const ro = new ResizeObserver(measure);
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);
    return () => { clearTimeout(t1); clearTimeout(t2); ro.disconnect(); };
  }, [isMobile, isShortViewport, data.length]);   // re-measure when layout flips or data shape changes

  return (
    <div>
      {/*
        v3-43: Two-column layout on desktop — chart (with celestial timeline
        on top) on the left, always-visible explainer panel on the right.
        The explainer replaces the recharts auto-legend; its colored keywords
        and chips serve as the legend, while the surrounding prose explains
        what each color means.

        On mobile/phone-landscape (`isMobile` covers narrow OR short viewports),
        the explainer becomes a collapsible <details> beneath the chart so
        it doesn't crowd the chart on small screens but is still discoverable.

        The chart's celestial timeline is measured against `chartContainerRef`,
        which now wraps just the chart column (not the explainer column). That
        keeps the celestial-symbol alignment math correct: trackLeft/trackRight
        are relative to the chart's own x-tick positions, and the chart column
        doesn't include the explainer's width.
      */}
      <div style={isMobile ? styles.layoutStacked : styles.layoutTwoCol}>
        <div ref={chartContainerRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {/* Celestial-arc timeline — positioned absolutely above the chart.
              See chartContainerRef logic above for measurement strategy. */}
          <CelestialTimeline
            trackLeft={trackBounds.left}
            trackRight={trackBounds.right}
            compact={isShortViewport}
          />

          <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={isShortViewport ? 220 : 300}>
              <ComposedChart data={data} margin={chartMargin}>
                <CartesianGrid stroke="#EEEEEE" vertical={false} />
                <XAxis
                  dataKey="hour"
                  interval={2}
                  tick={{ fontSize: 11, fill: COLORS.textMuted }}
                  stroke="#CCCCCC"
                />
                <YAxis
                  domain={[0, yMax]}
                  tick={{ fontSize: 11, fill: COLORS.textMuted }}
                  stroke="#CCCCCC"
                  label={{ value: 'kWh', angle: -90, position: 'insideLeft',
                           style: { textAnchor: 'middle', fontSize: 11, fill: COLORS.textMuted } }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [`${fmt.num(Number(value), 2)} kWh`, name]}
                  labelStyle={{ color: COLORS.textBody, fontWeight: 600 }}
                />
                {/* v3-43: <Legend> removed — see explainer panel to the right
                    (desktop) or the collapsible "How to read this chart"
                    block below the chart (mobile). */}

                {/* Stacked consumption: baseload (bottom) + major devices (above) */}
                {/* v3-37: stroke is the canonical "voice" color (also used in
                    the Radiance Curve explainer for the colored words), fill is a
                    lighter tint. Stroke width 1 reads as a definition edge, not
                    a heavy border. */}
                <Area type="monotone" dataKey="Baseload"
                      stackId="cons" stroke={COLOR_BASELOAD_STROKE} strokeWidth={1}
                      fill={COLOR_BASELOAD} fillOpacity={0.85} />
                <Area type="monotone" dataKey="Major Devices"
                      stackId="cons" stroke={COLOR_DEVICES_STROKE} strokeWidth={1}
                      fill={COLOR_DEVICES} fillOpacity={0.80} />

                {/* Excess solar — stacked ON TOP of consumption so it visually
                    sits above the consumption skyline exactly where the bell
                    curve exceeds total load. */}
                <Area type="monotone" dataKey="Excess Solar"
                      stackId="cons" stroke={COLOR_EXCESS_STROKE} strokeWidth={1}
                      fill={COLOR_EXCESS_SOLAR} fillOpacity={0.85} />

                {/* Solar Coverage of Energy Use — green line tracking the portion
                    of consumption directly covered by solar each hour */}
                <Line type="monotone" dataKey="Solar Coverage"
                      stroke={COLOR_COVERAGE_LN} strokeWidth={2.5}
                      dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Always-visible explainer (desktop only). Sized to the right column
            in a 2-column flex layout. The width is pinned in styles.explainer
            so it doesn't compete with the chart column for space; the chart
            takes the rest via flex:1.
            On mobile, this branch is skipped — the explainer renders below
            the chart via the collapsible <details> instead. */}
        {!isMobile && (
          <aside style={styles.explainer}>
            {RADIANCE_CURVE_INFO}
          </aside>
        )}
      </div>

      {/* Mobile-only: collapsible explainer below the chart. The same
          RADIANCE_CURVE_INFO content shown on desktop's right column, but
          tucked behind a tap so phones don't have to scroll past a long
          paragraph. The summary is styled as a quiet link-like row to invite
          the tap without dominating the layout. */}
      {isMobile && (
        <details style={styles.mobileExplainerDetails}>
          <summary style={styles.mobileExplainerSummary}>
            How to read this chart
          </summary>
          <div style={styles.mobileExplainerBody}>
            {RADIANCE_CURVE_INFO}
          </div>
        </details>
      )}

      {/* Coverage annotation — sits below the chart, above the totals strip,
          so it doesn't obstruct the bell curve or the coverage line. The
          asterisk note clarifies that this percentage is the BARE solar
          coverage, before batteries or net-metering. */}
      <div style={annotationStyles.belowChart}>
        <strong>{fmt.pct(pctOfProduction, 0)}</strong> of solar energy capture
        covers <strong>{fmt.pct(pctOfUse, 0)}</strong> of energy consumption *
        <div style={annotationStyles.footnote}>
          * Before Batteries and Net-Metering
        </div>
      </div>

      {/* Daily totals strip — note: "Solar used directly" and "Daily excess
          solar" are computed BEFORE batteries and net-metering kick in. The
          asterisk + footnote below makes that explicit. */}
      <div style={summaryStyles.totalsStrip}>
        <TotalCell label="Daily total consumption"   value={`${fmt.num(totals.totalLoad, 1)} kWh`} />
        <TotalCell label="Daily solar production"    value={`${fmt.num(totals.solar, 1)} kWh`} accent />
        <TotalCell label="Solar used directly *"     value={`${fmt.num(totals.solarUsed, 1)} kWh`} />
        <TotalCell label="Daily excess solar *"      value={`${fmt.num(totals.excessSolar, 1)} kWh`} />
      </div>
      <div style={summaryStyles.totalsFootnote}>
        * Before batteries and net-metering. With batteries, excess solar is
        stored for nighttime use; with net-metering, it's sold back to the grid.
      </div>
    </div>
  );
}

// ─── CelestialTimeline (parabolic-arc layout) ───────────────────────────────
// Five SVG glyphs across the top of the chart positioned so they trace an
// arc — moons low (near horizon), sunrise/sunset mid-height, sun at apex.
//
// Math: vertical offset follows a parabola where:
//   x = 0.0 (midnight)  → y = 0  (low, near horizon)
//   x = 0.25 (sunrise)  → y = 0.75 of arc height
//   x = 0.5 (noon)      → y = 1.0 of arc height (apex)
//   x = 0.75 (sunset)   → y = 0.75 of arc height
//   x = 1.0 (next midnight) → y = 0
function CelestialTimeline({ trackLeft, trackRight, compact = false }) {
  // Compress on short viewports (phone landscape) so the radiance card has a
  // chance of fitting in one screen without scrolling. Smaller arc, smaller
  // symbols. The arc fraction formula is unchanged — only the absolute
  // pixel scale.
  // v3-42: SUN_SIZE bumped 56→72 desktop, 36→44 compact-mobile. The TwinSun
  // glyph (8 yellow rays + green inner sun) has more empty space between its
  // rays than the simple yellow `logo-sun-v2.png` it replaced in v3-41, so at
  // 56px it read as visually lighter than the solid 28px moon glyphs at the
  // arc's bookends. 72px restores visual parity with the moons. Vertical
  // clearance still works: desktop sun apex is at bottomPx=60, sun's top edge
  // sits at 60 + (72/2) = 96, leaving 4px below TIMELINE_H=100. Compact
  // version uses 44 (not 48) so the sun's top edge sits at 36 + (44/2) = 58,
  // leaving 2px below the compact TIMELINE_H of 60. ICON_SIZE for the
  // smaller glyphs (moons, sunrise, sunset) is unchanged.
  const ARC_HEIGHT = compact ? 36 : 60;
  const TIMELINE_H = compact ? 60 : 100;
  const SUN_SIZE   = compact ? 44 : 72;
  const ICON_SIZE  = compact ? 20 : 28;

  // 5 symbols positioned at hour fractions of a 24-hour day. Hour-tick
  // positions: moons at 2AM/10PM bookend the deep-night hours; sunrise at
  // 7AM and sunset at 5PM frame the "useful daylight" window — these are
  // visual anchors only, not a literal solar elevation curve.
  const symbols = [
    { x:  2/24, kind: 'moon'    },  //  2AM
    { x:  7/24, kind: 'sunrise' },  //  7AM
    { x: 12/24, kind: 'sun'     },  // 12NN
    { x: 17/24, kind: 'sunset'  },  //  5PM
    { x: 22/24, kind: 'moon'    },  // 10PM
  ];

  // Arc height fraction at position x (0..1):
  //   peaks at x=0.5, equals 0 at x=0 and x=1
  //   formula: 1 − ((x−0.5)*2)²
  const arcFrac = (x) => 1 - Math.pow((x - 0.5) * 2, 2);

  // The outer row reserves vertical space (TIMELINE_H) for the chart layout.
  // The inner track is absolutely positioned to span exactly from the chart's
  // first x-tick (trackLeft) to its last x-tick (trackRight from container's
  // right edge). Within the track, symbols use percentage-based `left` which
  // now correctly maps to chart x-axis hours.
  return (
    <div style={{ height: TIMELINE_H, position: 'relative', marginBottom: 4 }}>
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0,
        left: trackLeft,
        right: trackRight,
      }}>
        {symbols.map((s, i) => {
          const SIZE = s.kind === 'sun' ? SUN_SIZE : ICON_SIZE;
          const bottomPx = arcFrac(s.x) * ARC_HEIGHT;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${s.x * 100}%`,
              bottom: bottomPx,
              transform: 'translate(-50%, 50%)',
              width: SIZE, height: SIZE,
            }}>
              {s.kind === 'sun'     && <img src={assetPath('twinsun-v3.png')} alt=""
                                            width={SIZE} height={SIZE}
                                            style={{ display: 'block' }} />}
              {s.kind === 'moon'    && <MoonGlyph    size={SIZE} />}
              {s.kind === 'sunrise' && <SunriseGlyph size={SIZE} />}
              {s.kind === 'sunset'  && <SunsetGlyph  size={SIZE} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function MoonGlyph({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill="#475569" stroke="#475569" strokeWidth="1.4"
            strokeLinejoin="round" />
      <circle cx="6" cy="6" r="0.8" fill="#475569" />
      <circle cx="3" cy="9" r="0.6" fill="#475569" />
    </svg>
  );
}

function SunriseGlyph({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round">
      <line x1="2" y1="18" x2="22" y2="18" />
      <path d="M6 18 A6 6 0 0 1 18 18" fill="#FBBF24" stroke="#F59E0B" />
      <line x1="12" y1="3" x2="12" y2="6" />
      <line x1="4.6" y1="6.6" x2="6.7" y2="8.7" />
      <line x1="19.4" y1="6.6" x2="17.3" y2="8.7" />
      <path d="M9 21 L12 15 L15 21" fill="none" />
    </svg>
  );
}

function SunsetGlyph({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="#F97316" strokeWidth="1.6" strokeLinecap="round">
      <line x1="2" y1="18" x2="22" y2="18" />
      <path d="M6 18 A6 6 0 0 1 18 18" fill="#FB923C" stroke="#F97316" />
      <line x1="12" y1="3" x2="12" y2="6" />
      <line x1="4.6" y1="6.6" x2="6.7" y2="8.7" />
      <line x1="19.4" y1="6.6" x2="17.3" y2="8.7" />
      <path d="M9 15 L12 21 L15 15" fill="none" />
    </svg>
  );
}

function TotalCell({ label, value, accent }) {
  return (
    <div style={summaryStyles.cell}>
      <div style={summaryStyles.cellLabel}>{label}</div>
      <div style={{
        ...summaryStyles.cellValue,
        // v3-37: use the canonical "voice" color for text contrast on white,
        // not the fill (the fill is too light to read as body text).
        color: accent ? COLOR_DEVICES_STROKE : COLORS.textBody,
      }}>
        {value}
      </div>
    </div>
  );
}

// v3-43: layout styles for the chart-plus-explainer composition.
//   layoutTwoCol  — desktop: chart column + explainer column side-by-side
//   layoutStacked — mobile: chart column only (explainer renders below as
//                    a separate <details> block)
//   explainer     — desktop right-column panel containing RADIANCE_CURVE_INFO
//   mobileExplainer{Details,Summary,Body} — collapsible "How to read this
//                    chart" block on mobile, rendered below the chart
const styles = {
  // Two-column flex on desktop. The chart column gets `flex: 1` so it absorbs
  // all remaining width after the explainer's pinned width. `min-width: 0`
  // is critical inside flex children that contain a ResponsiveContainer —
  // without it, the chart's intrinsic minimum content size can prevent it
  // from shrinking and overflow the card on narrow desktop widths.
  layoutTwoCol: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 24,
  },
  // Mobile layout collapses the row to a single chart column; the explainer
  // is then rendered separately below via the <details> block.
  layoutStacked: {
    display: 'block',
  },
  // Right-side explainer panel — pinned to ~260px so the chart still gets
  // ample width on a 1200px content column. Vertically centered (alignSelf)
  // so on shorter chart heights the prose doesn't pin to the top and look
  // disconnected from the chart it explains.
  explainer: {
    flex: '0 0 260px',
    fontSize: 13,
    color: '#444441',
    paddingTop: 60,            // align top of body text with the chart's
                               // first plot row, accounting for the
                               // celestial timeline above the chart
    paddingLeft: 4,
    boxSizing: 'border-box',
  },
  // Mobile collapsible — quiet styling so it reads as a secondary affordance,
  // not a CTA. The summary row is a discreet link-like row; tapping reveals
  // the full explainer body.
  mobileExplainerDetails: {
    marginTop: 12,
    padding: '8px 12px',
    backgroundColor: '#FAFAF7',
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 6,
  },
  mobileExplainerSummary: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.brandGreen,
    cursor: 'pointer',
    listStyle: 'revert',       // keep native disclosure triangle as the
                               // tap-to-expand affordance
    userSelect: 'none',
  },
  mobileExplainerBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${COLORS.divider}`,
    fontSize: 13,
  },
};

const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  border: `1px solid ${COLORS.divider}`,
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 12,
};

const annotationStyles = {
  belowChart: {
    margin: '12px auto 0',
    fontSize: 13,
    fontWeight: 600,
    color: '#1F8A4C',
    textAlign: 'center',
    lineHeight: 1.4,
    maxWidth: '92%',
  },
  footnote: {
    fontSize: 11,
    fontWeight: 400,
    fontStyle: 'italic',
    color: '#64748B',
    marginTop: 2,
  },
};

const summaryStyles = {
  totalsStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 8,
    marginTop: 16,
    backgroundColor: COLORS.brandCream,
    padding: 14,
    borderRadius: 8,
  },
  totalsFootnote: {
    marginTop: 6,
    paddingLeft: 14,
    paddingRight: 14,
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    lineHeight: 1.5,
    textAlign: 'right',  // align footnote to the right so it sits visually
                         // close to the "*"-marked totals above it (Solar
                         // used directly *  /  Daily excess solar *)
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  cellLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellValue: {
    fontSize: 18,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
};
