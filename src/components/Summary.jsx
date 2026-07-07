// =============================================================================
// SUMMARY TAB — replicates Excel SUMMARY sheet
// -----------------------------------------------------------------------------
// Two columns:
//   Left:  All line items with non-zero direct prices (FILTER B<>0).
//          Each row shows description, direct purchase price, 60-Mo RTO price.
//   Right: Discount, payments due, totals.
//
// Customer + agent details at top (already in App header).
//
// v3-51 — Step 2 line items have two render modes:
//   • COLLAPSED (default): solar items 1-N folded into one "N units WW Solar
//     Panels with Labor & Accessories" row; battery items folded into one
//     "X kWh Battery Package with ATS, Labor & Accessories" row; inverter
//     rows stay individual; cost adders (invMob, roof, location, misc) stay
//     individual below the battery row. Each collapsed group row is
//     SUPPRESSED if its sum is ₱0 (e.g. no-battery quotes hide the battery
//     row entirely). The collapsed view is also what the PDF captures.
//   • EXPANDED: full original 10-row layout (one row per non-zero pkg.items
//     entry), matching pre-v3-51 behavior.
// The expand → AuthDialog (any of the 6 configured passwords) → expanded
// flow; the collapse button has no password gate. Persisted in
// sessionStorage under `solviva_summary_expanded` so the choice survives
// reloads within the same browser session.
// =============================================================================

import React, { useState } from 'react';
import { COLORS, fmt } from './ui.jsx';
import AuthDialog from './AuthDialog.jsx';
import { AUTH } from '../config.js';

// Keys that belong to the Solar collapsed group (panels + everything that
// installs alongside them: cabling extras, RSD, labor). Keys that belong
// to the Battery collapsed group (battery cells + rack + ATS + critical-loads
// materials + battery labor). Inverter rows render individually (one per
// `inverter0..2`). Cost adders (`invMob`, `roof`, `location`, `misc0`,
// `misc1`) render individually below the battery row. See
// `buildPackageLineItems` in calculations.js for the canonical key list.
const SOLAR_GROUP_KEYS = new Set([
  'panels', 'mounting', 'cabling', 'dcExtra', 'acExtra', 'labor', 'rsd', 'rsdLabor',
]);
const BATTERY_GROUP_KEYS = new Set([
  'battery', 'rack', 'ats', 'critLoads', 'batteryLabor',
]);
const INVERTER_KEY_PREFIX = 'inverter';
const COST_ADDER_KEYS = new Set([
  'invMob', 'roof', 'location', 'misc0', 'misc1',
]);

