// =============================================================================
// CALCULATOR — orchestrates Steps 1, 2 (with embedded Energy Visuals), 3, 4
// -----------------------------------------------------------------------------
// Top-of-page rotating tagline (v3-51): the 8 marketing taglines previously
// shown on ContactGate now cycle continuously above Step 1. ContactGate is
// gone (customers land directly on the calculator unless maintenance mode is
// active — App.jsx routes via MaintenanceGate in that case).
//
// The Energy Visuals block (Radiance Curve + Energy Use Coverage) is rendered
// INSIDE Step 2, between subsections 2A and 2B, via the `afterSection2A` slot
// on Step2Packages. The visuals are derived purely from Step 1 + 2A (system
// size, battery), so this puts them immediately downstream of the inputs that
// shape them. 2B–2F (RSD / inverters / roof / location / misc) are pricing-
// only and don't feed the simulation.
//
// `mode` flows from App.jsx → here → Step2Packages and Step4Returns:
//   • Step2Packages — gates which 2-subsections render. 'customer' (public
//     view) hides cabling, RSD, inverter slots, roof material, the location
//     km input, and misc materials, plus the Selected (override) row in 2A.
//     'rep' shows everything.
//   • Step3PaymentTerms — v3-51: now shown in BOTH modes. Previously the
//     customer-mode placeholder card explained "Contact us to discuss
//     payment terms" but offered no controls. Customers now have the full
//     Step 3 controls (tenor dropdown, DP%, CC checkboxes, promo) — they
//     drive the same calc-engine output reps drive, just landing on the
//     direct-purchase defaults (tenor=1, DP=50%).
//   • Step4Returns — `mode` still controls subtitle framing and customer-
//     facing callouts.
//
// LAYOUT (v3-51): Steps 1, 2 stay full-width. Steps 3 and 4 render
// side-by-side at ≥1024px desktop widths (~1.05fr / 0.95fr split). Below the
// breakpoint they stack vertically. Step 4 is sticky-pinned within the right
// column so as the user adjusts Step 3 controls, Step 4's metrics stay
// visible. The breakpoint is enforced via CSS in index.html (.step34-grid
// class) so the same JSX renders both layouts.
//
// Step 1 is mode-agnostic.
// =============================================================================

import React from 'react';
import Step1Consumption from './Step1Consumption.jsx';
import Step2Packages from './Step2Packages.jsx';
import EnergyVisuals from './EnergyVisuals.jsx';
import Step3PaymentTerms from './Step3PaymentTerms.jsx';
import Step4Returns from './Step4Returns.jsx';
import RotatingTagline from './RotatingTagline.jsx';

export default function Calculator({
  state, updateState, model,
  adminParams, disclaimers,
  mode = 'rep',
  resetStep1, resetStep2, resetStep3,
}) {
  return (
    <div>
      <RotatingTagline />
      <Step1Consumption
        state={state} updateState={updateState} model={model}
        onReset={resetStep1}
      />
      <Step2Packages
        state={state} updateState={updateState} model={model}
        adminParams={adminParams}
        mode={mode}
        onReset={resetStep2}
        afterSection2A={
          <EnergyVisuals
            state={state} updateState={updateState} model={model}
            disclaimers={disclaimers} mode={mode}
          />
        }
      />
      <div className="step34-grid" style={styles.step34Grid}>
        <div className="step34-col-left">
          <Step3PaymentTerms
            state={state} updateState={updateState} model={model}
            adminParams={adminParams}
            onReset={resetStep3}
          />
        </div>
        <div className="step34-col-right" style={styles.step34RightCol}>
          <Step4Returns
            state={state} updateState={updateState} model={model}
            disclaimers={disclaimers}
            mode={mode}
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  // The side-by-side grid. Default = stacked single column (mobile/tablet
  // friendly); a CSS media query in index.html flips it to a two-column
  // grid at min-width: 1024px. Using a class hook + media query rather
  // than JS-side window-listening keeps the layout transition seamless
  // and avoids a flash of incorrect layout on first paint.
  step34Grid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 0,
  },
  // The right column is sticky-pinned so Step 4's metrics stay visible
  // while the customer adjusts Step 3 controls. Top offset accounts for
  // the header (~80px) plus the tab strip (~50px). On mobile/tablet
  // (single-column layout), `position: sticky` with `top` on a full-width
  // block degenerates to "stick to top of viewport while scrolling" which
  // would feel jarring; the media query in index.html disables sticky at
  // narrower widths.
  step34RightCol: {
    position: 'sticky',
    top: 140,
    alignSelf: 'start',
  },
};
