// =============================================================================
// ODOO QUOTATION — push a generated proposal to Odoo (stories 064C/J/K)
// -----------------------------------------------------------------------------
// After generateProposalPdf() saves the PDF, App.jsx calls pushProposalToOdoo()
// with the payload built here. The backend (POST /api/odoo/quotation) creates
// a DRAFT quotation on the Odoo opportunity the customer was loaded from.
//
// Product decisions (Dinuguan refinement, 2026-09-25):
//   • only when the customer carries an Odoo lead id — otherwise nothing is
//     sent and nothing is shown;
//   • a NEW quotation per generated PDF;
//   • the PDF never waits for or fails because of this call — the caller
//     renders the result as a banner.
//
// The Odoo credential lives on the backend; this module only talks to our own
// Express service with the caller's Supabase JWT (same pattern as crmContact.js).
// =============================================================================

import { getAccessToken } from "./supabaseClient.js";
import { buildBoqLines } from "./boq.js";
import { LEAD_ID_RE } from "./deepLink.js";

// Same base resolution as paramsService.js / crmContact.js.
const API_BASE = (
  import.meta.env.DEV
    ? "http://localhost:3000"
    : import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export const ODOO_PUSH_CONFIGURED = !!API_BASE;

function round(x, n = 2) {
  if (!Number.isFinite(x)) return null;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

const inverterLabels = (arr) => (arr || [])
  .filter(Boolean)
  .map((inv) => (inv.ratedKw != null ? `${inv.ratedKw} kW` : (inv.label || "Inverter")));

/**
 * Assemble the request body. Pure: no I/O, so the shape is testable.
 */
export function buildOdooQuotationPayload({ state, model, contact, agent, issuedAt, validUntil, quoteRef }) {
  const terms = model?.terms || {};
  const tenor = Number(state?.tenor) || 0;
  const isDirect = tenor <= 0;
  const boq = buildBoqLines({ model, state });
  return {
    leadId: contact?.leadId ?? null,
    proposal: {
      quoteRef,
      generatedAt: issuedAt instanceof Date ? issuedAt.toISOString() : issuedAt,
      validUntil: validUntil instanceof Date ? validUntil.toISOString() : validUntil,
      customer: {
        name: contact?.name || "",
        email: contact?.email || "",
        mobile: contact?.mobile || "",
        installAddress: contact?.installAddress || "",
      },
      agent: {
        name: agent?.name || "",
        email: agent?.email || "",
        phone: agent?.phone || "",
      },
      system: {
        panelCount: model?.panelCount ?? 0,
        systemKwp: round(model?.systemKwp, 2),
        batteryKwh: model?.batteryKwh ?? 0,
        batteryPackage: model?.activeBatteryPackage?.label || null,
        inverters: inverterLabels(model?.effectiveInverters),
        phase: state?.phase === "three" ? "3-phase" : "single-phase",
        roofMaterial: state?.roofMaterial || null,
        rsdIncluded: !!state?.rsdEnabled,
        netMetering: !!state?.netMeteringEnabled,
      },
      quote: {
        financingType: isDirect ? "Direct Purchase" : "RTO",
        netPrice: round(terms.netDirectPrice),
        discountAmount: round(terms.discountAmount ?? 0),
        promoCode: state?.promoCode || "",
        downPaymentPct: state?.downPaymentPct ?? null,
        downPaymentAmount: round(terms.dpTotalCharge),
        tenorMonths: tenor,
        interestRatePa: isDirect ? 0 : (terms.rtoRate ?? null),
        monthlyPayment: isDirect ? 0 : round(terms.customerMonthlyPmt),
        totalAmountDue: round(terms.totalAmountDue),
        dst: round(terms.dst ?? 0),
        totalAmountDueInclDst: round(terms.summaryTotalDue ?? terms.totalAmountDue),
      },
      boq: boq.map((r) => ({
        package: r.package,
        product: r.product,
        description: r.description,
        quantity: r.quantity,
        unit: r.unit,
      })),
    },
  };
}

// Human-readable outcome for the banner. Never throws.
//   { ok: true,  order: { id, name }, leadId, warnings }
//   { ok: false, error, code }
export async function pushProposalToOdoo(payload) {
  const leadId = String(payload?.leadId ?? "").trim();
  if (!LEAD_ID_RE.test(leadId)) {
    return { ok: false, error: "No Odoo lead is linked to this customer.", code: "no_lead" };
  }
  if (!API_BASE) {
    return { ok: false, error: "Odoo push unavailable — backend not configured.", code: "not_configured" };
  }
  let token;
  try {
    token = await getAccessToken();
  } catch (_) {
    token = null;
  }
  if (!token) {
    return { ok: false, error: "Session expired — sign in again to push the quotation to Odoo.", code: "unauthenticated" };
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/api/odoo/quotation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, leadId: Number(leadId) }),
    });
  } catch (_) {
    return { ok: false, error: "Odoo push unavailable — network error. The PDF was generated; create the quotation in Odoo manually or try again.", code: "network" };
  }

  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }

  if (res.ok) {
    return {
      ok: true,
      order: { id: body?.orderId ?? null, name: body?.orderName || null },
      leadId: Number(leadId),
      salespersonSource: body?.salespersonSource || null,
      warnings: Array.isArray(body?.warnings) ? body.warnings : [],
    };
  }
  const code = body?.code || `http_${res.status}`;
  const detail = body?.error;
  if (res.status === 401) return { ok: false, error: "Session expired — sign in again to push the quotation to Odoo.", code };
  if (res.status === 404) return { ok: false, error: `Odoo lead ${leadId} was not found, so no quotation was created.`, code };
  if (res.status === 422) return { ok: false, error: detail || "The Odoo lead has no customer contact linked, so no quotation was created.", code };
  if (res.status === 503) return { ok: false, error: "Odoo is not configured on the server — contact IT. The PDF was generated.", code };
  return { ok: false, error: detail || "Odoo did not accept the quotation. The PDF was generated; try again or create it in Odoo.", code };
}
