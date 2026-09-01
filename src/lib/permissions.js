// =============================================================================
// PERMISSIONS — role → allowed-edit-sections allowlist
// -----------------------------------------------------------------------------
// Single source of truth for what each editor role is allowed to CHANGE.
// Consumed by Admin.jsx and Inventory.jsx to render sections as editable vs
// read-only, and mirrored on the server in netlify/functions/parameters.js
// where it's the actual security boundary.
//
// VISIBILITY (v3-54, unchanged by v3-180): All admin roles can SEE every
// section in every admin tab (Inventory / Engineering / Product / FinCo).
// Sections outside a role's edit allowlist render read-only (greyed).
//
// v3-180 — FINCO/OPCO SEPARATION. Ahead of splitting the financing entity out
// of the operating company, the three parameters the financing entity owns
// moved behind a fifth role:
//   • minDpTiers + maxTenorMonths  — left 'quoteLimits', now 'financingTerms'
//   • the whole 'interestRates' section — left the Product allowlist
// 'quoteLimits' survives holding minSystemKwp alone (an OpCo engineering
// floor, deliberately NOT moved). Per Pat's decisions: Super Admin KEEPS the
// wildcard and can still edit FinCo sections; FinCo sees every other tab
// read-only; OpCo roles see the FinCo tab read-only. So no visibility
// machinery was added anywhere — the tab strip gained one entry and nothing
// else. FinCo is deliberately NOT in 'maintenance': taking the calculator
// offline is an OpCo operational lever.
//
// ROLES
//   'edit'         — Super Admin. Can edit everything, including FinCo.
//   'engineering'  — Engineering Team.
//   'product'      — Product Team.
//   'finco'        — FinCo Admin. Financing terms + interest rates ONLY.
//   'view'         — Audit / view-only. Cannot edit anything.
//   'none'         — Not signed in.
//
// ADMIN-PARAMETERS SECTIONS (string keys used in the tab pages' <Section> tags)
//   'quoteValidity'      'Quote Validity'                  [Product tab]
//   'quoteLimits'        'Quote Limits' (minSystemKwp)     [Product tab]
//   'financingTerms'     'Financing Limits'                [FinCo tab]
//   'interestRates'      'Interest Rates'                  [FinCo tab]
//   'promoCodes'         'Promo Codes'                     [Product tab]
//   'solarPanel'         'Solar Panel & Mounting'          [Inventory tab]
//   'cabling'            'AC/DC Cabling (% of Panels)'     [Inventory tab]
//   'batteryPackage'     'Battery Packages'                [Inventory tab]
//   'variableCharges'    'Variable Charges'                [Engineering tab]
//   'roofMaterial'       'Roof Material (per kWp)'         [Engineering tab]
//   'location'           'Location / Delivery Charges'     [Engineering tab]
//   'standaloneCharges'  'Standalone Retrofit Charges'     [Engineering tab]
//   'fixedOverhead'      'Fixed Overhead'                  [Engineering tab]
//   'scheduleConstants'  'Schedule Constants'              [Engineering tab]
//   'maintenance'        'Maintenance Mode'                [Above tabs]
//
// INVENTORY PANEL/INVERTER/DEVICE BUCKETS: Engineering + Super Admin can edit;
// Product can view but not edit (under v3-54 they CAN now navigate to the
// Inventory tab, but inputs are still gated).
// =============================================================================

export const ADMIN_SECTIONS = {
  quoteValidity:     'Quote Validity',
  quoteLimits:       'Quote Limits',
  step1Defaults:     'Step 1 Defaults',
  margins:           'Gross Margin & Merchant Discount',
  financingTerms:    'Financing Limits',
  returnsAssumptions:'Returns Assumptions',
  duInflationReference:'DU Rate Inflation Reference',
  interestRates:     'Interest Rates',
  solarPanel:        'Solar Panel & Mounting',
  variableCharges:   'Variable Charges',
  roofMaterial:      'Roof Material (per kWp)',
  location:          'Location / Delivery Charges',
  cabling:           'AC/DC Cables, Conduits, Fittings, Panel Board & Other Devices (% of Panels Price)',
  batteryPackage:    'Battery Packages',
  standaloneCharges: 'Standalone Retrofit Charges',
  fixedOverhead:     'Fixed Overhead',
  scheduleConstants: 'Schedule Constants',
  promoCodes:        'Promo Codes',
  maintenance:       'Maintenance Mode',
};

