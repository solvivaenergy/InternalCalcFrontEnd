// =============================================================================
// SUMMARY TAB — replicates Excel SUMMARY sheet
// -----------------------------------------------------------------------------
// Two columns:
//   Left:  All line items with non-zero direct prices (FILTER B<>0).
//          Each row shows description and direct purchase price. (v3-80: the
//          60-Mo RTO column is gone — OpCo sells at the direct price and AssetCo
//          finances the balance, so there is no RTO catalogue any more.)
//   Right: Discount, payments due, totals.
//
// Customer + agent details at top (already in App header).
//
// v3-117 — the v3-51 COLLAPSED/EXPANDED dual render mode is retired: the
// list always shows the full enumeration WITHOUT per-line prices, with one
// "Total Package Price (VAT Inclusive)" line at the bottom. A small
// AuthDialog-gated toggle (Engineering / Product / Audit / Super Admin only)
// reveals the price column; reveal state lives in App so Generate PDF can
// force it hidden during the snapshot. buildCollapsedRows, COST_ADDER_KEYS
// and the sessionStorage expanded flag were removed with the old flow.
// =============================================================================

import React, { useState } from 'react';
import { COLORS, fmt } from './ui.jsx';
import AuthDialog from './AuthDialog.jsx';
import { AUTH } from '../config.js';
import { monthlyAddOnRate, decomposeDirectPrice } from '../lib/calculations.js';   // v3-117 / v3-135

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

