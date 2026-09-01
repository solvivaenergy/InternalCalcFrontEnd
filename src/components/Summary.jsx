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
import { monthlyAddOnRate, decomposeDirectPrice,
         resolveMinDpPct, allowedDpOptions } from '../lib/calculations.js';   // v3-117 / v3-135 / v3-153
import { PACKAGE_CATEGORIES, normalizePromoType } from '../data/adminParams.js';   // v3-150 / v3-151

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

// v3-153 — `updateState` is new: the compare-terms block now WRITES state (down
// payment and tenor), where the Summary was previously read-only. Defaulted to
// a no-op so any other mount point degrades to the old read-only behaviour
// instead of throwing.
// v3-177 — `financingShown` / `onFinancingShown` are the SECOND admin gate on
// this tab. It reveals the financing detail removed from the customer view:
// the EIR row, the Post-Installation Balance row, the TOTAL AMOUNT DUE row and
// the EIR + Total Amount Due columns of the compare table. Same shape as the
// v3-117 price reveal — lifted to App so Generate PDF can force it hidden
// during the html2canvas snapshot, not persisted, default locked on every load.
export default function Summary({ state, model, adminParams, contact, agent, generatedDate, validUntil,
                                  updateState = () => {},
                                  pricesShown = false, onPricesShown = () => {},
                                  financingShown = false, onFinancingShown = () => {} }) {
  const { pkg, terms, popularTenors } = model;
  // v3-153 — the tier floor is a function of the DISCOUNTED price, the same
  // basis Step 3A resolves it on, so both selectors offer the same range.
  const summaryMinDpPct = resolveMinDpPct(adminParams.minDpTiers, terms.netDirectPrice);


  // Filter to only items with non-zero direct price (Excel: FILTER B<>0).
  // v3-146 — !== 0, not > 0: the Excel semantic is <>0, and REVERSAL/credit
  // lines (negative, v3-144) must enumerate — the engine already nets them
  // into every total, so hiding them made the table disagree with the
  // Pricing & Payment cascade below it. True-empty rows stay hidden.
  const visibleItems = pkg.items.filter(i => i.directPrice !== 0);

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
  // v3-180 — FinCo added: it is an internal-staff gate and the financing
  // entity sets the rates that produce these very prices. The Rep/Maintenance
  // exclusion of decision B is untouched.
  const acceptedPasswords = [
    AUTH.editPassword,
    AUTH.engineeringPassword,
    AUTH.productPassword,
    AUTH.fincoPassword,
    AUTH.viewPassword,
  ];

  const handleAuthSuccess = () => {
    onPricesShown(true);
    setAuthOpen(false);
  };

  // v3-177 — second gate, same accepted roles as the price reveal (Rep and
  // Maintenance deliberately excluded, per v3-117 decision B). Kept as its own
  // dialog + its own flag rather than folded into `pricesShown`: an admin
  // checking a margin has no reason to resurface the financed total, and the
  // two reveals expose different things to different people.
  const [financingAuthOpen, setFinancingAuthOpen] = useState(false);
  const handleFinancingAuthSuccess = () => {
    onFinancingShown(true);
    setFinancingAuthOpen(false);
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
            residual in the GM cell). v3-194 — the GM header is PLAIN
            (user-directed, Pat): under per-component margins (v3-191) no
            single percentage describes the column, so each GM cell carries
            its OWN realized margin in parentheses — gm ÷ (gm + COGS), the
            actual margin including the ceiling's rounding residual — and
            the subtotal/total rows carry the same figure blended. Lines
            with no COGS basis (misc free-form) show no percentage. The MDR
            header % remains the merchantDiscountRate parameter. Misc lines have no COGS basis —
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
          const gmPctOf = (gm, cogsVal, known) => {
            if (!known) return null;
            const base = gm + cogsVal;
            return base ? (gm / base) * 100 : null;
          };
          const gmCell = (gm, cogsVal, known) => {
            const pv = gmPctOf(gm, cogsVal, known);
            return (
              <React.Fragment>
                {fmt.peso(gm)}
                {pv != null && (
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {' '}({pv.toFixed(2)}%)
                  </span>
                )}
              </React.Fragment>
            );
          };
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
                  {pricesShown && <th style={numTh}>Gross Margin</th>}
                  {pricesShown && <th style={numTh}>{pct(mdrRate)}% Allow. for MDR</th>}
                  {pricesShown && <th style={numTh}>12% VAT</th>}
                  {pricesShown && <th style={numTh}>Direct Purchase Price</th>}
                </tr>
              </thead>
              <tbody>
                {/* v3-150 — line items are GROUPED into the three Quote Summary
                    categories (user-directed assignment; see LINE_ITEM_CATEGORY
                    in calculations.js and the per-item `category` on Anjon's 2F
                    catalog). Render order is PACKAGE_CATEGORIES order (A→B→C),
                    NOT engine emission order. An empty category is omitted
                    entirely — header and subtotal both — per Pat: a solar-only
                    quote should not show a ₱0 Battery Package block. Each
                    subtotal carries all five waterfall columns when prices are
                    unlocked, summed within the group, so the four components
                    still reconcile to that group's Direct Purchase Price the
                    same way the grand total does. */}
                {PACKAGE_CATEGORIES.map(cat => {
                  const catRows = rows.filter(({ it }) => it.category === cat.id);
                  if (catRows.length === 0) return null;
                  const sub = catRows.reduce((a, { it, d }) => ({
                    cogs: a.cogs + (d.cogsKnown ? d.cogs : 0), gm: a.gm + d.gm,
                    mdrAmt: a.mdrAmt + d.mdrAmt, vat: a.vat + d.vat, dp: a.dp + d.dp,
                    direct: a.direct + it.directPrice,
                  }), { cogs: 0, gm: 0, mdrAmt: 0, vat: 0, dp: 0, direct: 0 });
                  const subTd = { ...styles.td, fontWeight: 700 };
                  const subNum = { ...mutedTd, fontWeight: 700 };
                  return (
                    <React.Fragment key={cat.id}>
                      <tr>
                        <td colSpan={pricesShown ? 6 : 2} style={styles.categoryHeader}>
                          {cat.letter} &middot; {cat.label}
                        </td>
                      </tr>
                      {/* v3-175 — an expansion order states what it plugs
                          into. Rendered as a note row (zero-priced engine
                          items are filtered, so this cannot be a line item);
                          the PDF picks it up through the page-4 snapshot. */}
                      {cat.id === 'solar' && model.expansionActive && (
                        <tr>
                          <td colSpan={pricesShown ? 6 : 2}
                              style={{ ...styles.td, fontSize: 11.5, color: '#075985',
                                       fontStyle: 'italic' }}>
                            Connects to the customer&rsquo;s existing{' '}
                            {state.existingInverterKw
                              ? `${fmt.num(state.existingInverterKw, 1)} kW `
                              : ''}inverter — no inverter included in this order.
                          </td>
                        </tr>
                      )}
                      {catRows.map(({ it, d }) => (
                        <tr key={it.key}>
                          <td style={styles.td}>{it.description}</td>
                          {pricesShown && (
                            <td style={mutedTd}>{d.cogsKnown ? fmt.peso(d.cogs) : '\u2014'}</td>
                          )}
                          {pricesShown && <td style={mutedTd}>{gmCell(d.gm, d.cogs, d.cogsKnown)}</td>}
                          {pricesShown && <td style={mutedTd}>{fmt.peso(d.mdrAmt)}</td>}
                          {pricesShown && <td style={mutedTd}>{fmt.peso(d.vat)}</td>}
                          {pricesShown && <td style={numTd}>{fmt.peso(d.dp)}</td>}
                        </tr>
                      ))}
                      <tr style={styles.subtotalRow}>
                        <td style={subTd}>{cat.label} Subtotal</td>
                        {pricesShown && <td style={subNum}>{fmt.peso(sub.cogs)}</td>}
                        {pricesShown && <td style={subNum}>{gmCell(sub.gm, sub.cogs, sub.cogs > 0)}</td>}
                        {pricesShown && <td style={subNum}>{fmt.peso(sub.mdrAmt)}</td>}
                        {pricesShown && <td style={subNum}>{fmt.peso(sub.vat)}</td>}
                        <td style={{ ...styles.td, ...styles.tdNum, fontWeight: 700 }}>
                          {fmt.peso(pricesShown ? sub.dp : sub.direct)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                <tr style={styles.totalRow}>
                  <td style={{ ...styles.td, fontWeight: 700 }}>
                    Total Package Price <span style={styles.muted}>(VAT Inclusive)</span>
                  </td>
                  {pricesShown && (
                    <td style={{ ...mutedTd, fontWeight: 700 }}>{fmt.peso(tot.cogs)}</td>
                  )}
                  {pricesShown && (
                    <td style={{ ...mutedTd, fontWeight: 700 }}>
                      {fmt.peso(tot.gm)}
                      {netRevTot > 0 && (
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {' '}({gmPct.toFixed(2)}%)
                        </span>
                      )}
                    </td>
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

      {/* v3-177 — modal AuthDialog for the FINANCING-DETAIL gate. Same accepted
          password list and the same v3-122 title/subtitle suppression as the
          price gate: the dialog explains nothing. */}
      {financingAuthOpen && (
        <AuthDialog
          modal
          customTitle=""
          customSubtitle=""
          acceptedPasswords={acceptedPasswords}
          onAuth={handleFinancingAuthSuccess}
          onCancel={() => setFinancingAuthOpen(false)}
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
                  {/* v3-151 — a peso code has no percentage worth printing:
                      "Less: 12.4% Launch Promo" on a flat PHP 25,000 code is a
                      number the customer cannot reconcile against anything. The
                      amount is already in the column to the right. */}
                  Less: {normalizePromoType(terms.promo.type) === 'percent'
                    ? `${(terms.promoDiscount * 100).toFixed(1)}% ` : ''}
                  {terms.promo.label || terms.promo.code} Discount
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
            {/* v3-177 — the customer-facing rate row is now the MONTHLY ADD-ON
                RATE (user-directed). The EIR row it replaced is preserved
                verbatim below, behind the financing gate. Same helper and same
                base (terms.amountForFinancing) the compare table uses, so the
                row and the table's selected row always agree. */}
            <tr>
              <td style={styles.td3}>
                Monthly Add-On Rate <span style={styles.muted}>(per month)</span>
              </td>
              <td style={{ ...styles.td3, ...styles.tdNum }}>
                {`${(monthlyAddOnRate(terms.customerMonthlyPmt,
                                      terms.amountForFinancing || 0,
                                      state.tenor) * 100).toFixed(3)}%`}
              </td>
            </tr>
            {financingShown && (
              <tr>
                <td style={styles.td3}>
                  Interest Rate <span style={styles.muted}>(EIR, per annum)</span>
                </td>
                <td style={{ ...styles.td3, ...styles.tdNum }}>
                  {terms.rtoRate > 0 ? `${(terms.rtoRate * 100).toFixed(3)}%` : 'Interest-free'}
                </td>
              </tr>
            )}

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
                branch for "Direct Purch".
                v3-177 — behind the financing gate: monthly × tenor IS the
                financed total under another name, so leaving it visible would
                have defeated the removal of the TOTAL AMOUNT DUE row below. */}
            {financingShown && (
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
            )}

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
                by the DST.
                v3-177 — behind the financing gate (user-directed). The figure
                and its source are UNCHANGED; only who sees it moved. */}
            {financingShown && (
              <tr>
                <td style={{ ...styles.td3, ...styles.totalAmountDueLabel }}>
                  TOTAL AMOUNT DUE
                </td>
                <td style={{ ...styles.td3, ...styles.tdNum, ...styles.totalAmountDueAmount }}>
                  {fmt.peso(terms.summaryTotalDue)}
                </td>
              </tr>
            )}
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
          {/* v3-177 — financing-detail gate. Mirrors the v3-119 price-reveal
              button exactly: LOCKED is a bare padlock with no label and no
              tooltip (a customer must not learn what the control is for);
              UNLOCKED carries a label, which only an admin who just
              authenticated ever sees. .no-pdf-capture keeps the control itself
              out of the page-4 snapshot. */}
          <div style={styles.sectionTitleRow}>
            <h2 style={{ ...styles.sectionTitle, margin: '0 0 4px' }}>Compare your payment terms</h2>
            <button
              className="no-pdf-capture"
              onClick={financingShown ? () => onFinancingShown(false) : () => setFinancingAuthOpen(true)}
              style={styles.priceRevealBtn}
              title={financingShown ? 'Hide financing detail' : undefined}
            >
              {financingShown ? 'Hide financing detail' : '\u{1F512}'}
            </button>
          </div>
          {/* v3-155 — the v3-153 inline caption selector becomes a CONTROL BAR.
              The prose form ("At your 30% down payment of PHP 154,322,
              financing PHP 360,085") read well but buried the only two figures
              a customer actually compares, and a 12px inline <select> did not
              look like a lever worth pulling. Same state field, same shared
              option set as Step 3A — this is presentation only.

              100% is still excluded here: the whole section is gated behind
              !terms.isFullyPaid, so choosing it would remove the very control
              that set it. Step 3A keeps the full range. */}
          <div style={styles.termsBar}>
            <div>
              <div style={styles.termsBarLabel}>Your down payment</div>
              <select
                value={state.downPaymentPct}
                onChange={e => updateState({ downPaymentPct: Number(e.target.value) })}
                style={styles.dpSelect}
                aria-label="Down payment percentage"
              >
                {allowedDpOptions(summaryMinDpPct, true).map(p => (
                  <option key={p} value={p}>{`${(p * 100).toFixed(0)}%`}</option>
                ))}
              </select>
            </div>
            <div style={styles.termsBarFig}>
              <div style={styles.termsBarFigLabel}>Due at signing</div>
              <div style={styles.termsBarFigValue}>{fmt.peso(terms.dpTotalCharge)}</div>
            </div>
            <div>
              <div style={styles.termsBarFigLabel}>Financed</div>
              <div style={styles.termsBarFigValue}>{fmt.peso(terms.amountForFinancing)}</div>
            </div>
          </div>

          {/* v3-155 — lifted OUT of the footnote, where it was the first
              sentence of a paragraph that ran on into the EIR definition and
              the add-on formula. Reference material and an affordance hint have
              opposite reading patterns; merged, neither got read. Phrased as
              the next step rather than an instruction, because that is the
              real sequence: set the down payment, then pick a term. */}
          <div style={styles.tenorPrompt}>
            <span style={styles.tenorPromptArrow} aria-hidden="true">&#8595;</span>
            Now select a row below to choose your term
          </div>
          <table style={styles.table}>
            <thead>
              <tr role="radiogroup" aria-label="Payment tenor">
                {/* v3-155 — selection-indicator column. Unlabelled on purpose:
                    "Select" in the header added noise and the dots explain
                    themselves. This is what actually makes the table read as a
                    chooser; the prompt above is the belt to its braces. */}
                <th style={{ ...styles.th, width: 30 }} aria-hidden="true" />
                {/* v3-117 — user-specified columns + order:
                    TENOR · EIR · MONTHLY ADD-ON RATE · MONTHLY PAYMENT ·
                    TOTAL AMOUNT DUE. 'EIR' renames the old 'Your Rate'
                    (values unchanged — decision D).
                    v3-177 — the EIR and TOTAL AMOUNT DUE columns render only
                    behind the financing gate. Customers now compare terms on
                    add-on rate and monthly payment alone. */}
                <th style={{ ...styles.th, width: '24%' }}>Tenor</th>
                {financingShown && <th style={{ ...styles.th, textAlign: 'right' }}>EIR</th>}
                <th style={{ ...styles.th, textAlign: 'right' }}>Monthly Add-On Rate</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Monthly Payment</th>
                {financingShown && <th style={{ ...styles.th, textAlign: 'right' }}>Total Amount Due</th>}
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
                  /* v3-153 — rows select their tenor. The table already
                     highlighted the selection; making it clickable turns a
                     read-only comparison into the control the customer was
                     already reading it as. Keyboard-reachable and announced as
                     a radio so the highlight has a meaning assistive tech can
                     convey. */
                  <tr key={row.tenor}
                      role="radio"
                      aria-checked={isSel}
                      tabIndex={0}
                      onClick={() => updateState({ tenor: row.tenor })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          updateState({ tenor: row.tenor });
                        }
                      }}
                      className="tenor-row"
                      style={{ ...(isSel ? styles.tenorSelRow : undefined),
                               ...styles.tenorRowClickable }}>
                    <td style={cell}>
                      <span className="tenor-dot"
                            style={{ ...styles.tenorDot,
                                     ...(isSel ? styles.tenorDotOn : null) }} />
                    </td>
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
                    {financingShown && (
                      <td style={{ ...cell, ...styles.tdNum }}>{row.rate > 0 ? `${(row.rate * 100).toFixed(3)}%` : 'Interest-free'}</td>
                    )}
                    <td style={{ ...cell, ...styles.tdNum }}>
                      {`${(monthlyAddOnRate(row.monthlyPmt, addOnBase, row.tenor) * 100).toFixed(3)}%`}
                    </td>
                    <td style={{ ...cell, ...styles.tdNum }}>{fmt.peso(row.monthlyPmt)}</td>
                    {financingShown && (
                      <td style={{ ...cell, ...styles.tdNum }}>{fmt.peso(row.totalDue)}</td>
                    )}
                  </tr>
                );
                });
              })()}
            </tbody>
          </table>
          <div style={styles.tenorFoot}>
            {/* v3-155 — "Select any row…" moved above the table. The Monthly
                Add-On Rate formula further down is DELIBERATELY RETAINED: it
                discloses how a rate shown to the customer is derived, and with
                RA 3765 and counsel's review of the financing section still
                outstanding, that is not mine to drop on readability grounds.
                Revisit with counsel, not in a styling pass. */}
            {/* v3-177 — the EIR sentence, and the "raises your rate — and your
                total" clause, describe columns the customer can no longer see;
                both move behind the gate. The Monthly Add-On Rate formula is
                RETAINED in BOTH states — it discloses how a rate shown to the
                customer is derived, which is exactly the v3-155 reasoning, and
                it is now the ONLY rate on the page. */}
            {financingShown
              ? <>Totals include documentary stamp tax. A longer tenor lowers your monthly
                  payment but raises your rate — and your total.{' '}
                  EIR — Annual Effective Interest Rate: the per-annum rate implied by your
                  payment schedule.{' '}</>
              : <>Includes documentary stamp tax. A longer tenor lowers your monthly payment.{' '}</>}
            Monthly Add-On Rate = ((Monthly Payment × Tenor − Amount for
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
  // v3-150 — category band above each group of line items. Deliberately quiet:
  // the subtotal row below carries the visual weight, and the customer view
  // has no per-line prices, so a loud header would dominate the whole table.
  categoryHeader: {
    padding: '14px 12px 6px',
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.brandGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}`,
  },
  // v3-153 — DP selector sitting inline in a sentence: it has to read as part
  // of the prose, not as a form field dropped into it.
  // v3-155 — control bar above the tenor table.
  termsBar: {
    display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
    background: COLORS.brandCream,
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 9,
    padding: '13px 16px',
    marginBottom: 2,
  },
  termsBarLabel: {
    fontSize: 10, letterSpacing: 0.5, fontWeight: 700,
    textTransform: 'uppercase', color: COLORS.textMuted, marginBottom: 5,
  },
  dpSelect: {
    font: 'inherit', fontSize: 21, fontWeight: 700,
    color: COLORS.brandGreen,
    background: COLORS.surfaceCard,
    border: `1px solid ${COLORS.inputBorder}`,
    borderRadius: 7,
    padding: '6px 10px',
    cursor: 'pointer',
  },
  // Divider rule sits on the first figure so the selector reads as the control
  // and the two figures as its consequences.
  termsBarFig: { borderLeft: `1px solid ${COLORS.divider}`, paddingLeft: 18 },
  termsBarFigLabel: { fontSize: 11, color: COLORS.textMuted },
  termsBarFigValue: { fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  tenorPrompt: {
    display: 'flex', alignItems: 'center', gap: 7,
    color: COLORS.brandGreen, fontSize: 12.5, fontWeight: 700,
    padding: '12px 0 8px',
  },
  tenorPromptArrow: { fontSize: 15, lineHeight: 1 },
  // Selection indicator. Hover/focus states live in index.html — React inline
  // styles cannot express :hover.
  tenorDot: {
    width: 13, height: 13, borderRadius: '50%',
    border: `1.5px solid ${COLORS.inputBorder}`,
    display: 'inline-block', verticalAlign: 'middle',
    transition: 'border-color 120ms ease',
  },
  // Same gold as tenorSelCell below — one selected-state colour across the
  // row text, the row tint and the dot, not three near-misses.
  tenorDotOn: {
    borderColor: '#854F0B',
    background: 'radial-gradient(circle, #854F0B 0 45%, transparent 46%)',
  },
  tenorRowClickable: { cursor: 'pointer' },
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
