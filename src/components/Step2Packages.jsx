// =============================================================================
// STEP 2 — SELECT YOUR SOLVIVA PACKAGES
// -----------------------------------------------------------------------------
// Six subsections (consolidated from the Excel layout):
//   2A — Solar & Battery Package: desired savings %, two rows of tiles
//        (Recommended vs. Selected) for System Size · Panels · Battery,
//        battery-pack detail caption, additional cable inputs.
//        [Excel V5–V12, Y6–Z11, V25–V32, Y25, Z26]
//   2B — Rapid Shutdown Device (RSD): checkbox + standalone retrofit count.
//        [Excel G11, H11, Y15, Z15, AA14, AA15, AA16]
//   2C — Inverters: 3 slots, recommendation pills, DC/AC ratio warning.
//        [Excel V18–V22, W19–W21, Y19–Y21, AA19–AA21]
//   2D — Roof Material: surcharge based on roof type.
//   2E — Location: delivery / travel charges.
//   2F — Misc materials: dynamic 1–12 rows (add/remove), each either a pick
//        from Anjon's standing catalog (priced live at the quote's margin)
//        or a free-form "Other" line the rep describes and prices.
//        [Excel V33–AA36]
//
// 2A's Selected row uses inline controls inside tiles (NumberInput spinner
// for Panels, Select dropdown for Battery). When a Selected value differs
// from its recommendation, the tile gets an amber warning treatment plus a
// "↻ Use recommended" snap-back link.
// =============================================================================

import React, { useEffect } from 'react';
import { availableInverters, directFromCogs, grossMarginForCapacity } from '../lib/calculations.js';
import { availableDeliveryLocations, availableMiscCatalog,
         findMiscCatalogItem, MISC_CATALOG_OTHER } from '../data/adminParams.js';
import { INCLUDED_DC_CABLE_METERS, INCLUDED_AC_CABLE_METERS,
         LUZON_FREE_TRAVEL_KM, LUZON_REGIONS } from '../config.js';
import {
  SectionCard, Subsection, Field, NumberInput, Select, Checkbox, TextInput,
  CalloutBox, RecommendationPill, StatTile, COLORS, fmt, RSD_INFO,
  InfoTooltip,   // v3-136 — peaks-and-valleys checkbox info
  DC_AC_RATIO_INFO,   // v3-138 — 2C ratio explainer
} from './ui.jsx';

