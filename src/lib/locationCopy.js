// =============================================================================
// LOCATION COPY — the one sentence under the location picker (v3-231)
// -----------------------------------------------------------------------------
// Step 2E and the mobile "Your home" screen each carried their own hardcoded
// "within N km of our Parañaque logistics hub" sentence. With more than one
// region the hub, the region's name and whether a hub exists at all come from
// the live parameters (engine 1.3.0: deliveryRegionLabel / deliveryHubLabel /
// deliveryHubEnabled), so both screens build the sentence here and cannot
// drift. Returns plain parts; the caller renders `strong` in bold.
// =============================================================================

export function deliveryHint({ adminParams, city, km, freeKm }) {
  const regionLabel = adminParams?.deliveryRegionLabel || 'Luzon';
  const hub = adminParams?.deliveryHubLabel || 'Parañaque hub';
  const hubEnabled = adminParams?.deliveryHubEnabled !== false;
  const name = city || '—';
  const distance = Number.isFinite(km) ? km : 0;
  const free = Number.isFinite(freeKm) ? freeKm : 30;

  // No dispatch hub in this region yet: every serviceable city prices ₱0 and
  // no distance is shown — there is nothing to measure it from.
  if (!hubEnabled) {
    return {
      kind: 'noHub',
      before: `${name} — delivery within ${regionLabel} is `,
      strong: 'included in your package price',
      after: '.',
    };
  }
  if (!(distance > free)) {
    return {
      kind: 'free',
      before: `${name} — within ${free} km of our ${hub}. `,
      strong: 'No delivery charge',
      after: '.',
    };
  }
  return {
    kind: 'beyond',
    before: `${name} — approx. ${distance} km from our ${hub}. A delivery charge for the distance beyond ${free} km is `,
    strong: 'included in your package price',
    after: '.',
  };
}
