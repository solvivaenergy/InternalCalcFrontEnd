# src/engine — the sizing and pricing engine

Everything that turns calculator inputs and admin parameters into numbers
lives here, and nothing here may import React, the DOM, Vite (`import.meta.env`),
`fetch`, storage or Supabase. That rule is what lets the same files run in the
browser (the calculator) and in Node (the backend's quote endpoint), so the
website calculator and the sales calculator can never disagree.

| File | What it holds |
| --- | --- |
| `calculations.js` | Excel-mirror formulas: PMT/PV/IRR, consumption, panel recommendation, inverters, cabling, package line items, payment terms |
| `schedule.js` | Hourly curve, battery sizing, `optimizeSystem` sweep, cash flows, payment annex |
| `boq.js`, `payoff.js`, `duInflation.js` | BOQ lines, payoff chart model, DU inflation notes |
| `proposal.js` | `computeProposal(state, generatedDate)` — the whole pipeline in one call (App.jsx's model memo, lifted out) |
| `runtime.js` | `buildRuntime(defaults, overrides)` — pure: bundled defaults + a stored `app_parameters` payload → effective parameters (legacy migrations, COGS back-fill, derived prices). `applyRuntime(rt)` writes one into the live objects. |
| `data/*.js` | Bundled defaults and catalog helpers (`ADMIN_PARAMS`, `PANEL_SETTINGS`, inverter lists, `DEVICES`) |
| `constants.js` | Constants the engine needs that `config.js` used to own |

## The live-mutation pattern

The engine functions read the catalog from the module objects exported by
`data/*.js`. `paramsService.load()` (browser) and `applyRuntime()` (Node) fill
those objects in place after fetching the stored payload, so every function
sees the live values without threading parameters through each call. A change
in the admin screens therefore reaches every quote — and the website — with no
deploy.

## Old import paths

`src/lib/calculations.js`, `src/lib/schedule.js`, … and `src/data/*.js` are
re-export shims left in place when the files moved here (2026-09-27), so UI
imports did not have to change in the same commit. New code imports from
`src/engine/` directly.

## Changing anything here

The move was verified with a parity harness that ran 46 scenarios × 3
parameter sets through the old and new code and required byte-identical
output. Keep that bar: a change to a formula is a product decision that
should show up as a deliberate diff in the numbers, never as a side effect of
a refactor.