export default function Summary({ state, model, adminParams, contact, agent, generatedDate, validUntil,
                                  pricesShown = false, onPricesShown = () => {} }) {
  const { pkg, terms, popularTenors } = model;


  // Filter to only items with non-zero direct price (Excel: FILTER B<>0)
  const visibleItems = pkg.items.filter(i => i.directPrice > 0);

  // v3-117 — the list is ALWAYS the expanded enumeration; what's gated now is
  // the PRICE COLUMN, not the expansion (user directives 2-3). Reveal state
  // lives in App (lifted so Generate PDF can force it hidden during the
  // snapshot); the old Expand/Collapse + sessionStorage machinery is retired.
  const [authOpen, setAuthOpen] = useState(false);

  // v3-117 — price reveal accepts ONLY Engineering, Product, Audit
  // (viewPassword), and Super Admin (editPassword) — user decision B
  // deliberately EXCLUDES the Rep and Maintenance passwords, which the old
  // Expand gate accepted. Empty env vars filter out inside AuthDialog so a
  // missing var can't accidentally match an empty input.
  const acceptedPasswords = [
    AUTH.editPassword,
    AUTH.engineeringPassword,
    AUTH.productPassword,
    AUTH.viewPassword,
  ];

  const handleAuthSuccess = () => {
    onPricesShown(true);
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

      {/* ─── Line items table (v3-117) ───
          Always the EXPANDED enumeration, WITHOUT per-line prices (user
          directives 2-3). The bottom line carries the single total. The
          small .no-pdf-capture toggle reveals the price column for
          Engineering / Product / Audit / Super Admin only (AuthDialog gate);
          App forces it hidden during PDF capture, so the PDF never carries
          the breakdown. */}
      <section style={styles.section}>
        <div style={styles.sectionTitleRow}>
          <h2 style={styles.sectionTitle}>Summary of Equipment, Materials &amp; Labor</h2>
          {/* v3-119 — LOCKED state is a bare padlock glyph with NO label and
              NO tooltip (user-directed: customers shouldn't know what it's
              for). The UNLOCKED state keeps its "Hide prices" label — only
              an admin who just authenticated ever sees it. */}
          <button
            className="no-pdf-capture"
            onClick={pricesShown ? () => onPricesShown(false) : () => setAuthOpen(true)}
            style={styles.priceRevealBtn}
            title={pricesShown ? 'Hide component prices' : undefined}
          >
            {pricesShown ? 'Hide prices' : '\u{1F512}'}
          </button>
        </div>
        {/* v3-135 — the admin price reveal is now a FIVE-column waterfall
            (user-directed): COGS · Gross Margin · MDR allowance · VAT ·
            Direct Purchase Price, with the first four summing EXACTLY to the
            fifth on every line (decomposeDirectPrice puts the rounding
            residual in the GM cell). Header percentages are live: the GM %
            is this quote's blended realized margin; the MDR % is the
            merchantDiscountRate parameter. Misc lines have no COGS basis —
            COGS dashes and the whole net revenue books as margin. Same
            gate, same PDF force-hide as v3-117/134. */}
        {(() => {
          const mdrRate = adminParams.merchantDiscountRate ?? 0;
          const rows = visibleItems.map(it =>
            ({ it, d: decomposeDirectPrice(it.directPrice, it.cogs, mdrRate) }));
          const tot = rows.reduce((a, { d }) => ({
            cogs: a.cogs + (d.cogsKnown ? d.cogs : 0), gm: a.gm + d.gm,
            mdrAmt: a.mdrAmt + d.mdrAmt, vat: a.vat + d.vat, dp: a.dp + d.dp,
          }), { cogs: 0, gm: 0, mdrAmt: 0, vat: 0, dp: 0 });
          const netRevTot = tot.gm + tot.cogs;
          const gmPct = netRevTot > 0 ? (tot.gm / netRevTot) * 100 : 0;
          const pct = (v) => {
            const p = v * 100;
            return Number.isInteger(p) ? String(p) : p.toFixed(2);
          };
          const numTh = { ...styles.th, textAlign: 'right' };
          const numTd = { ...styles.td, ...styles.tdNum };
          const mutedTd = { ...numTd, color: '#6B7280' };
          return (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: pricesShown ? '28%' : '100%' }}>Description</th>
                  {pricesShown && <th style={numTh}>COGS (pre-VAT)</th>}
                  {pricesShown && <th style={numTh}>{gmPct.toFixed(2)}% Gross Margin</th>}
                  {pricesShown && <th style={numTh}>{pct(mdrRate)}% Allow. for MDR</th>}
                  {pricesShown && <th style={numTh}>12% VAT</th>}
                  {pricesShown && <th style={numTh}>Direct Purchase Price</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ it, d }) => (
                  <tr key={it.key}>
                    <td style={styles.td}>{it.description}</td>
                    {pricesShown && (
                      <td style={mutedTd}>{d.cogsKnown ? fmt.peso(d.cogs) : '\u2014'}</td>
                    )}
                    {pricesShown && <td style={mutedTd}>{fmt.peso(d.gm)}</td>}
                    {pricesShown && <td style={mutedTd}>{fmt.peso(d.mdrAmt)}</td>}
                    {pricesShown && <td style={mutedTd}>{fmt.peso(d.vat)}</td>}
                    {pricesShown && <td style={numTd}>{fmt.peso(d.dp)}</td>}
                  </tr>
                ))}
                <tr style={styles.totalRow}>
                  <td style={{ ...styles.td, fontWeight: 700 }}>
                    Total Package Price <span style={styles.muted}>(VAT Inclusive)</span>
                  </td>
                  {pricesShown && (
                    <td style={{ ...mutedTd, fontWeight: 700 }}>{fmt.peso(tot.cogs)}</td>
                  )}
                  {pricesShown && (
                    <td style={{ ...mutedTd, fontWeight: 700 }}>{fmt.peso(tot.gm)}</td>
                  )}
                  {pricesShown && (
                    <td style={{ ...mutedTd, fontWeight: 700 }}>{fmt.peso(tot.mdrAmt)}</td>
                  )}
                  {pricesShown && (
                    <td style={{ ...mutedTd, fontWeight: 700 }}>{fmt.peso(tot.vat)}</td>
                  )}
                  <td style={{ ...styles.td, ...styles.tdNum, fontWeight: 700 }}>
                    {fmt.peso(pricesShown ? tot.dp : pkg.totalDirect)}
                  </td>
                </tr>
              </tbody>
            </table>
          );
        })()}
      </section>

      {/* Modal AuthDialog for the price-reveal gate (v3-117). Only
          Engineering / Product / Audit / Super Admin passwords unlock —
          Rep and Maintenance are deliberately excluded (user decision B). */}
      {authOpen && (
        <AuthDialog
          modal
          customTitle=""
          customSubtitle=""
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
        <h2 style={{ ...styles.sectionTitle, margin: '0 0 12px' }}>Pricing &amp; Payment Summary</h2>
        <table style={styles.table3}>
          <colgroup>
            <col style={{ width: '76%' }} />
            <col style={{ width: '24%' }} />
          </colgroup>
          <tbody>
            {/* ═══ v3-80 — the OpCo / AssetCo LOAN ladder ═══════════════════
                Mirrors SUMMARY!G8:H19 of Solviva_Calc_v_B_4_2.xlsm.

                GONE, and not coming back: "Std. 60-Mo. Term Package Price"
                (there is no RTO catalogue), the Early Payment Discount (there
                is no sticker to discount from), and "Additional Savings from
                your Down Payment" (the DP no longer buys a time-value discount
                — it simply reduces the principal).

                Every number below is one the customer can verify with a
                calculator: the DP is a straight percentage of the Net Price,
                and the balance is a straight amortisation of what's left. */}

            {/* Total Price (VAT Inclusive) — AH5 */}
            <tr>
              <td style={styles.td3}>
                Total Price <span style={styles.muted}>(VAT Inclusive)</span>
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum }}>
                {fmt.peso(pkg.totalDirect)}
              </td>
            </tr>

            {/* Promo / partner discount — AH6. Hidden when no code applied. */}
            {terms.promo && Math.abs(terms.discountAmount) >= 0.5 && (
              <tr>
                <td style={styles.td3}>
                  Less: {(terms.promoDiscount * 100).toFixed(1)}% {terms.promo.label || terms.promo.code} Discount
                </td>
                <td style={{ ...styles.td3, ...styles.tdNum }}>
                  −{fmt.peso(Math.abs(terms.discountAmount))}
                </td>
              </tr>
            )}

            {/* = Net Price — AH7 */}
            <tr>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.subtotalLabel }}>
                = Net Price
              </td>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.tdNum, ...styles.subtotalAmount }}>
                {fmt.peso(terms.netDirectPrice)}
              </td>
            </tr>

            {/* Less: N% Pre-Installation Downpayment — AH9.
                THE number this whole redesign was for: a plain percentage of the
                line above it, identical at every tenor. */}
            <tr>
              <td style={styles.td3}>
                Less: {(state.downPaymentPct * 100).toFixed(0)}% Pre-Installation Downpayment
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum }}>
                −{fmt.peso(terms.dpTotalCharge)}
              </td>
            </tr>

            {/* = Amount for Financing — AH11. AssetCo's principal. */}
            <tr>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.subtotalLabel }}>
                = Amount for Financing{' '}
                <span style={styles.muted}>({((1 - state.downPaymentPct) * 100).toFixed(0)}%)</span>
              </td>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.tdNum, ...styles.subtotalAmount }}>
                {fmt.peso(terms.amountForFinancing)}
              </td>
            </tr>

            {/* Term + rate. v3-100 — tenor 0 renders as "Direct Purchase"
                (Excel AG12's "Direct Purch"); tenor 1 is a real 1-month term. */}
            <tr>
              <td style={{ ...styles.td3, paddingTop: 18 }}>
                Post-Installation Payment Term
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum, paddingTop: 18 }}>
                {terms.isDirectPurchase
                  ? 'Direct Purchase'
                  : `${state.tenor} ${state.tenor === 1 ? 'Month' : 'Months'}`}
              </td>
            </tr>
            <tr>
              <td style={styles.td3}>
                Interest Rate <span style={styles.muted}>(per annum)</span>
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum }}>
                {terms.rtoRate > 0 ? `${(terms.rtoRate * 100).toFixed(3)}%` : 'Interest-free'}
              </td>
            </tr>

            {/* Monthly Payment — AH15. v3-100: for a Direct Purchase the
                "monthly" IS the full balance, labelled per AG15's
                "Post-Installation Direct Purchase Balance" branch. */}
            <tr>
              <td style={{ ...styles.td3, ...styles.dividerAbove, fontWeight: 600 }}>
                {terms.isDirectPurchase
                  ? 'Direct Purchase Balance'
                  : `Monthly Payment for ${state.tenor} ${state.tenor === 1 ? 'Month' : 'Months'}`}
              </td>
              <td style={{ ...styles.td3, ...styles.dividerAbove, ...styles.tdNum, fontWeight: 600 }}>
                {fmt.peso(terms.customerMonthlyPmt)}
              </td>
            </tr>

            {/* Post-Installation Balance — AH16. The (₱X × N months) suffix is
                hidden on a Direct Purchase, mirroring AG16's empty-suffix
                branch for "Direct Purch". */}
            <tr>
              <td style={styles.td3}>
                Post-Installation Balance{' '}
                {!terms.isDirectPurchase && (
                  <span style={styles.muted}>
                    ({fmt.peso(terms.customerMonthlyPmt)} × {state.tenor}{' '}
                    {state.tenor === 1 ? 'month' : 'months'})
                  </span>
                )}
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum }}>
                {fmt.peso(terms.finalPostInstallBalance)}
              </td>
            </tr>

            {/* Documentary Stamp Tax — SUMMARY!G14/H14 (= CALCULATOR!AH13).
                v3-100: hidden when ₱0 (Direct Purchase / 100% DP), per user —
                the workbook prints the row with a zero instead. */}
            {terms.dst > 0 && (
              <tr>
                <td style={styles.td3}>
                  Documentary Stamp Tax
                </td>
                <td style={{ ...styles.td3, ...styles.tdNum }}>
                  {fmt.peso(terms.dst)}
                </td>
              </tr>
            )}

            {/* TOTAL AMOUNT DUE — SUMMARY!H20 = H18 + H14 + H11 (balance +
                DST + DP). v3-100: DST-INCLUSIVE via summaryTotalDue — the
                on-screen total had been AG29 (DST-exclusive) and understated
                by the DST. */}
            <tr>
              <td style={{ ...styles.td3, ...styles.totalAmountDueLabel }}>
                TOTAL AMOUNT DUE
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum, ...styles.totalAmountDueAmount }}>
                {fmt.peso(terms.summaryTotalDue)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
        );
      })()}

      {/* ═══ v3-80 — TENOR COMPARISON TABLE ═════════════════════════════════
          Mirrors the Excel data table at CALCULATOR!AE20:AH26. For the
          customer's CHOSEN down payment, shows the monthly payment and total
          amount due at each of 7 tenors.

          REP-MODE ONLY IN THE APP — but this is the Summary tab, which is
          already gated to rep mode in App.jsx, and it is ALSO the component
          html2canvas snapshots into the PDF. So living here satisfies both
          requirements at once: reps see it on screen, customers see it in the
          PDF, and the public Calculator never renders it.

          The down-payment column from the old `popularTenorsTable` is dropped:
          under the loan model the DP is a share of the Net Price, so it is
          IDENTICAL on every row. `rate` takes its place — it is the REASON the
          total climbs with tenor, and without it the table shows the effect and
          hides the cause. */}
      {/* v3-82 — hidden at a 100% down payment: with nothing financed every row
          shows a ₱0 monthly and the same total, so the table says nothing. */}
      {!terms.isFullyPaid && Array.isArray(popularTenors) && popularTenors.length > 0 && (
        /* v3-103 — .no-pdf-capture: this table stays ON SCREEN but is skipped
           by the page-4 Quote Summary snapshot (App.jsx handleGeneratePdf's
           ignoreElements). The PDF's payment-options page carries the SAME
           table (same model.popularTenors source, v3-102) in its vector
           format — printing it on both pages was redundant, and the user
           prefers the payment-options rendering. */
        <section style={styles.section} className="no-pdf-capture">
          <h2 style={{ ...styles.sectionTitle, margin: '0 0 4px' }}>Compare your payment terms</h2>
          <div style={styles.tenorCaption}>
            At your {(state.downPaymentPct * 100).toFixed(0)}% down payment of{' '}
            <strong>{fmt.peso(terms.dpTotalCharge)}</strong>, financing{' '}
            <strong>{fmt.peso(terms.amountForFinancing)}</strong>.{' '}
            <em>Totals include documentary stamp tax.</em>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                {/* v3-117 — user-specified columns + order:
                    TENOR · EIR · MONTHLY ADD-ON RATE · MONTHLY PAYMENT ·
                    TOTAL AMOUNT DUE. 'EIR' renames the old 'Your Rate'
                    (values unchanged — decision D). */}
                <th style={{ ...styles.th, width: '24%' }}>Tenor</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>EIR</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Monthly Add-On Rate</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Monthly Payment</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Total Amount Due</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // v3-118 — add-on base is the FINANCED amount (tenor-invariant;
                // it's the same figure the caption above prints).
                const addOnBase = terms.amountForFinancing || 0;
                return popularTenors.map(row => {
                const isSel = row.tenor === state.tenor;
                const cell = isSel
                  ? { ...styles.td, ...styles.tenorSelCell }
                  : styles.td;
                return (
                  <tr key={row.tenor} style={isSel ? styles.tenorSelRow : undefined}>
                    {/* v3-101 — the 1-month row is out and Direct Purchase
                        (tenor 0) is in; the selected tenor is spliced into the
                        base set by popularTenorsTable, so this highlight always
                        has a row to land on. */}
                    <td style={cell}>
                      {row.tenor === 0
                        ? 'Direct Purchase'
                        : `${row.tenor} ${row.tenor === 1 ? 'month' : 'months'}`}
                      {isSel && <span style={styles.muted}> · your selection</span>}
                    </td>
                    <td style={{ ...cell, ...styles.tdNum }}>{row.rate > 0 ? `${(row.rate * 100).toFixed(3)}%` : 'Interest-free'}</td>
                    <td style={{ ...cell, ...styles.tdNum }}>
                      {`${(monthlyAddOnRate(row.monthlyPmt, addOnBase, row.tenor) * 100).toFixed(3)}%`}
                    </td>
                    <td style={{ ...cell, ...styles.tdNum }}>{fmt.peso(row.monthlyPmt)}</td>
                    <td style={{ ...cell, ...styles.tdNum }}>{fmt.peso(row.totalDue)}</td>
                  </tr>
                );
                });
              })()}
            </tbody>
          </table>
          <div style={styles.tenorFoot}>
            A longer tenor lowers your monthly payment but raises your rate — and your total.
            {' '}EIR — Annual Effective Interest Rate: the per-annum rate implied by your
            payment schedule. Monthly Add-On Rate = ((Monthly Payment × Tenor − Amount for
            Financing) ÷ Tenor) ÷ Amount for Financing; Direct Purchase is interest-free (0%).
          </div>
        </section>
      )}

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
  // v3-80 — tenor comparison table.
  tenorCaption: { fontSize: 12, color: '#6B7280', margin: '0 0 10px' },
  tenorFoot:    { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', marginTop: 8 },
  tenorSelRow:  { backgroundColor: '#FEF9EF' },
  tenorSelCell: { fontWeight: 700, color: '#854F0B' },
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
  // v3-117 — small, low-key price-reveal toggle (replaces the Expand pill).
  priceRevealBtn: {
    fontSize: 11.5,
    padding: '3px 10px',
    background: 'transparent',
    color: '#9CA3AF',
    border: '1px solid #E5E7EB',
    borderRadius: 999,
    cursor: 'pointer',
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
