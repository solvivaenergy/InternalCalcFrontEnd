// =============================================================================
// ODOO ORDER LINES — one quotation line per package (story 064D)
// -----------------------------------------------------------------------------
// Mirrors the Summary tab's "Summary of Equipment, Materials & Labor": the same
// three groups in A → B → C order, the same visible rows (every engine line
// whose direct price is not zero, see Summary.jsx visibleItems), and the
// group's subtotal as the line's price. A group with no rows is left out,
// exactly as the Summary omits it — a solar-only quote sends no Battery line.
//
// The backend (odooQuotationService.js) puts each entry on the matching
// package product from story 064G, with the product name as the first line of
// the description and the inclusions below it, which is how a line looks when
// a rep picks the product by hand in Odoo.
//
// PRICES ARE VAT-INCLUSIVE, as everywhere in the calculator. The package
// products in Odoo carry the price-included "12%" sale tax, so the unit price
// lands as the line total and Odoo backs the VAT out of it. A promo discount
// is not in these lines: the backend adds it as a separate negative line
// (Odoo's "global discount" shape) from quote.discountAmount.
//
// Pure and framework-free so it runs in Node with a hand-built model.
// =============================================================================

import { PACKAGE_CATEGORIES } from "@solviva/calc-engine/data/adminParams.js";

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

/**
 * @param {object} args
 * @param {object} args.model  App.jsx's computed model (pkg.items with
 *                             key / description / directPrice / category,
 *                             expansionActive)
 * @param {object} [args.state] calculator state (existingInverterKw for the
 *                             expansion note)
 * @returns {Array<{package: 'A'|'B'|'C', label: string, inclusions: string[], amount: number}>}
 */
export function buildOdooOrderLines({ model, state } = {}) {
  const items = Array.isArray(model?.pkg?.items) ? model.pkg.items : [];
  // Same predicate as the Summary (FILTER B<>0): credit/reversal lines stay,
  // true-empty rows go. A row with no text has nothing to say in Odoo.
  const visible = items.filter((i) => i && i.directPrice !== 0 && String(i.description || "").trim());

  const lines = [];
  for (const cat of PACKAGE_CATEGORIES) {
    const rows = visible.filter((i) => i.category === cat.id);
    if (rows.length === 0) continue;
    const inclusions = rows.map((i) => String(i.description).trim());
    // The Summary prints this note under the Solar header on an expansion
    // order; it is part of what the customer was shown, so Odoo gets it too.
    if (cat.id === "solar" && model?.expansionActive) {
      const kw = Number(state?.existingInverterKw);
      inclusions.unshift(
        `Connects to the customer's existing ${Number.isFinite(kw) && kw > 0 ? `${kw.toFixed(1)} kW ` : ""}inverter — no inverter included in this order.`,
      );
    }
    lines.push({
      package: cat.letter,
      label: `${cat.letter}. ${cat.label}`,
      inclusions,
      amount: round2(rows.reduce((sum, i) => sum + (Number(i.directPrice) || 0), 0)),
    });
  }
  return lines;
}
