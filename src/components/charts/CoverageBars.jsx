// =============================================================================
// COVERAGE BARS — Energy Use Coverage stacked bar chart
// -----------------------------------------------------------------------------
// Replicates Excel chart3 (Schedule!G57:J61):
//   4 horizontal bars, each 100% wide, showing how energy use is split:
//     1. No Solar              [grid 100%]
//     2. Solar Only            [grid + solar]
//     3. Solar w/ Batteries    [grid + solar + battery]
//     4. Solar w/ Batt. & NM   [grid + solar + battery + net-metering]
//
// v3-38: in customer mode the 4th bar AND the Net Metering segment are
// suppressed — the recommended battery is sized to absorb daily excess solar
// so net metering doesn't add value at the recommended config, and exposing
// it just adds confusion. Customer view sees rows 1-3 only.
// =============================================================================

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts';
import { fmt, COLORS } from '../ui.jsx';

const COLOR_GRID = '#DC2626';     // red
const COLOR_SOLAR = '#F59E0B';    // amber
const COLOR_BATT = '#10B981';     // emerald
const COLOR_NM = '#3B82C4';       // blue

export default function CoverageBars({ bars, mode = 'rep' }) {
  const isCustomer = mode === 'customer';

  // Convert decimal proportions (0-1) to percentage (0-100) for display.
  // In customer mode, drop the 4th bar (Solar w/ Batt. & Net Met.) entirely
  // — it's structurally identical to bar 3 (Solar w/ Batteries) at the
  // recommended battery size, since excess solar is fully absorbed by the
  // battery and there's nothing left to net-meter.
  const sourceBars = isCustomer ? bars.slice(0, 3) : bars;
  const data = sourceBars.map(b => ({
    name: b.name,
    Grid: b.grid * 100,
    Solar: b.solar * 100,
    Battery: b.battery * 100,
    // Customer mode: omit the field entirely (Recharts auto-omits the legend
    // chip for any dataKey not present in the data). Rep mode: include it.
    ...(isCustomer ? {} : { 'Net Metering': b.netMetering * 100 }),
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical"
                  margin={{ top: 16, right: 24, left: 32, bottom: 8 }}>
          <XAxis type="number" domain={[0, 100]}
                 ticks={[0, 25, 50, 75, 100]}
                 tick={{ fontSize: 11, fill: COLORS.textMuted }}
                 tickFormatter={(v) => `${Math.round(v)}%`} stroke="#CCCCCC" />
          <YAxis type="category" dataKey="name"
                 tick={{ fontSize: 12, fill: COLORS.textBody }}
                 width={170} stroke="#CCCCCC" />
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(v, n) => [`${fmt.num(Number(v), 1)}%`, n]} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="square" />

          <Bar dataKey="Grid" stackId="a" fill={COLOR_GRID} />
          <Bar dataKey="Solar" stackId="a" fill={COLOR_SOLAR} />
          <Bar dataKey="Battery" stackId="a" fill={COLOR_BATT} />
          {!isCustomer && (
            <Bar dataKey="Net Metering" stackId="a" fill={COLOR_NM} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  border: `1px solid ${COLORS.divider}`,
  borderRadius: 6, padding: '8px 12px', fontSize: 12,
};