export default function Step2Packages({ state, updateState, model, adminParams, onReset,
                                        afterSection2A, mode = 'rep', onContactRep }) {
  // afterSection2A: optional ReactNode rendered between subsections 2A and 2B.
  // Used by Calculator.jsx to embed the "Visualizing your system" block
  // (Radiance Curve + Energy Use Coverage) immediately after the size/battery
  // decision in 2A, since those visuals are derived purely from Step 1 + 2A
  // and have no dependency on 2B–2F.
  //
  // mode: 'rep' | 'customer'. In 'customer' mode (the default public view),
  // we hide the install-side / engineering details — RSD, inverter slots,
  // roof material, misc materials, cable inputs, the location km field —
  // and collapse 2A to just the Recommended row (no Selected/override).
  // The state defaults remain wired through, so the calculation engine
  // produces the same output regardless of which inputs are visible.
  const isCustomer = mode === 'customer';

  // Customer-mode safety net: if a session previously entered rep mode and
  // set non-default values for the now-hidden inputs (location, km, roof
  // surcharge, misc, cable meters, inverter overrides, panel/battery
  // overrides), force them back to baseline so the customer sees a clean
  // zero-surcharge quote consistent with "no oversizing, no upselling".
  // The hidden UI means the customer can't see/change these, so any leftover
  // values from a prior rep session would silently distort their number.
  //
  // NOTE: rsdEnabled is intentionally NOT reset here. RSD is now visible
  // (and toggleable) in customer mode as of v3-26 — see 2B below — so we
  // respect whatever the customer chose. Default for fresh sessions is
  // still `false` via makeInitialState; this safety net only protects the
  // truly-hidden inputs.
  // v3-71: batteryPackageId IS reset again (reversing v3-63) — the package
  // dropdown moved to the rep-only Selected row and the Recommended tile
  // shows the auto-optimized winner read-only, so customers can no longer
  // choose a package. A non-null id in customer mode is stale rep state
  // that would silently reprice the customer's quote.
  useEffect(() => {
    if (!isCustomer) return;
    const patch = {};
    // v3-109 (cascade lineage, merged v3-114) — location + locationKm are now
    // CUSTOMER-set inputs (the Region → City picker in 2E is exposed in public
    // view), so they are no longer force-reset here. The customer chooses their
    // own install location and it materially affects the quote — same rationale
    // as roofMaterial (v3-97).
    // v3-97 — roofMaterial is now a CUSTOMER-set input (2D is exposed in public
    // view), so it is no longer force-reset to 'metal' here. The customer knows
    // their own roof type and it materially affects the quote.
    if (state.dcCableMeters !== INCLUDED_DC_CABLE_METERS) patch.dcCableMeters = INCLUDED_DC_CABLE_METERS;
    if (state.acCableMeters !== INCLUDED_AC_CABLE_METERS) patch.acCableMeters = INCLUDED_AC_CABLE_METERS;
    // v3-120 — panelCount / batteryKwh / batteryPackageId are now CUSTOMER-set
    // inputs (the Selected row is public), so they are no longer force-reset
    // here — same rationale as roofMaterial (v3-97) and location (v3-114).
    // This reverses the v3-71 batteryPackageId reset. The v3-110 mode-switch
    // clear still applies to everyone (the ladder under an override changes).
    // v3-121 — selectedInverters are now CUSTOMER-set inputs (2C is public),
    // so inverter overrides are no longer force-reset here (v3-97/v3-114/
    // v3-120 rationale). The v3-106 stock revalidation still governs stale
    // picks.
    // Empty out any misc materials that have data
    // v3-138 — a CATALOG row carries neither description nor unitPrice, so the
    // pre-v3-138 predicate would have left a rep's ₱45,385 Service Entry
    // Remodelling line silently priced into a customer quote. catalogId is now
    // part of the "has data" test.
    if (Array.isArray(state.miscMaterials)
        && state.miscMaterials.some(m => m && (m.description || m.unitPrice
             || (m.catalogId && m.catalogId !== MISC_CATALOG_OTHER)))) {
      patch.miscMaterials = [
        { catalogId: MISC_CATALOG_OTHER, description: '', count: 1, unitPrice: 0 },
      ];
    }
    if (Object.keys(patch).length > 0) {
      updateState(patch);
    }
    // We deliberately depend on isCustomer + the watched state fields so
    // this re-runs if any of them drift while in customer mode (e.g. an
    // unexpected external state mutation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomer,
      state.roofMaterial,
      state.dcCableMeters, state.acCableMeters]);

  // v3-68: enforce the Product-set minimum system size (Quote Limits) on the
  // rep's manual panel override. Runs whenever the override or the floor
  // changes (admin params load async after boot, so a restored session can
  // sit below a floor that arrives moments later). panelCount === 0 is
  // deliberately exempt — that's the standalone RSD/inverter retrofit path.
  // Snapping to the recommendation (null) when the floor equals it keeps the
  // "override" amber state honest.
  useEffect(() => {
    // v3-106 — skip the floor snap while panels are out of stock: the model
    // forces the array to 0 panels regardless, so snapping a stale override
    // up to the floor would just churn state to no effect.
    if (model.panelsAvailable === false) return;
    const floor = model.recommended?.minPanelsFloor || 0;
    if (state.panelCount != null && state.panelCount > 0 && state.panelCount < floor) {
      updateState({ panelCount: floor === model.recPanelCount ? null : floor });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.panelCount, model.recommended?.minPanelsFloor, model.recPanelCount, model.panelsAvailable]);
  const { recommended, recPanelCount, panelCount, recInverters, effectiveInverters,
          sizing, recBatteryKwh, batteryKwh, activeBatteryPackage,
          autoBatteryPackage, activeRecBatteryKwh,
          panelsAvailable, anyBatteryInStock, rsdInStock,
          optimization,
          // v3-136 — peaks-and-valleys sizing (checkbox gate / effective
          // value / Variant-B 100%-target lock)
          hasSub7Device, conservativeSizing, conservativeLocked } = model;

  const phase = state.phase === 3 ? 'three' : 'single';
  const phaseInverters = availableInverters(phase);

  // ─── DC/AC ratio warning (Excel V22 conditional formatting) ────────────
  // Excel: warns when sizing.dcAcRatio > sizing.maxRatio
  const ratioWarn = sizing.totalInverterKw > 0 && sizing.ratioExceeded;

  // ─── 2F misc catalog (v3-138) ──────────────────────────────────────────
  // THIS quote's capacity margin — the same value buildPackageLineItems
  // resolves before re-pricing every COGS-derived line (v3-92). Computing it
  // here means the unit price the rep reads in 2F is the identical number the
  // Summary bills, and both move together as panel count changes.
  const quoteMargin = grossMarginForCapacity(sizing.systemKwp, panelCount, adminParams);
  // Only IN-STOCK items are offerable. A row already holding a now-hidden id
  // re-injects it below so the Select never renders blank.
  const miscCatalogOptions = availableMiscCatalog(adminParams).map(m => ({
    value: m.id, label: m.label,
  }));

  return (
    <SectionCard
      accent="Step 2"
      title="Select your Solviva packages"
      subtitle={isCustomer
        ? "Solviva sizes your system to hit your target savings — no oversizing, no upselling."
        : "Each item below has a recommended value. Click any green pill to snap that input to its recommendation, or type to override."}
      onReset={onReset}
    >
      {/* ─────────── 2A · Solar Package ─────────── */}
      {/* Layout shift in v3-9: the panel-count and battery inputs are now
          rendered INSIDE the "Selected" row tiles below, alongside the read-
          only "Recommended" row. This puts the comparison spatially obvious
          (recommended vs. selected, side-by-side) instead of relying on
          "Overridden" badges to flag a mismatch. The two rows show three
          tiles each: System Size, Panels, Battery — with the kWp tile being
          a derived value, while Panels uses a number spinner and Battery
          uses a dropdown for invalid-input safety.

          The battery input has moved from the old 2D section into 2A here.
          2B (formerly RSD) is now Battery Package, holding only the
          detail hint about packs/racks/ATS — no duplicate control. */}
      <Subsection title="2A · Solar & Battery Package">
        {/* Desired savings is the SINGLE input that drives every recommended
            number in the tiles below. Render it supersized so the customer
            understands "this is the lever". 18px label + 32px dropdown puts
            it visually between the standard 14px form fields and the 40px
            Recommended-tile values, telegraphing its driver role. */}
        <div style={styles.savingsRow}>
          <label style={styles.savingsLabel}>Desired savings from utility bill</label>
          <Select
            value={state.desiredSavingsPct}
            onChange={v => updateState({ desiredSavingsPct: Number(v) })}
            width={150}
            xlarge
            options={[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(p => ({
              value: p, label: `${(p * 100).toFixed(0)}%`,
            }))}
          />
        </div>

        {/* v3-110 — optimization objective selector (user-approved mockup).
            PUBLIC-facing, both modes. Three objectives, all "reach your
            target savings, minimizing X":
              'panels'  — standard W7 sizing (default; workbook parity)
              'battery' — optimizeSystem sweep, min battery kWh
              'cost'    — optimizeSystem sweep, min total direct cost
            Switching modes CLEARS the panel/battery/package overrides
            (locked decision B) — the ladder underneath them changed, same
            rationale as the v3-71 package-switch-nukes-kWh rule. */}
        <div style={styles.optModeLabel}>Optimize my system for</div>
        <div style={styles.optModeRow}>
          {[
            { id: 'panels',
              // v3-126 — fuller title (user-directed): 'Fewest panels' alone
              // is ambiguous when Least-battery ties on panel count with ZERO
              // batteries while this mode still recommends one — the waste-
              // minimization half (store-all-excess) is what justifies it.
              title: 'Fewest panels & least solar production wasted',
              sub: 'Smallest rooftop footprint' },
            { id: 'battery', title: 'Least battery',
              sub: 'Minimal indoor bulk' },
            { id: 'cost',    title: 'Lowest cost',
              sub: 'Cheapest system that hits your target' },
          ].map(opt => {
            const active = (state.optimizationMode || 'panels') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) return;
                  updateState({ optimizationMode: opt.id,
                                panelCount: null, batteryKwh: null,
                                batteryPackageId: null });
                }}
                style={{ ...styles.optModeCard,
                         ...(active ? styles.optModeCardActive : null) }}
              >
                <span style={{ ...styles.optModeTitle,
                               ...(active ? styles.optModeTitleActive : null) }}>
                  {opt.title}
                </span>
                <span style={{ ...styles.optModeSub,
                               ...(active ? styles.optModeSubActive : null) }}>
                  {opt.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* v3-106 — panels out of stock for the selected phase. The quote is
            NOT blocked: the solar array is forced to 0 panels and the rest
            (batteries / inverters / RSD retrofits for an existing
            installation) stays orderable via the standalone pricing paths. */}
        {/* v3-136 — "Size panels for peaks and batteries for valleys"
            (approved mockup, Variant B). Rendered ONLY when a sub-7-day
            device exists — otherwise the corner days equal the average day
            and the control would be pure noise. Toggling clears the
            panel/battery/package overrides (locked decision 4 — the
            recommendation basis changed under them, same rationale as the
            v3-110 mode-switch clear). At a 100% target the model FORCES the
            flag on and the checkbox renders ticked + disabled (Variant B);
            the user's own choice survives in state and returns when the
            lock releases. */}
        {hasSub7Device && (
          <div style={styles.consvBlock}>
            <label style={styles.consvRow}>
              <input
                type="checkbox"
                checked={conservativeSizing}
                disabled={conservativeLocked}
                onChange={e => updateState({ conservativeSizing: e.target.checked,
                                             panelCount: null, batteryKwh: null,
                                             batteryPackageId: null })}
                style={styles.consvCheckbox}
              />
              <span>
                <span style={styles.consvLabel}>
                  Size panels for peaks and batteries for valleys
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6 }}
                    onClick={e => e.preventDefault()}
                  >
                    <InfoTooltip
                      ariaLabel="More info about sizing for peaks and valleys"
                      content={'Appliances that run fewer than 7 days a week make some days heavier than others. Normally the calculator sizes your system to your average day. Ticking this sizes it against your real week instead: enough panels to reach your target savings on the days everything runs ("peaks"), and enough battery to store your excess solar on the light days ("valleys"). The recommended system will be somewhat larger — and honest on every day of the week.'}
                    />
                  </span>
                </span>
                <span style={styles.consvHint}>
                  Some of your appliances don't run every day. Tick this to get
                  a system that reaches your target savings even on the days
                  they all run — and stores your excess solar even on the days
                  they don't.
                </span>
              </span>
            </label>
          </div>
        )}
        {hasSub7Device && conservativeSizing && (
          <div style={styles.consvConfirm}>
            {conservativeLocked
              ? 'Because you\u2019re targeting 100% savings and some appliances don\u2019t run every day, sizing for peaks and valleys is required \u2014 a system sized to the average week cannot deliver a true 100%.'
              : 'Sized for your peak days \u2014 this system reaches your target savings on the days your appliances run and stores your excess solar on the days they don\u2019t.'}
          </div>
        )}
        {hasSub7Device && !conservativeSizing && (
          <div style={styles.consvCaveat}>
            Some appliances you listed run fewer than 7 days a week. This
            recommendation is sized to your average week &mdash; on days those
            appliances run, savings will fall below your target; on lighter
            days, some excess solar may go unstored.
          </div>
        )}

        {!panelsAvailable && (
          <div style={{ margin: '0 0 16px' }}>
            <CalloutBox kind="warn">
              <strong>Solar panels are temporarily out of stock</strong> for{' '}
              {state.phase === 3 ? '3-phase' : 'single-phase'} systems, so this
              quote doesn't include a solar array. You can still order
              batteries, inverters, or a Rapid Shutdown Device for an existing
              installation — or contact your Solviva representative about
              panel availability.
            </CalloutBox>
          </div>
        )}

        {/* v3-143 — Battery-only shortcut (rep-only). One click zeroes the
            solar array for a storage-only order and pins the battery the rep
            is seeing so it survives the loss of the solar-excess battery
            recommendation (which drops to 0 without solar). Unchecking
            restores the full auto solar + battery recommendation. */}
        {!isCustomer && panelsAvailable && anyBatteryInStock && (
          <div style={styles.consvBlock}>
            <label style={styles.consvRow}>
              <input
                type="checkbox"
                checked={panelCount === 0}
                onChange={e => {
                  if (e.target.checked) {
                    const patch = { panelCount: 0 };
                    // Pin the current battery so a storage-only order doesn't
                    // silently drop to ₱0 (rec can't size storage w/o solar).
                    if (state.batteryKwh == null && batteryKwh > 0) {
                      patch.batteryKwh = batteryKwh;
                    }
                    updateState(patch);
                  } else {
                    updateState({ panelCount: null, batteryKwh: null });
                  }
                }}
                style={styles.consvCheckbox}
              />
              <span>
                <span style={styles.consvLabel}>Battery-only order (no solar panels)</span>
                <span style={styles.consvHint}>
                  Storage-only quote: zeroes the solar array and prices the
                  battery package on its own (standalone labor, plus ATS &amp;
                  critical-loads materials unless unbundled below). The inverter
                  is treated as client-supplied unless you add one in 2C.
                </span>
              </span>
            </label>
          </div>
        )}

        {(() => {
          // Override flags drive the amber treatment on the Selected tiles.
          // A null state value means "use the recommendation" — either the
          // customer hasn't typed anything yet, or they clicked the snap-back
          // link. Any non-null value that differs from the recommendation is
          // an override.
          // v3-106 — with panels out of stock the model forces the array to
          // 0 regardless of any override, so no amber / snap-back either.
          const panelOverridden   = panelsAvailable
            && state.panelCount   != null && state.panelCount   !== recPanelCount;
          // v3-71: kWh override compares against the recommendation ON THE
          // ACTIVE PACKAGE'S LADDER (activeRecBatteryKwh) — the auto-pack
          // recBatteryKwh may not exist on an overridden pack's ladder.
          // v3-106 — with every package out of stock the model forces both
          // batteryKwh and the recommendation to 0, so a stale session value
          // must not paint amber / offer a snap-back to a control that's been
          // replaced by the out-of-stock note.
          const batteryOverridden = anyBatteryInStock
            && state.batteryKwh   != null && state.batteryKwh   !== activeRecBatteryKwh;
          // Package override: an explicit pick that differs from the auto
          // winner. Explicitly picking the pack that IS the winner pins it
          // but stays visually non-amber (numerically identical), matching
          // how a typed panel count equal to the rec isn't an override.
          const packageOverridden = anyBatteryInStock
            && state.batteryPackageId != null
            && activeBatteryPackage?.id !== autoBatteryPackage?.id;
          // System Size is a pure derivative of panel count, so it inherits
          // the panel override state for amber tinting purposes.
          const systemSizeOverridden = panelOverridden;

          return (
            <>
              {/* v3-63: the Battery Package selector moved from a section-
                  level cream band (v3-54) into the Recommended BATTERY tile.
                  v3-71: the SELECTOR moved again — to the rep-only Selected
                  Battery tile — and the Recommended tile's aside became a
                  read-only display of the auto-optimized winner. Public
                  quotes are fully auto-optimized (no package control). */}

              {/* v3-71: optimization caption rides the row label — one
                  continuous small-caps line, shown in BOTH modes.
                  v3-110: the v3-71 wording ("…at the lowest cost") asserted a
                  system-level cost claim the pipeline never made (it minimized
                  panels/wastage, not cost). Replaced with per-objective
                  captions that say exactly what each mode does (user-approved
                  copy). */}
              <div style={styles.tileRowLabel}>
                {{
                  panels:  'Recommended — the fewest panels and least solar production wasted to reach your target savings',
                  battery: 'Recommended — the smallest battery that reaches your target savings',
                  cost:    'Recommended — the lowest-cost system that reaches your target savings',
                }[state.optimizationMode] ||
                  'Recommended — the fewest panels and least solar production wasted to reach your target savings'}
              </div>
              {/* v3-110 — infeasible-target notice (locked decision A): when
                  the sweep can't reach the target inside the panel cap, the
                  tiles show the BEST-ACHIEVABLE system and this amber line
                  says so honestly. Never fires in mode 'panels' (W7 has no
                  cap concept — the existing DC/AC ratio warning covers it). */}
              {optimization && optimization.feasible === false && (
                <div style={styles.optInfeasibleNote}>
                  Your target savings can't be fully reached within system
                  limits — showing the closest achievable
                  (~{Math.round((optimization.achievedPct || 0) * 100)}%).
                </div>
              )}
              <div style={styles.recTilesRow}>
                <StatTile
                  label="System Size"
                  value={fmt.num(recPanelCount * recommended.panelWatts / 1000, 2)}
                  sub="kWp"
                  color={COLORS.brandGreen}
                  xl
                />
                <StatTile
                  label="Panels"
                  /* v3-111 HOTFIX — read the MODE-AWARE recPanelCount, not the
                     raw W7 field. The two were aliases until v3-110's sweep
                     made them diverge; this tile kept reading raw W7 while
                     System Size read recPanelCount, so a sweep-mode quote
                     showed 5.04 kWp beside 7 panels (7 × 630 ≠ 5.04). */
                  value={fmt.num(recPanelCount)}
                  sub={`× ${recommended.panelWatts}W panels`}
                  color={COLORS.brandGreen}
                  xl
                />
                <StatTile
                  label="Battery"
                  value={recBatteryKwh > 0 ? fmt.num(recBatteryKwh) : '—'}
                  /* v3-106 — a 0 recommendation now has TWO distinct causes:
                     genuinely not needed vs. every package out of stock. The
                     "not needed" copy would be a lie in the second case. */
                  sub={recBatteryKwh > 0 ? 'kWh storage'
                    : anyBatteryInStock ? 'Not needed at this savings level'
                    : 'Temporarily out of stock'}
                  color={COLORS.brandGreen}
                  xl
                  /* v3-71: tooltip reworded — the sizing-economics comparison
                     the v3-64 copy asked the user to make is now done FOR
                     them by the optimizer. */
                  tooltip={'Solviva automatically compares every available battery package and selects the one that stores all your excess solar at the lowest total cost — including units, racks, ATS, and installation.'}
                  /* v3-71: the aside is now READ-ONLY — it displays the
                     optimizer's winning package (name + unit composition).
                     The selectable dropdown moved to the rep-only Selected
                     tile below; public/customer quotes are fully auto-
                     optimized (deliberate walk-back of v3-63's public
                     choice, user-confirmed). When the recommendation is 0
                     ("Not needed at this savings level") the winner is
                     meaningless, so the aside shows an em dash. */
                  aside={anyBatteryInStock && adminParams?.batteryPackages?.length > 0 ? (
                    <div style={styles.battPkgAside}>
                      <label style={styles.battPkgAsideLabel}>Battery Package</label>
                      {recBatteryKwh > 0 ? (
                        <>
                          <span style={styles.battPkgAutoName}>
                            {autoBatteryPackage?.label}
                          </span>
                          <span style={styles.battPkgAutoComp}>
                            {(() => {
                              const unit = autoBatteryPackage?.batteryUnitKwh || 5;
                              const n = Math.ceil(recBatteryKwh / unit);
                              return `${n} × ${unit} kWh unit${n > 1 ? 's' : ''}`;
                            })()}
                          </span>
                        </>
                      ) : (
                        <span style={styles.battPkgAutoName}>—</span>
                      )}
                      <span style={styles.battPkgAsideHint}>
                        Auto-selected: the lowest-cost package that stores all your excess solar
                      </span>
                    </div>
                  ) : null}
                />
              </div>

              {/* Selected (override) row — v3-120: PUBLIC in both modes
                  (user-directed). Customers can now adjust the panel count
                  and pick a battery package/kWh directly; state stays null
                  until they touch a control, so the calc engine falls back
                  to the recommendation automatically. The DC/AC cable
                  inputs below remain REP-ONLY. */}
              {(
                <>
                  <div style={styles.tileRowLabel}>Selected</div>
                  <div style={styles.recTilesRow}>
                    {/* Selected System Size — read-only derived value. Goes
                        amber when panels are overridden (since this kWp is
                        computed from the customer's panel choice). */}
                    <SelectedTile
                      label="System Size"
                      amber={systemSizeOverridden}
                    >
                      <div style={selectedTileStyles.value(systemSizeOverridden)}>
                        {fmt.num(model.systemKwp, 2)}
                      </div>
                      <div style={selectedTileStyles.sub}>kWp</div>
                    </SelectedTile>

                    {/* Selected Panels — number spinner inline. Amber + snap-
                        back link when the typed value differs from the
                        recommendation. */}
                    <SelectedTile
                      label="Panels"
                      amber={panelOverridden}
                      snapBack={panelOverridden
                        ? { label: `Use recommended (${recPanelCount})`,
                            onClick: () => updateState({ panelCount: null }) }
                        : null}
                    >
                      {/* v3-106 — panels out of stock: the model prices 0
                          panels no matter what's typed, so an editable
                          spinner here would show a number the quote ignores.
                          Render a read-only 0 instead (the section-level
                          callout above explains why). */}
                      {!panelsAvailable ? (
                        <>
                          <div style={selectedTileStyles.value(false)}>0</div>
                          <div style={selectedTileStyles.sub}>panels — temporarily out of stock</div>
                        </>
                      ) : (
                        <>
                      <div style={selectedTileStyles.controlRow}>
                        <NumberInput
                          value={state.panelCount ?? recPanelCount}
                          onChange={v => {
                            // v3-68: manual entries below the Quote Limits
                            // panel floor clamp up to it (0 stays allowed —
                            // standalone retrofit path).
                            const floor = recommended?.minPanelsFloor || 0;
                            const c = (v > 0 && v < floor) ? floor : v;
                            const patch = { panelCount: c === recPanelCount ? null : c };
                            // Going standalone (0 panels) zeroes the solar-excess
                            // battery recommendation; pin the battery the rep is
                            // seeing so a battery-only order doesn't silently drop
                            // to ₱0 (the recommendation can't size storage without
                            // solar — it must be an explicit choice).
                            if (c === 0 && state.batteryKwh == null && batteryKwh > 0) {
                              patch.batteryKwh = batteryKwh;
                            }
                            updateState(patch);
                          }}
                          min={0}
                          step={1}
                          width={100}
                          large
                          amber={panelOverridden}
                        />
                      </div>
                      <div style={selectedTileStyles.sub}>× {recommended.panelWatts}W panels</div>
                        </>
                      )}
                    </SelectedTile>

                    {/* Selected Battery — dropdown inline. Multiples of 5 kWh
                        from 0 to 210 (matches Excel data validation). Amber +
                        snap-back when different from recommendation. */}
                    <SelectedTile
                      label="Battery"
                      amber={batteryOverridden || packageOverridden}
                      snapBack={packageOverridden
                        // Package overridden (possibly with a kWh override
                        // too): one link resets BOTH back to the optimizer.
                        ? { label: `Use recommended package (${autoBatteryPackage?.label})`,
                            onClick: () => updateState({ batteryPackageId: null, batteryKwh: null }) }
                        : batteryOverridden
                        ? { label: `Use recommended (${activeRecBatteryKwh} kWh)`,
                            onClick: () => updateState({ batteryKwh: null }) }
                        : null}
                    >
                      {/* v3-106 — every package out of stock: the model has
                          already forced batteryKwh to 0, so the controls
                          would be dead weight. Replace them with a note; the
                          quote proceeds battery-free (an existing-installation
                          panels/inverter/RSD order stays possible). */}
                      {!anyBatteryInStock ? (
                        <div style={selectedTileStyles.oosNote}>
                          All battery packages are temporarily out of stock, so
                          a battery can't be added to this quote. The rest of
                          the quote is unaffected.
                        </div>
                      ) : (
                      <>
                      {/* v3-71: the Battery Package dropdown lives HERE now
                          (rep-only Selected row), replacing the v3-63
                          placement in the Recommended tile — and it renders
                          ABOVE the kWh selector (user correction: the kWh
                          value is a multiple of the package's unit size, so
                          the package is the upstream choice and reads
                          first). First option is "Auto — <winner>" (state
                          null); picking a named package pins it and nukes
                          any kWh override (the new pack's ladder may not
                          contain the current value). */}
                      {adminParams?.batteryPackages?.length > 0 && (
                        <div style={selectedTileStyles.battPkgSelBlock}>
                          <label style={selectedTileStyles.battPkgSelLabel}>Battery Package</label>
                          <Select
                            /* v3-106 — a pinned id that has since gone out of
                               stock is no longer in the options; the pricing
                               resolver already ignores it (falls through to
                               the first in-stock package), so render as Auto
                               rather than letting the <select> show a blank. */
                            value={adminParams.batteryPackages.some(p =>
                                     p.id === state.batteryPackageId && p.available !== false)
                                   ? state.batteryPackageId : ''}
                            onChange={v => {
                              updateState({ batteryPackageId: v || null, batteryKwh: null });
                            }}
                            width={190}
                            amber={packageOverridden}
                            options={[
                              { value: '', label: `Auto — ${autoBatteryPackage?.label}` },
                              /* v3-106 — out-of-stock packages keep their row
                                 in the admin editor but leave the rep menu. */
                              ...adminParams.batteryPackages
                                .filter(p => p.available !== false)
                                .map(p => ({
                                  value: p.id, label: p.label,
                                })),
                            ]}
                          />
                          <span style={selectedTileStyles.battPkgSelHint}>
                            kWh options step in this package's unit size
                          </span>
                        </div>
                      )}
                      <div style={selectedTileStyles.controlRow}>
                        <Select
                          value={batteryKwh}
                          onChange={v => updateState({ batteryKwh: Number(v) === activeRecBatteryKwh ? null : Number(v) })}
                          width={140}
                          large
                          amber={batteryOverridden}
                          options={(() => {
                            // v3-54: kWh ladder steps by the ACTIVE PACKAGE'S
                            // unit size, so a 5-kWh pack offers 0/5/10/.../210
                            // and a 16-kWh pack offers 0/16/32/.../208. Upper
                            // bound stays ~210 (rounded to a clean multiple).
                            const step = activeBatteryPackage?.batteryUnitKwh || 5;
                            const arr = [];
                            const top = Math.ceil(210 / step) * step;
                            for (let kwh = 0; kwh <= top; kwh += step) {
                              arr.push({
                                value: kwh,
                                label: kwh === 0 ? 'No battery' : `${kwh} kWh`,
                              });
                            }
                            return arr;
                          })()}
                        />
                      </div>
                      <div style={selectedTileStyles.sub}>kWh storage</div>
                      {/* v3-52: pack-composition detail moved INSIDE the
                          Selected Battery tile. Previously rendered as a
                          standalone caption below the Recommended/Selected
                          row pair. Customer mode (Selected row hidden)
                          drops the footnote entirely — pack composition
                          is engineering detail the rep walks through.
                          v3-54: unit size and rack capacity now read from
                          the active battery package, not hardcoded 5/3. */}
                      {batteryKwh > 0 && (() => {
                        const pkg = activeBatteryPackage || { batteryUnitKwh: 5, batteryRackCapacity: 3 };
                        const battCount = Math.ceil(batteryKwh / pkg.batteryUnitKwh);
                        const rackCount = Math.ceil(battCount / pkg.batteryRackCapacity);
                        return (
                          <div style={selectedTileStyles.packComposition}>
                            {battCount} × {pkg.batteryUnitKwh} kWh batteries
                            {' · '}
                            {rackCount} battery rack{rackCount > 1 ? 's' : ''}
                            {' · '}includes ATS &amp; critical-loads materials
                          </div>
                        );
                      })()}
                      </>
                      )}
                    </SelectedTile>
                  </div>

                  {/* Oversized-battery hint — appears only when the rep
                      selects a battery LARGER than the recommendation. The
                      recommended size is already sized to cover the
                      customer's nightly usage; a larger pack only earns
                      its keep on lower-than-usual days (vacation/weekend
                      homes), and we want to prevent reps from upselling
                      excess capacity that won't actually be used.
                      Trigger covers both "rec is positive but selected is
                      bigger" and "rec is 0 but rep added a battery
                      anyway" via the same > comparison. */}
                  {batteryOverridden && batteryKwh > activeRecBatteryKwh && (
                    <div style={styles.oversizedBatteryHint}>
                      <strong>Why a larger battery?</strong> Beneficial only
                      if there are days your electricity consumption is
                      considerably less than usual — e.g., vacation or
                      weekend homes. On those days, the extra capacity
                      stores more of your solar production for later use.
                    </div>
                  )}
                  {/* Undersized-battery hint — split into two variants
                      because the qualitative experience differs:
                      `batteryKwh === 0` means NO storage at all (rep
                      picked "No battery" from the dropdown against a
                      positive recommendation), whereas `0 < batteryKwh <
                      recBatteryKwh` means partial storage. The Net
                      Metering economics in the body are identical; only
                      the lead-in framing differs ("Why no battery?" vs
                      "Why a smaller battery?"). Both share the same
                      amber-palette style as the oversized hint and
                      dismiss on snap-back to rec. Mutually exclusive
                      with each other and with the oversized hint above. */}
                  {batteryOverridden && batteryKwh === 0 && activeRecBatteryKwh > 0 && (
                    <div style={styles.oversizedBatteryHint}>
                      <strong>Why no battery?</strong> Without battery storage,
                      your daytime solar production that exceeds your immediate
                      use is either lost (without Net Metering) or exported
                      back to the grid for credits worth roughly half what
                      you'd pay to buy that energy back at night.
                    </div>
                  )}
                  {batteryOverridden && batteryKwh > 0 && batteryKwh < activeRecBatteryKwh && (
                    <div style={styles.oversizedBatteryHint}>
                      <strong>Why a smaller battery?</strong> A battery
                      smaller than recommended stores less of your daytime
                      solar production for nighttime use — meaning excess
                      energy is either lost (without Net Metering) or
                      exported back to the grid for credits worth roughly
                      half what you'd pay to buy that energy back at night.
                    </div>
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* Customer-mode customization callout. Sits immediately after the
            Recommended tiles (Selected row is hidden in customer mode) and
            before the battery-pack detail / Visualizing block. Goal: tell
            the customer that the recommended package isn't a take-it-or-
            leave-it offer — Solviva will tailor it during follow-up — so
            the read-only tiles don't feel restrictive, AND so the customer
            understands why the calculator doesn't expose those overrides
            inline (we don't want them tinkering with engineering details
            without rep guidance). Rep-mode keeps the inline override
            controls instead. */}
        {/* v3-52: pack-composition detail moved into the Selected Battery
            tile (rep-mode only). Customer mode no longer surfaces it —
            it's engineering detail the rep walks through during follow-up. */}

        <div className="grid-2col" style={styles.subgrid}>
          {!isCustomer && (
            <>
              <Field
                label="DC cable from panels to inverter(s)"
                inline
                hint={`First ${INCLUDED_DC_CABLE_METERS}m included; additional metered.`}
              >
                <NumberInput
                  value={state.dcCableMeters}
                  onChange={v => updateState({ dcCableMeters: v ?? 0 })}
                  min={0} step={1} width={100} suffix="m"
                />
              </Field>
              <Field
                label="AC cable from inverter(s) to circuit breaker panel"
                inline
                hint={`First ${INCLUDED_AC_CABLE_METERS}m included; additional metered.`}
              >
                <NumberInput
                  value={state.acCableMeters}
                  onChange={v => updateState({ acCableMeters: v ?? 0 })}
                  min={0} step={1} width={100} suffix="m"
                />
              </Field>
            </>
          )}
        </div>

        {/* v3-143 — battery component unbundling (rep-only). Shown only when a
            battery is on the quote. Unchecking excludes that component from
            the price and prints an explicit "not included (client-supplied)"
            line on the quote/PDF instead of silently dropping it. */}
        {!isCustomer && anyBatteryInStock && batteryKwh > 0 && (
          <div style={styles.battUnbundleBlock}>
            <div style={styles.battUnbundleHeader}>
              Battery components &mdash; uncheck any the client supplies themselves
            </div>
            <label style={styles.battUnbundleRow}>
              <input
                type="checkbox"
                checked={state.batteryIncludeRack !== false}
                onChange={e => updateState({ batteryIncludeRack: e.target.checked })}
                style={styles.consvCheckbox}
              />
              <span style={styles.consvLabel}>Include battery rack(s)</span>
            </label>
            <label style={styles.battUnbundleRow}>
              <input
                type="checkbox"
                checked={state.batteryIncludeAts !== false}
                onChange={e => updateState({ batteryIncludeAts: e.target.checked })}
                style={styles.consvCheckbox}
              />
              <span style={styles.consvLabel}>Include Automatic Transfer Switch (ATS)</span>
            </label>
            <label style={styles.battUnbundleRow}>
              <input
                type="checkbox"
                checked={state.batteryIncludeCriticalLoads !== false}
                onChange={e => updateState({ batteryIncludeCriticalLoads: e.target.checked })}
                style={styles.consvCheckbox}
              />
              <span style={styles.consvLabel}>Include critical-loads materials</span>
            </label>
          </div>
        )}
      </Subsection>

      {/* ─── Slot for "Visualizing your system" block ───
           Rendered here (between 2A and 2B) so the visuals — which depend
           only on Step 1 + 2A — appear immediately after the customer makes
           their sizing/battery decision, before any of the install-side
           choices (RSD / inverters / roof / location / misc) below. */}
      {afterSection2A}

      {/* ─────────── 2B · Rapid Shutdown Device ─────────── */}
      {/* Visible in BOTH customer and rep mode.
          - Customer mode: defaulted OFF, with an info tooltip explaining
            what RSD is and Solviva's recommendation. Lets the customer
            see the option exists without inflating the headline number,
            so the rep follow-up doesn't feel like a bait-and-switch.
          - Rep mode: same checkbox, plus the standalone-retrofit panel-
            count field (only relevant when there's no solar package, i.e.
            panelCount === 0 — a rep-only path, not a customer flow). */}
      <Subsection title="2B · Rapid Shutdown Device (RSD)"
                  hint="recommended for safety">
        {/* v3-106 — RSD stock gate. When the admin marks RSD out of stock
            (Inventory → Variable Charges), the checkbox is REPLACED by this
            notice in both modes; App.jsx independently forces rsdEnabled off
            in the pricing inputs, so a stale session value can't price it. */}
        {!rsdInStock ? (
          <CalloutBox kind="warn">
            <strong>Rapid Shutdown Devices are temporarily out of stock</strong>{' '}
            and can't be added to quotes right now. The rest of your quote is
            unaffected — contact your Solviva representative about availability.
          </CalloutBox>
        ) : (
          <>
            <Checkbox
              checked={state.rsdEnabled}
              onChange={v => updateState({ rsdEnabled: v })}
              label="Include RSD with my solar package"
              info={RSD_INFO}
            />
            {!isCustomer && state.rsdEnabled && panelCount === 0 && (
              <div style={{ marginTop: 12 }}>
                <Field label="Standalone RSD retrofit — number of existing panels" inline>
                  <NumberInput
                    value={state.rsdStandalonePanelCount}
                    onChange={v => updateState({ rsdStandalonePanelCount: v ?? 0 })}
                    min={0} step={1} width={100} suffix="panels"
                  />
                </Field>
              </div>
            )}
          </>
        )}
      </Subsection>

      {/* ─────────── 2C · Inverters ─────────── */}
      {/* v3-121 — now shown in PUBLIC view too (user-directed): customers can
          see and customize their inverter slots. effectiveInverters still
          falls back to recInverters for untouched slots; the v3-106 stock
          filter/revalidation, recommendation pills, and DC/AC ratio warning
          all apply to customers unchanged. */}
      {(
        <Subsection title="2C · Inverters"
                    hint="Solviva uses only BNEF Tier-1 inverters">
          {phaseInverters.length === 0 ? (
            <CalloutBox kind="warn">
              No inverters are currently in stock for this phase. Please contact
              your Solviva agent to discuss alternatives.
            </CalloutBox>
          ) : (
            <>
              <div style={styles.inverterRows}>
                {[0, 1, 2].map(i => (
                  <InverterRow
                    key={i}
                    slot={i}
                    selected={effectiveInverters[i]}
                    recommended={recInverters[i]}
                    available={phaseInverters}
                    onChange={(inv) => {
                      const next = [...state.selectedInverters];
                      if (inv && recInverters[i] && inv.ratedKw === recInverters[i].ratedKw) {
                        next[i] = null;                  // matches recommendation → track the rec
                      } else {
                        next[i] = inv;
                      }
                      updateState({ selectedInverters: next });
                    }}
                  />
                ))}
              </div>

              <div style={styles.dcAcSummary}>
                <div style={styles.dcAcRow}>
                  <span style={styles.dcAcLabel}>Total inverter capacity:</span>
                  <strong>{fmt.num(sizing.totalInverterKw, 2)} kW AC</strong>
                </div>
                <div style={styles.dcAcRow}>
                  <span style={styles.dcAcLabel}>DC/AC ratio:</span>
                  <strong style={ratioWarn ? styles.dcAcWarn : null}>
                    {sizing.totalInverterKw > 0 ? fmt.num(sizing.dcAcRatio, 2) : '—'}
                  </strong>
                  {/* v3-138 — the ⓘ sits on the RATIO, not on the 2C header
                      (which already carries the BNEF Tier-1 hint). Public
                      since v3-121, so the copy is customer-facing. */}
                  <InfoTooltip content={DC_AC_RATIO_INFO} ariaLabel="More info about the DC/AC ratio" />
                  <span style={styles.dcAcMax}>(max allowed: {fmt.num(sizing.maxRatio, 1)})</span>
                </div>
              </div>

              {ratioWarn && (
                <div style={{ marginTop: 12 }}>
                  <CalloutBox kind="warn">
                    <strong>DC/AC ratio exceeds maximum.</strong> Your system has
                    {' '}{fmt.num(model.systemKwp, 2)} kWp of panels but only
                    {' '}{fmt.num(sizing.totalInverterKw, 2)} kW of inverter capacity.
                    Add a larger inverter or a second/third inverter to bring the
                    ratio within {fmt.num(sizing.maxRatio, 1)}.
                  </CalloutBox>
                </div>
              )}

              {sizing.totalInverterKw === 0 && panelCount > 0 && (
                <div style={{ marginTop: 12 }}>
                  <CalloutBox kind="warn">
                    No inverter selected. Click any green "Recommended" pill above
                    to use the suggested configuration.
                  </CalloutBox>
                </div>
              )}
            </>
          )}
        </Subsection>
      )}

      {/* ─────────── 2D · Roof Material ─────────── */}
      {/* v3-97 — now shown in PUBLIC view too. Roof type is customer-knowable
          (unlike inverter selection) and materially changes the price
          (metal ₱0 / asphalt / concrete per kWp), so exposing it makes the
          public quote materially more accurate. The rep still confirms during
          follow-up. */}
      <Subsection title="2D · Roof Material"
                  hint="for properly mounting solar panels">
        <Field label="Roof material" inline>
          <Select
            value={state.roofMaterial}
            onChange={v => updateState({ roofMaterial: v })}
            width={300}
            options={[
              // Order: default first, then alphabetical
              { value: 'metal',    label: 'Metal — no roof prep needed' },
              { value: 'asphalt',  label: 'Asphalt / Shingles / Tiled' },
              { value: 'concrete', label: 'Concrete' },
            ]}
          />
        </Field>
        <div style={styles.roofHint}>
          {state.roofMaterial === 'metal' && (
            <span>Metal roofs need no prep work — no additional charge.</span>
          )}
          {state.roofMaterial === 'asphalt' && (
            <span>Asphalt/shingles/tiled roofs require additional mounting prep
              at <strong>{fmt.peso(adminParams.roofAsphaltPerKwp)}/kWp</strong>.</span>
          )}
          {state.roofMaterial === 'concrete' && (
            <span>Concrete roofs require the most prep work
              at <strong>{fmt.peso(adminParams.roofConcretePerKwp)}/kWp</strong>.</span>
          )}
        </div>
      </Subsection>

      {/* ─────────── 2E · Location (v3-109 Region → City cascade) ─────────── */}
      {/* Both modes now show the picker (v3-109 — exposed to customers). For
          "Luzon main island" the rep/customer picks a Region then a City; the
          city's stored road-km from the Parañaque logistics hub (config
          LUZON_REGIONS, v3-114 origin rebase) is written to state.locationKm
          and feeds the identical charge formula in
          calculations.js (workbook AA38 parity). Cebu / Siargao apply their
          fixed + per-panel tier. "Other" covers non-road-connected addresses:
          in customer mode it shows a "contact your rep" note (2F is rep-only);
          in rep mode the rep enters the cost as a 2F line. */}
      {/* v3-121 — customer letter was 2C; Inverters (2C) is public now, so customer lettering runs 2A–2E cleanly */}
      <Subsection title={isCustomer ? '2E · Installation Location' : '2E · Location'}
                  hint={isCustomer ? undefined : 'determines delivery & travel charges'}>
        <Field label="Installation location" inline>
          {/* v3-116 — the middle options are the DYNAMIC in-stock delivery
              locations (admin-editable, Inventory-toggle idiom). Luzon main
              island and Other are structural. A stale pick of a hidden/
              deleted id is forced back to 'luzon' by App.jsx before pricing,
              so the Select's value is always a live option. */}
          <Select
            value={state.location}
            onChange={v => updateState({ location: v })}
            width={300}
            options={[
              { value: 'luzon', label: 'Luzon main island' },
              ...availableDeliveryLocations(adminParams).map(l => ({
                value: l.id, label: l.label,
              })),
              { value: 'other', label: isCustomer ? 'Other' : 'Other (Specify in 2F)' },
            ]}
          />
        </Field>

        {/* Region → City cascade — only for Luzon main island. */}
        {state.location === 'luzon' && (() => {
          const region = LUZON_REGIONS.find(r => r.code === state.locationRegion) || LUZON_REGIONS[0];
          const cities = region.cities;
          const city   = cities.find(c => c.name === state.locationCity) || cities[0];
          const km     = city ? city.km : 0;
          // v3-115 — excess-km only, mirroring the corrected AA38 formula.
          const surcharge = km > LUZON_FREE_TRAVEL_KM
            ? adminParams.luzonOver30FixedFee
              + (km - LUZON_FREE_TRAVEL_KM) * adminParams.luzonOver30PerKm
            : 0;
          return (
            <div style={{ marginTop: 10 }}>
              <Field label="Region" inline>
                <Select
                  value={region.code}
                  onChange={code => {
                    const r = LUZON_REGIONS.find(x => x.code === code) || LUZON_REGIONS[0];
                    const first = r.cities[0];
                    updateState({ locationRegion: r.code, locationCity: first.name, locationKm: first.km });
                  }}
                  width={300}
                  options={LUZON_REGIONS.map(r => ({ value: r.code, label: r.label }))}
                />
              </Field>
              <div style={{ marginTop: 10 }}>
                <Field label="City" inline>
                  <Select
                    value={city ? city.name : ''}
                    onChange={name => {
                      const c = cities.find(x => x.name === name) || cities[0];
                      updateState({ locationCity: c.name, locationKm: c.km });
                    }}
                    width={300}
                    options={cities.map(c => ({ value: c.name, label: c.name }))}
                  />
                </Field>
              </div>
              <div style={styles.locationHint}>
                {surcharge === 0 ? (
                  <span>{city ? city.name : '—'} — within {LUZON_FREE_TRAVEL_KM} km of our Parañaque logistics hub. <strong>No delivery charge</strong>.</span>
                ) : (
                  <span>{city.name} — approx. {km} km from our Parañaque logistics hub. Adds <strong>{fmt.peso(adminParams.luzonOver30FixedFee)}</strong> fixed
                    + <strong>{fmt.peso(adminParams.luzonOver30PerKm)}/km</strong> beyond {LUZON_FREE_TRAVEL_KM} km, totaling <strong>{fmt.peso(surcharge)}</strong>.</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* v3-116 — one generic hint serves every dynamic row (was two
            hardcoded Cebu/Siargao blocks). Reads the boot-margin derived
            prices off the live row, exactly as the old scalars did. */}
        {(() => {
          if (state.location === 'luzon' || state.location === 'other') return null;
          const row = (adminParams.deliveryLocations || []).find(l => l.id === state.location);
          if (!row) return null;
          return (
            <div style={styles.locationHint}>
              {row.label} delivery: <strong>{fmt.peso(row.fixedFee)}</strong> fixed
              + <strong>{fmt.peso(row.perPanel)}/panel</strong>.
            </div>
          );
        })()}
        {state.location === 'other' && isCustomer && (
          <div style={styles.locationOtherNote}>
            Additional delivery and location charges may apply in certain areas.
            Please contact your Solviva representative for a location-specific quote.
          </div>
        )}
      </Subsection>

      {/* v3-121 — customer-facing closing note for Step 2 (user-directed copy,
          lightly refined). Replaces the old 2A rep-customize hint and covers
          the inputs customers still can't see (cables, misc line items,
          promos). The representative phrase keeps the contact-rep link. */}
      {isCustomer && (
        <div style={styles.repCustomizeHint}>
          Additional charges may apply for extra cabling, location and delivery,
          and other necessary works specific to your site and requirements;
          discounts may also apply under existing promos. Your{' '}
          <button type="button" onClick={onContactRep} style={styles.repLink}>
            Solviva representative
          </button>{' '}
          can work with you to further refine your solar package.
        </div>
      )}

      {/* ─────────── 2G · Misc Materials (was 2E) ─────────── */}
      {/* Rep mode only — adds free-form line items the rep negotiates with
          the customer (e.g. roof reinforcement). Hidden from customer view. */}
      {!isCustomer && (
        <Subsection title="2F · Add MISCELLANEOUS MATERIALS, LABOR &amp; OTHER SERVICES"
                    hint="optional — pick from the standing catalog, or specify your own">
          <div style={miscStyles.tableWrap}>
            <table className="step2g-misc-table" style={miscStyles.table}>
              <thead>
                <tr>
                  <th style={{ ...miscStyles.th, width: '45%' }}>Description</th>
                  <th style={{ ...miscStyles.th, width: '15%' }}>Count</th>
                  <th style={{ ...miscStyles.th, width: '20%' }}>Unit price (₱)</th>
                  <th style={{ ...miscStyles.th, width: '18%', textAlign: 'right' }}>Total</th>
                  <th style={{ ...miscStyles.th, width: 28 }} aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {state.miscMaterials.map((row, i) => {
                  const canRemove = state.miscMaterials.length > MISC_MIN_ROWS && i >= MISC_MIN_ROWS;
                  // v3-138 — a row is either CATALOG-backed or free-form. A row
                  // restored from a pre-v3-138 session has no catalogId at all,
                  // which reads as free-form and keeps its typed description +
                  // price — hence no STATE_RECORD_VERSION bump.
                  const isOther = !row.catalogId || row.catalogId === MISC_CATALOG_OTHER;
                  const item = isOther ? null : findMiscCatalogItem(adminParams, row.catalogId);
                  // Stale = the rep picked an item that Anjon has since deleted
                  // or marked out of stock. calculations.js prices it at ₱0; we
                  // say so here rather than letting the line vanish silently.
                  const stale = !isOther && (!item || item.available === false);
                  // Catalog unit price is LIVE at THIS quote's capacity margin —
                  // the identical call the engine makes, so 2F and the Summary
                  // can never disagree. It moves with panel count by design.
                  const unitPrice = isOther
                    ? (row.unitPrice || 0)
                    : (stale ? 0 : directFromCogs(item.cogs, adminParams, quoteMargin));
                  const total = (row.count || 0) * unitPrice;
                  return (
                    <tr key={i}>
                      <td style={miscStyles.td}>
                        <Select
                          value={isOther ? MISC_CATALOG_OTHER : row.catalogId}
                          onChange={v => {
                            const next = [...state.miscMaterials];
                            // Switching KIND clears the other kind's fields, so a
                            // stale free-form price can never ride along on a
                            // catalog row (or vice versa).
                            next[i] = v === MISC_CATALOG_OTHER
                              ? { catalogId: MISC_CATALOG_OTHER, description: '', count: next[i].count ?? 1, unitPrice: 0 }
                              : { catalogId: v, description: '', count: next[i].count ?? 1, unitPrice: 0 };
                            updateState({ miscMaterials: next });
                          }}
                          options={[
                            ...miscCatalogOptions,
                            // Keep a deleted/out-of-stock pick addressable so the
                            // Select doesn't render blank while the notice below
                            // explains itself.
                            ...(stale ? [{ value: row.catalogId,
                                           label: `${item ? item.label : 'Previous item'} — no longer available` }] : []),
                            { value: MISC_CATALOG_OTHER, label: 'Other (please specify)' },
                          ]}
                        />
                        {isOther && (
                          <div style={{ marginTop: 6 }}>
                            <TextInput
                              value={row.description}
                              onChange={v => {
                                const next = [...state.miscMaterials];
                                next[i] = { ...next[i], description: v };
                                updateState({ miscMaterials: next });
                              }}
                              placeholder="e.g. Roof reinforcement"
                            />
                          </div>
                        )}
                        {stale && (
                          <div style={miscStyles.staleNote}>
                            No longer offered — this line prices at ₱0 until you pick another item.
                          </div>
                        )}
                      </td>
                      <td style={{ ...miscStyles.td, verticalAlign: 'top' }}>
                        <NumberInput
                          value={row.count}
                          onChange={v => {
                            const next = [...state.miscMaterials];
                            next[i] = { ...next[i], count: v ?? 0 };
                            updateState({ miscMaterials: next });
                          }}
                          min={0} step={1} width={70}
                        />
                      </td>
                      <td style={{ ...miscStyles.td, verticalAlign: 'top' }}>
                        {isOther ? (
                          <NumberInput
                            value={row.unitPrice}
                            onChange={v => {
                              const next = [...state.miscMaterials];
                              next[i] = { ...next[i], unitPrice: v ?? 0 };
                              updateState({ miscMaterials: next });
                            }}
                            min={0} step={100} prefix="₱" width={120}
                          />
                        ) : (
                          // Read-only by instruction: a catalog price is Anjon's
                          // to set. A rep who needs a different number uses Other.
                          <span style={miscStyles.catalogPrice}>
                            {unitPrice > 0 ? fmt.peso(unitPrice) : '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ ...miscStyles.td, textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>
                        {total > 0 ? fmt.peso(total) : '—'}
                      </td>
                      <td style={{ ...miscStyles.removeCell, verticalAlign: 'top' }}>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => {
                              updateState({
                                miscMaterials: state.miscMaterials.filter((_, idx) => idx !== i),
                              });
                            }}
                            style={miscStyles.removeBtn}
                            aria-label={`Remove line item ${i + 1}`}
                            title="Remove this row"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {state.miscMaterials.length < MISC_MAX_ROWS ? (
            <button
              type="button"
              onClick={() => {
                updateState({
                  miscMaterials: [
                    ...state.miscMaterials,
                    { catalogId: MISC_CATALOG_OTHER, description: '', count: 1, unitPrice: 0 },
                  ],
                });
              }}
              style={miscStyles.addBtn}
            >
              + Add line item
            </button>
          ) : (
            <div style={miscStyles.maxHint}>
              Up to twelve line items — increase a row's Count for repeated items.
            </div>
          )}
        </Subsection>
      )}
    </SectionCard>
  );
}

// ─── InverterRow — one row per inverter slot ───────────────────────────────
function InverterRow({ slot, selected, recommended, available, onChange }) {
  const showRecPill = recommended && (!selected || selected.ratedKw !== recommended.ratedKw);

  return (
    <div style={inverterStyles.row}>
      <div style={inverterStyles.label}>
        Inverter {slot + 1}
      </div>
      <Select
        value={selected ? `${selected.ratedKw}` : ''}
        onChange={v => {
          const inv = available.find(a => `${a.ratedKw}` === String(v));
          onChange(inv || null);
        }}
        width={180}
        options={[
          ...available.map(inv => ({
            value: `${inv.ratedKw}`,
            label: `${inv.ratedKw.toFixed(2)} kW Inverter`,
          })),
        ]}
      />
      {showRecPill && (
        <RecommendationPill onClick={() => onChange(recommended)}>
          Recommended: {recommended.ratedKw.toFixed(2)} kW
        </RecommendationPill>
      )}
    </div>
  );
}

// ─── SelectedTile — sibling of StatTile for the "Selected" row in 2A ──────
// Visually mirrors StatTile's layout (label · value area · sub) but accepts
// `children` instead of a static value, so the value area can host a
// number spinner or a dropdown. When `amber` is true, the tile background
// shifts to a soft amber (matching the brand's existing warning palette
// used in CalloutBox kind="warn") to flag a mismatch with the Recommended
// row above. When `snapBack` is provided, a subtle "↻ Use recommended"
// link renders below the tile body — clicking it calls the onClick to
// snap state back to the recommendation (typically by setting the state
// field to null, which makes the model fall back to the recommendation).
function SelectedTile({ label, amber, snapBack, children }) {
  return (
    <div style={amber ? selectedTileStyles.tileAmber : selectedTileStyles.tile}>
      <div style={selectedTileStyles.label}>{label}</div>
      {children}
      {snapBack && (
        <button
          type="button"
          onClick={snapBack.onClick}
          style={selectedTileStyles.snapBack}
        >
          ↻ {snapBack.label}
        </button>
      )}
    </div>
  );
}

const selectedTileStyles = {
  // Default cream tile — matches StatTile's appearance so the two rows
  // of tiles read as a coherent pair.
  tile: {
    backgroundColor: COLORS.brandCream,
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 8,
    padding: '14px 16px',
  },
  // Amber-tinted variant — same palette as CalloutBox kind="warn" for
  // visual consistency with other warning treatments (testing-phase
  // notice, net-metering yellow callouts).
  tileAmber: {
    backgroundColor: '#FFFBEB',
    border: '1px solid #FCD34D',
    borderRadius: 8,
    padding: '14px 16px',
  },
  // v3-71: stacked Battery Package block at the TOP of the Selected Battery
  // tile (above the kWh dropdown — the package determines the kWh ladder's
  // step, so it reads first). Left-aligned, unlike the right-aligned aside
  // in the Recommended tile.
  battPkgSelBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 10,
  },
  battPkgSelLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.textBody,
    letterSpacing: 0.2,
  },
  battPkgSelHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // Read-only value display (used in the Selected System Size tile).
  // Function-style: takes `amber` and returns the merged style so the
  // big number turns amber to match an overridden tile.
  value: (amber) => ({
    fontSize: 40,
    fontWeight: 700,
    letterSpacing: -0.4,
    lineHeight: 1.1,
    color: amber ? '#854F0B' : COLORS.brandGreen,
  }),
  // Wrapper for the input/select control. Aligns the control vertically
  // in the tile body so the visual rhythm matches the StatTile values.
  controlRow: {
    display: 'flex',
    alignItems: 'center',
  },
  sub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  // v3-52: pack-composition detail line inside the Selected Battery tile.
  // Italic + small + muted so it reads as a quiet annotation rather than
  // a primary value. Sits below the "kWh storage" sub-line and above the
  // snap-back link (when present).
  packComposition: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 1.45,
  },
  // v3-106 — out-of-stock note that replaces the battery controls inside the
  // Selected tile. Muted, non-alarming: the quote proceeds without a battery.
  oosNote: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 1.5,
    padding: '6px 0',
  },
  // Snap-back link — ghost-style, brand-green, underlined so it reads as
  // an action without dominating the tile.
  snapBack: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: 'transparent',
    border: 'none',
    padding: '8px 0 0',
    margin: 0,
    color: COLORS.brandGreen,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
};

// ───────── Styles ─────────
const styles = {
  subgrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px 32px',
    marginBottom: 8,
  },
  // The "Desired savings from utility bill" row at the very top of Section 2A.
  // Supersized intentionally — it's the single input that drives every value
  // in the Recommended tiles below it. The label sits to the LEFT of the
  // dropdown on desktop and stacks ABOVE on narrow viewports. align-items:
  // baseline keeps the label visually anchored to the dropdown's text
  // baseline rather than its outer box (which can look top-heavy at 32px).
  savingsRow: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: '8px 18px',
    marginBottom: 18,
  },
  savingsLabel: {
    fontSize: 18,
    fontWeight: 600,
    color: COLORS.textBody,
    letterSpacing: -0.1,
  },
  // Recommendation tiles row in Section 2A — System Size, Recommended
  // Panels, and Recommended Battery, three equal-width tiles in one row
  // on desktop. The auto-fit grid wraps tiles to a new line when the
  // viewport is too narrow for three columns of >=180px, dropping to two-
  // up and ultimately one-up on phones. The min track size (180px) is a
  // bit smaller than the original 220px so all three tiles can sit
  // side-by-side on tighter desktop columns and most landscape phones.
  recTilesRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  // v3-63: Battery Package selector, now living INSIDE the Recommended
  // Battery tile as a right-column `aside` (replaces the v3-54 section-level
  // cream band). Rendered in both public and rep modes. Right-aligned to
  // match the tile's split layout; wraps below the kWh value on mobile.
  battPkgAside: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  battPkgAsideLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.textBody,
    letterSpacing: 0.2,
  },
  battPkgAsideHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'right',
  },
  // v3-71: read-only auto-winner display in the Recommended Battery tile
  // (the selectable dropdown moved to the Selected tile).
  battPkgAutoName: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.brandGreen,
    textAlign: 'right',
  },
  battPkgAutoComp: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'right',
  },
  // Sub-row label that sits above each of the two tile rows in 2A
  // ("Recommended", "Selected"). Same uppercase muted treatment as the
  // tile labels themselves, but slightly more prominent letter spacing
  // since it's a row header rather than a tile-internal label.
  tileRowLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
    marginTop: 14,
    marginBottom: 8,
  },
  // v3-110 — optimization objective selector (2A, above the Recommended row).
  // Card treatment mirrors the approved mockup: three equal cards, selected
  // card gets the brand-green border + cream fill; the responsive grid wraps
  // to one column on narrow (~390px) mobile viewports via auto-fit.
  optModeLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 8,
  },
  optModeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 10,
    marginBottom: 16,
  },
  optModeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
    textAlign: 'left',
    padding: '11px 13px',
    background: COLORS.surfaceCard,
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 8,
    cursor: 'pointer',
    font: 'inherit',
  },
  optModeCardActive: {
    background: COLORS.brandCream,
    border: `2px solid ${COLORS.brandGreen}`,
    padding: '10px 12px',   // compensate the thicker border → no layout shift
  },
  optModeTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textBody,
  },
  optModeTitleActive: {
    color: COLORS.brandGreen,
  },
  optModeSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 1.45,
  },
  optModeSubActive: {
    color: COLORS.brandGreenLight,
  },
  // v3-110 — infeasible-target amber notice under the Recommended caption.
  // Active-constraint styling per the v3-75 idiom (warning amber, 600 weight,
  // not italic — it's a fact about the quote, not an error).
  optInfeasibleNote: {
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.warning,
    margin: '-2px 0 8px',
    lineHeight: 1.5,
  },
  // v3-136 — "Size panels for peaks and batteries for valleys" (approved
  // mockup): cream card holding the checkbox + hint, then a green confirm
  // or amber caveat line below it. Amber reuses the optInfeasibleNote /
  // v3-75 active-constraint palette; the confirm uses brandGreenLight
  // (matching the active mode-card sub text) — a fact, not a warning.
  consvBlock: {
    display: 'flex',
    padding: '10px 12px',
    background: COLORS.brandCream,
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 8,
    marginBottom: 10,
  },
  battUnbundleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    padding: '10px 12px',
    background: COLORS.brandCream,
    border: `1px solid ${COLORS.divider}`,
    borderRadius: 8,
    margin: '4px 0 10px',
  },
  battUnbundleHeader: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.textBody,
    marginBottom: 2,
  },
  battUnbundleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    cursor: 'pointer',
  },
  consvRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    cursor: 'pointer',
  },
  consvCheckbox: {
    width: 16,
    height: 16,
    marginTop: 2,
    accentColor: COLORS.brandGreen,
    flexShrink: 0,
  },
  consvLabel: {
    display: 'block',
    fontSize: 13.5,
    fontWeight: 600,
    color: COLORS.textBody,
  },
  consvHint: {
    display: 'block',
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 1.5,
    marginTop: 2,
  },
  consvConfirm: {
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.brandGreenLight,
    margin: '0 0 12px',
    lineHeight: 1.55,
  },
  consvCaveat: {
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.warning,
    margin: '0 0 12px',
    lineHeight: 1.55,
  },
  roofHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    paddingLeft: 4,
    lineHeight: 1.5,
  },
  locationHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    paddingLeft: 4,
    lineHeight: 1.5,
  },
  locationOtherNote: {
    fontSize: 12.5,
    color: '#854F0B',
    background: '#FAEEDA',
    border: '0.5px solid #FAC775',
    borderRadius: 8,
    padding: '10px 12px',
    marginTop: 10,
    lineHeight: 1.55,
  },
  inverterRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 16,
  },
  dcAcSummary: {
    backgroundColor: COLORS.brandCream,
    padding: '12px 16px',
    borderRadius: 6,
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  dcAcRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dcAcLabel: {
    color: COLORS.textMuted,
    minWidth: 170,
  },
  dcAcMax: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  dcAcWarn: {
    color: COLORS.error,
  },
  // Customer-mode-only callout reassuring the customer that the recommended
  // package can be tailored further during the rep follow-up. Visually
  // distinct from the muted gray hints (roofHint, locationHint)
  // because this is a sales message, not a parenthetical detail. Cream
  // background + brand-green accent stripe + brand-green-italic text
  // matches the "monthly savings" callout in EnergyVisuals so the customer
  // reads it as "Solviva is talking to you" rather than "system instruction."
  repCustomizeHint: {
    marginTop: 16,
    padding: '14px 18px',
    backgroundColor: COLORS.brandCream,
    borderLeft: `3px solid ${COLORS.brandGreen}`,
    borderRadius: '4px 8px 8px 4px',
    fontSize: 15,
    fontStyle: 'italic',
    color: COLORS.brandGreen,
    lineHeight: 1.55,
  },
  // v3-97 — "Solviva representative" rendered as an inline link that opens the
  // contact form (same action as the header "Talk to a Solviva Rep" button).
  repLink: {
    background: 'none', border: 'none', padding: 0, margin: 0,
    font: 'inherit', fontStyle: 'italic', fontWeight: 700,
    color: COLORS.brandGreen, textDecoration: 'underline',
    textUnderlineOffset: 2, cursor: 'pointer',
  },
  // Rep-mode-only hint shown beneath the Selected row when the rep has
  // dialed the battery LARGER than the recommendation. Uses the same amber
  // palette as the overridden Battery tile (`tileAmber` in selectedTileStyles)
  // so the hint reads as a continuation of the warning the tile is already
  // displaying. Left border stripe matches the structural pattern of
  // repCustomizeHint above; the role is similar (a contextual sales-team
  // note attached to a specific input state) but the palette signals
  // caution rather than reassurance.
  oversizedBatteryHint: {
    marginTop: 4,
    marginBottom: 12,
    padding: '12px 16px',
    backgroundColor: '#FFFBEB',
    borderLeft: '3px solid #FCD34D',
    borderRadius: '4px 8px 8px 4px',
    fontSize: 13,
    color: '#854F0B',
    lineHeight: 1.5,
  },
};

