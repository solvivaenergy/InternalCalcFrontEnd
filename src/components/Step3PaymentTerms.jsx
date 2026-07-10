// =============================================================================
// STEP 3 — DEFINE YOUR PAYMENT TERM
// -----------------------------------------------------------------------------
// Four subsections (v3-52 reorder — 3A/3B swapped so the section ordering
// matches the temporal order of customer payments: pre-install DP first,
// post-install tenor second):
//   3A — Pre-installation down payment % (dropdown: 0% to 50% in 5% increments)
//        [Excel AH11]
//   3B — Post-installation payment tenor (dropdown: 1, 3, 6, 9, 12, 18, 24,
//        30, 36, 42, 48, 54, 60 months) [Excel AH7]
//   3C — Post-installation balance summary (always paid via PDCs)
//   3D — Promo code [Excel AF6]
//
// v3-60: credit-card payment options removed throughout — see header note
// further down. 3A and 3C no longer carry a "pay via credit card" checkbox.
//
// v3-51:
//   • 3A/3B switched from NumberInput/Select to Select-only with the dropdown
//     value sets listed above (no free-form numeric entry; both modes lock to
//     these values).
//   • Both inputs render with the xlarge Select variant (32px brand-green/700),
//     matching the "Desired savings" treatment in Step 2A — telegraphs that
//     these are the driver inputs that shape every downstream number.
//   • Field labels removed since the supersized inputs are self-describing
//     against the 3A/3B section titles.
//   • Popular tenors table at the bottom REMOVED — was rendered after Step 3
//     and offered a quick visual of DP+monthly across 7 sample tenors. Calc
//     engine still produces `model.popularTenors` (harmless; no UI consumer
//     today, may be re-surfaced in Summary/PDF later).
//   • v3-60: the credit-card payment options (DP-via-CC and balance-via-CC),
//     their 5% surcharge, and the CC-eligible-tenor warning were all removed —
//     surcharging card payments is not permitted. Step 3 now offers DP% and
//     tenor only; the post-install balance is always paid via PDCs.
// =============================================================================

import React, { useEffect } from 'react';
import {
  SectionCard, Subsection, Field, Select, TextInput,
  CalloutBox, COLORS, fmt,
} from './ui.jsx';
import { resolveMinDpPct } from '../lib/calculations.js';

// ─── Hardcoded Step 3 dropdown value sets ────────────────────────────────────
// These are the customer-facing options for tenor and DP%. The base lists are
// locked to these 13 and 11 values respectively across both rep and customer
// modes. v3-68: Product can now NARROW them via Quote Limits —
// the tier resolved from adminParams.minDpTiers (v3-75) hides lower DP options and
// adminParams.maxTenorMonths hides longer tenors (see the filters inside the
// component). The base lists themselves are still not admin-editable.
const TENOR_OPTIONS = [1, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48, 54, 60];
const DP_PCT_OPTIONS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];

// Float-safe comparison epsilon for DP fractions (0.15 vs 0.15000000000002).
const DP_EPS = 1e-9;