// Per-role allowlists. 'edit' (Super Admin) is implicit-everything; do NOT
// include it here — checks below treat it as wildcard.
const ROLE_ADMIN_SECTIONS = {
  engineering: new Set([
    'solarPanel',
    'variableCharges',
    'roofMaterial',
    'miscCatalog',   // v3-138 — Step 2F standing catalog
    'location',
    'cabling',
    'batteryPackage',
    'standaloneCharges',
    'fixedOverhead',
    'scheduleConstants',
    'maintenance',
  ]),
  product: new Set([
    'margins',          // v3-83 — the two levers that drive every derived price
    'quoteValidity',
    'quoteLimits',      // v3-180 — minSystemKwp ONLY; min DP + max tenor left
                        // for 'financingTerms' (FinCo) at the entity split
    'step1Defaults',    // v3-70 — default utility rate / monthly bill
    'step3Defaults',    // v3-159 — default down-payment % (stays with Product
                        // per Pat: a pre-fill, not a floor)
    'promoCodes',
    'maintenance',
  ]),
  finco: new Set([
    'financingTerms',      // v3-180 — minimum down payment tiers + maximum tenor
    'interestRates',       // v3-180 — moved wholesale off the Product tab
    'returnsAssumptions',  // v3-181 — DU tariff inflation default
    'duInflationReference',// v3-183 — historical reference calculator (advisory)
  ]),
  // Inventory-only editor. NOT part of the upstream v3-207 role set — this
  // deployment added it as a Supabase role (backend migration
  // 20260731_add_inventory_role.sql), so it survives the v3-207 alignment.
  inventory: new Set(['solarPanel', 'cabling', 'batteryPackage']),
};

const ROLE_INVENTORY_ACCESS = {
  // Super Admin handled separately as wildcard.
  engineering: true,
  inventory: true,        // this deployment's Supabase-only role
  product: false,
  finco: false,
};

const ROLE_LABELS = {
  edit:        'Management',
  engineering: 'Engineering',
  product:     'Consumer Finance',
  finco:       'FinCo Admin',
  inventory:   'Inventory',
  view:        'View only',
};

// NOTE ON TAB VISIBILITY (v3-203 D2): there is deliberately NO tab-level
// allowlist here. Every admin tier sees all four admin tabs; the read/write
// split is per SECTION, via canEditAdminSection() / canEditInventory() below.
// A pre-v3-203 tab allowlist (ROLE_ADMIN_TABS) was removed in this alignment —
// it hid whole tabs from roles that are supposed to read them.

// ─── Public helpers ──────────────────────────────────────────────────────────

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Unknown';
}

// Can this role edit the given Admin Parameters section?
export function canEditAdminSection(role, sectionKey) {
  if (role === 'edit') return true;
  const set = ROLE_ADMIN_SECTIONS[role];
  return set ? set.has(sectionKey) : false;
}

// Can this role edit anything in the Inventory pane (panel settings,
// inverters, battery packages, device library)?
export function canEditInventory(role) {
  if (role === 'edit') return true;
  return !!ROLE_INVENTORY_ACCESS[role];
}

// Does this role have ANY edit power somewhere?
// (Used to decide whether to show Save bar.)
export function hasAnyEditAccess(role) {
  if (role === 'edit') return true;
  if (role === 'engineering' || role === 'product') return true;
  if (role === 'finco') return true;   // v3-180 — else the Save bar never renders
  if (role === 'inventory') return true;  // this deployment's Supabase-only role
  return false;
}