// Build the collapsed row list from the full pkg.items + resolved model values.
// We re-derive the dynamic numbers (panel count, panel watts, battery kWh)
// from MODEL not STATE — `state.panelCount` and `state.batteryKwh` are null
// when the customer hasn't overridden the recommendation, in which case the
// resolved values live on the model (App.jsx: `panelCount = state.panelCount
// ?? recPanelCount`, `batteryKwh = state.batteryKwh ?? recBatteryKwh`).
function buildCollapsedRows(items, model) {
  const rows = [];

  // Solar group → single row "N units WW Solar Panels with Labor & Accessories"
  const solarItems = items.filter(i => SOLAR_GROUP_KEYS.has(i.key));
  const solarDirect = solarItems.reduce((s, i) => s + (i.directPrice || 0), 0);
  const solarRto = solarItems.reduce((s, i) => s + (i.rto60Price || 0), 0);
  // Find the "panels" item description to extract the rendered "N units WW"
  // prefix so we don't reinvent the format. Falls back to a generic label
  // if for some reason the panels item is missing (shouldn't happen).
  const panelsItem = items.find(i => i.key === 'panels');
  if (solarDirect > 0 && panelsItem) {
    rows.push({
      key: 'collapsed-solar',
      description: `${panelsItem.description} with Labor & Accessories`,
      directPrice: solarDirect,
      rto60Price: solarRto,
    });
  }

  // Inverter rows — pass through individually, in original order, only
  // those with non-zero direct price (matches the existing FILTER B<>0).
  items.filter(i => i.key.startsWith(INVERTER_KEY_PREFIX) && i.directPrice > 0)
       .forEach(i => rows.push(i));

  // Battery group → single row "X kWh Battery Package with ATS, Labor & Accessories"
  const batteryItems = items.filter(i => BATTERY_GROUP_KEYS.has(i.key));
  const batteryDirect = batteryItems.reduce((s, i) => s + (i.directPrice || 0), 0);
  const batteryRto = batteryItems.reduce((s, i) => s + (i.rto60Price || 0), 0);
  if (batteryDirect > 0) {
    // model.batteryKwh is the RESOLVED value (state override OR recommendation
    // fallback), set by App.jsx's useMemo before pkg is computed. Always
    // present when batteryItems sum non-zero.
    // v3-54: include the active pack's unit-size label in the description so
    // the customer sees which physical pack-size their quote is built on
    // (e.g. "32 kWh Battery Package (16 kWh BYD) with ATS, Labor & Accessories").
    const kwh = model.batteryKwh || 0;
    const pkg = model.activeBatteryPackage;
    const pkgSuffix = pkg && pkg.label ? ` (${pkg.label})` : '';
    rows.push({
      key: 'collapsed-battery',
      description: `${kwh} kWh Battery Package${pkgSuffix} with ATS, Labor & Accessories`,
      directPrice: batteryDirect,
      rto60Price: batteryRto,
    });
  }

  // Cost adders — pass through individually, in original order.
  items.filter(i => COST_ADDER_KEYS.has(i.key) && i.directPrice > 0)
       .forEach(i => rows.push(i));

  return rows;
}

// sessionStorage key for the Expand/Collapse preference. Survives tab
// reloads within the browser session; clears on browser close.
const SUMMARY_EXPANDED_KEY = 'solviva_summary_expanded';

