// ════════════════════════════════════════════════════════════════════════════
// submit-lead — receives a "talk to a Solviva rep" submission from the public
// calculator and forwards it to Solviva.
//
// ⚠️⚠️⚠️  THE DELIVERY CHANNEL DOES NOT EXIST YET.  ⚠️⚠️⚠️
//
//   As shipped, this function runs in MOCK MODE: it validates the payload,
//   LOGS it to the Netlify function log, and returns success — but it does NOT
//   send the lead anywhere. A customer will see "your request is on its way,"
//   yet nothing reaches Solviva.
//
//   ALDEN: you must build the real delivery before this is deployed to
//   customers. Set the LEAD_DELIVERY_WEBHOOK environment variable (or replace
//   the deliver() body) so leads actually go somewhere. Full instructions are
//   in ALDEN-LEAD-DELIVERY.md at the repo root. DO NOT DEPLOY IN MOCK MODE.
// ════════════════════════════════════════════════════════════════════════════

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

// Minimal shape check — enough to reject junk without coupling to the exact
// payload version. The client builds the full record (see src/lib/lead.js).
function invalidReason(lead) {
  if (!lead || typeof lead !== 'object') return 'missing body';
  const c = lead.customer || {};
  if (!c.name || !c.email || !c.mobile) return 'missing customer name/email/mobile';
  if (!c.installationAddress) return 'missing installation address';
  if (!lead.consent || lead.consent.given !== true) return 'consent not given';
  return null;
}

// The one place Alden wires up. When LEAD_DELIVERY_WEBHOOK is set, the lead is
// POSTed there as JSON (works with Slack/Teams incoming webhooks, a CRM intake
// URL, or a small email relay). When it is NOT set, we are in mock mode.
async function deliver(lead) {
  const webhook = process.env.LEAD_DELIVERY_WEBHOOK;
  if (!webhook) {
    // MOCK MODE — no channel configured. Log the full record so it is visible
    // in the Netlify function log, and report back that nothing was delivered.
    console.warn(
      '⚠️ LEAD DELIVERY NOT CONFIGURED — LEAD_DELIVERY_WEBHOOK is unset. ' +
      'The lead below was NOT sent to Solviva. See ALDEN-LEAD-DELIVERY.md.\n' +
      JSON.stringify(lead, null, 2)
    );
    return { delivered: false, mock: true };
  }
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });
  if (!res.ok) throw new Error(`delivery webhook responded ${res.status}`);
  return { delivered: true, mock: false };
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method not allowed' });

  let lead;
  try {
    lead = await request.json();
  } catch (_) {
    return json(400, { ok: false, error: 'invalid JSON' });
  }

  const reason = invalidReason(lead);
  if (reason) return json(400, { ok: false, error: reason });

  try {
    const result = await deliver(lead);
    // In mock mode we still return 200 so the customer sees the final
    // experience during development/preview. `mock: true` marks that nothing
    // was actually delivered — the deploy-time guard is the Alden instruction,
    // not a runtime block.
    return json(200, { ok: true, reference: lead.quoteReference || null, mock: !!result.mock });
  } catch (err) {
    console.error('submit-lead delivery error:', err);
    return json(502, { ok: false, error: 'delivery failed' });
  }
};