// Map a parameter key in ADMIN_PARAMS to the section it belongs to.
// Used at save-time to filter the dirty diff down to a role's allowed
// sections — and also mirrored server-side as the security boundary.
export const PARAM_KEY_TO_SECTION = {
  // Interest Rates
  financingEntityName:           'margins',
  financingEntityIsSeparate:     'margins',
  grossMarginMinKwp:             'margins',
  grossMarginMidKwp:             'margins',
  grossMarginMaxKwp:             'margins',
  grossMarginMin:                'margins',
  grossMarginMid:                'margins',
  grossMarginMax:                'margins',
  grossMarginMinKwpTp:           'margins',   // v3-191 — three-phase curve anchors
  grossMarginMidKwpTp:           'margins',
  grossMarginMaxKwpTp:           'margins',
  grossMarginMinTp:              'margins',
  grossMarginMidTp:              'margins',
  grossMarginMaxTp:              'margins',
  grossMarginNoInverterSp:       'margins',   // v3-191 — panels-without-inverter margins
  grossMarginNoInverterTp:       'margins',
  componentMargins:              'margins',   // v3-191 — per-component margin table (B–Q)
  grossMarginReference:          'returnsAssumptions',  // v3-190 — moved to FinCo; UI label renamed, key kept
  merchantDiscountRate:          'margins',
  rateAnchorMax:                 'interestRates',
  rateAnchorMid:                 'interestRates',
  rateAnchorMin:                 'interestRates',
  rateTenorWeight:               'interestRates',
  rateStepPct:                   'interestRates',
  earlyPayoffDiscountRate:       'interestRates',
  documentaryStampTaxRate:       'interestRates',   // v3-100 — Product-editable DST rate
  // Solar Panel & Mounting
  mountingSupportFloorCogs:        'solarPanel',
  mountingSupportPctOfPanels:    'solarPanel',
  // Variable Charges
  additionalDcCablePerMeterCogs:   'variableCharges',
  additionalAcCablePerMeterCogs:   'variableCharges',
  laborInstallationPerKwpCogs:     'variableCharges',
  rsdVariablePerPanelCogs:         'variableCharges',
  rsdFixedTransmitterCogs:         'variableCharges',
  rsdAvailable:                    'variableCharges',   // v3-106 — RSD stock flag
  // Roof Material
  roofAsphaltPerKwpCogs:           'roofMaterial',
  roofConcretePerKwpCogs:          'roofMaterial',
  // Misc Materials / Labor / Services catalog (v3-138)
  miscCatalog:                     'miscCatalog',
  // Location / Delivery
  deliveryLocations:               'location',   // v3-116 — replaces the 4 Cebu/Siargao scalars
  luzonFreeTravelKm:               'location',   // v3-199 — free-delivery radius
  luzonOver30FixedFeeCogs:         'location',
  luzonOver30PerKmCogs:            'location',
  // Cabling
  cablingTiers:                  'cabling',
  cablingTiersThreePhase:        'cabling',   // NEW v3-62 — 3-phase tier table
  // Battery Packages (v3-54: replaces the 6 flat batteryPer5kWhPrice/etc keys
  // with a single array). Edit gate stays on the 'batteryPackage' section.
  batteryPackages:               'batteryPackage',
  // Standalone Retrofit Charges (RSD-only / Inverter-only orders without solar)
  rsdStandaloneLaborPerPanelCogs:  'standaloneCharges',
  rsdStandaloneLaborMobilizationCogs: 'standaloneCharges',
  inverterStandaloneLaborPerUnitCogs: 'standaloneCharges',
  inverterStandaloneMobilizationCogs: 'standaloneCharges',
  // Fixed Overhead (rolled into "Solar Labor & Installation" line on the quote)
  fixedOverheadDeliveryLogisticsCogs: 'fixedOverhead',
  fixedOverheadWarehouseCogs:      'fixedOverhead',
  fixedOverheadCustomsCogs:        'fixedOverhead',
  fixedOverheadSafetySupervisionCogs: 'fixedOverhead',
  fixedOverheadTestingCogs:        'fixedOverhead',
  // Schedule Constants
  kWhPerKwpPerDay:               'scheduleConstants',
  batteryEfficiency:             'scheduleConstants',
  maxDailySpillKwh:              'scheduleConstants',   // v3-132 — Mode-1 spill tolerance
  batteryDepthOfDischarge:       'scheduleConstants',
  panelAnnualDegradation:        'scheduleConstants',
  lcoeNpvDiscountRate:           'returnsAssumptions',  // v3-190 — moved from Engineering to FinCo
  maintenanceInflationRate:      'returnsAssumptions',  // v3-190 — moved from Engineering to FinCo
  netMeteringEfficiency:         'scheduleConstants',
  preventiveMaintenancePerPanelCogs: 'scheduleConstants',
  preventiveMaintenancePerVisitCogs: 'scheduleConstants',
  minDaysToFirstPostInstallPayment: 'scheduleConstants',
  // Promo Codes
  promoCodes:                    'promoCodes',
  // Quote Validity
  quoteValidityDays:             'quoteValidity',
  // Quote Limits (v3-68) — minSystemKwp ONLY since v3-180
  minSystemKwp:                  'quoteLimits',
  // Financing Limits (v3-180) — FinCo-owned. minDpTiers is the v3-75 tiered
  // table (it replaced the scalar minDownPaymentPct); maxTenorMonths caps the
  // Step 3B options. Both were 'quoteLimits' through v3-179.
  minDpTiers:                    'financingTerms',
  maxTenorMonths:                'financingTerms',
  // Returns Assumptions (v3-181) — FinCo-owned; default only, the customer
  // sets their own rate per quote.
  irrYearsDefault:               'returnsAssumptions',
  duRateInflationDefault:        'returnsAssumptions',
  // DU Rate Inflation Reference (v3-183) — advisory only, sets no quote value.
  duInflationSourceName:         'duInflationReference',
  duInflationSourceUrl:          'duInflationReference',
  duInflationBasis:              'duInflationReference',
  duInflationDate1:              'duInflationReference',
  duInflationRate1:              'duInflationReference',
  duInflationDate2:              'duInflationReference',
  duInflationRate2:              'duInflationReference',
  // Step 1 Defaults (v3-70)
  defaultUtilityRate:            'step1Defaults',
  defaultMonthlyBill:            'step1Defaults',
  // Step 3 Default (v3-159)
  defaultDownPaymentPct:         'step3Defaults',
  // Maintenance Mode
  gateAuthEnabled:               'maintenance',
};

// "Quote Validity" persists via ADMIN_PARAMS.quoteValidityDays (added v3-15).
// DEFAULTS.quoteValidityDays in src/config.js remains as the bundled fallback
// used until paramsService finishes its boot fetch.
