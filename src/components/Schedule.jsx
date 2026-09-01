// =============================================================================
// SCHEDULE OF PAYMENTS — replicates Excel ANNEX sheet
// -----------------------------------------------------------------------------
// 60-row payment table:
//   • Down Payment (special row)
//   • Months 1..60 with: Due Date, Description, Min Amount Due,
//     Early Payoff Amount, Savings from Early Payoff
// =============================================================================

import React from 'react';
import { COLORS, fmt } from './ui.jsx';

export default function Schedule({ model, state, contact, generatedDate }) {
  const { annex, terms } = model;

  // Schedule-strip numbers (sourced to match the Summary tab exactly):
  //   Gross Price = Net Direct Price from Summary = terms.netDirectPrice
  //                 (the 60-month RTO total after any promo code, before DP).
  //   Net Price   = `Total Amount Due` from Summary = terms.totalAmountDue
  //                 (the sum of all payments the customer actually makes:
  //                  DP charge + post-install balance, including any CC fees).
  //   Discount    = Gross − Net (the implicit savings from making a DP and/or
  //                 paying on a shorter tenor).
  //   X%          = Discount / Gross, expressed as a percent.
  // v3-90 — the four-tile strip (Gross / Discount / Net / Tenor) is GONE.
  // It was also actively WRONG: `netPrice` was assigned terms.totalAmountDue, so
  // the tile labelled "NET PRICE" printed the TOTAL AMOUNT DUE (₱854,432) while
  // the tile labelled "GROSS PRICE" printed the actual Net Price (₱813,770) —
  // inverted, and the "discount" between them was really the INTEREST. Under a
  // loan there is no gross-vs-net discount to show at all.
  //
  // Replaced with the three figures that describe the schedule below it: what is
  // paid up front, what is paid each month, and for how long.
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Schedule of Payments</h1>
        <p style={styles.subtitle}>
          For <strong>{contact.name}</strong> · Generated {fmtDate(generatedDate)}
        </p>
      </div>

      {/* ─── v3-90 — three tiles that describe the schedule below ─── */}
      <div style={styles.totalsGrid}>
        <SummaryCard
          label={`Pre-Installation ${fmt.pct(state.downPaymentPct, 0)} Downpayment`}
          value={fmt.peso(terms.dpTotalCharge)}
          accent
        />
        {/* v3-100 — Direct Purchase (tenor 0): the middle tile is the full
            balance due upon installation (Excel AG15), and the tenor tile
            names the option instead of a month count. */}
        <SummaryCard
          label={terms.isDirectPurchase
            ? 'Post-Installation Direct Purchase Balance'
            : 'Post-Installation Monthly Payment'}
          value={fmt.peso(terms.customerMonthlyPmt)}
          color={COLORS.brandGreen}
        />
        <SummaryCard
          label="Post-Installation Payment Tenor"
          value={terms.isDirectPurchase
            ? 'Direct Purchase'
            : `${state.tenor} Month${state.tenor === 1 ? '' : 's'}`}
        />
      </div>

      {/* ─── 61-row payment table ─── */}
      <div className="schedule-table-wrap">
        <table className="schedule-table" style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, width: 60 }}>#</th>
            <th style={styles.th}>Due Date</th>
            <th style={styles.th}>Description</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Min. Amount Due</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Early Payoff Amount</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Savings from Early Payoff</th>
          </tr>
        </thead>
        <tbody>
          {annex.rows.map((r, idx) => {
            const isEmpty = (r.minDue == null || r.minDue === 0) && idx > 0;
            if (isEmpty) return null;
            const isDp = idx === 0;
            const isLast = !isEmpty && r.minDue > 0 && (idx === annex.rows.length - 1 ||
                          (annex.rows[idx + 1] && annex.rows[idx + 1].minDue === 0));
            return (
              <tr key={idx} style={isDp ? styles.dpRow : null}>
                <td style={{ ...styles.td, fontWeight: 600 }}>{r.payment}</td>
                <td style={styles.td}>
                  {r.dueDate instanceof Date ? fmtDate(r.dueDate) : r.dueDate}
                </td>
                <td style={styles.td}>{r.description}</td>
                <td style={{ ...styles.td, ...styles.tdNum }}>
                  {r.minDue != null ? fmt.peso(r.minDue) : '—'}
                </td>
                <td style={{ ...styles.td, ...styles.tdNum }}>
                  {r.earlyPayoff != null ? fmt.peso(r.earlyPayoff) : '—'}
                </td>
                <td style={{ ...styles.td, ...styles.tdNum, color: r.savings > 0 ? COLORS.brandGreen : COLORS.textMuted }}>
                  {r.savings != null ? fmt.peso(r.savings) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* v3-189 — the first sentence was removed (Pat). It had two problems
          beyond being unwanted: it cited "Admin C28", an internal workbook cell
          reference on a customer-facing tab, and it HARDCODED "8% per annum"
          while the rate it described is `earlyPayoffDiscountRate` — FinCo-
          editable since v3-180. The moment FinCo moved that rate the sentence
          would have stated a false figure beside a column computed from the
          real one. What remains is the definition that is always true. */}
      <p style={styles.disclaimer}>
        <strong>Note:</strong> Savings from Early Payoff = total of remaining
        payments minus Early Payoff Amount.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, accent, color }) {
  return (
    <div style={{
      backgroundColor: accent ? COLORS.brandCream : '#FFFFFF',
      border: `1px solid ${COLORS.divider}`,
      borderRadius: 8,
      padding: '12px 16px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 700,
        color: color || (accent ? COLORS.brandGreen : COLORS.textBody),
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  );
}

function fmtDate(d) {
  if (!(d instanceof Date)) return d;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles = {
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    border: `1px solid ${COLORS.divider}`,
    padding: '32px 36px',
  },
  header: { paddingBottom: 16, marginBottom: 20, borderBottom: `1px solid ${COLORS.divider}` },
  title: { fontSize: 24, fontWeight: 700, color: COLORS.brandGreen, margin: '0 0 6px', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: 0 },
  totalsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
    marginBottom: 24,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left', padding: '8px 10px',
    fontSize: 10, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}`, backgroundColor: COLORS.brandCream,
  },
  td: { padding: '6px 10px', borderBottom: `1px solid ${COLORS.divider}` },
  tdNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  dpRow: { backgroundColor: '#F5F1E8' },
  disclaimer: {
    fontSize: 12, color: COLORS.textMuted, marginTop: 16, lineHeight: 1.6,
  },
};
