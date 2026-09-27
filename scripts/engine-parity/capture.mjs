// Capture the engine's output for the scenario battery, so two versions of
// the engine can be compared byte for byte (compare.mjs).
//
//   node scripts/engine-parity/capture.mjs <checkout-dir> <params.json> [out.json]
//
// <checkout-dir>  a checkout of this repo (or of the engine package) that has
//                 src/engine/ — the working tree, or `git archive <sha> src
//                 package.json | tar -x -C <dir>` for an older commit
// <params.json>   an app_parameters payload: fetch-params.mjs, or the row's
//                 `payload` column, or GET /api/parameters with a Bearer JWT
//
// Runs in plain Node: the engine has no browser or Vite dependency.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stableStringify, scenarios, GENERATED_DATE } from "./lib.mjs";

const [checkout, paramsPath, outPath = "engine-capture.json"] = process.argv.slice(2);
if (!checkout || !paramsPath) {
  console.error("usage: capture.mjs <checkout-dir> <params.json> [out.json]");
  process.exit(2);
}
const root = resolve(checkout);
const u = (p) => pathToFileURL(`${root}/src/engine/${p}`).href;
const rt = await import(u("runtime.js"));
const { computeProposal } = await import(u("proposal.js"));
const ap = await import(u("data/adminParams.js"));
const inv = await import(u("data/inventory.js"));
const dev = await import(u("data/devices.js"));

const payload = JSON.parse(readFileSync(paramsPath, "utf8"));
rt.applyRuntime(rt.buildRuntime(rt.DEFAULTS, payload));
const runtime = JSON.parse(JSON.stringify({
  adminParams: ap.ADMIN_PARAMS,
  panelSettings: inv.PANEL_SETTINGS,
  invertersSinglePhase: inv.INVERTERS_SINGLE_PHASE,
  invertersThreePhase: inv.INVERTERS_THREE_PHASE,
  devices: dev.DEVICES,
}));

const proposals = {};
let errors = 0;
for (const [id, state] of Object.entries(scenarios(runtime))) {
  try {
    // Serialise now: the model references live engine objects.
    proposals[id] = JSON.parse(stableStringify(computeProposal(state, new Date(GENERATED_DATE))));
  } catch (e) {
    errors++;
    proposals[id] = { __error: String((e && e.message) || e) };
  }
}
writeFileSync(
  outPath,
  stableStringify({
    meta: { checkout: root, params: resolve(paramsPath), generatedDate: GENERATED_DATE.toISOString() },
    runtime,
    proposals,
  }),
);
console.log(`${Object.keys(proposals).length} scenarios captured (${errors} threw) → ${outPath}`);