const inverterStyles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  label: {
    minWidth: 120,
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.textBody,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
};

// 2F misc line items — dynamic add/remove, mirroring the Step 1 DeviceTable
// pattern. Floor of 1 (row 0 never gets a ✕); cap of 6 protects the
// fixed-size PDF quote-summary snapshot from overflow.
const MISC_MIN_ROWS = 1;
const MISC_MAX_ROWS = 12;   // v3-138 — was 6; the standing catalog makes multi-line quotes routine

const miscStyles = {
  tableWrap: { overflowX: 'auto', maxWidth: '100%', minWidth: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
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
  td: { padding: '6px 8px', verticalAlign: 'middle' },
  // Remove-row column — narrow, centered, reserved even when empty so the
  // table columns don't jump as rows cross the removable threshold.
  removeCell: { padding: '6px 4px', textAlign: 'center', width: 28 },
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
  // Add-row button — inline dashed ghost, flush-left under the table.
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
  // v3-138 — read-only unit price on a catalog-backed row. Deliberately styled
  // as TEXT, not a disabled input: a greyed-out box invites clicking and then
  // reads as broken. This reads as "not yours to set".
  catalogPrice: {
    display: 'inline-block',
    padding: '7px 0',
    color: COLORS.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  // v3-138 — the picked catalog item was deleted or marked out of stock.
  staleNote: {
    marginTop: 6,
    fontSize: 12,
    color: '#B45309',
    lineHeight: 1.4,
  },
  // Replaces the add button at the cap — muted, non-shouting.
  maxHint: {
    marginTop: 8,
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    lineHeight: 1.5,
    paddingLeft: 4,
  },
};