function readExpandedFlag() {
  try {
    return sessionStorage.getItem(SUMMARY_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}
function writeExpandedFlag(v) {
  try {
    if (v) sessionStorage.setItem(SUMMARY_EXPANDED_KEY, '1');
    else   sessionStorage.removeItem(SUMMARY_EXPANDED_KEY);
  } catch { /* ignore */ }
}

export default function Summary({ state, model, adminParams, contact, agent, generatedDate, validUntil }) {
  const { pkg, terms } = model;

  // Filter to only items with non-zero direct price (Excel: FILTER B<>0)
  const visibleItems = pkg.items.filter(i => i.directPrice > 0);
  const collapsedRows = buildCollapsedRows(pkg.items, model);

  // Expand/collapse state — survives reloads via sessionStorage.
  const [expanded, setExpanded] = useState(() => readExpandedFlag());
  const [authOpen, setAuthOpen] = useState(false);
  const rowsToRender = expanded ? visibleItems : collapsedRows;

  // Accept any of the 6 configured passwords (matches MaintenanceGate). Empty
  // env vars filter out so a missing var can't accidentally match an empty
  // input. Built fresh on each render so a redeploy with a new password
  // list takes effect immediately.
  const acceptedPasswords = [
    AUTH.editPassword,
    AUTH.engineeringPassword,
    AUTH.productPassword,
    AUTH.viewPassword,
    AUTH.repPassword,
    AUTH.testingPassword,
  ];

  const handleExpand = () => setAuthOpen(true);
  const handleCollapse = () => {
    setExpanded(false);
    writeExpandedFlag(false);
  };
  const handleAuthSuccess = () => {
    setExpanded(true);
    writeExpandedFlag(true);
    setAuthOpen(false);
  };

  return (
    <div style={styles.container} data-pdf-capture="summary">
      <div style={styles.header}>
        <h1 style={styles.title}>Quote Summary</h1>
        <p style={styles.subtitle}>
          For <strong>{contact.name}</strong> · Generated {fmtDate(generatedDate)} · Valid until {fmtDate(validUntil)}
        </p>
      </div>

      {/* ─── Line items table ─── */}
      <section style={styles.section}>
        <div style={styles.sectionTitleRow}>
          <h2 style={styles.sectionTitle}>Step 2 · Equipment, Materials &amp; Labor</h2>
          {/* The Expand/Collapse pill button is .no-pdf-capture so html2canvas
              (App.jsx handleGeneratePdf) skips it when snapshotting. The PDF
              still reflects whichever view (collapsed or expanded) is on
              screen at generation time — only the button itself is hidden. */}
          <button
            className="no-pdf-capture"
            onClick={expanded ? handleCollapse : handleExpand}
            style={styles.expandToggleBtn}
            title={expanded ? 'Collapse to summary view' : 'Show full line-item detail (password required)'}
          >
            {expanded ? '← Collapse' : '🔍 Expand'}
          </button>
        </div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '60%' }}>Description</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Direct Purchase</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>60-Mo. RTO</th>
            </tr>
          </thead>
          <tbody>
            {rowsToRender.map(item => (
              <tr key={item.key}>
                <td style={styles.td}>{item.description}</td>
                <td style={{ ...styles.td, ...styles.tdNum }}>{fmt.peso(item.directPrice)}</td>
                <td style={{ ...styles.td, ...styles.tdNum }}>{fmt.peso(item.rto60Price)}</td>
              </tr>
            ))}
            <tr style={styles.totalRow}>
              <td style={{ ...styles.td, fontWeight: 700 }}>Total</td>
              <td style={{ ...styles.td, ...styles.tdNum, fontWeight: 700 }}>{fmt.peso(pkg.totalDirect)}</td>
              <td style={{ ...styles.td, ...styles.tdNum, fontWeight: 700 }}>{fmt.peso(pkg.totalRto60)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Modal AuthDialog for the Expand-detail gate. Renders ABOVE the
          Summary tab content (semi-transparent backdrop, fixed-position).
          Any of the 6 configured passwords unlocks. Cancel just dismisses. */}
      {authOpen && (
        <AuthDialog
          mode="legacy"
          modal
          customTitle="View detailed quote breakdown"
          customSubtitle="Enter your access password to expand the line items."
          acceptedPasswords={acceptedPasswords}
          onAuth={handleAuthSuccess}
          onCancel={() => setAuthOpen(false)}
        />
      )}

      {/* ─── Step 3 Summary ─── */}
      {/* Mirrors the Excel SUMMARY sheet's Step 3 row order and wording so the
          web quote looks identical to the customer-known PDF. Three-column
          layout (label · sign · amount) keeps minus signs and ₱ symbols
          aligned vertically across rows that have them and rows that don't.

          Imperatives "Enter your" / "Select your" / "Review your" are stripped
          from the section headers because they only make sense in the
          Calculator tab where the customer can act. The Summary is a
          read-only quote view — tenor and DP% render as plain text after an
          em-dash.

          v3-60: the credit-card payment options and their surcharge were
          removed throughout (surcharging card payments is not permitted), so
          the post-installation balance is always paid via PDCs and the CC
          label-flips / CC-fee rows that used to live here are gone. */}
      {(() => {
        return (
      <section style={styles.section}>
        <h2 style={{ ...styles.sectionTitle, margin: '0 0 12px' }}>Step 3 · Pricing &amp; Payment</h2>
        <table style={styles.table3}>
          <colgroup>
            <col style={{ width: '76%' }} />
            <col style={{ width: '24%' }} />
          </colgroup>
          <tbody>
            {/* Std. 60-Mo. Term Package Price.
                v3-22: collapsed to 2-column layout matching Step 2's compact
                format — ₱ glyph attaches to the digit via fmt.peso instead
                of sitting in its own column. Negative-discount rows below
                use a leading −₱ prefix inline; CC-fee rows use +₱. */}
            <tr>
              <td style={styles.td3}>
                Std. 60-Mo. Term Package Price{' '}
                <span style={styles.muted}>(Total from Step 2)</span>
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum, fontWeight: 700 }}>
                {fmt.peso(pkg.totalRto60)}
              </td>
            </tr>

            {/* Promo Code discount ─ only if a promo is active. */}
            {terms.promo && (
              <tr>
                <td style={styles.td3}>
                  Promo Code:{' '}
                  <span style={styles.promoChip}>{terms.promo.code}</span>
                  {' '}
                  <span style={styles.muted}>
                    {(terms.promo.discount * 100).toFixed(1)}% {terms.promo.label} Discount
                  </span>
                </td>
                <td style={{ ...styles.td3, ...styles.tdNum }}>
                  −{fmt.peso(Math.abs(terms.promoDiscountAmount))}
                </td>
              </tr>
            )}

            {/* 3A header row — Pre-Installation Down Payment (v3-52 reorder).
                Moved here from "3B" position so the Summary ordering matches
                Step 3's tab order: DP first (pre-install), then tenor block
                (post-install). */}
            <tr>
              <td style={{ ...styles.td3, ...styles.headerRow }}>
                <span style={styles.headerLabel}>3A:</span>{' '}
                Pre-Installation <strong>DOWN PMT</strong> &mdash;{' '}
                <span style={styles.headerValue}>
                  {(state.downPaymentPct * 100).toFixed(0)}%
                </span>
              </td>
              <td style={styles.td3}></td>
            </tr>

            {/* Down Payment amount */}
            <tr>
              <td style={styles.td3}>
                {(state.downPaymentPct * 100).toFixed(0)}% Pre-Installation Down Payment Amount
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum }}>
                {fmt.peso(terms.dpAmount)}
              </td>
            </tr>

            {/* DP total — v3-60: credit-card DP option removed, so the
                payment channel is always cash/check/bank-transfer. */}
            <tr>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.subtotalLabel }}>
                Total Down Payment
              </td>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.tdNum, ...styles.subtotalAmount }}>
                {fmt.peso(terms.dpTotalCharge)}
              </td>
            </tr>

            {/* 3B header row — Post-Installation Payment Tenor (v3-52 reorder).
                Moved here from "3A" position. Title gained the
                "Post-Installation" qualifier to clarify that the tenor
                applies to the post-install payment schedule, not the
                pre-install DP. EPD + Net Price rows below belong to this
                block because they're derived from the tenor (the EPD
                applies to the package price spread over `tenor` months,
                and the Net Price subtotal IS the package price × tenor). */}
            <tr>
              <td style={{ ...styles.td3, ...styles.headerRow, paddingTop: 18 }}>
                <span style={styles.headerLabel}>3B:</span>{' '}
                Post-Installation Payment <strong>TENOR</strong> &mdash;{' '}
                <span style={styles.headerValue}>{state.tenor} Months</span>
              </td>
              <td style={styles.td3}></td>
            </tr>

            {/* Early Payment Discount.
                Excel: AI8 = AI9 - SUM(AI5:AI6) which equals
                  totalPaymentsOverTenor − stepTwoTotalLessDiscount.
                This is negative or zero (zero at tenor=60). The percentage
                shown next to the label is `-AI8 / stepTwoTotalLessDiscount`,
                matching Excel cell AH8's TEXT formula. */}
            {(() => {
              const epdAmount = terms.epdAmount;  // negative or 0
              const base = terms.stepTwoTotalLessDiscount || 0;
              const epdPctMagnitude = base > 0 ? (-epdAmount / base) : 0;
              // Skip the row if EPD is effectively zero (tenor=60).
              if (Math.abs(epdAmount) < 0.5) return null;
              return (
                <tr>
                  <td style={styles.td3}>
                    {(epdPctMagnitude * 100).toFixed(1)}% Early Payment Discount (EPD)
                  </td>
                  <td style={{ ...styles.td3, ...styles.tdNum }}>
                    −{fmt.peso(Math.abs(epdAmount))}
                  </td>
                </tr>
              );
            })()}

            {/* Net Price subtotal — Excel cell AI9 = M9 × tenor. */}
            <tr>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.subtotalLabel }}>
                Net Price{' '}
                <span style={styles.muted}>(before DP Discount)</span>
              </td>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.tdNum, ...styles.subtotalAmount }}>
                {fmt.peso(terms.totalPaymentsOverTenor)}
              </td>
            </tr>

            {/* 3C header row — Post-Installation Balance (with amount on same row) */}
            <tr>
              <td style={{ ...styles.td3, ...styles.headerRow, paddingTop: 18 }}>
                <span style={styles.headerLabel}>3C:</span>{' '}
                Post-Installation <strong>BALANCE</strong>
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum, paddingTop: 18, fontWeight: 600 }}>
                {fmt.peso(terms.postInstallBalance)}
              </td>
            </tr>

            {/* Additional Savings from DP. */}
            <tr>
              <td style={styles.td3}>
                Additional Savings from your {(state.downPaymentPct * 100).toFixed(0)}% Down Payment
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum }}>
                −{fmt.peso(Math.abs(terms.savingsFromDp))}
              </td>
            </tr>

            {/* Net BALANCE over N Months */}
            <tr>
              <td style={{ ...styles.td3, ...styles.dividerAbove, fontWeight: 600 }}>
                Net BALANCE over {state.tenor} Months
              </td>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.tdNum, fontWeight: 600 }}>
                {fmt.peso(terms.netBalanceOverTenor)}
              </td>
            </tr>

            {/* Final post-installation balance — v3-60: always via PDCs. */}
            <tr>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.subtotalLabel }}>
                Post-Installation Balance
              </td>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.tdNum, ...styles.subtotalAmount }}>
                {fmt.peso(terms.finalPostInstallBalance)}
              </td>
            </tr>

            {/* Monthly amount — always the PDC amount. */}
            <tr>
              <td style={{ ...styles.td3, paddingTop: 10 }}>
                {`Monthly Payment for ${state.tenor} Months`}
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum, ...styles.subtotalAmount, paddingTop: 10 }}>
                {fmt.peso(terms.customerMonthlyPmt)}
              </td>
            </tr>

            {/* TOTAL AMOUNT DUE — Excel: J24 = J15 + J21
                = DP Total Charge + Final Post-Installation Balance. */}
            <tr>
              <td style={{ ...styles.td3, ...styles.totalAmountDueLabel }}>
                TOTAL AMOUNT DUE
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum, ...styles.totalAmountDueAmount }}>
                {fmt.peso(terms.totalAmountDue)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
        );
      })()}

      {/* ─── Agent / support contact ─── */}
      <section style={styles.agentSection}>
        {agent.name ? (
          <>
            <div style={styles.agentLabel}>Your Solviva Agent</div>
            <div style={styles.agentName}>{agent.name}</div>
            <div style={styles.agentContact}>{agent.email} · {agent.phone}</div>
          </>
        ) : (
          <>
            <div style={styles.agentLabel}>Solviva Customer Support</div>
            <div style={styles.agentContact}>{agent.email} · {agent.phone}</div>
          </>
        )}
      </section>
    </div>
  );
}

