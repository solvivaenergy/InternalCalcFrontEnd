// =============================================================================
// MOBILE FLOW — phone-first public calculator view (v3-157)
// -----------------------------------------------------------------------------
// A third top-level view alongside the desktop customer view and rep mode.
// Renders ONLY when: mode === 'customer' AND (phone viewport OR ?view=mobile).
// Authenticated reps keep the full UI even on phones (user decision 1);
// tablets are treated as desktop (user decision 2, breakpoint 640px +
// coarse-pointer requirement in App.jsx).
//
// ARCHITECTURE — this component is a pure VIEW over the existing state record
// and model. It reads/writes the SAME fields the desktop steps bind to
// (monthlyBill, utilityRate, deviceRows, desiredSavingsPct, optimizationMode,
// roofMaterial, location/locationRegion/locationCity/locationKm, tenor,
// downPaymentPct) and consumes the SAME memoized `model` App.jsx already
// computes — so every figure shown here is byte-identical to the desktop
// view and the workbook mirrors behind it. NO engine changes shipped with
// this view; LCOE / IRR / payback / savings all come from the existing
// computeCashFlows (Schedule!X8:AC38 mirror) via model.cashFlows.
//
// Fields the mobile flow deliberately does NOT expose (cables, RSD, inverter
// picks, battery package/component toggles, promo code, net metering,
// conservativeSizing checkbox, irrYears selector) sit at their defaults —
// the same defaults the desktop customer-mode safety net enforces. irrYears
// stays at its default (25); the horizon is written into the copy via
// {state.irrYears} so an admin-driven default change flows through.
//
// Screens: 0 Welcome · 1 Bill · 2 Appliances · 3 Goal · 4 Recommendation ·
// 5 Your Home (roof + location) · 6 Investment · 7 Lead form.
// A sticky "Investment returns" bottom sheet rotates LCOE / IRR / savings /
// payback every 3s (approved mockup cadence) once a recommendation screen
// has been reached, and expands to tiles + plain-language explainers.
//
// Styling is scoped: every class is .mfl-* and the stylesheet is injected
// once per mount via <style>. Brand palette + Mulish per the Solviva Brand
// Book (PolySans is the primary face but is a paid license; Mulish is the
// book's approved alternate and is served from Google Fonts via index.html).
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { DEVICES } from '../data/devices.js';
import { useMemo } from 'react';
import { availableDeliveryLocations, availableBatteryPackages, optimizeBatteryPackage,
         DISCLAIMERS } from '../data/adminParams.js';
import { LUZON_REGIONS, LUZON_FREE_TRAVEL_KM } from '../config.js';
import { formatHour12, optimizeSystem } from '../lib/schedule.js';
import {
  allowedDpOptions, resolveMinDpPct, DP_EPS,
  computeRecommendedPanels, recommendInverters, buildPackageLineItems,
  computePaymentTerms,
} from '../lib/calculations.js';
import {
  buildLeadPayload, submitLead, makeLeadRef, LEAD_CONSENT_TEXT,
} from '../lib/lead.js';
import { isValidPhPhone } from '../lib/validation.js';

// Same acceptance rule as App.jsx's ContactPanel (local there, mirrored here).
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());
import { DU_STEP_BP, DU_MIN_BP, DU_MAX_BP, clampDuRateBp } from './Step4Returns.jsx';
import { buildPayoffModel, WARRANTY_YEARS } from '../lib/payoff.js';
import { fmt, SERVICE_TYPE_INFO, RATE_INFO, CHARGES_INFO, MAJOR_DEVICES_INFO } from './ui.jsx';
import { TAGLINES } from './RotatingTagline.jsx';

// Tenor chips — the same base set as popularTenorsTable (v3-154), filtered by
// adminParams.maxTenorMonths at render.
const MOBILE_TENORS = [0, 3, 6, 9, 12, 24, 36, 48, 60];

// Rotation cadences (user decision: 3 seconds, 0.3s crossfade).
const ROTATE_MS = 3000;
const FADE_MS = 300;

