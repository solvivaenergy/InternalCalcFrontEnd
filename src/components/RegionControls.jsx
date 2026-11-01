// =============================================================================
// REGION CONTROLS — the "Pricing branch" dropdown and the marks that say which
// branch priced the quote (v3-231; dropdown design 2026-11-01)
// -----------------------------------------------------------------------------
// All driven by src/lib/region.js. Four pieces:
//   • <RegionSelect/>      — "Pricing branch  [● Manila ⌄]" in the header, for
//     EVERY account. A native <select> listing every branch: the account's
//     regions are selectable, a region the account does not hold is disabled
//     ("no access"), and a planned branch (Davao) is disabled ("coming soon").
//     Choosing another region calls onSwitch(id); the control stays on the
//     active region until the parent commits (it confirms first when a quote
//     is in progress), so a cancelled switch leaves it untouched.
//   • <RegionPricingPill/> — "⌖ Manila pricing", filled in the branch colour;
//     the first cell of the live total bar, so the branch is named next to
//     the numbers it priced.
//   • <PriceListBadge/>    — "● Manila rates, costs and margins · price list
//     updated 28 Oct 2026" beside the Step 1 title: which payload is live and
//     when it was last saved.
//   • <RegionStamp/>       — the compact "MANILA" stamp the mobile flow keeps
//     in its header (no live bar there).
// =============================================================================

import React from 'react';
import { BRANCHES, regionMeta, branchMeta, isPlannedBranch } from '../lib/region.js';

export function PinIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

// The branch dot: the accent, ringed in the ink so a lime dot still shows on
// white (dark green on dark green is simply a solid dot).
function BranchDot({ meta, size = 10 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
      backgroundColor: meta.theme.accent, boxShadow: `inset 0 0 0 1.5px ${meta.theme.ink}`,
    }} />
  );
}

export function RegionStamp({ region, compact = false }) {
  const m = regionMeta(region);
  return (
    <span aria-label="Quoting region" title={`You are in the ${m.label} calculator`}
          style={{ ...styles.stamp, ...(compact ? styles.stampCompact : {}),
                   backgroundColor: m.theme.accent, color: m.theme.onAccent }}>
      <PinIcon size={compact ? 10 : 11} />
      <span>{m.label}</span>
      {!compact && <span style={styles.stampWord}>calculator</span>}
    </span>
  );
}

export function RegionSelect({ regions = [], active, onSwitch }) {
  const meta = branchMeta(active);
  const canSwitch = Array.isArray(regions) && regions.length > 1;
  const optionLabel = (b) => {
    if (isPlannedBranch(b.id)) return `${b.label} · coming soon`;
    if (!regions.includes(b.id)) return `${b.label} · no access`;
    return b.label;
  };
  return (
    <label style={styles.selectWrap} data-no-print="true"
           title={canSwitch ? 'Switch the calculator to another branch’s prices'
                            : `This account quotes in ${meta.label}`}>
      <span style={styles.selectCaption}>Pricing branch</span>
      <span style={styles.selectShell}>
        <span style={styles.selectDot}><BranchDot meta={meta} /></span>
        <select aria-label="Pricing branch" value={active}
                onChange={(e) => { const next = e.target.value; if (next !== active && onSwitch) onSwitch(next); }}
                style={{ ...styles.select, borderColor: meta.theme.accent, color: meta.theme.ink }}>
          {BRANCHES.map((b) => (
            <option key={b.id} value={b.id}
                    disabled={isPlannedBranch(b.id) || !regions.includes(b.id)}>
              {optionLabel(b)}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
             style={{ ...styles.selectChevron, color: meta.theme.ink }}>
          <path d="M8 10l4 4 4-4" />
        </svg>
      </span>
    </label>
  );
}

export function RegionPricingPill({ region }) {
  const m = regionMeta(region);
  return (
    <span aria-label="Pricing branch in use" title={`These figures use the ${m.label} branch’s prices`}
          style={{ ...styles.pricingPill, backgroundColor: m.theme.accent, color: m.theme.onAccent }}>
      <PinIcon size={12} />
      <span>{m.label} pricing</span>
    </span>
  );
}

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function PriceListBadge({ region, updatedAt }) {
  const m = regionMeta(region);
  const date = fmtDate(updatedAt);
  return (
    <span aria-label="Price list in use"
          style={{ ...styles.priceList, backgroundColor: m.theme.tint, color: m.theme.ink }}>
      <BranchDot meta={m} size={9} />
      <span><strong style={{ fontWeight: 700 }}>{m.label}</strong> rates, costs and margins</span>
      {date && <span style={styles.priceListDate}>· price list updated {date}</span>}
    </span>
  );
}

const styles = {
  stamp: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px 4px 8px', borderRadius: 6,
    fontSize: 10.5, fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.2,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  stampCompact: { padding: '3px 8px 3px 7px', fontSize: 10, gap: 5 },
  stampWord: { opacity: 0.8, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'none', fontSize: 10.5 },

  selectWrap: { display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0, cursor: 'pointer' },
  selectCaption: { fontSize: 12.5, fontWeight: 600, color: '#212121', whiteSpace: 'nowrap' },
  selectShell: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
  selectDot: {
    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
    display: 'inline-flex', pointerEvents: 'none',
  },
  select: {
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    minWidth: 190, padding: '7px 34px 7px 28px',
    border: '1.5px solid', borderRadius: 7, backgroundColor: '#FFFFFF',
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.3,
    cursor: 'pointer',
  },
  selectChevron: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    pointerEvents: 'none',
  },

  pricingPill: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '7px 14px 7px 12px', borderRadius: 999,
    fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0.2,
    whiteSpace: 'nowrap', flexShrink: 0,
  },

  priceList: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderRadius: 999,
    fontSize: 12, fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap',
  },
  priceListDate: { opacity: 0.85 },
};