function fmtDate(d) {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

const styles = {
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    border: `1px solid ${COLORS.divider}`,
    padding: '32px 36px',
  },
  header: {
    paddingBottom: 20,
    marginBottom: 20,
    borderBottom: `1px solid ${COLORS.divider}`,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.brandGreen,
    margin: '0 0 6px',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    margin: 0,
  },
  section: {
    marginBottom: 28,
  },
  // v3-51: row wrapping the section title + Expand/Collapse pill so they
  // sit on the same baseline. The pill is push-right via space-between.
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.brandGreen,
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // v3-51: small pill button at the top-right of the Step 2 section heading.
  // Toggles between "🔍 Expand" (when collapsed) and "← Collapse" (when
  // expanded). The .no-pdf-capture class is the CSS hook that html2canvas
  // uses to skip this element when capturing the Summary snapshot for the
  // PDF (so the button doesn't appear in the rendered PDF).
  expandToggleBtn: {
    background: 'transparent',
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 999,
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textBody,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}`,
  },
  td: {
    padding: '8px 12px',
    borderBottom: `1px solid ${COLORS.divider}`,
  },
  tdNum: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  subtotalRow: {
    backgroundColor: COLORS.brandCream,
  },
  totalRow: {
    backgroundColor: '#F5F1E8',
    borderTop: `2px solid ${COLORS.brandGreen}`,
  },

  // ─── Step 3 (Excel-aligned layout, v3-19+) ─────────────────────────────
  // Distinct from the line-items table above. Uses 3 columns (label · sign ·
  // amount) so the ₱ symbol and minus signs align vertically across all
  // rows. No background tints on subtotal rows — instead a thin top border
  // (`dividerAbove`) and bold colored text (`subtotalAmount`).
  table3: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  td3: {
    padding: '4px 0',
    border: 'none',
    verticalAlign: 'baseline',
  },
  signCol: {
    textAlign: 'center',
    color: COLORS.textMuted,
  },
  peso: {
    color: '#B45309',     // Solviva orange — used in the screenshots
    fontWeight: 600,
  },
  muted: {
    color: COLORS.textMuted,
  },
  // Section headers (3A / 3B / 3C). Brand green, with the chosen value
  // shown in muted body color after an em-dash.
  headerRow: {
    paddingTop: 14,
    paddingBottom: 4,
    fontWeight: 600,
    color: COLORS.brandGreen,
  },
  headerLabel: {
    color: COLORS.brandGreen,
    fontWeight: 700,
  },
  headerValue: {
    color: COLORS.textBody,
    fontWeight: 400,
  },
  // Subtotal rows ("Net Price", "DP Amount via …", "Post-Installation
  // Balance via …", "Monthly … Amount for …"). Brand orange + bold.
  subtotalLabel: {
    fontWeight: 600,
    color: COLORS.brandGreen,
    paddingTop: 6,
    paddingBottom: 6,
  },
  subtotalAmount: {
    fontWeight: 700,
    color: '#B45309',
    paddingTop: 6,
    paddingBottom: 6,
  },
  // Top border applied to subtotal-row cells. Adding this to a <tr> doesn't
  // render reliably across browsers (the TR border-collapse semantics with
  // borderCollapse: 'collapse' often suppresses row-level borders), so we
  // spread this onto each <td> of rows that should have a divider above.
  dividerAbove: {
    borderTop: `1px solid ${COLORS.divider}`,
    paddingTop: 8,
  },
  // TOTAL AMOUNT DUE row — visually heaviest treatment (thicker top border,
  // larger amount text, deeper orange) to signal it's the bottom-line takeaway.
  // Sits below the monthly-payment row at the very bottom of Step 3.
  totalAmountDueLabel: {
    fontWeight: 700,
    color: COLORS.brandGreen,
    paddingTop: 16,
    paddingBottom: 6,
    borderTop: `2px solid ${COLORS.brandGreen}`,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  totalAmountDueAmount: {
    fontWeight: 700,
    color: '#B45309',
    paddingTop: 16,
    paddingBottom: 6,
    borderTop: `2px solid ${COLORS.brandGreen}`,
    fontSize: 16,
  },
  // Promo code chip — matches the Calculator-tab Excel-blue input tint
  // used elsewhere for editable values.
  promoChip: {
    backgroundColor: COLORS.inputTint,
    padding: '1px 8px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0.3,
    color: COLORS.textBody,
  },
  // Checkbox indicator glyphs. ☑ when checked (brand-green), ☐ when not
  // (muted). Read-only — the customer toggles these from the Calculator tab.
  checkOn: {
    color: COLORS.brandGreen,
    fontSize: 14,
  },
  checkOff: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  // Used for the unchecked-state CC fee row — dim both the dash and the
  // em-dash placeholder so they read as "no charge applied".
  dimDash: {
    color: COLORS.textMuted,
  },
  agentSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTop: `1px solid ${COLORS.divider}`,
    fontSize: 13,
  },
  agentLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  agentName: {
    fontWeight: 700,
    color: COLORS.textBody,
  },
  agentContact: {
    color: COLORS.textMuted,
    marginTop: 2,
  },
};