const CSS = `
.mfl{--g9:#1F522B;--g6:#467147;--g3:#AAC78D;--neon:#D2FF1E;--sky:#B9D8EB;
  --cream:#F6F5ED;--ink:#173D20;--muted:#5C7561;--line:#E3E6D8;
  font-family:'Mulish',system-ui,sans-serif;background:var(--cream);
  color:var(--ink);min-height:100vh;display:flex;flex-direction:column;
  max-width:480px;margin:0 auto;position:relative}
.mfl *{box-sizing:border-box}
.mfl-header{padding:calc(12px + env(safe-area-inset-top)) 20px 8px;
  display:flex;align-items:center;justify-content:space-between}
.mfl-header img{height:24px;display:block}
.mfl-progress{display:flex;gap:5px;padding:4px 20px 12px}
.mfl-progress i{flex:1;height:4px;border-radius:4px;background:#DDE0D2;transition:background .3s}
.mfl-progress i.done{background:var(--g9)}
.mfl-progress i.now{background:var(--neon);outline:1px solid var(--g9)}
.mfl-screen{flex:1;padding:6px 20px 150px}
.mfl-kicker{font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--g6);
  text-transform:uppercase;margin:8px 0 6px}
.mfl h1{font-size:25px;font-weight:900;line-height:1.15;color:var(--g9);margin:0 0 6px}
.mfl-h2{font-size:16px;font-weight:900;color:var(--g9);margin:20px 0 10px}
.mfl-sub{font-size:14px;color:var(--muted);line-height:1.5;margin:0 0 18px}
.mfl-card{background:#fff;border-radius:22px;box-shadow:0 6px 24px rgba(31,82,43,.10);
  padding:18px;margin-bottom:14px}
.mfl-field{display:block;font-size:12px;font-weight:800;letter-spacing:.05em;
  color:var(--g6);text-transform:uppercase;margin-bottom:8px}
.mfl-money{display:flex;align-items:center;gap:8px;border:2px solid var(--g3);
  border-radius:16px;padding:12px 14px;background:var(--cream)}
.mfl-money:focus-within{border-color:var(--g9)}
.mfl-money .cur{font-weight:800;color:var(--g6);font-size:20px}
.mfl-money input{border:none;background:none;outline:none;font:inherit;
  font-size:26px;font-weight:900;color:var(--g9);width:100%;min-width:0}
.mfl-hint{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.45}
.mfl-derived{display:inline-flex;align-items:center;gap:6px;margin-top:12px;
  background:var(--sky);color:var(--g9);font-size:13px;font-weight:700;
  border-radius:999px;padding:7px 14px}
.mfl-notice{background:#FEF6E0;border:1.5px solid #E4C765;border-radius:16px;
  padding:12px 14px;font-size:12.5px;color:#6B5A1E;line-height:1.5;margin-bottom:14px}
.mfl-chips{display:flex;flex-wrap:wrap;gap:8px}
.mfl-chip{border:1.5px solid var(--g3);background:#fff;color:var(--g9);font:inherit;
  font-size:13px;font-weight:700;border-radius:999px;padding:9px 14px;cursor:pointer}
.mfl-approw{border:1.5px solid var(--line);border-radius:18px;padding:12px 14px;
  margin-top:10px;background:#fff}
.mfl-approw-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mfl-approw-name{font-weight:800;font-size:15px;color:var(--g9)}
.mfl-stepper{display:flex;align-items:center;gap:10px}
.mfl-stepper button{width:30px;height:30px;border-radius:50%;border:none;
  background:var(--cream);color:var(--g9);font-size:18px;font-weight:800;cursor:pointer}
.mfl-stepper span{font-weight:900;min-width:16px;text-align:center}
.mfl-sched{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px}
.mfl-sched label{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;
  color:var(--muted);text-transform:uppercase;margin-bottom:4px}
.mfl-sched select{width:100%;font:inherit;font-size:14px;font-weight:800;
  color:var(--g9);border:1.5px solid var(--g3);border-radius:12px;padding:9px 6px;
  background:#fff;appearance:none;text-align:center}
.mfl-remove{background:none;border:none;color:#B05B4C;font-size:12px;font-weight:700;
  cursor:pointer;margin-top:10px;padding:0}
.mfl-obj{border:2px solid var(--line);border-radius:22px;padding:16px;margin-bottom:12px;
  background:#fff;cursor:pointer;position:relative}
.mfl-obj.sel{border-color:var(--g9);background:var(--g9)}
.mfl-obj-t{font-weight:900;font-size:16px;color:var(--g9);padding-right:36px}
.mfl-obj-d{font-size:13px;color:var(--muted);line-height:1.5;margin-top:5px}
.mfl-obj.sel .mfl-obj-t{color:var(--neon)}
.mfl-obj.sel .mfl-obj-d{color:#D9E4D2}
.mfl-tick{position:absolute;top:14px;right:14px;width:22px;height:22px;border-radius:50%;
  border:2px solid var(--g3);display:flex;align-items:center;justify-content:center;
  font-size:12px;color:transparent}
.mfl-obj.sel .mfl-tick{background:var(--neon);border-color:var(--neon);
  color:var(--g9);font-weight:900}
.mfl-obj-price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;
  margin-top:10px;font-size:13px;font-weight:700;color:var(--muted)}
.mfl-obj-price b{font-size:16px;font-weight:900;color:var(--g9)}
.mfl-obj.sel .mfl-obj-price{color:#D9E4D2}
.mfl-obj.sel .mfl-obj-price b{color:var(--neon)}
.mfl-obj-delta{font-size:11px;font-weight:800;border-radius:999px;
  padding:3px 9px;background:#FEF6E0;color:#8A6D1B}
.mfl-obj-cheapest{font-size:11px;font-weight:800;border-radius:999px;
  padding:3px 9px;background:var(--g6);color:var(--cream)}
.mfl-obj.sel .mfl-obj-delta{background:rgba(255,255,255,.14);color:#F3E2AE}
.mfl-obj.sel .mfl-obj-cheapest{background:var(--neon);color:var(--g9)}
.mfl-sliderval{font-size:38px;font-weight:900;color:var(--g9)}
.mfl-sliderval small{font-size:16px;color:var(--g6);font-weight:700}
.mfl input[type=range]{width:100%;accent-color:var(--g9);height:32px;margin:0}
.mfl-range-ends{display:flex;justify-content:space-between;font-size:10px;
  font-weight:700;color:var(--muted);margin-top:-2px}
.mfl-heronum{font-size:46px;font-weight:900;color:var(--g9);line-height:1}
.mfl-heronum small{font-size:15px;font-weight:700;color:var(--g6)}
.mfl-specs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.mfl-spec{background:var(--cream);border-radius:16px;padding:12px}
.mfl-spec .v{font-weight:900;font-size:19px;color:var(--g9)}
.mfl-spec .l{font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.04em;
  text-transform:uppercase;margin-top:2px}
.mfl-bar{height:14px;border-radius:8px;background:var(--line);overflow:hidden;
  display:flex;margin-top:8px}
.mfl-bar b{background:var(--g6);height:100%}
.mfl-bar i{background:var(--sky);height:100%}
.mfl-legend{display:flex;gap:14px;font-size:11px;color:var(--muted);margin-top:6px;
  font-weight:700;flex-wrap:wrap}
.mfl-dotg,.mfl-dotb{width:9px;height:9px;border-radius:50%;display:inline-block;
  margin-right:4px;vertical-align:-1px}
.mfl-dotg{background:var(--g6)}.mfl-dotb{background:var(--sky)}
.mfl-roof{display:flex;align-items:center;gap:14px;border:2px solid var(--line);
  border-radius:22px;padding:13px 16px;margin-bottom:10px;background:#fff;cursor:pointer}
.mfl-roof.sel{border-color:var(--g9);background:var(--g9)}
.mfl-roof .ic{font-size:26px}
.mfl-roof .t{font-weight:900;font-size:15px;color:var(--g9)}
.mfl-roof .d{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.4}
.mfl-roof.sel .t{color:var(--neon)}.mfl-roof.sel .d{color:#D9E4D2}
.mfl-select{width:100%;font:inherit;font-size:16px;font-weight:700;color:var(--g9);
  border:2px solid var(--g3);border-radius:16px;padding:13px 40px 13px 14px;background:#fff;
  appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9'%3E%3Cpath d='M1 1l6 6 6-6' stroke='%231F522B' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 16px center}
.mfl-pricehero{text-align:center;padding:6px 0 2px}
.mfl-pricehero .p{font-size:40px;font-weight:900;color:var(--g9)}
.mfl-pricehero .l{font-size:12px;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:var(--g6)}
.mfl-tenors{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px}
.mfl-tenor{border:1.5px solid var(--g3);border-radius:14px;padding:10px 4px;
  text-align:center;background:#fff;cursor:pointer;font-weight:800;font-size:13px;
  color:var(--g9)}
.mfl-tenor small{display:block;font-size:10px;font-weight:700;color:var(--muted)}
.mfl-tenor.sel{background:var(--g9);border-color:var(--g9);color:var(--neon)}
.mfl-tenor.sel small{color:var(--g3)}
.mfl-payline{display:flex;justify-content:space-between;font-size:14px;
  padding:9px 0;border-bottom:1px solid #ECEEE2;gap:10px}
.mfl-payline:last-child{border-bottom:none}
.mfl-payline b{font-weight:900;color:var(--g9);white-space:nowrap}
.mfl-monthly{background:var(--g9);border-radius:22px;padding:20px;text-align:center;
  margin-bottom:14px}
.mfl-monthly .v{font-size:38px;font-weight:900;color:var(--neon)}
.mfl-monthly .l{font-size:12px;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:var(--g3);margin-top:2px}
.mfl-exrow{padding:10px 0;border-bottom:1px solid #ECEEE2}
.mfl-exrow:last-child{border-bottom:none}
.mfl-exhead{display:flex;align-items:baseline;gap:10px;margin-bottom:5px;flex-wrap:wrap}
.mfl-exv{font-weight:900;font-size:20px;color:var(--g9)}
.mfl-exl{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
  color:var(--g6)}
.mfl-exd{font-size:12.5px;color:var(--muted);line-height:1.55;margin:0}
.mfl-exd b{color:var(--g9)}
.mfl-nav{display:flex;gap:10px;margin-top:8px}
.mfl-btn{flex:1;border:none;font:inherit;font-weight:900;font-size:16px;
  border-radius:999px;padding:16px 18px;cursor:pointer}
.mfl-btn.primary{background:var(--neon);color:var(--g9)}
.mfl-btn.primary:disabled{opacity:.55;cursor:default}
.mfl-btn.ghost{background:none;border:2px solid var(--g3);color:var(--g9);
  flex:0 0 auto;padding:14px 20px}
.mfl-welcome{text-align:center}
.mfl-biglogo{width:210px;margin:26px auto 6px;display:block}
.mfl-heroimg{width:100%;border-radius:26px 26px 110px 110px;display:block;
  margin:22px 0 26px;box-shadow:0 6px 24px rgba(31,82,43,.10);aspect-ratio:16/7;
  object-fit:cover}
.mfl-welcome h1{min-height:2.4em;display:flex;align-items:center;justify-content:center;
  font-size:29px;text-align:center}
.mfl-welcome h1 span{transition:opacity .3s ease;opacity:1}
.mfl-welcome h1 span.fading{opacity:0}
.mfl-returns{position:fixed;left:50%;transform:translate(-50%,calc(100% - 62px));
  bottom:0;width:100%;max-width:480px;z-index:30;background:var(--g9);color:var(--cream);
  border-radius:26px 26px 0 0;box-shadow:0 -8px 30px rgba(23,61,32,.28);
  padding:0 20px calc(12px + env(safe-area-inset-bottom));
  transition:transform .32s cubic-bezier(.2,.8,.2,1)}
.mfl-returns.open{transform:translate(-50%,0)}
/* v3-182 — THE SHEET MUST BE ABLE TO SCROLL WHEN EXPANDED.
   It is position:fixed, bottom:0, with NO height bound, so content taller than
   the viewport grew UPWARD past the top edge and was simply unreachable —
   "What do these mean?" expanded into nothing. Capping the height at the
   viewport (less a little breathing room) and making the body scrollable is
   the whole fix. The grab handle stays put while the body scrolls under it, so
   the collapse control is never the thing you have to scroll to reach.
   overscroll-behavior:contain stops a flick at the end of the list from
   scrolling the screen underneath, which on iOS reads as the sheet jumping. */
.mfl-returns{max-height:88vh;max-height:88dvh;display:flex;flex-direction:column}
.mfl-returns .mfl-grab{flex:0 0 auto}
.mfl-returns .mfl-detail{overflow-y:auto;overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;min-height:0}
.mfl-grab{display:flex;align-items:center;justify-content:space-between;height:62px;
  cursor:pointer;gap:10px}
.mfl-grab .lbl{font-size:11px;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:var(--g3)}
.mfl-grab .quick{font-size:18px;font-weight:900;color:var(--neon);
  transition:opacity .3s ease}
.mfl-grab .quick.fading{opacity:0}
.mfl-grab .chev{font-size:13px;color:var(--g3);transition:transform .3s;flex:0 0 auto}
.mfl-returns.open .mfl-grab .chev{transform:rotate(180deg)}
/* v3-181 — DU inflation stepper inside the expanded returns sheet. 46px hit
   targets (touch minimum). Palette is the flow's Brand Book set, not the
   desktop admin blues. */
/* v3-182 — .mfl-detail is a TWO-COLUMN grid and this block was landing in a
   single ~170px column: the hint wrapped one word per line, and the 174px
   control could not shrink, so it blew the track out and pushed the metric
   tiles off the right edge of the sheet. Spanning both columns fixes the
   wrapping AND the horizontal overflow, which had the same cause. */
.mfl-dustep{grid-column:1/-1;display:block}
.mfl-dusrow{display:flex;align-items:center;justify-content:space-between;
  gap:12px;flex-wrap:wrap}
/* v3-182 — was #467147 (--g6) on the dark --g9 sheet: dark-on-dark, effectively
   unreadable in Pat's screenshot. The sheet's own muted tone is --g3. */
.mfl-dushint{font-size:11.5px;color:var(--g3);line-height:1.5;flex:1 1 140px;min-width:0}
.mfl-dusctl{display:flex;align-items:center;border:1px solid #AAC78D;
  border-radius:10px;overflow:hidden;background:#fff;flex-shrink:0}
.mfl-dusctl button{width:46px;height:46px;border:none;background:#EAF3E1;
  color:#1F522B;font-size:22px;font-weight:800;line-height:1;cursor:pointer;
  font-family:inherit}
.mfl-dusctl button:disabled{opacity:.35;cursor:not-allowed}
.mfl-dusval{min-width:82px;text-align:center;font-size:17px;font-weight:800;
  color:#1F522B;font-variant-numeric:tabular-nums}
.mfl-detail{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:2px 0 14px}
.mfl-rt{background:rgba(255,255,255,.07);border-radius:16px;padding:12px}
.mfl-rt .v{font-weight:900;font-size:22px;color:var(--neon)}
.mfl-rt .l{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--g3);margin-top:2px}
.mfl-rt .c{font-size:10px;font-weight:700;color:var(--sky);margin-top:4px;line-height:1.35}
.mfl-whatbtn{grid-column:1/-1;background:none;border:none;font:inherit;font-size:12px;
  font-weight:800;color:var(--neon);cursor:pointer;text-align:left;padding:2px 0}
.mfl-explain{grid-column:1/-1}
.mfl-explain p{font-size:11px;color:#D9E4D2;line-height:1.55;margin:0 0 8px}
.mfl-explain b{color:var(--cream)}
.mfl-note{grid-column:1/-1;font-size:10px;color:var(--g3);line-height:1.5}
/* v3-182 — screen 6 metrics block. The sticky sheet is a summary you can
   dismiss; screen 6 is the last screen before the proposal request, so every
   metric is stated in full there rather than only in a sheet the customer may
   never open. Light-on-cream (the screen palette), NOT the dark sheet palette. */
.mfl-payoff{margin:0 -15px}
.mfl-payoff .mfl-pad{padding:0 15px}
.mfl-payoff svg{display:block;width:100%}
.mfl-payoff .l{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
  color:var(--g6)}
.mfl-payoff .s{font-size:12px;color:#5A7358;line-height:1.5;margin:4px 0 10px}
.mfl-payoff .f{font-size:11px;color:#6F8A6C;line-height:1.5;margin-top:8px;font-style:italic}
.mfl-payoff .k{display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;color:#5A7358;margin-top:8px}
.mfl-payoff .k i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;
  vertical-align:-1px;background:#3B7B5A}
.mfl-payoff .k i.ln{border-radius:0;height:0;border-top:2px dashed #C9862B;width:13px}
/* v3-193 — the payment caption lives here, NOT over the bars. #8A5C1C on white
   clears WCAG AA at 11px; the old in-plot label was #9A6B1F over #3B7B5A. */
.mfl-payoff .mfl-paycap{font-size:11px;font-weight:700;color:#8A5C1C;margin-top:6px}
.mfl-m6{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
.mfl-m6 .t{background:var(--cream);border:1px solid var(--line);border-radius:14px;
  padding:11px 12px;min-width:0}
.mfl-m6 .t.wide{grid-column:1/-1}
.mfl-m6 .v{font-size:20px;font-weight:900;color:var(--g9);line-height:1.15;
  word-break:break-word}
.mfl-m6 .l{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
  color:var(--g6);margin-top:3px}
.mfl-m6 .c{font-size:10px;font-weight:700;color:var(--g6);margin-top:3px;line-height:1.35}
.mfl-m6step{grid-column:1/-1;background:var(--cream);border:1px solid var(--line);
  border-radius:14px;padding:12px}
.mfl-m6srow{display:flex;align-items:center;justify-content:space-between;
  gap:12px;flex-wrap:wrap;margin-top:9px}
.mfl-m6shint{font-size:11px;color:var(--g6);line-height:1.45;flex:1 1 130px;min-width:0}
.mfl-input{width:100%;font:inherit;font-size:15px;font-weight:600;color:var(--g9);
  border:2px solid var(--g3);border-radius:14px;padding:12px 14px;background:#fff;
  outline:none}
.mfl-input:focus{border-color:var(--g9)}
.mfl-input.err{border-color:#DC2626;background:#FEF2F2}
.mfl-errmsg{font-size:11px;color:#DC2626;margin-top:4px;display:block}
.mfl-consent{display:flex;gap:10px;align-items:flex-start;font-size:11.5px;
  color:var(--muted);line-height:1.5;margin-top:12px}
.mfl-consent input{margin-top:2px;accent-color:var(--g9);width:16px;height:16px;
  flex:0 0 auto}
.mfl-success{text-align:center;padding:30px 0}
.mfl-success .big{font-size:44px}
.mfl-success h2{font-size:21px;font-weight:900;color:var(--g9);margin:10px 0 6px}
.mfl-success p{font-size:13.5px;color:var(--muted);line-height:1.55}
.mfl-success .ref{display:inline-block;margin-top:10px;background:var(--cream);
  border-radius:999px;padding:8px 16px;font-weight:800;color:var(--g9);font-size:13px}
.mfl-fieldrow{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.mfl-fieldrow .mfl-field{margin-bottom:0}
.mfl-infobtn{appearance:none;-webkit-appearance:none;display:inline-flex;
  vertical-align:middle;border:none;background:none;cursor:pointer;padding:2px;
  line-height:0;flex:0 0 auto}
.mfl-infobtn svg{display:block}
.mfl-scrim{position:fixed;inset:0;background:rgba(23,61,32,.45);z-index:60;
  display:flex;align-items:center;justify-content:center;padding:20px}
.mfl-sheet{background:#fff;border-radius:22px;max-width:420px;width:100%;
  max-height:78vh;display:flex;flex-direction:column;
  box-shadow:0 18px 50px rgba(23,61,32,.35)}
.mfl-sheet-head{display:flex;align-items:center;justify-content:space-between;
  padding:16px 18px 10px;font-weight:900;font-size:16px;color:var(--g9)}
.mfl-sheet-x{background:var(--cream);border:none;width:28px;height:28px;
  border-radius:50%;font-size:14px;font-weight:800;color:var(--g9);cursor:pointer;
  flex:0 0 auto}
.mfl-sheet-body{padding:0 18px 18px;overflow-y:auto;font-size:13px;line-height:1.55;
  color:var(--ink)}
.mfl-sheet-body p{margin:0 0 10px}
.mfl-seg{display:grid;grid-template-columns:1fr 1fr;gap:0;border:2px solid var(--g3);
  border-radius:16px;overflow:hidden}
.mfl-seg button{border:none;font:inherit;font-size:14px;font-weight:800;
  padding:12px 8px;background:#fff;color:var(--g9);cursor:pointer}
.mfl-seg button.sel{background:var(--g9);color:var(--neon)}
.mfl-invite{font-size:12px;color:var(--muted);line-height:1.55;margin:20px 0 0;
  padding:12px 14px;background:rgba(185,216,235,.35);border-radius:14px;text-align:left}
.mfl-invite b{color:var(--g9)}
@keyframes mflInFwd{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:none}}
@keyframes mflInBack{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}
.mfl-anim-fwd{animation:mflInFwd .25s ease}
.mfl-anim-back{animation:mflInBack .25s ease}
`;