export default function Step3PaymentTerms({ state, updateState, model, adminParams, onReset }) {
  const { terms } = model;

  // ─── v3-68 / v3-75: Quote Limits (Product-settable floors/caps) ────────────
  // Narrow the dropdown option sets per adminParams. Defaults leave both
  // lists untouched. Server-side validation guarantees sane ranges (every
  // tier's DP floor ≤ 0.5, tenor cap 1–60), so the filtered lists are never
  // empty.
  //
  // v3-75: the DP floor is TIERED on the quote's "Net Price (before DP
  // Discount)" — AI9 = terms.totalPaymentsOverTenor, which depends on the
  // package, promo, and TENOR but not on the DP% itself (no circularity).
  // Because the net price moves with the tenor, lengthening a tenor can
  // cross a tier boundary and raise the floor mid-quote; the snap effect
  // below then lifts the selected DP to the new lowest allowed option.
  // Crossing DOWN a boundary loosens the floor but never auto-lowers the
  // user's selection (the snap only ever moves DP up). The active minimum is
  // always displayed in the 3A subsection title — both public and rep views.
  const minDpPct  = resolveMinDpPct(adminParams.minDpTiers, terms.totalPaymentsOverTenor);
  const maxTenor  = adminParams.maxTenorMonths || 60;
  const dpOptions    = DP_PCT_OPTIONS.filter(p => p >= minDpPct - DP_EPS);
  const tenorOptions = TENOR_OPTIONS.filter(t => t <= maxTenor);

  // Snap live/restored quotes into the allowed ranges. Runs at render-time
  // state, not restore-time, because admin params load asynchronously after
  // boot — a saved session can sit outside limits that arrive moments later.
  useEffect(() => {
    const patch = {};
    if (state.downPaymentPct < minDpPct - DP_EPS) {
      patch.downPaymentPct = dpOptions[0];               // lowest allowed
    }
    if (state.tenor > maxTenor) {
      patch.tenor = tenorOptions[tenorOptions.length - 1]; // highest allowed
    }
    if (Object.keys(patch).length > 0) updateState(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.downPaymentPct, state.tenor, minDpPct, maxTenor]);

  // Promo code feedback
  const promoCode = (state.promoCode || '').trim().toUpperCase();
  const matchedPromo = adminParams.promoCodes.find(p => p.code === promoCode);
  const promoStatus = !state.promoCode ? null
                     : matchedPromo ? { kind: 'ok', label: matchedPromo.label, pct: matchedPromo.discount }
                     : { kind: 'invalid' };

  return (
    <SectionCard
      accent="Step 3"
      title="Define your payment term"
      subtitle="Choose how you'd like to pay. Customers can opt for full Direct Purchase (1-month tenor), or any tenor up to 60 months under our Rent-to-Own program."
      onReset={onReset}
    >
      {/* ──── 3A · Pre-installation Down Payment (v3-52 reorder) ────
          Was 3B in v3-51. Moved to 3A so the section ordering matches
          temporal payment order: DP first (pre-install), then balance
          over tenor (post-install). */}
      {/* v3-75: the resolved tier minimum ALWAYS renders in the title —
          both modes, every floor value including 0% — via Subsection's
          `hint` prop (which also stacks below the title on mobile). Amber
          = the app's standard notice color: an active constraint, not an
          error. When a tenor change crosses a tier boundary and the DP
          snaps up, this number is the rep's/customer's explanation. */}
      <Subsection
        title="3A · Pre-installation Down Payment"
        hint={
          <span style={{ color: COLORS.warning, fontStyle: 'normal', fontWeight: 600 }}>
            {Number((minDpPct * 100).toFixed(1))}% minimum
          </span>
        }
      >
        {/* v3-66: DP% selector and the DP-amount tile sit side-by-side in a
            single flex row (equal height via alignItems:'stretch' — the tile's
            content governs the height and the xlarge Select stretches up to
            match). Replaces the old stacked layout (Select → hint → full-width
            tile), saving ~two rows of vertical space; the hint now sits below
            the row. The DP-amount tile uses `fill` so it flexes into the space
            beside the fixed-width Select instead of sprawling full-width. */}
        <div style={styles.dpRow}>
          <Select
            value={state.downPaymentPct}
            onChange={v => updateState({ downPaymentPct: Number(v) })}
            width={150}
            xlarge
            options={dpOptions.map(p => ({
              value: p, label: `${(p * 100).toFixed(0)}%`,
            }))}
          />
          <SummaryTile
            label={`${(state.downPaymentPct * 100).toFixed(0)}% Down Payment Amount`}
            value={fmt.peso(terms.dpAmount)}
            emphasis
            fill
          />
        </div>
        <div style={styles.hint}>
          A larger down payment lowers your monthly payment and increases your discount.
        </div>
      </Subsection>

      {/* ──── 3B · Post-installation Payment Tenor (v3-52 reorder) ────
          Was 3A in v3-51. Title gained "Post-installation" qualifier
          to clarify that the tenor applies to the post-install payment
          schedule (the pre-install DP is paid before installation, the
          balance is spread over this tenor after). */}
      <Subsection title="3B · Post-installation Payment Tenor">
        <div style={styles.driverRow}>
          <Select
            value={state.tenor}
            onChange={v => updateState({ tenor: Number(v) })}
            width={160}
            xlarge
            options={tenorOptions.map(t => ({
              value: t,
              label: t === 1 ? '1 month' : `${t} months`,
            }))}
          />
        </div>
        <div style={styles.hint}>
          1 month = direct purchase; up to 60 months for Rent-to-Own
        </div>
      </Subsection>

      {/* ──── 3C · Post-installation Balance ──── */}
      <Subsection title="3C · Post-installation Balance">
        {terms.negativeBalance ? (
          /* v3-56 — DP discount exceeds remaining balance over the chosen tenor.
             The monthly payment would be negative (nonsensical to display). Show
             a yellow callout suggesting which input to adjust, and hide the
             3 SummaryTiles below. The Summary and Schedule
             of Payments tabs are also hidden in App.jsx until this resolves. */
          <CalloutBox kind="warn">
            <strong>Your down payment exceeds the balance owed.</strong>{' '}
            At {(state.downPaymentPct * 100).toFixed(0)}% down over{' '}
            {state.tenor} month{state.tenor !== 1 ? 's' : ''}, the discount you
            earn for the larger down payment is larger than the remaining
            balance. To see a valid monthly payment, please{' '}
            <strong>lower the down payment</strong> or{' '}
            <strong>shorten the tenor</strong> above.
          </CalloutBox>
        ) : (
          <>
            <div className="summary-tile-grid" style={styles.dpSummaryGrid}>
              {/* v3-67: the "Post-installation balance" tile was removed —
                  since v3-60, finalPostInstallBalance === netBalanceOverTenor
                  (the CC surcharge that once made them differ is gone), so the
                  two tiles always showed the same number. Per user mockup, the
                  "Net balance over N months" tile is the one kept; the Total
                  Amount Due bar below still uses finalPostInstallBalance. */}
              <SummaryTile
                label={`Net balance over ${state.tenor} month${state.tenor !== 1 ? 's' : ''}`}
                value={fmt.peso(terms.netBalanceOverTenor)}
              />
              <SummaryTile
                label={`Monthly Payment for ${state.tenor} month${state.tenor !== 1 ? 's' : ''}`}
                value={fmt.peso(terms.customerMonthlyPmt)}
                tint="brand"
              />
            </div>
          </>
        )}
      </Subsection>

      {/* ──── 3D · Promo Code ──── */}
      <Subsection title="3D · Promo / Partner Discount Code"
                  hint="Optional">
        <Field label="Promo code" inline>
          <TextInput
            value={state.promoCode}
            onChange={v => updateState({ promoCode: v.toUpperCase().slice(0, 16) })}
            placeholder="Enter code"
            width={200}
          />
          {promoStatus?.kind === 'ok' && (
            <span style={styles.promoOk}>
              ✓ {promoStatus.label} — {fmt.pct(promoStatus.pct, 0)} discount
            </span>
          )}
          {promoStatus?.kind === 'invalid' && (
            <span style={styles.promoInvalid}>Code not recognized</span>
          )}
        </Field>
      </Subsection>

      {/* ──── 3E · Total Amount Due Summary ────
          v3-56: hidden when terms.negativeBalance because the figure would
          read as "DP + (negative balance)" which is meaningless to a customer
          and might be misread as a discount they're entitled to. The 3C
          callout already explains what to adjust to resurface this row. */}
      {!terms.negativeBalance && (
        <div style={styles.totalDue}>
          <div>
            <div style={styles.totalDueLabel}>YOUR TOTAL AMOUNT DUE</div>
            <div style={styles.totalDueSub}>
              DP {fmt.peso(terms.dpTotalCharge)} + Balance {fmt.peso(terms.finalPostInstallBalance)}
            </div>
          </div>
          <div style={styles.totalDueAmount}>
            {fmt.peso(terms.dpTotalCharge + terms.finalPostInstallBalance)}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── SummaryTile: a compact key/value tile inside Step 3 ────────────────────
// `fill` (v3-66) makes the tile a flex child that grows into the space beside
// the fixed-width xlarge Select in 3A: it stretches to the row height (content
// vertically centered), rounds/pads a touch larger, and bumps the emphasised
// value to 20px so it reads as a balanced pair with the 22px Select. Untouched
// for the 3C grid tiles, which don't pass `fill`.
function SummaryTile({ label, value, emphasis, tint, fill }) {
  const tintBg = tint === 'warn' ? '#FFFBEB' : tint === 'brand' ? '#ECFDF5' : COLORS.brandCream;
  const tintBorder = tint === 'warn' ? '#FCD34D' : tint === 'brand' ? '#A7F3D0' : COLORS.divider;
  const valueColor = tint === 'brand' ? COLORS.brandGreen
                   : emphasis ? COLORS.brandGreen
                   : COLORS.textBody;
  return (
    <div style={{
      backgroundColor: tintBg,
      border: `1px solid ${tintBorder}`,
      borderRadius: fill ? 8 : 6,
      padding: fill ? '10px 16px' : '10px 14px',
      ...(fill ? {
        flex: '1 1 0',
        minWidth: 0,
        minHeight: 56,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      } : null),
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: fill ? 5 : 4,
      }}>{label}</div>
      <div style={{
        fontSize: fill && emphasis ? 20 : emphasis ? 18 : 16,
        fontWeight: emphasis ? 700 : 600,
        color: valueColor,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  );
}

const styles = {
  // Wrapper around the xlarge Select in 3B. Provides vertical breathing room
  // before the hint text below and lets the Select size naturally to its
  // content without being squeezed by Field's inline label layout (which we
  // don't use anymore for these driver inputs). (v3-66: 3A no longer uses this
  // — it uses dpRow to sit the Select and DP-amount tile side-by-side.)
  driverRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  // v3-66: 3A row holding the DP% Select (fixed 150px) + the DP-amount tile
  // (flex-fill). alignItems:'stretch' equalises their heights.
  dpRow: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 12,
    marginBottom: 2,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 6,
  },
  dpSummaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 10,
    marginTop: 14,
  },
  totalDue: {
    backgroundColor: COLORS.brandGreen,
    color: '#FFFFFF',
    padding: '20px 24px',
    borderRadius: 10,
    marginTop: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  totalDueLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.85,
    marginBottom: 4,
  },
  totalDueSub: {
    fontSize: 13,
    opacity: 0.8,
    fontVariantNumeric: 'tabular-nums',
  },
  totalDueAmount: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: -0.5,
    fontVariantNumeric: 'tabular-nums',
  },
  promoOk: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: 600,
    marginLeft: 12,
  },
  promoInvalid: {
    fontSize: 13,
    color: COLORS.error,
    marginLeft: 12,
  },
};
