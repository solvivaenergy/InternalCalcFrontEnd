// =============================================================================
// CONSUMPTION DONUT — Step 1 visual
// -----------------------------------------------------------------------------
// Shows the user's estimated monthly consumption split between day-time and
// night-time use, with the total kWh in the center of the donut.
//
// Per user direction: "We can convert the pie chart into a donut with the
// total consumption number in the center of the donut."
//
// Excel source: chart1.xml on CALCULATOR sheet
//   • Series: P28 ("Day Time"), P29 ("Night Time")
//   • Values: Q28, Q29 (kWh/month)
//   • Center text: Q25 (total estimated monthly consumption)
// =============================================================================

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { fmt, COLORS } from '../ui.jsx';

const DAY_COLOR = '#3B82C4';    // sky blue
const NIGHT_COLOR = '#1F3A5F';  // navy

export default function ConsumptionDonut({ dayKwh, nightKwh, totalKwh }) {
  const data = [
    { name: 'Day Time',   value: Math.max(0, dayKwh),   color: DAY_COLOR },
    { name: 'Night Time', value: Math.max(0, nightKwh), color: NIGHT_COLOR },
  ];

  // If the model produced a negative baseload (consumption inputs don't add up),
  // we still want to render something — show an empty donut.
  const isEmpty = data.every(d => d.value <= 0);
  const renderData = isEmpty ? [{ name: 'No data', value: 1, color: '#E5E7EB' }] : data;

  return (
    <div style={styles.container}>
      <div style={styles.chartArea}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={renderData}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
              startAngle={90}
              endAngle={-270}
              paddingAngle={isEmpty ? 0 : 2}
              stroke="none"
            >
              {renderData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            {!isEmpty && (
              <Tooltip
                formatter={(value) => `${fmt.num(value, 0)} kWh/mo`}
                contentStyle={styles.tooltip}
              />
            )}
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — absolutely positioned over the donut hole */}
        <div style={styles.centerLabel}>
          <div style={styles.centerNumber}>
            {isEmpty ? '—' : fmt.num(Math.round(totalKwh), 0)}
          </div>
          <div style={styles.centerUnit}>kWh / mo</div>
        </div>
      </div>

      {!isEmpty && (
        <div style={styles.legend}>
          {data.map(d => (
            <div key={d.name} style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: d.color }} />
              <span style={styles.legendLabel}>{d.name}</span>
              <span style={styles.legendValue}>{fmt.num(d.value, 0)} kWh</span>
              <span style={styles.legendPct}>
                ({fmt.pct(d.value / (data[0].value + data[1].value), 0)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  chartArea: {
    position: 'relative',
    width: '100%',
    height: 240,
  },
  centerLabel: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    pointerEvents: 'none',
  },
  centerNumber: {
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.brandGreen,
    letterSpacing: -0.5,
    lineHeight: 1,
  },
  centerUnit: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 8,
    width: '100%',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    flexShrink: 0,
  },
  legendLabel: {
    fontWeight: 500,
    color: COLORS.textBody,
    flex: 1,
  },
  legendValue: {
    color: COLORS.textBody,
    fontVariantNumeric: 'tabular-nums',
  },
  legendPct: {
    color: COLORS.textMuted,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 44,
    textAlign: 'right',
  },
  tooltip: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
  },
};