// ─── Info tooltip — tap-to-open sheet (hover doesn't exist on touch) ─────────
// One self-contained component: the ⓘ button and its centered sheet. The
// content is either the SHARED desktop info JSX (SERVICE_TYPE_INFO, RATE_INFO,
// CHARGES_INFO, MAJOR_DEVICES_INFO — single-sourced, already customer-facing
// on desktop) or short mobile-only plain-language copy defined below.
function Info({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* v3-167 — box-pinning still rendered oval on real iPhones AND
          Androids (Pat, screenshots), so the disc is now GEOMETRY, not
          layout: a fixed-viewBox SVG stays circular no matter what the
          layout engine does to the box around it. The button itself is
          a transparent hit-area. */}
      <button className="mfl-infobtn" type="button" aria-label={`About ${title}`}
              onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"
             focusable="false">
          <circle cx="9" cy="9" r="9" fill="#FFAB40" />
          <text x="9" y="12.8" textAnchor="middle" fontFamily="Georgia, serif"
                fontStyle="italic" fontWeight="800" fontSize="11.5"
                fill="#1F522B">i</text>
        </svg>
      </button>
      {open && (
        <div className="mfl-scrim" onClick={() => setOpen(false)}>
          <div className="mfl-sheet" role="dialog" aria-label={title}
               onClick={e => e.stopPropagation()}>
            <div className="mfl-sheet-head">
              <span>{title}</span>
              <button className="mfl-sheet-x" type="button" aria-label="Close"
                      onClick={() => setOpen(false)}>{'\u2715'}</button>
            </div>
            <div className="mfl-sheet-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

// Label + optional info button on one row.
function FieldLabel({ text, info, infoTitle, style }) {
  return (
    <div className="mfl-fieldrow" style={style}>
      <label className="mfl-field">{text}</label>
      {info && <Info title={infoTitle || text}>{info}</Info>}
    </div>
  );
}

// Desktop invitation — welcome screen + lead-success screen (user-directed,
// framed as MORE rather than better: the phone flow is not apologized for).
const DESKTOP_INVITE = (
  <>Want the <b>full detailed calculator</b>? Open this same page on a tablet
    or computer &mdash; you&rsquo;ll get the complete version with every option, the
    itemized summary, and the payment schedule.</>
);

function fmtPeso(v) { return fmt.peso(v); }

// Payback in the LiveTotalBar's compact style ("6 yrs 4 mos").
function paybackShort(paybackMonths) {
  if (!Number.isFinite(paybackMonths)) return '\u2014';
  const y = Math.floor(paybackMonths / 12), mo = paybackMonths - y * 12;
  return y === 0 ? `${mo} mos`
       : mo === 0 ? `${y} yr${y === 1 ? '' : 's'}`
       : `${y} yr${y === 1 ? '' : 's'} ${mo} mos`;
}

// ─── Money input — controlled text field storing a number in state ───────────
function MoneyInput({ value, onChange, decimals = 0, big = true }) {
  const [text, setText] = useState(() =>
    value == null ? '' : Number(value).toLocaleString('en-PH',
      { maximumFractionDigits: decimals }));
  const [focused, setFocused] = useState(false);
  // Re-sync from state when not being edited (e.g. server params arriving).
  useEffect(() => {
    if (!focused) {
      setText(value == null ? '' : Number(value).toLocaleString('en-PH',
        { maximumFractionDigits: decimals }));
    }
  }, [value, focused, decimals]);
  return (
    <div className="mfl-money">
      <span className="cur">{'\u20B1'}</span>
      <input
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const n = parseFloat(text.replace(/[^0-9.]/g, ''));
          if (Number.isFinite(n) && n > 0) onChange(n);
          setText(value == null ? '' : Number(
            Number.isFinite(parseFloat(text.replace(/[^0-9.]/g, '')))
              && parseFloat(text.replace(/[^0-9.]/g, '')) > 0
              ? parseFloat(text.replace(/[^0-9.]/g, ''))
              : value
          ).toLocaleString('en-PH', { maximumFractionDigits: decimals }));
        }}
        onChange={e => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
          if (Number.isFinite(n) && n > 0) onChange(n);
        }}
        style={big ? undefined : { fontSize: 18 }}
      />
    </div>
  );
}

// ─── Rotating text — shared by the welcome tagline + returns quick line ──────
function useRotator(lines, active) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * Math.max(1, lines.length)));
  const [fading, setFading] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx(prev => (prev + 1) % Math.max(1, linesRef.current.length));
        setFading(false);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [active]);
  const safe = lines.length ? lines[idx % lines.length] : '';
  return { text: safe, fading };
}

