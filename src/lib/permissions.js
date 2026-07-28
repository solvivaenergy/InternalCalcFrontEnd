// =============================================================================
// PERMISSIONS — role → allowed-edit-sections allowlist
// -----------------------------------------------------------------------------
// Single source of truth for what each editor role is allowed to CHANGE.
// Consumed by Admin.jsx and Inventory.jsx to render sections as editable vs
// read-only, and mirrored on the server in netlify/functions/parameters.js
// where it's the actual security boundary.
//
// VISIBILITY (v3-54): All four admin roles can SEE every section in every
// admin tab (Inventory / Engineering / Product). Sections outside a role's
// edit allowlist render read-only (greyed). EDIT rights below are unchanged
// from v3-53.
//
// ROLES
//   'edit'         — Super Admin. Can edit everything.
//   'engineering'  — Engineering Team.
//   'product'      — Product Team.
//   'view'         — Audit / view-only. Cannot edit anything.
//   'none'         — Not signed in.
//
// ADMIN-PARAMETERS SECTIONS (string keys used in Admin.jsx <Section> tags)
//   'quoteValidity'      'Quote Validity'                  [Product tab]
//   'interestRates'      'Interest Rates'                  [Product tab]
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
    'quoteLimits',      // v3-68 — min system size / min DP / max tenor
    'step1Defaults',    // v3-70 — default utility rate / monthly bill
    'interestRates',
    'promoCodes',
    'maintenance',
  ]),
};

const ROLE_INVENTORY_ACCESS = {
  // Super Admin handled separately as wildcard.
  engineering: true,
  product: false,
};

const ROLE_LABELS = {
  edit:        'Super Admin',
  engineering: 'Engineering',
  product:     'Product',
  view:        'View only',
};

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
  grossMarginReference:          'margins',
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
  lcoeNpvDiscountRate:           'scheduleConstants',
  maintenanceInflationRate:      'scheduleConstants',
  netMeteringEfficiency:         'scheduleConstants',
  preventiveMaintenancePerPanelCogs: 'scheduleConstants',
  preventiveMaintenancePerVisitCogs: 'scheduleConstants',
  minDaysToFirstPostInstallPayment: 'scheduleConstants',
  // Promo Codes
  promoCodes:                    'promoCodes',
  // Quote Validity
  quoteValidityDays:             'quoteValidity',
  // Quote Limits (v3-68)
  minSystemKwp:                  'quoteLimits',
  minDpTiers:                    'quoteLimits',   // v3-75 — replaces scalar minDownPaymentPct
  maxTenorMonths:                'quoteLimits',
  // Step 1 Defaults (v3-70)
  defaultUtilityRate:            'step1Defaults',
  defaultMonthlyBill:            'step1Defaults',
  // Maintenance Mode
  gateAuthEnabled:               'maintenance',
};

// "Quote Validity" persists via ADMIN_PARAMS.quoteValidityDays (added v3-15).
// DEFAULTS.quoteValidityDays in src/config.js remains as the bundled fallback
// used until paramsService finishes its boot fetch.
