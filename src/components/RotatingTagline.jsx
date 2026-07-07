// =============================================================================
// ROTATING TAGLINE — animated headline at the top of the Calculator page
// -----------------------------------------------------------------------------
// Replaces the standalone ContactGate's static-per-page-load headline. The
// 15 tagline lines now cycle continuously while the page is open: each line
// displays for DISPLAY_MS, then fades out over FADE_MS, then the next line
// fades in.
//
// v3-55: pruned the original 8 v3-51 lines down to 4 (dropped two explicit
// "zero bill" promises and two implicit ones: "Imagine an electric bill that
// pays YOU back" and "Break up with your electric bill" — both can be read
// as guaranteeing bill elimination, which post-solar consumption drift makes
// difficult to deliver). Added 11 new lines focused on savings, ownership,
// inflation hedging, and the asset framing — all carefully phrased to avoid
// promising bill elimination.
//
// Initial pick uses the same per-page-load rotation index from localStorage
// (HEADLINE_IDX_KEY) so first-render index varies across visits — preserves
// the "different every visit" feel layered on top of in-page cycling.
//
// Rendered at the top of the Calculator tab (above Step 1) by Calculator.jsx.
// No props; component is self-contained.
// =============================================================================

import React, { useState, useEffect } from 'react';

const TAGLINES = [
  'Turn sunshine into savings.',
  "Your roof is sitting on a goldmine. Let's tap it.",
  'From bill payer to power producer.',
  "The sun is free. Why isn't your electricity?",
  'Cut your power bill. Keep the lifestyle.',
  'Less spent on power. More spent on living.',
  'Brighter days mean lower bills.',
  'Own your power. Literally.',
  "Generate. Don't just consume.",
  'The upgrade that pays you back.',
  'Solar pays. Your roof collects.',
  'Built for the Philippine sun.',
  'Why pay for power you could make?',
  'Ever wonder what your roof is worth?',
  'Power up. Pay down.',
];

// Per-page-load rotation index — shared key from v3-50 ContactGate so the
// rotation continues even though the gate component is gone.
const HEADLINE_IDX_KEY = 'solviva_headline_idx';

// Display each tagline for this long before transitioning. Tunable; 4500ms
// + 600ms fade = ~5.1s per line, ~76s for a full 15-line loop.
const DISPLAY_MS = 4500;
const FADE_MS = 600;

function readStartIndex() {
  let idx = 0;
  try {
    const raw = localStorage.getItem(HEADLINE_IDX_KEY);
    if (raw != null) idx = parseInt(raw, 10) || 0;
  } catch (_) { /* fine */ }
  idx = ((idx % TAGLINES.length) + TAGLINES.length) % TAGLINES.length;
  try {
    // Advance the persisted index for the NEXT page load (so consecutive
    // reloads start at different lines, layering on top of in-page cycling).
    localStorage.setItem(HEADLINE_IDX_KEY, String((idx + 1) % TAGLINES.length));
  } catch (_) { /* fine */ }
  return idx;
}

export default function RotatingTagline() {
  const [idx, setIdx] = useState(() => readStartIndex());
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Schedule: hold for DISPLAY_MS → start fade-out → after FADE_MS, swap
    // the index and fade-in. Repeat indefinitely.
    const holdTimer = setTimeout(() => {
      setFading(true);
      const swapTimer = setTimeout(() => {
        setIdx(prev => (prev + 1) % TAGLINES.length);
        setFading(false);
      }, FADE_MS);
      // No explicit cleanup for swapTimer here — the outer cleanup (below)
      // will fire on unmount and the swapTimer will harmlessly complete or
      // be GC'd if the component is still mounted.
      return () => clearTimeout(swapTimer);
    }, DISPLAY_MS);
    return () => clearTimeout(holdTimer);
  }, [idx]);

  return (
    <div style={styles.container} aria-live="polite">
      <div style={styles.headlineWrap}>
        <h1 style={{
          ...styles.headline,
          opacity: fading ? 0 : 1,
        }}>
          {TAGLINES[idx]}
        </h1>
      </div>
    </div>
  );
}

const styles = {
  // v3-52: tightened from 28px top / 24px bottom to 14px both, and the
  // dots-row + its 14px top margin are gone. Total vertical footprint of
  // the tagline drops from ~110px to ~60px.
  container: {
    padding: '14px 20px',
    textAlign: 'center',
    background: 'transparent',
  },
  headlineWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // v3-52: dropped from 58px (which reserved room for a two-line wrap +
    // dots) to 36px (one-line at 26px font ≈ 31px, plus a few px of
    // breathing room). Two-line taglines are rare and can shift the
    // layout slightly when they appear; acceptable trade-off for the
    // tighter default footprint.
    minHeight: 36,
  },
  headline: {
    fontSize: 26,
    fontWeight: 700,
    color: '#25543A',
    letterSpacing: -0.5,
    lineHeight: 1.2,
    margin: 0,
    transition: `opacity ${FADE_MS}ms ease-in-out`,
    maxWidth: 760,
  },
};