// ─── Sticky Investment Returns sheet ─────────────────────────────────────────
// ─── Mobile payoff graphic (v3-192) ──────────────────────────────────────────
// Same shared model as the desktop Step 3 panel, DIFFERENT ENCODING FOR THE
// PAYMENT — and the reason is measurable, not aesthetic. Inside a mobile card
// at a 25-year horizon the desktop's per-year payment bar would be 3.6px wide
// (3.0px at 30). So the payment becomes a horizontal dashed line that simply
// ENDS: legible at any width, and its termination is the message.
//
// Capped at 25 years because the mobile flow has NO horizon selector. It
// inherits the FinCo default, and at a 30-year default the customer would have
// no way to shorten a chart whose bars had become an unreadable block.
function MobilePayoff({ state, model, adminParams }) {
  const p = buildPayoffModel({ state, model, adminParams, maxYears: WARRANTY_YEARS });
  if (!p) return null;
  const { years, monthlySave, pmt, payYears, directPurchase,
          headline, subtitle, horizonNote, totalOverHorizon } = p;

  // Full-bleed: the card's own padding is cancelled so the chart gets the whole
  // width (374px rather than 328px on a 390px screen).
  const W = 374, X0 = 14, X1 = W - 14, YB = 118, YT = 26;
  const slot = (X1 - X0) / years;
  const bw = Math.max(3, slot * 0.66);
  const maxV = Math.max(...monthlySave, directPurchase ? 0 : pmt) * 1.18;
  const h = (v) => (v / maxV) * (YB - YT);

  const bars = monthlySave.map((v, y) => {
    const x = X0 + y * slot + (slot - bw) / 2;
    const hs = h(v);
    return <rect key={y} x={x.toFixed(1)} y={(YB - hs).toFixed(1)}
                 width={bw.toFixed(1)} height={hs.toFixed(1)} rx="1.5" fill="#3B7B5A" />;
  });

  let paymentLine = null;
  if (!directPurchase) {
    const py = YB - h(pmt);
    const px = X0 + Math.min(payYears, years) * slot;
    // v3-193 — NO TEXT INSIDE THE PLOT. Both amber labels used to sit over the
    // savings bars at 9.5px: "₱X/mo paid" just above the dashed line and
    // "payments end yr N" near the baseline, amber on green, illegible on a
    // phone (Pat's screenshot). Desktop can carry them because it has headroom
    // above the bars; mobile does not. The line, the end dot and a short tick
    // below the axis carry the position; the words move to a caption under the
    // chart, where they get full width, 11px and a readable contrast ratio.
    paymentLine = (
      <g>
        <path d={`M${X0} ${py.toFixed(1)}L${px.toFixed(1)} ${py.toFixed(1)}L${px.toFixed(1)} ${YB}`}
              fill="none" stroke="#C9862B" strokeWidth="2" strokeDasharray="4 3" />
        <circle cx={px.toFixed(1)} cy={YB} r="3" fill="#C9862B" />
        <line x1={px.toFixed(1)} y1={YB} x2={px.toFixed(1)} y2={YB + 6}
              stroke="#C9862B" strokeWidth="1.5" />
      </g>
    );
  }

  return (
    <div className="mfl-card mfl-payoff">
      <div className="mfl-pad">
        <div className="l">{headline}</div>
        <div className="s">{subtitle}</div>
      </div>
      <svg viewBox={`0 0 ${W} 140`} role="img"
           aria-label={`Monthly bill savings by year over ${years} years, from `
             + `${fmtPeso(monthlySave[0])} in year one to ${fmtPeso(monthlySave[years - 1])} `
             + `in year ${years}`
             + (directPurchase ? '. There is no monthly payment.'
                : `, against a fixed monthly payment of ${fmtPeso(pmt)} that ends after year ${payYears}.`)}>
        <line x1={X0} y1={YB} x2={X1} y2={YB} stroke="#D9E2CC" />
        {bars}
        {paymentLine}
        <text x={X0} y={YT - 12} fontSize="9.5" fontWeight="700" fill="#1F3D2E">
          {fmtPeso(monthlySave[0])}/mo saved
        </text>
        <text x={X1} y={YT - 12} textAnchor="end" fontSize="9.5" fontWeight="700" fill="#1F3D2E">
          {fmtPeso(monthlySave[years - 1])}/mo by yr {years}
        </text>
        <text x={X0} y="134" fontSize="8.5" fill="#9CA3AF">yr 1</text>
        <text x={X1} y="134" textAnchor="end" fontSize="8.5" fill="#9CA3AF">yr {years}</text>
      </svg>
      <div className="mfl-pad">
        <div className="k">
          <span><i />Saved each month</span>
          {!directPurchase && <span><i className="ln" />Paid each month</span>}
        </div>
        {!directPurchase && (
          <div className="mfl-paycap">
            {fmtPeso(pmt)}/mo paid, ending year {payYears}
          </div>
        )}
        <div className="f">
          Total saved over {years} years: <strong>{fmtPeso(totalOverHorizon)}</strong>.{horizonNote}
        </div>
      </div>
    </div>
  );
}

function ReturnsSheet({ screen, state, model, updateState }) {
  const [open, setOpen] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const cf = model.cashFlows;
  const rate = Number(state.utilityRate);
  const sched = model.schedule;
  const irrYears = state.irrYears;
  // v3-181 — DU tariff inflation, shared bounds/clamp with desktop Step 4 so
  // the two surfaces cannot drift apart on the grid or the ceiling.
  const duBp = clampDuRateBp(Math.round((cf.duRateInflation || 0) * 10000));
  const setDu = (nextBp) => updateState({ duRateInflation: clampDuRateBp(nextBp) / 10000 });

  // v3-169 — full metrics from the savings-target screen on (user decision:
  // watching IRR / LCOE / horizon savings move with the slider IS the pitch).
  const metricsReady = screen >= 3;
  const lines = metricsReady ? [
    `Solar at ${fmt.pesoCents(cf.lcoe)}/kWh vs. your Utility Bill at \u20B1${Number.isFinite(rate) ? rate.toFixed(2) : '\u2014'}`,
    cf.irr != null
      ? `${(cf.irr * 100).toFixed(1)}% yearly return \u00B7 deposits pay ~3\u20136%`
      : `Savings of ${fmtPeso(sched.monthlyPesoSavingsBatt)}/month`,
    `${fmtPeso(cf.totalDuSavings)} saved over ${irrYears} years`,
    Number.isFinite(cf.paybackMonths)
      ? `Pays for itself in ${paybackShort(cf.paybackMonths)}`
      : `Savings of ${fmtPeso(sched.monthlyPesoSavingsBatt)}/month`,
  ] : [];
  const rotor = useRotator(lines, metricsReady && !open);

  // v3-165 — the bar is mounted only from the Goal screen (screen 3) on, so
  // the pre-goal teaser stage is gone: screen 3 shows the estimated monthly
  // savings line, and the full four-metric rotation starts with the
  // recommendation (screen 4).
  const quick = metricsReady ? rotor.text
    : `Est. savings ${fmtPeso(sched.monthlyPesoSavingsBatt)}/month`;

  return (
    <div className={`mfl-returns${open ? ' open' : ''}`}>
      <div className="mfl-grab" onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
           onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(o => !o); }}>
        <div style={{ minWidth: 0 }}>
          <div className="lbl">Investment returns</div>
          <div className={`quick${rotor.fading && metricsReady && !open ? ' fading' : ''}`}>{quick}</div>
        </div>
        <div className="chev">{'\u25B2'}</div>
      </div>
      <div className="mfl-detail">
        <div className="mfl-rt">
          <div className="v">{metricsReady ? `${fmt.pesoCents(cf.lcoe)}/kWh` : '\u2014'}</div>
          <div className="l">Your solar rate &middot; LCOE</div>
          {metricsReady && (
            <div className="c">vs {'\u20B1'}{Number.isFinite(rate) ? rate.toFixed(2) : '\u2014'}/kWh from the grid</div>
          )}
        </div>
        <div className="mfl-rt">
          <div className="v">{metricsReady && cf.irr != null ? fmt.pct(cf.irr, 1) : '\u2014'}</div>
          <div className="l">Annual return &middot; IRR</div>
          {metricsReady && <div className="c">vs ~3&ndash;6% on a bank time deposit</div>}
        </div>
        <div className="mfl-rt">
          <div className="v">{fmtPeso(sched.monthlyPesoSavingsBatt)}</div>
          <div className="l">Savings / month</div>
        </div>
        <div className="mfl-rt">
          <div className="v">{metricsReady ? fmtPeso(cf.totalDuSavings) : '\u2014'}</div>
          <div className="l">{irrYears}-year savings</div>
        </div>
        {/* v3-181 — same control and the same bounds as desktop Step 4, so a
            customer who sets a rate on one surface sees the other agree. The
            46px targets are a touch minimum, not a style choice. */}
        <div className="mfl-rt mfl-dustep">
          <div className="l" style={{ marginBottom: 9 }}>Assumed annual DU rate increase</div>
          <div className="mfl-dusrow">
            <div className="mfl-dushint">
              0.25% steps &middot; up to 10.00%.<br />Does not change LCOE.
            </div>
            <div className="mfl-dusctl">
              <button type="button" aria-label="Decrease assumed annual DU rate increase by 0.25%"
                      disabled={duBp <= DU_MIN_BP}
                      onClick={() => setDu(duBp - DU_STEP_BP)}>&minus;</button>
              <div className="mfl-dusval"
                   role="spinbutton"
                   aria-valuemin={DU_MIN_BP / 100} aria-valuemax={DU_MAX_BP / 100}
                   aria-valuenow={duBp / 100}
                   aria-valuetext={`${(duBp / 100).toFixed(2)} percent`}
                   aria-label="Assumed annual DU rate increase">
                {(duBp / 100).toFixed(2)}%
              </div>
              <button type="button" aria-label="Increase assumed annual DU rate increase by 0.25%"
                      disabled={duBp >= DU_MAX_BP}
                      onClick={() => setDu(duBp + DU_STEP_BP)}>+</button>
            </div>
          </div>
        </div>
        <button className="mfl-whatbtn" type="button"
                onClick={() => setShowExplain(s => !s)}>
          What do these mean? {'\u25BE'}
        </button>
        {showExplain && (
          <div className="mfl-explain">
            <p><b>LCOE &mdash; your price per kWh, from solar.</b> Take everything the
              system costs and divide it by every kWh it will produce over its
              service life. That&rsquo;s the rate you&rsquo;re really paying for solar
              power &mdash; compare it directly to the {'\u20B1'}/kWh on your utility bill.</p>
            <p><b>IRR &mdash; your money&rsquo;s yearly return.</b> Treat the system like
              an investment: you pay once, and it pays you back every month in
              bill savings. The IRR is the equivalent yearly interest rate &mdash;
              compare it to what a bank time deposit pays.</p>
          </div>
        )}
        <div className="mfl-note">
          Estimates based on your inputs, current rates, and our standard
          assumptions on panel degradation and maintenance. Your final proposal
          restates these figures.
        </div>
      </div>
    </div>
  );
}

