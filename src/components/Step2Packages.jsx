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
//   2F — Misc materials: 2 free-form rows.
//        [Excel V33–AA36]
//
// 2A's Selected row uses inline controls inside tiles (NumberInput spinner
// for Panels, Select dropdown for Battery). When a Selected value differs
// from its recommendation, the tile gets an amber warning treatment plus a
// "↻ Use recommended" snap-back link.
// =============================================================================

import React, { useEffect } from 'react';
import { availableInverters } from '../lib/calculations.js';
import { INCLUDED_DC_CABLE_METERS, INCLUDED_AC_CABLE_METERS,
         LUZON_FREE_TRAVEL_KM } from '../config.js';
import {
  SectionCard, Subsection, Field, NumberInput, Select, Checkbox, TextInput,
  CalloutBox, RecommendationPill, StatTile, COLORS, fmt, RSD_INFO,
} from './ui.jsx';

export default function Step2Packages({ state, updateState, model, adminParams, onReset,
                                        afterSection2A, mode = 'rep' }) {
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
  // v3-63: batteryPackageId is likewise NOT reset — the Battery Package
  // selector is now visible (and choosable) in customer mode, living inside
  // the Recommended Battery tile.
  useEffect(() => {
    if (!isCustomer) return;
    const patch = {};
    if (state.location !== 'luzon')                   patch.location = 'luzon';
    if (state.locationKm !== LUZON_FREE_TRAVEL_KM)    patch.locationKm = LUZON_FREE_TRAVEL_KM;
    if (state.roofMaterial !== 'metal')               patch.roofMaterial = 'metal';
    if (state.dcCableMeters !== INCLUDED_DC_CABLE_METERS) patch.dcCableMeters = INCLUDED_DC_CABLE_METERS;
    if (state.acCableMeters !== INCLUDED_AC_CABLE_METERS) patch.acCableMeters = INCLUDED_AC_CABLE_METERS;
    if (state.panelCount  !== null)                   patch.panelCount = null;
    if (state.batteryKwh  !== null)                   patch.batteryKwh = null;
    // Reset any inverter overrides; null per slot means "use recommended"
    if (Array.isArray(state.selectedInverters)
        && state.selectedInverters.some(s => s !== null)) {
      patch.selectedInverters = [null, null, null];
    }
    // Empty out any misc materials that have data
    if (Array.isArray(state.miscMaterials)
        && state.miscMaterials.some(m => m && (m.description || m.unitPrice))) {
      patch.miscMaterials = [
        { description: '', count: 1, unitPrice: 0 },
        { description: '', count: 1, unitPrice: 0 },
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
      state.location, state.locationKm, state.roofMaterial,
      state.dcCableMeters, state.acCableMeters,
      state.panelCount, state.batteryKwh]);
  const { recommended, recPanelCount, panelCount, recInverters, effectiveInverters,
          sizing, recBatteryKwh, batteryKwh, activeBatteryPackage } = model;

  const phase = state.phase === 3 ? 'three' : 'single';
  const phaseInverters = availableInverters(phase);

  // ─── DC/AC ratio warning (Excel V22 conditional formatting) ────────────
  // Excel: warns when sizing.dcAcRatio > sizing.maxRatio
  const ratioWarn = sizing.totalInverterKw > 0 && sizing.ratioExceeded;

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

        {(() => {
          // Override flags drive the amber treatment on the Selected tiles.
          // A null state value means "use the recommendation" — either the
          // customer hasn't typed anything yet, or they clicked the snap-back
          // link. Any non-null value that differs from the recommendation is
          // an override.
          const panelOverridden   = state.panelCount   != null && state.panelCount   !== recPanelCount;
          const batteryOverridden = state.batteryKwh   != null && state.batteryKwh   !== recBatteryKwh;
          // System Size is a pure derivative of panel count, so it inherits
          // the panel override state for amber tinting purposes.
          const systemSizeOverridden = panelOverridden;

          return (
            <>
              {/* v3-63: the Battery Package selector moved from a section-
                  level cream band (v3-54) into the Recommended BATTERY tile
                  below (saves a full row of vertical space), and is now
                  rendered in BOTH modes — public users can pick the package
                  too. See the `aside` on the Battery StatTile. */}

              <div style={styles.tileRowLabel}>Recommended</div>
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
                  value={fmt.num(recommended.recommendedPanelCount)}
                  sub={`× ${recommended.panelWatts}W panels`}
                  color={COLORS.brandGreen}
                  xl
                />
                <StatTile
                  label="Battery"
                  value={recBatteryKwh > 0 ? fmt.num(recBatteryKwh) : '—'}
                  sub={recBatteryKwh > 0 ? 'kWh storage' : 'Not needed at this savings level'}
                  color={COLORS.brandGreen}
                  xl
                  /* v3-64: sizing-economics tooltip beside the BATTERY label.
                     Nudges users comparing packages toward the larger-unit
                     option at similar total capacity. */
                  tooltip={'A single larger battery is generally more affordable than combining several smaller batteries to reach roughly the same total capacity — fewer units and racks to purchase and install.'}
                  /* v3-63: Battery Package selector lives INSIDE this tile
                     (right column), replacing the v3-54 section-level band.
                     Rendered in BOTH modes — the package is an input that
                     reshapes the recommendation itself (kWh rounds to the
                     selected pack's unit size and pricing follows), so
                     public users may choose it too. Switching still nukes
                     any rep batteryKwh override: the new pack's kWh ladder
                     may not contain the current value (e.g. 25 kWh on the
                     5-pack → invalid on the 16-pack stepping in 16's). */
                  aside={adminParams?.batteryPackages?.length > 0 ? (
                    <div style={styles.battPkgAside}>
                      <label style={styles.battPkgAsideLabel}>Battery Package</label>
                      <Select
                        value={state.batteryPackageId ?? adminParams.batteryPackages[0].id}
                        onChange={v => {
                          updateState({ batteryPackageId: v, batteryKwh: null });
                        }}
                        width={180}
                        options={adminParams.batteryPackages.map(p => ({
                          value: p.id, label: p.label,
                        }))}
                      />
                      <span style={styles.battPkgAsideHint}>
                        Recommendation rounds to this package's unit size
                      </span>
                    </div>
                  ) : null}
                />
              </div>

              {/* Selected (override) row — REP MODE ONLY. In customer mode the
                  recommendation is the answer. State stays at null for
                  panelCount/batteryKwh so the calc engine falls back to the
                  recommendation automatically. */}
              {!isCustomer && (
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
                      <div style={selectedTileStyles.controlRow}>
                        <NumberInput
                          value={state.panelCount ?? recPanelCount}
                          onChange={v => updateState({ panelCount: v === recPanelCount ? null : v })}
                          min={0}
                          step={1}
                          width={100}
                          large
                          amber={panelOverridden}
                        />
                      </div>
                      <div style={selectedTileStyles.sub}>× {recommended.panelWatts}W panels</div>
                    </SelectedTile>

                    {/* Selected Battery — dropdown inline. Multiples of 5 kWh
                        from 0 to 210 (matches Excel data validation). Amber +
                        snap-back when different from recommendation. */}
                    <SelectedTile
                      label="Battery"
                      amber={batteryOverridden}
                      snapBack={batteryOverridden
                        ? { label: `Use recommended (${recBatteryKwh} kWh)`,
                            onClick: () => updateState({ batteryKwh: null }) }
                        : null}
                    >
                      <div style={selectedTileStyles.controlRow}>
                        <Select
                          value={batteryKwh}
                          onChange={v => updateState({ batteryKwh: Number(v) === recBatteryKwh ? null : Number(v) })}
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
                  {batteryOverridden && batteryKwh > recBatteryKwh && (
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
                  {batteryOverridden && batteryKwh === 0 && recBatteryKwh > 0 && (
                    <div style={styles.oversizedBatteryHint}>
                      <strong>Why no battery?</strong> Without battery storage,
                      your daytime solar production that exceeds your immediate
                      use is either lost (without Net Metering) or exported
                      back to the grid for credits worth roughly half what
                      you'd pay to buy that energy back at night.
                    </div>
                  )}
                  {batteryOverridden && batteryKwh > 0 && batteryKwh < recBatteryKwh && (
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
        {isCustomer && (
          <div style={styles.repCustomizeHint}>
            Your Solviva representative can work with you to further customize your
            solar package in terms of panels, batteries, and inverters.
          </div>
        )}

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
      </Subsection>

      {/* ─────────── 2C · Inverters ─────────── */}
      {/* Functionality unchanged. Rep mode only — customers get the
          recommended inverter selection automatically (effectiveInverters
          falls back to recInverters when state.selectedInverters is null). */}
      {!isCustomer && (
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
                      next[i] = (inv && recInverters[i] && inv.ratedKw === recInverters[i].ratedKw)
                                ? null : inv;
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

      {/* ─────────── 2E · Roof Material (NEW v3) ─────────── */}
      {/* Rep mode only — customer mode keeps state.roofMaterial='metal'
          (₱0 charge), so the calculator produces a clean baseline number
          for lead-gen. The rep nails down the exact roof type during
          follow-up; any surcharge appears on the formal quote. */}
      {!isCustomer && (
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
      )}

      {/* ─────────── 2F · Location (NEW v3) ─────────── */}
      {/* Customer mode shows a simple disclaimer ("Additional charges may apply
          for certain locations.") instead of the full region picker — the
          calc engine sees state.location='luzon' + locationKm=30 (zero
          surcharge), and the rep nails down the exact location during
          follow-up. Rep mode keeps the full picker. */}
      {isCustomer ? (
        <Subsection title="2C · Installation Location">
          <div style={styles.roofHint}>
            <span>Pricing shown assumes installation within {LUZON_FREE_TRAVEL_KM} km of Metro Manila.
              <strong> Additional charges may apply for certain locations.</strong> Your Solviva agent
              will confirm any location-specific costs during follow-up.</span>
          </div>
        </Subsection>
      ) : (
        <Subsection title="2E · Location"
                    hint="determines delivery & travel charges">
          <Field label="Installation location" inline>
            <Select
              value={state.location}
              onChange={v => updateState({ location: v })}
              width={300}
              options={[
                // Order: default first, then by frequency
                { value: 'luzon',   label: 'Luzon' },
                { value: 'cebu',    label: 'Cebu' },
                { value: 'siargao', label: 'Siargao' },
              ]}
            />
          </Field>

          {/* Distance input — only visible for Luzon */}
          {state.location === 'luzon' && (
            <div style={{ marginTop: 10 }}>
              <Field label="Land travel distance from Rizal Park" inline>
                <NumberInput
                  value={state.locationKm}
                  onChange={v => updateState({ locationKm: Math.max(0, v ?? 0) })}
                  min={0} step={1} width={120} suffix="km"
                />
              </Field>
              <div style={styles.locationHint}>
                {state.locationKm <= LUZON_FREE_TRAVEL_KM ? (
                  <span>Within {LUZON_FREE_TRAVEL_KM} km of Rizal Park — <strong>no delivery charge</strong>.</span>
                ) : (
                  <span>Beyond {LUZON_FREE_TRAVEL_KM} km — adds <strong>{fmt.peso(adminParams.luzonOver30FixedFee)}</strong> fixed
                    + <strong>{fmt.peso(adminParams.luzonOver30PerKm)}/km</strong>.
                    At {state.locationKm} km, that's <strong>{
                      fmt.peso(adminParams.luzonOver30FixedFee + state.locationKm * adminParams.luzonOver30PerKm)
                    }</strong>.</span>
                )}
              </div>
            </div>
          )}
          {state.location === 'cebu' && (
            <div style={styles.locationHint}>
              Cebu delivery: <strong>{fmt.peso(adminParams.cebuFixedFee)}</strong> fixed
              + <strong>{fmt.peso(adminParams.cebuPerPanel)}/panel</strong>.
            </div>
          )}
          {state.location === 'siargao' && (
            <div style={styles.locationHint}>
              Siargao delivery: <strong>{fmt.peso(adminParams.siargaoFixedFee)}</strong> fixed
              + <strong>{fmt.peso(adminParams.siargaoPerPanel)}/panel</strong>.
            </div>
          )}
        </Subsection>
      )}

      {/* ─────────── 2G · Misc Materials (was 2E) ─────────── */}
      {/* Rep mode only — adds free-form line items the rep negotiates with
          the customer (e.g. roof reinforcement). Hidden from customer view. */}
      {!isCustomer && (
        <Subsection title="2F · Add MISCELLANEOUS MATERIALS, LABOR &amp; OTHER SERVICES"
                    hint="optional — up to 2 free-form line items">
          <div style={miscStyles.tableWrap}>
            <table className="step2g-misc-table" style={miscStyles.table}>
              <thead>
                <tr>
                  <th style={{ ...miscStyles.th, width: '45%' }}>Description</th>
                  <th style={{ ...miscStyles.th, width: '15%' }}>Count</th>
                  <th style={{ ...miscStyles.th, width: '20%' }}>Unit price (₱)</th>
                  <th style={{ ...miscStyles.th, width: '20%', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {state.miscMaterials.map((row, i) => {
                  const total = (row.count || 0) * (row.unitPrice || 0);
                  return (
                    <tr key={i}>
                      <td style={miscStyles.td}>
                        <TextInput
                          value={row.description}
                          onChange={v => {
                            const next = [...state.miscMaterials];
                            next[i] = { ...next[i], description: v };
                            updateState({ miscMaterials: next });
                          }}
                          placeholder="e.g. Roof reinforcement"
                        />
                      </td>
                      <td style={miscStyles.td}>
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
                      <td style={miscStyles.td}>
                        <NumberInput
                          value={row.unitPrice}
                          onChange={v => {
                            const next = [...state.miscMaterials];
                            next[i] = { ...next[i], unitPrice: v ?? 0 };
                            updateState({ miscMaterials: next });
                          }}
                          min={0} step={100} prefix="₱" width={120}
                        />
                      </td>
                      <td style={{ ...miscStyles.td, textAlign: 'right', fontWeight: 600 }}>
                        {total > 0 ? fmt.peso(total) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          if (v === '' || v == null) {
            onChange(null);
          } else {
            const inv = available.find(a => `${a.ratedKw}` === String(v));
            onChange(inv || null);
          }
        }}
        width={180}
        options={[
          { value: '', label: '— None —' },
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
    padding: '12px 16px',
    backgroundColor: COLORS.brandCream,
    borderLeft: `3px solid ${COLORS.brandGreen}`,
    borderRadius: '4px 8px 8px 4px',
    fontSize: 13,
    fontStyle: 'italic',
    color: COLORS.brandGreen,
    lineHeight: 1.5,
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
};
