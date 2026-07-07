// =============================================================================
// STEP 1 — TELL US ABOUT YOUR CONSUMPTION
// -----------------------------------------------------------------------------
// Three subsections (matching Excel):
//   1A — Identity (handled by ContactGate before calculator opens)
//        + utility rate input (renamed here as 1A-utility for parity with Excel)
//   1B — Average electric utility rate per kWh  [Excel T10]
//   1C — Average monthly utility bill           [Excel T12]
//   1D — Major devices that affect day/night distribution [Excel O15:T22]
//
// On the right side we display the consumption donut and a few stat tiles
// summarizing day/night/baseload kWh.
// =============================================================================

import React from 'react';
import { DEVICES } from '../data/devices.js';
import { formatHour12 } from '../lib/schedule.js';
import {
  SectionCard, Subsection, Field, NumberInput, Select, StatTile, CalloutBox, COLORS, fmt,
  SERVICE_TYPE_INFO, RATE_INFO, CHARGES_INFO, MAJOR_DEVICES_INFO,
} from './ui.jsx';
import ConsumptionDonut from './charts/ConsumptionDonut.jsx';

export default function Step1Consumption({ state, updateState, model, onReset }) {
  const { recommended } = model;

  return (
    <SectionCard
      accent="Step 1"
      title="Tell us about your consumption"
      subtitle="A few quick details about your monthly bill help us recommend the right system size for your home."
      onReset={onReset}
    >
      <div className="grid-2col" style={styles.grid}>
        {/* ─── Left column: inputs ──────────────────────────── */}
        <div>
          <Subsection title="1A · Electric Service">
            <Field label="Service type" inline info={SERVICE_TYPE_INFO}>
              <PhaseToggle
                value={state.phase}
                onChange={v => updateState({ phase: v })}
              />
            </Field>
          </Subsection>

          <Subsection title="1B · Average Electric Utility Rate"
                      hint="The ₱/kWh on your bill — typically ₱13–₱15">
            <Field label="Rate per kWh" inline info={RATE_INFO}>
              <NumberInput
                value={state.utilityRate}
                onChange={v => updateState({ utilityRate: v })}
                min={1}
                step={0.1}
                prefix="₱"
                width={130}
              />
            </Field>
          </Subsection>

          <Subsection title="1C · Average Monthly Utility Bill"
                      hint="Total ₱ on your most recent bill">
            <Field label="Monthly bill" inline info={CHARGES_INFO}>
              <NumberInput
                value={state.monthlyBill}
                onChange={v => updateState({ monthlyBill: v })}
                min={0}
                step={500}
                prefix="₱"
                width={160}
              />
            </Field>
          </Subsection>

          <Subsection title="1D · Major Devices"
                      hint="Optional — helps refine day vs night split"
                      info={MAJOR_DEVICES_INFO}>
            <DeviceTable
              rows={state.deviceRows}
              onChange={(i, patch) => {
                const newRows = state.deviceRows.map((r, idx) =>
                  idx === i ? { ...r, ...patch } : r
                );
                updateState({ deviceRows: newRows });
              }}
              onAddRow={() => {
                // Hard cap at 10 — UI normally hides the button at this
                // point but we also enforce it here so any direct call
                // (programmatic or future-tooling) can't overshoot.
                if (state.deviceRows.length >= 10) return;
                updateState({
                  deviceRows: [
                    ...state.deviceRows,
                    { deviceName: null, count: 1, onTime: null, offTime: null, daysPerWeek: null },
                  ],
                });
              }}
              onRemoveRow={(i) => {
                updateState({
                  deviceRows: state.deviceRows.filter((_, idx) => idx !== i),
                });
              }}
            />
          </Subsection>
        </div>

        {/* ─── Right column: visualization & stats ───────────── */}
        <div style={styles.rightCol}>
          {recommended.inconsistent && (
            <div style={{ marginBottom: 16 }}>
              <CalloutBox kind="warn">
                <strong>Something doesn't add up.</strong> The devices you've listed
                consume more than your monthly bill suggests. Please review the
                device counts, hours, or your monthly bill.
              </CalloutBox>
            </div>
          )}

          <div style={styles.donutCard}>
            <div style={styles.donutTitle}>Estimated Monthly Consumption</div>
            <ConsumptionDonut
              dayKwh={recommended.dayTimeKwh}
              nightKwh={recommended.nightTimeKwh}
              totalKwh={recommended.estMonthlyKwh}
            />
          </div>

          <div style={styles.statGrid}>
            <StatTile
              label="From listed devices"
              value={fmt.num(Math.round(recommended.deviceTotalKwh))}
              sub="kWh / month"
            />
            <StatTile
              label="Baseload"
              value={fmt.num(Math.round(Math.max(0, recommended.baseloadKwh)))}
              sub="kWh / month"
              color={recommended.baseloadKwh < 0 ? COLORS.error : COLORS.brandGreen}
            />
            {/* The "Recommended panels" tile previously lived here, but moved
                to Section 2A where the "Desired savings %" selector drives it.
                Step 1 inputs (consumption) feed into the calculation, but the
                user-facing recommendation now appears next to the control
                that adjusts it. */}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Phase toggle (single-phase / 3-phase) ─────────────────────────────────
function PhaseToggle({ value, onChange }) {
  const options = [
    { value: 1, label: 'Single-phase' },
    { value: 3, label: '3-phase' },
  ];
  return (
    <div style={toggleStyles.group} role="radiogroup">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          style={{
            ...toggleStyles.button,
            ...(value === o.value ? toggleStyles.active : {}),
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const toggleStyles = {
  group: {
    display: 'inline-flex',
    border: `1px solid ${COLORS.inputBorder}`,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: COLORS.inputTint,
  },
  button: {
    background: 'transparent',
    border: 'none',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.textBody,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  active: {
    backgroundColor: COLORS.brandGreen,
    color: '#FFFFFF',
    fontWeight: 600,
  },
};

// ─── Device table ───────────────────────────────────────────────────────────
function DeviceTable({ rows, onChange, onAddRow, onRemoveRow }) {
  const deviceOptions = [
    { value: null, label: '— Select device —' },
    ...DEVICES.map(d => ({ value: d.name, label: d.name })),
  ];

  // Time options: 12MN, 1AM, 2AM, ..., 12NN, 1PM, ..., 11PM (matches the
  // Radiance Curve x-axis labels, single source of truth for hour format).
  const timeOptions = [
    { value: null, label: '—' },
    ...Array.from({ length: 24 }, (_, h) => ({
      value: h / 24,
      label: formatHour12(h),
    })),
  ];

  const dayOptions = [
    { value: null, label: '—' },
    ...Array.from({ length: 7 }, (_, i) => ({
      value: i + 1, label: String(i + 1),
    })),
  ];

  // Default floor: rows 0 and 1 are always present and can't be removed.
  // Rows beyond index 1 get a remove "✕" button so customers can declutter
  // after adding too many. Both buttons are no-ops if their handlers
  // weren't passed in (defensive fallback for older callers).
  // Ceiling: 10 rows total — at that point the form is long enough that
  // the customer is probably better served increasing the `count` field on
  // existing rows than adding more device types.
  const MIN_ROWS = 2;
  const MAX_ROWS = 10;
  const canRemoveRow = (i) => onRemoveRow && rows.length > MIN_ROWS && i >= MIN_ROWS;
  const atMaxRows = rows.length >= MAX_ROWS;

  return (
    <div style={tableStyles.tableWrap}>
      <table className="device-rows-table" style={tableStyles.table}>
        <thead>
          <tr>
            <th style={{ ...tableStyles.th, width: '32%' }}>Device</th>
            <th style={tableStyles.th}>Count</th>
            <th style={tableStyles.th}>On time</th>
            <th style={tableStyles.th}>Off time</th>
            <th style={tableStyles.th}>Days/wk</th>
            {/* Empty header for the remove-button column. We always reserve
                this column even if no rows currently have a remove button —
                that keeps the table layout stable when rows are added or
                removed. The reserved width is small (~24px). */}
            <th style={{ ...tableStyles.th, width: 24 }} aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={tableStyles.td}>
                <Select
                  value={row.deviceName}
                  onChange={v => onChange(i, { deviceName: v })}
                  options={deviceOptions}
                />
              </td>
              <td style={tableStyles.td}>
                <NumberInput
                  value={row.count}
                  onChange={v => onChange(i, { count: v })}
                  min={1} step={1} width={80}
                />
              </td>
              <td style={tableStyles.td}>
                <Select
                  value={row.onTime}
                  onChange={v => onChange(i, { onTime: v })}
                  options={timeOptions}
                />
              </td>
              <td style={tableStyles.td}>
                <Select
                  value={row.offTime}
                  onChange={v => onChange(i, { offTime: v })}
                  options={timeOptions}
                />
              </td>
              <td style={tableStyles.td}>
                <Select
                  value={row.daysPerWeek}
                  onChange={v => onChange(i, { daysPerWeek: v })}
                  options={dayOptions}
                />
              </td>
              <td style={tableStyles.removeCell}>
                {canRemoveRow(i) && (
                  <button
                    type="button"
                    onClick={() => onRemoveRow(i)}
                    style={tableStyles.removeBtn}
                    aria-label={`Remove device row ${i + 1}`}
                    title="Remove this row"
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {onAddRow && !atMaxRows && (
        <button
          type="button"
          onClick={onAddRow}
          style={tableStyles.addBtn}
        >
          + Add row
        </button>
      )}
      {onAddRow && atMaxRows && (
        // At the cap, swap the "+ Add row" affordance for a soft hint that
        // nudges the customer toward consolidating duplicate devices into
        // the `count` field on an existing row rather than adding more.
        <div style={tableStyles.maxHint}>
          Maximum 10 rows. Have more than one of the same device? Increase
          the <strong>count</strong> on an existing row instead.
        </div>
      )}
    </div>
  );
}

const tableStyles = {
  tableWrap: {
    overflowX: 'auto',
    // Constrain to parent width so the wrap actually clips its overflow rather
    // than growing to the inner table's intrinsic width — without this, when
    // the inner table has a min-width on mobile, the wrap grows to match and
    // the whole page scrolls horizontally instead of just the table.
    maxWidth: '100%',
    // CSS grid items default to `min-width: auto` (content-based), which lets
    // them grow past their track's available width when content has its own
    // min-width. Forcing `min-width: 0` makes the wrap honor its grid track's
    // size so the inner table's `min-width: 560px` triggers horizontal scroll
    // inside the wrap instead of expanding the parent grid track.
    minWidth: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}`,
  },
  td: {
    padding: '4px 6px',
    verticalAlign: 'middle',
  },
  // Remove-row column. Narrow and right-aligned so the "✕" button sits
  // close to the edge of the row without disturbing the field grid.
  removeCell: {
    padding: '4px 0 4px 4px',
    verticalAlign: 'middle',
    textAlign: 'center',
    width: 24,
  },
  // The remove "✕" button is intentionally muted — it shouldn't fight for
  // attention with the actual data fields. Slight hover affordance via
  // color shift; full accessibility via aria-label on the rendered button.
  removeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: COLORS.textMuted,
    fontSize: 18,
    lineHeight: 1,
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 4,
    fontFamily: 'inherit',
  },
  // Add-row button — inline ghost-style. Sits flush-left under the table.
  addBtn: {
    marginTop: 8,
    background: 'transparent',
    border: `1px dashed ${COLORS.divider}`,
    color: COLORS.brandGreen,
    fontSize: 13,
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  // Replacement message when the row cap is reached. Italic, muted —
  // doesn't shout, just confirms the cap and nudges toward `count`.
  maxHint: {
    marginTop: 8,
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    lineHeight: 1.5,
    paddingLeft: 4,
  },
};

// ─── Layout ────────────────────────────────────────────────────────────────
const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: 32,
  },
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  donutCard: {
    backgroundColor: COLORS.brandCream,
    borderRadius: 8,
    padding: '20px 16px',
    border: `1px solid ${COLORS.divider}`,
  },
  donutTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: 'auto auto',
    gap: 10,
    marginTop: 14,
  },
};
