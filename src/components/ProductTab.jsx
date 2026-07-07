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
  Section, Param, PromoCodesTable, adminStyles,
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