// ─── Per-mode quote estimates for the Goal screen (v3-169) ───────────────────
// Runs the SAME pipeline App.jsx's model memo uses — optimizeSystem →
// package resolution → buildPackageLineItems → computePaymentTerms — once per
// objective, so the three cards can show real prices for the customer's
// current inputs. The simplifications below are safe ONLY because mobile
// state guarantees no overrides (panelCount/batteryKwh/batteryPackageId all
// null, no inverter picks): every branch App takes for overrides collapses
// to the recommendation path mirrored here. The SELECTED card is displayed
// from `model` directly (guaranteed equal to the Investment screen); this
// helper prices the two unselected alternatives.
function quoteForMode(mode, state, adminParams) {
  const phase = state.phase === 3 ? 'three' : 'single';
  const inputs = { ...state, phase, deviceLibrary: DEVICES,
                   optimizationMode: mode };
  const recommended = computeRecommendedPanels(inputs, adminParams);
  // Effective conservative flag — same two lines as App.jsx (v3-136): the
  // checkbox is hidden on mobile but the 100%-target Variant-B lock still
  // applies underneath.
  const hasSub7 = (state.deviceRows || []).some(r =>
    r && r.deviceName && r.count && r.onTime != null && r.offTime != null
      && (r.daysPerWeek || 0) >= 1 && (r.daysPerWeek || 0) < 7);
  const conservative = hasSub7 && ((state.desiredSavingsPct || 0) >= 1 - 1e-9
    || !!state.conservativeSizing);
  const sweep = optimizeSystem(mode, inputs, adminParams, recommended,
                               { conservative });
  const panelCount = sweep.panelCount;
  const systemKwp = panelCount * recommended.panelWatts / 1000;
  const recInv = recommendInverters(systemKwp, phase);
  const anyBatt = availableBatteryPackages(adminParams).length > 0;
  const pkgObj = sweep.batteryPackage
    || optimizeBatteryPackage(adminParams, 0, panelCount > 0);
  const batteryKwh = anyBatt ? sweep.batteryKwh : 0;
  const fullState = { ...inputs, panelCount, selectedInverters: recInv,
                      batteryKwh, batteryPackageId: pkgObj.id };
  const pkg = buildPackageLineItems(fullState, adminParams, null);
  const terms = computePaymentTerms(fullState, adminParams, pkg);
  return { panelCount, batteryKwh, netDirectPrice: terms.netDirectPrice };
}

const roundTo100 = (v) => Math.round(v / 100) * 100;

// ─── Screen bodies ───────────────────────────────────────────────────────────

function WelcomeScreen({ onStart }) {
  const rotor = useRotator(TAGLINES, true);
  return (
    <div className="mfl-screen mfl-welcome">
      <img className="mfl-biglogo" src="/logo-full-transparent-v1.png"
           alt="Solviva — An AboitizPower Company" />
      <img className="mfl-heroimg" src="/mobile-hero-v1.jpg"
           alt="Rooftop solar installation" />
      <h1><span className={rotor.fading ? 'fading' : ''}>{rotor.text}</span></h1>
      <p className="mfl-sub">A solar &amp; battery system sized for your home &mdash;
        with real prices and monthly payments.</p>
      <p className="mfl-kicker" style={{ textAlign: 'center' }}>6 quick steps &middot; about 2 minutes</p>
      <div className="mfl-nav">
        <button className="mfl-btn primary" type="button" onClick={onStart}>
          Start my estimate
        </button>
      </div>
      <div className="mfl-invite">{DESKTOP_INVITE}</div>
    </div>
  );
}

function BillScreen({ state, updateState, go }) {
  const kwh = (state.monthlyBill > 0 && state.utilityRate > 0)
    ? state.monthlyBill / state.utilityRate : 0;
  return (
    <div className="mfl-screen">
      <p className="mfl-kicker">Step 1 of 6 &middot; Your electric bill</p>
      <h1>What do you pay for electricity each month?</h1>
      <p className="mfl-sub">Your average monthly bill tells us how much energy your home uses.</p>
      <div className="mfl-card">
        <FieldLabel text="Average monthly bill" infoTitle="Your monthly bill"
                    info={CHARGES_INFO} />
        <MoneyInput value={state.monthlyBill}
                    onChange={v => updateState({ monthlyBill: v })} />
        <FieldLabel text="Your rate per kWh" infoTitle="Finding your rate"
                    info={RATE_INFO} style={{ marginTop: 16 }} />
        <MoneyInput value={state.utilityRate} decimals={2}
                    onChange={v => updateState({ utilityRate: v })} />
        <p className="mfl-hint">We&rsquo;ve pre-filled a typical residential rate. Your
          exact rate is on your bill &mdash; but the estimate works fine without it.</p>
        <div className="mfl-derived">{'\u26A1'} &asymp; {Math.round(kwh).toLocaleString('en-PH')} kWh&nbsp;per month</div>
        <FieldLabel text="Your electric service" infoTitle="Service type"
                    info={SERVICE_TYPE_INFO} style={{ marginTop: 16 }} />
        <div className="mfl-seg" role="radiogroup" aria-label="Service type">
          {[{ v: 1, l: 'Single-phase' }, { v: 3, l: '3-phase' }].map(o => (
            <button key={o.v} type="button" role="radio"
                    aria-checked={state.phase === o.v}
                    className={state.phase === o.v ? 'sel' : ''}
                    onClick={() => updateState({ phase: o.v })}>{o.l}</button>
          ))}
        </div>
        <p className="mfl-hint">Most homes are single-phase. If you&rsquo;re not sure,
          leave this as is &mdash; tap the {'\u24D8'} for how to check.</p>
      </div>
      <div className="mfl-nav">
        <button className="mfl-btn ghost" type="button" onClick={() => go(0)}>{'\u2190'}</button>
        <button className="mfl-btn primary" type="button" onClick={() => go(2)}>Continue</button>
      </div>
    </div>
  );
}

