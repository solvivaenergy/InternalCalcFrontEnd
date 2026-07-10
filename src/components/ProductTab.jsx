// =============================================================================
// PRODUCT TAB — third of three admin tabs (v3-54)
// -----------------------------------------------------------------------------
// Section order (per spec):
//   1. Quote Validity
//   2. Interest Rates
//   3. CC Post-Install Tenors
//   4. Promo Codes
//
// All edits flow through props from AdminShell. Edit gating per section is
// read from permissions.js — Product + Super Admin can edit; Engineering +
// Audit see read-only.
// =============================================================================

import React from 'react';
import { COLORS } from './ui.jsx';
import {
  Section, Param, PromoCodesTable, MinDpTiersTable, adminStyles,
} from './AdminShared.jsx';
import {
  canEditAdminSection, hasAnyEditAccess,
} from '../lib/permissions.js';

export default function ProductTab({
  params, updateParam, accessLevel, validityDays,
}) {
  const anyEdit = hasAnyEditAccess(accessLevel);
  const canEditSection = (k) => canEditAdminSection(accessLevel, k);

  const validUntilPreview = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (validityDays || 0));
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  })();

  return (
    <div>
      {/* ─── Quote Validity ─────────────────────────────────────────── */}
      <Section title="Quote Validity"
               canEdit={canEditSection('quoteValidity')}
               anyEditRole={anyEdit}>
        <Param label="Quote validity period" suffix="days" step={1}
               value={params.quoteValidityDays}
               onChange={v => updateParam('quoteValidity', 'quoteValidityDays', v)}
               canEdit={canEditSection('quoteValidity')}
               min={1} max={365}
               hint={`A quote generated today would be valid until ${validUntilPreview}.`} />
      </Section>

      {/* ─── Quote Limits (v3-68) ───────────────────────────────────── */}
      <Section title="Quote Limits"
               canEdit={canEditSection('quoteLimits')}
               anyEditRole={anyEdit}>
        <Param label="Minimum system size" suffix="kWp" step={0.5}
               value={params.minSystemKwp}
               onChange={v => updateParam('quoteLimits', 'minSystemKwp', v)}
               canEdit={canEditSection('quoteLimits')}
               min={0} max={50}
               hint="Floors the Step 2A recommendation and the Selected-panels override. 0 = no minimum. Retrofit-only orders (0 panels) are unaffected." />
        {/* v3-75: tiered minimum DP replaces the v3-68 scalar. */}
        <div style={{ margin: '14px 0 6px', fontSize: 13, fontWeight: 600 }}>
          Minimum down payment — by Net Price (before DP Discount)
        </div>
        <MinDpTiersTable tiers={params.minDpTiers}
                         onChange={v => updateParam('quoteLimits', 'minDpTiers', v)}
                         canEdit={canEditSection('quoteLimits')} />
        <div style={{
          fontSize: 11.5, color: COLORS.textMuted, fontStyle: 'italic',
          margin: '10px 0 4px',
        }}>
          Each quote uses the tier matching its Net Price (before DP Discount).
          Lower Step 3A percentages are hidden; live quotes below the floor snap
          up to the lowest allowed option. Because the net price moves with the
          tenor, lengthening a tenor can cross a tier boundary and raise the
          minimum mid-quote — Step 3A always shows the active minimum in its
          title.
        </div>
        <Param label="Maximum tenor" suffix="months" step={1}
               value={params.maxTenorMonths}
               onChange={v => updateParam('quoteLimits', 'maxTenorMonths', v)}
               canEdit={canEditSection('quoteLimits')}
               min={1} max={60}
               hint="Hides longer Step 3B options. Live quotes above the cap snap down to the highest allowed option. 1-month Direct Purchase is always available." />
      </Section>

      {/* ─── Step 1 Defaults (v3-70) ────────────────────────────────── */}
      <Section title="Step 1 Defaults"
               canEdit={canEditSection('step1Defaults')}
               anyEditRole={anyEdit}>
        <Param label="Default utility rate (1B)" suffix="₱/kWh" step={0.1}
               value={params.defaultUtilityRate}
               onChange={v => updateParam('step1Defaults', 'defaultUtilityRate', v)}
               canEdit={canEditSection('step1Defaults')}
               min={1} max={100}
               hint="Pre-filled ₱/kWh in Step 1B for new sessions and after Reset. Never overwrites a value the user has already typed." />
        <Param label="Default monthly bill (1C)" isPeso step={500}
               value={params.defaultMonthlyBill}
               onChange={v => updateParam('step1Defaults', 'defaultMonthlyBill', v)}
               canEdit={canEditSection('step1Defaults')}
               min={100} max={10000000}
               hint="Pre-filled monthly utility bill in Step 1C for new sessions and after Reset. Never overwrites a value the user has already typed." />
      </Section>

      {/* ─── Interest Rates ─────────────────────────────────────────── */}
      <Section title="Interest Rates"
               canEdit={canEditSection('interestRates')}
               anyEditRole={anyEdit}>
        <Param label="Base RTO Interest Rate (annual)" isPct step={0.005}
               value={params.baseRtoInterestRate}
               onChange={v => updateParam('interestRates', 'baseRtoInterestRate', v)}
               canEdit={canEditSection('interestRates')} />
        <Param label="Small Package Threshold" suffix="panels" step={1}
               value={params.smallPackagePanelThreshold}
               onChange={v => updateParam('interestRates', 'smallPackagePanelThreshold', v)}
               canEdit={canEditSection('interestRates')}
               hint="Quotes with fewer than this many panels get the risk premium added" />
        <Param label="Small Package Risk Premium" suffix="bps" step={25}
               value={params.smallPackageRiskPremiumBps}
               onChange={v => updateParam('interestRates', 'smallPackageRiskPremiumBps', v)}
               canEdit={canEditSection('interestRates')}
               hint="Basis points to ADD to base RTO rate when below threshold (100 bps = 1%)" />
        <Param label="Early Payoff NPV Discount Rate" isPct step={0.005}
               value={params.earlyPayoffDiscountRate}
               onChange={v => updateParam('interestRates', 'earlyPayoffDiscountRate', v)}
               canEdit={canEditSection('interestRates')}
               hint="NPV discount applied to the ANNEX early-payoff column" />
      </Section>

      {/* ─── Promo Codes ────────────────────────────────────────────── */}
      <Section title="Promo Codes"
               canEdit={canEditSection('promoCodes')}
               anyEditRole={anyEdit}>
        <PromoCodesTable codes={params.promoCodes || []}
                         onChange={v => updateParam('promoCodes', 'promoCodes', v)}
                         canEdit={canEditSection('promoCodes')} />
      </Section>
    </div>
  );
}