function AppliancesScreen({ state, updateState, go }) {
  const rows = state.deviceRows;
  const timeOptions = [
    { value: '', label: '\u2014' },
    ...Array.from({ length: 24 }, (_, h) => ({
      value: String(h / 24), label: formatHour12(h),
    })),
  ];
  const dayOptions = [
    { value: '', label: '\u2014' },
    ...Array.from({ length: 7 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  ];
  const setRow = (i, patch) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    updateState({ deviceRows: next });
  };
  const addDevice = (name) => {
    const emptyIdx = rows.findIndex(r => r.deviceName == null);
    const fresh = { deviceName: name, count: 1, onTime: null, offTime: null, daysPerWeek: null };
    if (emptyIdx >= 0) {
      setRow(emptyIdx, fresh);
    } else {
      updateState({ deviceRows: [...rows, fresh] });
    }
  };
  const removeRow = (i) => {
    let next = rows.filter((_, j) => j !== i);
    // Preserve the desktop's 2-row minimum shape with empty rows.
    while (next.length < 2) {
      next = [...next, { deviceName: null, count: 1, onTime: null, offTime: null, daysPerWeek: null }];
    }
    updateState({ deviceRows: next });
  };
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.deviceName != null);
  return (
    <div className="mfl-screen">
      <p className="mfl-kicker">Step 2 of 6 &middot; Your appliances</p>
      <h1>What are your biggest power users?</h1>
      <p className="mfl-sub">Their schedules tell us <b>when</b> your home uses energy &mdash;
        daytime runs straight off the sun; nighttime needs battery.</p>
      <div className="mfl-card">
        <FieldLabel text="Tap to add" infoTitle="Why appliances matter"
                    info={MAJOR_DEVICES_INFO} />
        <div className="mfl-chips">
          {DEVICES.map(d => (
            <button key={d.name} className="mfl-chip" type="button"
                    onClick={() => addDevice(d.name)}>+ {d.name}</button>
          ))}
        </div>
        {visible.length === 0 && (
          <p className="mfl-hint" style={{ marginTop: 12 }}>
            No appliances added yet &mdash; that&rsquo;s okay. Your bill alone gives us a
            good estimate; appliances make the day-and-night split more accurate.
          </p>
        )}
        {visible.map(({ r, i }) => (
          <div className="mfl-approw" key={i}>
            <div className="mfl-approw-top">
              <span className="mfl-approw-name">{r.deviceName}</span>
              <span className="mfl-stepper">
                <button type="button" onClick={() => setRow(i, { count: Math.max(1, (r.count || 1) - 1) })}>{'\u2212'}</button>
                <span>{r.count || 1}</span>
                <button type="button" onClick={() => setRow(i, { count: (r.count || 1) + 1 })}>+</button>
              </span>
            </div>
            <div className="mfl-sched">
              <div>
                <label>On at</label>
                <select value={r.onTime == null ? '' : String(r.onTime)}
                        onChange={e => setRow(i, { onTime: e.target.value === '' ? null : Number(e.target.value) })}>
                  {timeOptions.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label>Off at</label>
                <select value={r.offTime == null ? '' : String(r.offTime)}
                        onChange={e => setRow(i, { offTime: e.target.value === '' ? null : Number(e.target.value) })}>
                  {timeOptions.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label>Days/week</label>
                <select value={r.daysPerWeek == null ? '' : String(r.daysPerWeek)}
                        onChange={e => setRow(i, { daysPerWeek: e.target.value === '' ? null : Number(e.target.value) })}>
                  {dayOptions.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <button className="mfl-remove" type="button" onClick={() => removeRow(i)}>Remove</button>
          </div>
        ))}
      </div>
      <div className="mfl-nav">
        <button className="mfl-btn ghost" type="button" onClick={() => go(1)}>{'\u2190'}</button>
        <button className="mfl-btn primary" type="button" onClick={() => go(3)}>Continue</button>
      </div>
    </div>
  );
}

function GoalScreen({ state, updateState, model, adminParams, go }) {
  // v3-169 — price all three objectives at the current inputs. The selected
  // mode reads from `model` (Investment-screen parity to the centavo); the
  // other two run the mirrored pipeline. Memoized on the exact inputs that
  // move a quote; skipped entirely when panels are out of stock for the
  // phase (the Recommendation screen's notice owns that story).
  const modeQuotes = useMemo(() => {
    if (model.panelsAvailable === false) return null;
    const out = {};
    for (const m of ['panels', 'battery', 'cost']) {
      out[m] = m === state.optimizationMode
        ? { panelCount: model.panelCount, batteryKwh: model.batteryKwh,
            netDirectPrice: model.terms.netDirectPrice }
        : quoteForMode(m, state, adminParams);
    }
    const cheapest = Math.min(...Object.values(out).map(q => q.netDirectPrice));
    for (const m of Object.keys(out)) {
      out[m].delta = out[m].netDirectPrice - cheapest;
      out[m].isCheapest = out[m].netDirectPrice - cheapest < 0.005;
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.monthlyBill, state.utilityRate, state.deviceRows,
      state.desiredSavingsPct, state.phase, state.conservativeSizing,
      state.optimizationMode, model, adminParams]);
  const pct = Math.round((state.desiredSavingsPct ?? 0.5) * 100);
  const est = (state.monthlyBill || 0) * (state.desiredSavingsPct ?? 0.5);
  const objectives = [
    // v3-168 — title matches desktop 2A (v3-126); description is Pat's exact
    // wording. Engine-accurate: mode 'panels' sizes the battery to store all
    // excess solar (v3-130), i.e. "enough batteries to minimize solar energy
    // wasted".
    { id: 'panels', icon: '\u2600\uFE0F', t: 'Fewest panels, least solar wasted',
      d: 'The standard recommendation \u2014 the fewest panels that reach your savings goal with enough batteries to minimize solar energy wasted. Best for most homes.' },
    { id: 'battery', icon: '\uD83D\uDD0B', t: 'Smaller battery',
      d: 'Shifts more of the work to panels so you buy less battery. Good if your home is busiest in the daytime.' },
    { id: 'cost', icon: '\uD83D\uDCB0', t: 'Lowest price',
      d: 'We search every panel-and-battery combination and pick the cheapest one that still hits your goal \u2014 even if some extra solar goes unused.' },
  ];
  const opt = model.optimization;
  const showShortfall = opt && opt.feasible === false && opt.achievedPct != null;
  return (
    <div className="mfl-screen">
      <p className="mfl-kicker">Step 3 of 6 &middot; Your goal</p>
      <h1>How much of your bill do you want to erase?</h1>
      <div className="mfl-card">
        <FieldLabel text="Your savings goal" infoTitle="Your savings goal"
                    info={
          <p>We size your system to a <b>savings goal</b> &mdash; the share of your
            monthly bill that solar takes over. Reaching 100% is possible for many
            homes, but the last stretch usually needs extra battery capacity, so
            most customers start at 50&ndash;70% and expand later. Whatever you pick,
            the recommendation updates instantly.</p>
        } />
        <div className="mfl-sliderval">{pct}%<small> &middot; about {fmtPeso(est)}/month</small></div>
        <input type="range" min={20} max={100} step={5} value={pct}
               onChange={e => updateState({ desiredSavingsPct: Number(e.target.value) / 100 })} />
        <p className="mfl-hint">Most customers start at 50&ndash;70%. You can always add panels later.</p>
      </div>
      {showShortfall && (
        <div className="mfl-notice">
          With this preference, the closest achievable savings at your target is
          about <b>{Math.round(opt.achievedPct * 100)}%</b>. We&rsquo;ll size to that
          &mdash; or try the &ldquo;Fewest panels, least solar wasted&rdquo; option for the full target.
        </div>
      )}
      <label className="mfl-field" style={{ margin: '4px 0 10px' }}>What matters most to you?</label>
      {objectives.map(o => (
        <div key={o.id}
             className={`mfl-obj${state.optimizationMode === o.id ? ' sel' : ''}`}
             onClick={() => updateState({ optimizationMode: o.id })}
             role="button" tabIndex={0}
             onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') updateState({ optimizationMode: o.id }); }}>
          <div className="mfl-tick">{'\u2713'}</div>
          <div className="mfl-obj-t">{o.icon} {o.t}</div>
          <div className="mfl-obj-d">{o.d}</div>
          {modeQuotes && modeQuotes[o.id] && (
            <div className="mfl-obj-price">
              <b>{'\u2248'} {fmtPeso(roundTo100(modeQuotes[o.id].netDirectPrice))}</b>
              <span>{modeQuotes[o.id].panelCount} panels &middot; {
                modeQuotes[o.id].batteryKwh > 0
                  ? `${modeQuotes[o.id].batteryKwh} kWh battery`
                  : 'no battery'}</span>
              {modeQuotes[o.id].isCheapest
                ? <span className="mfl-obj-cheapest">cheapest</span>
                : <span className="mfl-obj-delta">+{fmtPeso(roundTo100(modeQuotes[o.id].delta))}</span>}
            </div>
          )}
        </div>
      ))}
      {modeQuotes && (
        <p className="mfl-hint" style={{ margin: '2px 0 10px' }}>
          Prices refine as you answer the next steps.
        </p>
      )}
      <div className="mfl-nav">
        <button className="mfl-btn ghost" type="button" onClick={() => go(2)}>{'\u2190'}</button>
        <button className="mfl-btn primary" type="button" onClick={() => go(4)}>See my system</button>
      </div>
    </div>
  );
}

function RecommendationScreen({ state, model, adminParams, go }) {
  const sched = model.schedule;
  const monthlyGen = model.systemKwp * (adminParams.kWhPerKwpPerDay || 0) * 365 / 12;
  // Bill-covered % — the model's achieved savings against the customer's bill.
  const coveredPct = state.monthlyBill > 0
    ? Math.min(1, sched.monthlyPesoSavingsBatt / state.monthlyBill) : 0;
  // Day/night savings split — direct solar vs battery discharge shares.
  const used = (sched.totals.solarUsed || 0) + (sched.totals.battUsed || 0);
  const dayShare = used > 0 ? (sched.totals.solarUsed / used) : 1;
  const hasBattery = (model.batteryKwh || 0) > 0;
  return (
    <div className="mfl-screen">
      <p className="mfl-kicker">Step 4 of 6 &middot; Our recommendation</p>
      <h1>Your home, powered by the sun</h1>
      {model.panelsAvailable === false && (
        <div className="mfl-notice">
          <b>Solar panels are temporarily out of stock</b> for{' '}
          {state.phase === 3 ? '3-phase' : 'single-phase'} systems, so we can&rsquo;t
          size a solar array right now. Leave your details at the end and we&rsquo;ll
          contact you as soon as stock arrives.
        </div>
      )}
      <div className="mfl-card">
        <div className="mfl-heronum">{model.panelCount} <small>solar panel{model.panelCount === 1 ? '' : 's'}</small></div>
        <div className="mfl-specs">
          <div className="mfl-spec">
            <div className="v">{model.systemKwp.toFixed(2)} kWp</div>
            <div className="l">System size{' '}
              <Info title="System size (kWp)">
                <p><b>Kilowatt-peak</b> is the system&rsquo;s maximum output under full
                  sun &mdash; the standard way solar systems are sized. More kWp means
                  more energy produced every day.</p>
              </Info>
            </div>
          </div>
          <div className="mfl-spec">
            <div className="v">{hasBattery ? `${model.batteryKwh} kWh` : 'None needed'}</div>
            <div className="l">Battery storage{' '}
              <Info title="Battery storage (kWh)">
                <p><b>Kilowatt-hours of storage</b> &mdash; energy your panels bank
                  during the day so your home keeps running on solar after sunset,
                  instead of switching back to the grid.</p>
              </Info>
            </div>
          </div>
          <div className="mfl-spec"><div className="v">~{Math.round(monthlyGen).toLocaleString('en-PH')} kWh</div><div className="l">Monthly generation</div></div>
          <div className="mfl-spec"><div className="v">{Math.round(coveredPct * 100)}%</div><div className="l">Bill covered</div></div>
        </div>
        {hasBattery && (
          <div style={{ marginTop: 16 }}>
            <label className="mfl-field">Where your savings come from</label>
            <div className="mfl-bar">
              <b style={{ width: `${Math.round(dayShare * 100)}%` }} />
              <i style={{ width: `${100 - Math.round(dayShare * 100)}%` }} />
            </div>
            <div className="mfl-legend">
              <span><span className="mfl-dotg" />Direct from panels &middot; day</span>
              <span><span className="mfl-dotb" />From battery &middot; night</span>
            </div>
          </div>
        )}
        <p className="mfl-hint" style={{ marginTop: 14 }}>
          Sized from your bill, your appliances, and your
          {' '}{Math.round((state.desiredSavingsPct ?? 0.5) * 100)}% goal. Change anything in the
          previous steps and this updates.
        </p>
      </div>
      <div className="mfl-nav">
        <button className="mfl-btn ghost" type="button" onClick={() => go(3)}>{'\u2190'}</button>
        <button className="mfl-btn primary" type="button" onClick={() => go(5)}>Looks good &mdash; price it</button>
      </div>
    </div>
  );
}

function YourHomeScreen({ state, updateState, model, adminParams, go }) {
  const roofs = [
    { id: 'metal', icon: '\uD83C\uDFE0', t: 'Metal / GI sheet',
      d: 'The most common roof in the Philippines. No prep work \u2014 no additional charge.' },
    // v3-171 — no prices on this screen (user decision; the boot-derived
    // figures could contradict the quote-margin prices in the totals).
    { id: 'asphalt', icon: '\uD83E\uDDF1', t: 'Asphalt / Shingles / Tiled',
      d: 'Requires additional mounting prep, included in your package price.' },
    { id: 'concrete', icon: '\uD83C\uDFE2', t: 'Concrete',
      d: 'Requires the most prep work, included in your package price.' },
  ];
  const dynamicLocs = availableDeliveryLocations(adminParams);
  const isLuzon = state.location === 'luzon';
  const region = LUZON_REGIONS.find(r => r.code === state.locationRegion) || LUZON_REGIONS[0];
  const cities = region.cities;
  const city = cities.find(c => c.name === state.locationCity) || cities[0];
  const km = city ? city.km : 0;
  // v3-199 — the free radius is the luzonFreeTravelKm param (config constant
  // is the fallback only).
  const freeKm = adminParams.luzonFreeTravelKm ?? LUZON_FREE_TRAVEL_KM;
  const beyondFreeKm = km > freeKm;   // v3-171 — wording only; no price shown
  const dynRow = (!isLuzon && state.location !== 'other')
    ? (adminParams.deliveryLocations || []).find(l => l.id === state.location)
    : null;
  return (
    <div className="mfl-screen">
      <p className="mfl-kicker">Step 5 of 6 &middot; Your home</p>
      <h1>A little about your house</h1>
      <div className="mfl-h2">What&rsquo;s your roof made of?</div>
      {roofs.map(r => (
        <div key={r.id}
             className={`mfl-roof${state.roofMaterial === r.id ? ' sel' : ''}`}
             onClick={() => updateState({ roofMaterial: r.id })}
             role="button" tabIndex={0}
             onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') updateState({ roofMaterial: r.id }); }}>
          <div className="ic">{r.icon}</div>
          <div>
            <div className="t">{r.t}</div>
            <div className="d">{r.d}</div>
          </div>
        </div>
      ))}
      <div className="mfl-h2">Where will we install?</div>
      <div className="mfl-card">
        <label className="mfl-field">Installation location</label>
        <select className="mfl-select" value={state.location}
                onChange={e => updateState({ location: e.target.value })}>
          <option value="luzon">Luzon main island</option>
          {dynamicLocs.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          <option value="other">Other</option>
        </select>
        {isLuzon && (
          <>
            <label className="mfl-field" style={{ marginTop: 14 }}>Region</label>
            <select className="mfl-select" value={region.code}
                    onChange={e => {
                      const r = LUZON_REGIONS.find(x => x.code === e.target.value) || LUZON_REGIONS[0];
                      const first = r.cities[0];
                      updateState({ locationRegion: r.code, locationCity: first.name, locationKm: first.km });
                    }}>
              {LUZON_REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
            <label className="mfl-field" style={{ marginTop: 14 }}>City / municipality</label>
            <select className="mfl-select" value={city ? city.name : ''}
                    onChange={e => {
                      const c = cities.find(x => x.name === e.target.value) || cities[0];
                      updateState({ locationCity: c.name, locationKm: c.km });
                    }}>
              {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            {!beyondFreeKm ? (
              <div className="mfl-derived" style={{ marginTop: 14 }}>
                {'\uD83D\uDE9A'} {city ? city.name : '\u2014'} &mdash; delivery included
              </div>
            ) : (
              <p className="mfl-hint" style={{ marginTop: 12 }}>
                {city.name} &mdash; approx. {km} km from our Para&ntilde;aque logistics hub.
                A delivery charge for the distance beyond {freeKm} km is
                already <b>included in your price</b>.
              </p>
            )}
          </>
        )}
        {dynRow && (
          <p className="mfl-hint" style={{ marginTop: 12 }}>
            {dynRow.label} delivery is already <b>included in your price</b>.
          </p>
        )}
        {state.location === 'other' && (
          <p className="mfl-hint" style={{ marginTop: 12 }}>
            Additional delivery and location charges may apply in certain areas.
            Our team will confirm the exact figure with you.
          </p>
        )}
      </div>
      <div className="mfl-nav">
        <button className="mfl-btn ghost" type="button" onClick={() => go(4)}>{'\u2190'}</button>
        <button className="mfl-btn primary" type="button" onClick={() => go(6)}>See my price</button>
      </div>
    </div>
  );
}

function InvestmentScreen({ state, updateState, model, adminParams, go, onProposal }) {
  const terms = model.terms;
  const cf = model.cashFlows;
  const rate = Number(state.utilityRate);
  const irrYears = state.irrYears;

  // DP options — same tier resolution as Step 3 (floor is a property of the
  // quote via netDirectPrice; allowedDpOptions gives the 5%-grid choices).
  const minDpPct = resolveMinDpPct(adminParams.minDpTiers, terms.netDirectPrice);
  const dpOptions = allowedDpOptions(minDpPct);
  const maxTenor = adminParams.maxTenorMonths || 60;
  const tenorOptions = MOBILE_TENORS.filter(t => t <= maxTenor);

  // Clamp effect — mirrors Step3PaymentTerms' snap: restored/live quotes are
  // pulled into the allowed ranges once params or price move the floor.
  useEffect(() => {
    const patch = {};
    if (state.downPaymentPct < minDpPct - DP_EPS) patch.downPaymentPct = dpOptions[0];
    if (state.tenor > maxTenor) patch.tenor = tenorOptions[tenorOptions.length - 1];
    if (Object.keys(patch).length > 0) updateState(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.downPaymentPct, state.tenor, minDpPct, maxTenor]);

  // v3-182 — the SAME bounds/clamp the sheet and desktop Step 4 use, so a
  // customer adjusting the rate here, in the sheet, or on desktop always sees
  // the other surfaces agree.
  const duBp6 = clampDuRateBp(Math.round((cf.duRateInflation || 0) * 10000));
  const setDu6 = (nextBp) => updateState({ duRateInflation: clampDuRateBp(nextBp) / 10000 });

  const dpIdx = Math.max(0, dpOptions.findIndex(p => Math.abs(p - state.downPaymentPct) < DP_EPS));
  const isDirect = terms.isDirectPurchase;
  return (
    <div className="mfl-screen">
      <p className="mfl-kicker">Step 6 of 6 &middot; Your investment</p>
      <div className="mfl-pricehero">
        <div className="l">Total system price</div>
        <div className="p">{fmtPeso(terms.netDirectPrice)}</div>
      </div>
      <div className="mfl-card">
        <div className="mfl-fieldrow">
          <label className="mfl-field">Choose your down payment</label>
          <Info title="Down payment">
            <p>The amount due when you <b>sign your contract</b>. The rest is either
              paid in full upon installation (Direct Purchase) or spread over the
              monthly term you choose below.</p>
          </Info>
        </div>
        <div className="mfl-sliderval" style={{ fontSize: 34 }}>
          {Number((state.downPaymentPct * 100).toFixed(1))}%
          <small> &middot; {fmtPeso(terms.dpTotalCharge)} at signing</small>
        </div>
        <input type="range" min={0} max={Math.max(0, dpOptions.length - 1)} step={1}
               value={dpIdx}
               onChange={e => updateState({ downPaymentPct: dpOptions[Number(e.target.value)] })} />
        <div className="mfl-range-ends">
          <span>{Number((minDpPct * 100).toFixed(1))}% min</span>
          <span>100%</span>
        </div>
        <label className="mfl-field" style={{ marginTop: 16 }}>Choose your payment term</label>
        <div className="mfl-tenors">
          {tenorOptions.map(t => (
            <button key={t} type="button"
                    className={`mfl-tenor${state.tenor === t ? ' sel' : ''}`}
                    onClick={() => updateState({ tenor: t })}>
              {t === 0 ? 'Direct' : `${t} mo`}
              <small>{t === 0 ? 'pay on install' : t < 12 ? 'months' : `${t / 12} year${t === 12 ? '' : 's'}`}</small>
            </button>
          ))}
        </div>
      </div>
      {!isDirect && !terms.isFullyPaid && (
        <div className="mfl-monthly">
          <div className="v">{fmtPeso(terms.customerMonthlyPmt)}</div>
          <div className="l">Monthly payment</div>
        </div>
      )}
      <div className="mfl-card">
        <div className="mfl-payline"><span>Down payment at signing</span><b>{fmtPeso(terms.dpTotalCharge)}</b></div>
        {isDirect || terms.isFullyPaid ? (
          <div className="mfl-payline"><span>Balance on installation</span><b>{fmtPeso(terms.finalPostInstallBalance)}</b></div>
        ) : (
          <>
            <div className="mfl-payline"><span>{state.tenor} monthly payment{state.tenor === 1 ? '' : 's'} of</span><b>{fmtPeso(terms.customerMonthlyPmt)}</b></div>
            {terms.dst > 0 && (
              <div className="mfl-payline">
                <span>Documentary stamp tax at signing{' '}
                  <Info title="Documentary Stamp Tax">
                    <p><b>Documentary Stamp Tax (DST)</b> is a government tax on
                      financing documents required by law, computed on the amount
                      financed. It is collected separately at contract signing and
                      is not part of your financed balance.</p>
                  </Info>
                </span>
                <b>{fmtPeso(terms.dst)}</b>
              </div>
            )}
            {/* v3-177 — "Total amount due over the term" removed (user-directed).
                The mobile flow is purely public with no password path, so
                unlike the Summary tab there is nothing to gate: the line is
                simply gone. The Direct-Purchase branch above never carried a
                total and is untouched. */}
          </>
        )}
        <p className="mfl-hint" style={{ marginTop: 10 }}>
          {isDirect
            ? 'Direct Purchase is interest-free: your down payment at contract signing, and the balance in full upon installation.'
            : 'Your full proposal restates every figure, including the payment schedule and disclosure statement.'}
        </p>
      </div>
      {/* v3-192 — payoff graphic, above the metric set. Screen 6 is the last
          screen before the proposal request and the only mobile surface where
          the payment terms and the returns are both already in view. */}
      <MobilePayoff state={state} model={model} adminParams={adminParams} />

      {/* v3-182 — every investment-return metric, stated on the last screen
          before the proposal request (Pat). The sticky sheet remains a
          dismissible summary; this is the full set, including payback, which
          the sheet's four tiles never showed. */}
      <div className="mfl-card">
        <label className="mfl-field">Your investment returns</label>
        <div className="mfl-m6">
          <div className="t">
            <div className="v">{cf.paybackLabel || '\u2014'}</div>
            <div className="l">Simple payback period</div>
          </div>
          <div className="t">
            <div className="v">{cf.irr != null ? fmt.pct(cf.irr, 1) : '\u2014'}</div>
            <div className="l">Internal rate of return</div>
            <div className="c">Over {irrYears} years</div>
          </div>
          <div className="t">
            <div className="v">{fmt.pesoCents(cf.lcoe)}/kWh</div>
            <div className="l">Levelized cost of energy</div>
            <div className="c">
              vs {'\u20B1'}{Number.isFinite(rate) ? rate.toFixed(2) : '\u2014'}/kWh from the grid
            </div>
          </div>
          <div className="t">
            <div className="v">{fmtPeso(model.schedule.monthlyPesoSavingsBatt)}</div>
            <div className="l">
              Estimated savings per month{' '}
              {/* v3-201 — mobile parity with the desktop tooltip (D2, Pat).
                  Single-sourced from DISCLAIMERS.monthlySavingsNote — the same
                  entry the desktop tile renders — so the two surfaces cannot
                  drift. This is the metrics grid's first Info; the other
                  tiles' desktop tooltips remain desktop-only for now. */}
              <Info title="Estimated savings per month">
                <p>
                  <b>{DISCLAIMERS.monthlySavingsNote.term}</b>
                  {DISCLAIMERS.monthlySavingsNote.rest}
                </p>
              </Info>
            </div>
            <div className="c">At today&rsquo;s DU rate</div>
          </div>
          <div className="t wide">
            <div className="v">{fmtPeso(cf.totalDuSavings)}</div>
            <div className="l">Total distribution utility savings</div>
            <div className="c">Over {irrYears} years</div>
          </div>
          <div className="mfl-m6step">
            <div className="l" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em',
                                        textTransform: 'uppercase', color: 'var(--g6)' }}>
              Assumed annual DU rate increase
            </div>
            <div className="mfl-m6srow">
              <div className="mfl-m6shint">
                0.25% steps &middot; up to 10.00%.<br />Does not change LCOE.
              </div>
              <div className="mfl-dusctl">
                <button type="button" aria-label="Decrease assumed annual DU rate increase by 0.25%"
                        disabled={duBp6 <= DU_MIN_BP}
                        onClick={() => setDu6(duBp6 - DU_STEP_BP)}>&minus;</button>
                <div className="mfl-dusval"
                     role="spinbutton"
                     aria-valuemin={DU_MIN_BP / 100} aria-valuemax={DU_MAX_BP / 100}
                     aria-valuenow={duBp6 / 100}
                     aria-valuetext={`${(duBp6 / 100).toFixed(2)} percent`}
                     aria-label="Assumed annual DU rate increase">
                  {(duBp6 / 100).toFixed(2)}%
                </div>
                <button type="button" aria-label="Increase assumed annual DU rate increase by 0.25%"
                        disabled={duBp6 >= DU_MAX_BP}
                        onClick={() => setDu6(duBp6 + DU_STEP_BP)}>+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mfl-card">
        <label className="mfl-field">Understanding your returns</label>
        <div className="mfl-exrow">
          <div className="mfl-exhead">
            <span className="mfl-exv">{fmt.pesoCents(cf.lcoe)}/kWh</span>
            <span className="mfl-exl">Your solar rate (LCOE)</span>
          </div>
          <p className="mfl-exd">Everything the system costs, divided by every kWh it
            produces over its service life. It&rsquo;s the true price you pay per kWh of
            solar power &mdash; <b>compare it to the {'\u20B1'}{Number.isFinite(rate) ? rate.toFixed(2) : '\u2014'}/kWh
            you pay the grid today</b>.</p>
        </div>
        <div className="mfl-exrow">
          <div className="mfl-exhead">
            <span className="mfl-exv">{cf.irr != null ? fmt.pct(cf.irr, 1) : '\u2014'}</span>
            <span className="mfl-exl">Annual return (IRR)</span>
          </div>
          <p className="mfl-exd">Think of the system as an investment: you pay once,
            and it pays you back in bill savings every month for {irrYears} years. The
            IRR is the equivalent yearly interest rate on that money &mdash;
            <b> compare it to the ~3&ndash;6% a bank time deposit pays</b>.</p>
        </div>
      </div>
      {/* v3-166 — promo note (Pat-approved option B), the last read before
          the CTA it points at. */}
      <div className="mfl-invite" style={{ margin: '0 0 14px' }}>
        {'\uD83C\uDF81'} Discounts and promos may apply &mdash; request your free
        proposal below and your Solviva Representative will walk you through
        what&rsquo;s available.
      </div>
      <div className="mfl-nav">
        <button className="mfl-btn ghost" type="button" onClick={() => go(5)}>{'\u2190'}</button>
        <button className="mfl-btn primary" type="button" onClick={onProposal}>
          Get my free proposal {'\u2192'}
        </button>
      </div>
    </div>
  );
}

function LeadScreen({ state, model, adminParams, contact, setContact, go, onSent }) {
  const [draft, setDraft] = useState({
    name: contact.name || '', email: contact.email || '',
    mobile: contact.mobile || '', installAddress: contact.installAddress || '',
  });
  const [consent, setConsent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [ref, setRef] = useState('');
  const err = {
    name: !draft.name.trim(),
    email: !validEmail(draft.email),
    mobile: !isValidPhPhone(draft.mobile),
    installAddress: !draft.installAddress.trim(),
  };
  const canSend = !err.name && !err.email && !err.mobile && !err.installAddress && consent;
  const send = async () => {
    if (!canSend) { setShowErrors(true); return; }
    setContact(draft);
    setStatus('sending');
    try {
      const now = new Date();
      const reference = makeLeadRef(now, draft);
      const payload = buildLeadPayload({
        state, model, contact: draft,
        submittedAt: now.toISOString(), reference, adminParams,
      });
      await submitLead(payload);
      setRef(reference);
      setStatus('sent');
      if (onSent) onSent();   // v3-164 — locks swipe-nav on the success panel
    } catch (_) {
      setStatus('error');
    }
  };
  if (status === 'sent') {
    return (
      <div className="mfl-screen">
        <div className="mfl-success">
          <div className="big">{'\u2600\uFE0F'}</div>
          <h2>Your proposal is on its way</h2>
          <p>Thanks, {draft.name.split(' ')[0]}! A Solviva Representative will reach out
            shortly with your personalized proposal and answer any questions.</p>
          <div className="ref">Ref: {ref}</div>
          <div className="mfl-invite" style={{ textAlign: 'left' }}>{DESKTOP_INVITE}</div>
        </div>
        <div className="mfl-nav">
          <button className="mfl-btn primary" type="button" onClick={() => go(6)}>Done</button>
        </div>
      </div>
    );
  }
  const inputCls = (bad) => `mfl-input${showErrors && bad ? ' err' : ''}`;
  return (
    <div className="mfl-screen">
      <p className="mfl-kicker">Almost there</p>
      <h1>Where should we send your proposal?</h1>
      <p className="mfl-sub">A Solviva Representative will prepare your full written proposal
        and walk you through it.</p>
      <div className="mfl-card">
        <label className="mfl-field">Full name</label>
        <input className={inputCls(err.name)} value={draft.name}
               onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
        {showErrors && err.name && <span className="mfl-errmsg">Your name is required.</span>}
        <label className="mfl-field" style={{ marginTop: 14 }}>Email</label>
        <input className={inputCls(err.email)} type="email" inputMode="email" value={draft.email}
               onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
        {showErrors && err.email && <span className="mfl-errmsg">A valid email is required.</span>}
        <label className="mfl-field" style={{ marginTop: 14 }}>Mobile number</label>
        <input className={inputCls(err.mobile)} type="tel" inputMode="tel" value={draft.mobile}
               placeholder="09XX XXX XXXX"
               onChange={e => setDraft(d => ({ ...d, mobile: e.target.value }))} />
        {showErrors && err.mobile && <span className="mfl-errmsg">A valid PH mobile number is required.</span>}
        <label className="mfl-field" style={{ marginTop: 14 }}>Installation address</label>
        <input className={inputCls(err.installAddress)} value={draft.installAddress}
               onChange={e => setDraft(d => ({ ...d, installAddress: e.target.value }))} />
        {showErrors && err.installAddress && <span className="mfl-errmsg">The installation address is required.</span>}
        <label className="mfl-consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>{LEAD_CONSENT_TEXT}</span>
        </label>
        {status === 'error' && (
          <div className="mfl-notice" style={{ marginTop: 12 }}>
            Something went wrong sending your details. Please try again.
          </div>
        )}
      </div>
      <div className="mfl-nav">
        <button className="mfl-btn ghost" type="button" onClick={() => go(6)}>{'\u2190'}</button>
        <button className="mfl-btn primary" type="button" onClick={send}
                disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending\u2026' : 'Send my proposal request'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
// v3-160 — the rep sign-in affordance is GONE (user decision): the mobile
// flow is purely for public customers. Reps reach the full UI on a phone via
// a persisted rep session (gating is customer-mode-only) or any ≥640px
// viewport; the welcome invitation already points humans at tablet/desktop.
export default function MobileFlow({
  state, updateState, model, adminParams, contact, setContact,
}) {
  const [screen, setScreen] = useState(0);
  // v3-164 — direction of the last navigation, driving the slide-in
  // animation on the keyed screen wrapper. Applies to BUTTON navigation
  // too, so swipes and taps feel like one system. null on first mount
  // (no animation on initial render).
  const [navDir, setNavDir] = useState(null);
  // v3-164 — set once a lead submits; while the success panel is showing,
  // all swipe navigation is off (the only exit is the Done button). Reset
  // whenever the lead screen is (re-)entered so a fresh form swipes
  // normally again.
  const [leadSent, setLeadSent] = useState(false);
  const go = (n) => {
    setNavDir(n > screen ? 'fwd' : n < screen ? 'back' : null);
    if (n === 7) setLeadSent(false);
    setScreen(n);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  // ── Swipe navigation (v3-164, user-approved scope) ────────────────────────
  // swipe-left = continue, swipe-right = back. Axis-locked: the gesture must
  // travel ≥60px horizontally AND dominate the vertical axis by 1.5× —
  // diagonal scrolls never navigate. Gestures are ignored when they START on
  // a slider/select/input (those are drag controls themselves), inside the
  // returns bar, or inside an open info sheet. Forward swipes stop at the
  // Investment screen — "Get my free proposal" stays a deliberate tap
  // (swiping into a personal-details form is the wrong surprise); the lead
  // form still swipes BACK to Investment. Success panel: no swipes at all.
  const touchRef = useRef(null);
  const SWIPE_MIN_PX = 60;
  const SWIPE_AXIS_RATIO = 1.5;
  const swipeTargets = () => {
    const fwd = screen <= 5 ? screen + 1 : null;               // 6, 7: no fwd
    const back = screen >= 1 && !(screen === 7 && leadSent) ? screen - 1 : null;
    return { fwd, back };
  };
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) { touchRef.current = null; return; }
    const t = e.touches[0];
    const blocked = e.target.closest
      && e.target.closest('input, select, textarea, .mfl-returns, .mfl-scrim');
    touchRef.current = blocked ? null : { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;
    if (Math.abs(dx) < SWIPE_AXIS_RATIO * Math.abs(dy)) return;
    const { fwd, back } = swipeTargets();
    if (dx < 0 && fwd != null) go(fwd);
    else if (dx > 0 && back != null) go(back);
  };
  return (
    <div className="mfl" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
         onTouchCancel={() => { touchRef.current = null; }}>
      <style>{CSS}</style>
      {screen > 0 && (
        <>
          <div className="mfl-header">
            <img src="/logo-full-transparent-v1.png" alt="Solviva" />
          </div>
          <div className="mfl-progress">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} className={
                screen >= 7 ? 'done'
                : i < screen - 1 ? 'done'
                : i === screen - 1 ? 'now' : ''
              } />
            ))}
          </div>
        </>
      )}
      <div key={screen}
           className={navDir === 'fwd' ? 'mfl-anim-fwd' : navDir === 'back' ? 'mfl-anim-back' : undefined}>
      {screen === 0 && <WelcomeScreen onStart={() => go(1)} />}
      {screen === 1 && <BillScreen state={state} updateState={updateState} go={go} />}
      {screen === 2 && <AppliancesScreen state={state} updateState={updateState} go={go} />}
      {screen === 3 && <GoalScreen state={state} updateState={updateState} model={model} adminParams={adminParams} go={go} />}
      {screen === 4 && <RecommendationScreen state={state} model={model} adminParams={adminParams} go={go} />}
      {screen === 5 && <YourHomeScreen state={state} updateState={updateState} model={model} adminParams={adminParams} go={go} />}
      {screen === 6 && <InvestmentScreen state={state} updateState={updateState} model={model} adminParams={adminParams} go={go} onProposal={() => go(7)} />}
      {screen === 7 && <LeadScreen state={state} model={model} adminParams={adminParams} contact={contact} setContact={setContact} go={go} onSent={() => setLeadSent(true)} />}
      </div>
      {/* v3-165 — investment returns appear starting on Step 3 (the savings
          target screen), not before (user decision). */}
      {screen >= 3 && <ReturnsSheet screen={screen} state={state} model={model}
                                    updateState={updateState} />}
    </div>
  );
}
