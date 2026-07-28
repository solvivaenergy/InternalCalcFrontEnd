// =============================================================================
// UI PRIMITIVES — shared input/label/section components used across the
// calculator. Centralizing them here keeps the visual language consistent.
// -----------------------------------------------------------------------------
// Style philosophy:
//   • Excel uses light blue (RGB ~219,234,254) for user-input cells. We adopt
//     that as INPUT_TINT so the calculator visually echoes the workbook —
//     experienced agents will recognize the convention.
//   • Recommendations appear as small green pills next to inputs that have
//     a recommended value. Clicking the pill snaps the input back to the
//     recommended value.
//   • Errors and warnings use red (#B91C1C) and amber (#B45309) respectively.
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';

export const COLORS = {
  brandGreen:   '#25543A',
  brandGreenLight: '#3B7B5A',
  brandCream:   '#F7F4ED',
  inputTint:    '#DBEAFE',  // Excel-style user-input blue
  inputBorder:  '#9DB7DD',
  recHint:      '#10B981',  // recommendation pill bg
  warning:      '#B45309',
  error:        '#B91C1C',
  textMuted:    '#6B7280',
  textBody:     '#1F2937',
  divider:      '#E5E1D6',
  surfaceCard:  '#FFFFFF',
};

// ─── SectionCard: top-level container for each Step ─────────────────────────
export function SectionCard({ title, subtitle, accent, onReset, children, badge }) {
  return (
    <section className="section-card" style={cardStyles.card}>
      <header style={cardStyles.header}>
        <div>
          <div style={cardStyles.eyebrow}>{accent}</div>
          <h2 style={cardStyles.title}>{title}</h2>
          {subtitle && <p style={cardStyles.subtitle}>{subtitle}</p>}
        </div>
        <div style={cardStyles.headerRight}>
          {badge}
          {onReset && (
            <button onClick={onReset} style={cardStyles.resetBtn}
                    title="Reset this section to default values">
              ↻ Reset
            </button>
          )}
        </div>
      </header>
      <div style={cardStyles.body}>{children}</div>
    </section>
  );
}

// ─── Subsection: lighter divider for splitting a card into 2A, 2B, 2C, etc. ──
// `hint` appears immediately after the title in parentheses (lighter weight),
// not floated to the right. `info`, when provided, renders an InfoTooltip
// (italic-serif "i" in an orange-bordered circle) immediately after the title
// — matches the existing pattern for Field-level tooltips like SERVICE_TYPE_INFO.
export function Subsection({ title, hint, info, children }) {
  return (
    <div style={cardStyles.subsection}>
      <div style={cardStyles.subsectionHeader}>
        <h3 style={cardStyles.subsectionTitle}>
          {title}
          {hint && (
            <span className="subsection-hint" style={cardStyles.subsectionHint}> ({hint})</span>
          )}
          {info && (
            <span style={{ marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}>
              <InfoTooltip content={info} ariaLabel={typeof title === 'string' ? `More info about ${title}` : 'More info'} />
            </span>
          )}
        </h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── FieldLabel + various input wrappers ────────────────────────────────────
export function Field({ label, hint, error, recommendation, onAcceptRec, children, inline, info }) {
  return (
    <div className={inline ? 'field-inline' : ''} style={inline ? fieldStyles.inline : fieldStyles.stacked}>
      <label style={fieldStyles.label}>
        <span style={fieldStyles.labelText}>{label}</span>
        {info && <InfoTooltip content={info} ariaLabel={`More info about ${label}`} />}
      </label>
      <div style={fieldStyles.control}>
        <div style={inline ? fieldStyles.controlInline : null}>
          {children}
          {/* Reserved slot for the recommendation pill — keeps the input
              position stable whether or not the pill is visible. */}
          {inline && (
            <span style={fieldStyles.recSlot}>
              {recommendation && (
                <RecommendationPill onClick={onAcceptRec}>
                  {recommendation}
                </RecommendationPill>
              )}
            </span>
          )}
        </div>
        {!inline && recommendation && (
          <div style={{ marginTop: 4 }}>
            <RecommendationPill onClick={onAcceptRec}>
              {recommendation}
            </RecommendationPill>
          </div>
        )}
        {hint && <span style={fieldStyles.hint}>{hint}</span>}
        {error && <span style={fieldStyles.error}>{error}</span>}
      </div>
    </div>
  );
}

export function RecommendationPill({ children, onClick, active }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...fieldStyles.recPill,
      ...(active ? fieldStyles.recPillActive : {}),
    }} title="Click to apply this recommended value">
      ✓ {children}
    </button>
  );
}

// ─── Input variants ─────────────────────────────────────────────────────────
// `large` bumps the input font to 24px and adds vertical padding — used
// when the input lives inside a tile rendered alongside StatTile-style
// supersized values (e.g. Section 2A's Selected row). `amber` shifts the
// background and text color to the warning palette to match an overridden
// tile. Both default to undefined — existing usages stay unaffected.
// NumberInput
// ───────────
// Numeric input control. Renders as a styled <input> wrapped with optional
// prefix/suffix tokens (e.g. "₱", "kWh", "m", "%").
//
// v3-46: peso fields (any caller passing prefix='₱') auto-format with
// thousand separators. To keep the typing experience smooth we defer
// comma formatting until the input loses focus:
//
//   • While FOCUSED: input echoes the user's raw typing (no commas).
//     This preserves cursor position naturally — no mid-type
//     reformatting that would otherwise jump the cursor when commas
//     appear or disappear.
//   • While BLURRED: the displayed value is comma-formatted. So at rest,
//     a bill of 15000 shows as "15,000".
//
// We switched the underlying <input> from type='number' to type='text'
// because thousand separators in the displayed value would be stripped/
// rejected by a numeric input. inputMode='decimal' still triggers the
// numeric keypad on phones. Trade-off: we lose native step spinners
// (▲▼) and Up/Down arrow increment — acceptable per product direction
// (users type bill amounts, they don't increment by ₱500 with the spinner).
//
// Non-peso callers (no prefix, or non-₱ prefix) keep the same look and
// feel as before — no commas, just plain numeric editing. The function
// signature is unchanged, so existing call sites need no updates.
//
// `step`/`min`/`max` are no longer wired to the browser (since type='text')
// but are kept in the props for forward-compatibility — call sites pass
// them today; we keep them inert until/unless we reimplement keyboard
// increment.
export function NumberInput({
  value, onChange, min, max, step = 1, suffix, prefix, width = 120,
  large, amber, compact, error,
}) {
  const dynamic = {
    ...(large ? inputStyles.inputLarge : null),
    ...(amber ? inputStyles.inputAmber : null),
    ...(compact ? inputStyles.inputCompact : null),
    ...(error ? inputStyles.inputError : null),
  };

  // Peso fields auto-format on blur. We tie this to prefix==='₱' rather
  // than introducing a new prop because the peso prefix already encodes
  // the intent — every ₱ field benefits from thousands; no other prefix
  // does. A decimal peso like ₱13.50/kWh gets formatted as "13.50" (no
  // thousands needed) — harmless no-op.
  const isPeso = prefix === '₱';

  // Local focus state. While focused, we display the user's raw input
  // string verbatim (no formatting). While blurred, we display the canonical
  // formatted version of the parent's `value` prop. This gives the user
  // stable typing without cursor jumps from mid-type comma insertion.
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  // Build the BLURRED display from the numeric value:
  //   null/undefined/empty → '' (input is empty, not "0")
  //   peso → comma-formatted
  //   non-peso → bare String(value) — matches old type='number' behavior
  const blurredDisplay =
    value === null || value === undefined || value === ''
      ? ''
      : isPeso
        ? formatPesoForInput(value)
        : String(value);

  // While focused, show the raw draft. While blurred, show the formatted value.
  const display = focused ? draft : blurredDisplay;

  // Parse user input back to a number (or null). Strip commas and any other
  // non-numeric characters except '.' and '-'. Empty stays null.
  function parseToNumber(rawText) {
    if (rawText === '') return null;
    let cleaned = rawText.replace(/[^\d.\-]/g, '');
    // Only one decimal point — keep first, drop rest
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
    // Minus only at start
    cleaned = cleaned[0] === '-'
      ? '-' + cleaned.slice(1).replace(/-/g, '')
      : cleaned.replace(/-/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function handleFocus() {
    setFocused(true);
    // Seed the draft with the unformatted version of the current value so
    // editing starts from a clean numeric string (no commas to backspace
    // through). For non-peso fields, the blurred display is already
    // unformatted — same effect either way.
    const unformatted =
      value === null || value === undefined || value === ''
        ? ''
        : String(value);
    setDraft(unformatted);

    // Replace the input's content with the unformatted string AND select it
    // synchronously, in the same focus-event tick. Both steps are imperative
    // (direct DOM mutation) so that any keystroke that follows immediately —
    // including in fast-typing scenarios where the next event lands before
    // React re-renders — sees the right starting state:
    //   • input.value is the unformatted string (so the cursor / selection
    //     reflects what the user expects to be editing, not the formatted
    //     "15,000" that was visible at rest).
    //   • The selection covers the entire content, so the next keystroke
    //     replaces rather than appends.
    //
    // Why imperative: a previous version of this code used requestAnimationFrame
    // to wait for React to render the unformatted draft before selecting.
    // That worked for slow human typing, but fast typing or programmatic
    // input (Playwright fill, paste events) could land a keystroke before
    // the rAF callback fired — causing the keystroke to APPEND to the still-
    // formatted text. Doing the work synchronously eliminates the race.
    //
    // React will reconcile to the same value on its next render via the
    // controlled-input mechanism, so there's no visible flash from the
    // imperative mutation.
    if (inputRef.current) {
      inputRef.current.value = unformatted;
      inputRef.current.select();
    }
  }

  function handleChange(text) {
    setDraft(text);                  // echo verbatim while focused
    onChange(parseToNumber(text));   // keep parent's numeric state in sync
  }

  function handleBlur() {
    setFocused(false);
    // No need to onChange() here — the parent already has the latest
    // numeric value from the most recent handleChange. Switching `focused`
    // to false flips the display to the formatted blurredDisplay.
  }

  return (
    <div style={{ ...inputStyles.wrap, width }}>
      {prefix && <span style={inputStyles.prefix}>{prefix}</span>}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={display}
        onFocus={handleFocus}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        style={{
          ...inputStyles.input,
          ...dynamic,
          paddingLeft: prefix ? 28 : 12,
          paddingRight: suffix ? 32 : 12,
        }}
      />
      {suffix && <span style={inputStyles.suffix}>{suffix}</span>}
    </div>
  );
}

// Format a numeric value for in-input peso display when not focused.
// Whole numbers → "15,000" (thousands grouped, no decimals).
// Decimals     → "13.50"  (thousands grouped if needed, up to 2 decimals —
//                          matches typical ₱/kWh rates like ₱13.5012 → "13.50").
// Negative     → "-15,000".
// We don't use fmt.peso here because that prepends the ₱ symbol; the prefix
// span already shows ₱ next to the input, so the input value itself should
// be just the number.
function formatPesoForInput(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const isWhole = Number.isInteger(n);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  });
}

export function TextInput({ value, onChange, placeholder, width }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyles.input, width: width ?? '100%' }}
    />
  );
}

// =============================================================================
// PASSWORD INPUT — text input with a tap-to-reveal eye toggle
// -----------------------------------------------------------------------------
// v3-57: introduced for AuthDialog and MaintenanceGate so customers, reps, and
// admins can verify what they've typed before submitting (especially helpful
// on mobile, where typos are common and password mis-strikes are invisible).
//
// The toggle button sits absolutely positioned inside the input's right edge,
// matching the industry-standard pattern used by Google, GitHub, banks, etc.
// State is internal (each instance manages its own show/hide); callers do not
// control visibility. On mount the password is always hidden, regardless of
// any prefill — never persist the visible state across mounts.
//
// Accepts a `style` prop that gets merged into the native input style so
// callers can pass their existing input style (e.g. AuthDialog's brand-tinted
// input or MaintenanceGate's literal-hex input) without having to redo the
// styling here. Right padding is force-adjusted to leave room for the toggle.
//
// `onKeyDown` is forwarded so the Enter-to-submit pattern in both call sites
// continues to work.
// =============================================================================
export function PasswordInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoFocus,
  style,
  inputErrorStyle,
}) {
  const [visible, setVisible] = useState(false);
  // Merge caller-provided style; add right-padding to make room for the toggle
  // button (44px = roughly 32px button + 12px breathing room).
  const inputStyle = {
    ...(style || {}),
    paddingRight: 44,
    ...(inputErrorStyle || {}),
  };
  return (
    <div style={passwordInputStyles.wrapper}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        // Disable browser autofill that would re-fill a stale password
        autoComplete="current-password"
        style={inputStyle}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        // Don't take focus when tapped — keep the cursor in the input so the
        // user can keep typing after tapping the eye.
        onMouseDown={e => e.preventDefault()}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        style={passwordInputStyles.toggleBtn}
      >
        {visible ? EYE_OFF_ICON : EYE_ICON}
      </button>
    </div>
  );
}

// Eye icons (inline SVG — matches the rest of the app's icon idiom in ui.jsx).
// Stroke-only, 20×20, currentColor so the toggle inherits its colour from the
// button. Paths adapted from the Feather/Heroicons "eye" and "eye-off" set.
const EYE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EYE_OFF_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const passwordInputStyles = {
  wrapper: {
    position: 'relative',
    width: '100%',
  },
  toggleBtn: {
    position: 'absolute',
    right: 6,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    padding: 6,
    cursor: 'pointer',
    color: COLORS.textMuted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    // Larger touch target on mobile (32×32) but visually tighter
    minWidth: 32,
    minHeight: 32,
  },
};

// v3-82 — `disabled` added for Step 3B, which greys out at a 100% down payment
// (nothing financed => no tenor). Greyed rather than unmounted so the panel's
// layout doesn't jump when the customer crosses 100%.
export function Select({ value, onChange, options, width, large, xlarge, amber, disabled }) {
  const dynamic = {
    ...(large  ? inputStyles.inputLarge  : null),
    ...(xlarge ? inputStyles.inputXLarge : null),
    ...(amber  ? inputStyles.inputAmber  : null),
    ...(disabled ? { opacity: 0.45, cursor: 'not-allowed', backgroundColor: '#F3F4F6' } : null),
  };
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={e => {
        const v = e.target.value;
        // If options have numeric values, coerce
        const matched = options.find(o => String(o.value) === v);
        onChange(matched ? matched.value : v === '' ? null : v);
      }}
      style={{ ...inputStyles.input, ...dynamic, width: width ?? '100%' }}>
      {options.map((o, i) => (
        <option key={i} value={o.value === null ? '' : o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label, info }) {
  return (
    <label style={inputStyles.checkboxRow}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)}
             style={inputStyles.checkbox} />
      <span>{label}</span>
      {info && (
        <span
          style={{ display: 'inline-flex', alignItems: 'center' }}
          // Stop the click from bubbling to the parent <label>, which would
          // toggle the checkbox. The InfoTooltip handles its own click.
          onClick={e => e.preventDefault()}
        >
          <InfoTooltip content={info} ariaLabel={typeof label === 'string' ? `More info about ${label}` : 'More info'} />
        </span>
      )}
    </label>
  );
}

// ─── Display helpers ───────────────────────────────────────────────────────
// `large` bumps the value to 32px (used in Step 1 / Step 4 returns metrics).
// `xl` goes a step further to 40px ("supersize") — used in Section 2A's
// recommendation tiles where the values are short integers/decimals and
// benefit from extra weight on the page.
//
// `badge` (optional) renders a small amber pill in the tile's top-right
// corner. Used in Section 2A to flag when the customer has overridden a
// recommended value. `note` (optional) renders an italic muted line below
// the sub text — used to spell out the customer's chosen value alongside
// the recommendation when there's a mismatch.
//
// v3-51 additions:
//   • `tooltip` — optional content (string or JSX) shown via InfoTooltip
//     ⓘ icon next to the label. Used in Step 4 for the per-metric
//     explanations (Simple Payback, IRR, LCOE, DU Savings) that previously
//     lived in a "What do these numbers mean?" collapsible block.
//   • `stacked` — flips the tile into a horizontal label-left / value-right
//     row instead of the default label-on-top / value-below stack. Used in
//     Step 4 when the side-by-side Step3+Step4 layout (≥1024px) compresses
//     Step 4's grid into a narrower right column; vertical stacking of
//     thin rows reads better than a 2x2 of cards there.
export function StatTile({
  label, value, sub, color = COLORS.brandGreen, large, xl,
  badge, note, tooltip, stacked,
  // v3-63: optional right-hand column rendered INSIDE the tile, beside the
  // value/sub block. Used by Step 2A's Recommended Battery tile to host the
  // Battery Package selector (label + dropdown + hint) without a separate
  // section-level row. Wraps below the value block on narrow viewports.
  aside,
}) {
  const valueFontSize = xl ? 40 : (large ? (stacked ? 24 : 32) : 22);
  if (stacked) {
    // Horizontal layout: label + optional ⓘ on the left, value on the right
    // aligned along a shared baseline. Sub (e.g. LCOE's "Compare to your
    // current...") becomes a small secondary line under the label.
    return (
      <div style={statStyles.tileStacked}>
        <div style={statStyles.stackedLabelCol}>
          <div style={statStyles.labelWithTip}>
            <span style={statStyles.label}>{label}</span>
            {tooltip && <InfoTooltip content={tooltip}
                                     ariaLabel={typeof label === 'string' ? `More info about ${label}` : 'More info'} />}
          </div>
          {sub && <div style={statStyles.subStacked}>{sub}</div>}
        </div>
        <div className="stat-tile-value" style={{
          ...statStyles.value,
          color,
          fontSize: valueFontSize,
          textAlign: 'right',
        }}>
          {value}
        </div>
      </div>
    );
  }
  return (
    <div style={statStyles.tile}>
      <div style={aside ? statStyles.splitRow : undefined}>
        <div style={aside ? statStyles.splitLeftCol : undefined}>
          {/* Header row: label on the left, optional override badge on the right */}
          <div style={statStyles.headerRow}>
            <div style={statStyles.labelWithTip}>
              <span style={statStyles.label}>{label}</span>
              {tooltip && <InfoTooltip content={tooltip}
                                       ariaLabel={typeof label === 'string' ? `More info about ${label}` : 'More info'} />}
            </div>
            {badge && <div style={statStyles.badge}>{badge}</div>}
          </div>
          <div className="stat-tile-value" style={{
            ...statStyles.value,
            color,
            fontSize: valueFontSize,
          }}>
            {value}
          </div>
          {sub && <div style={statStyles.sub}>{sub}</div>}
          {note && <div style={statStyles.note}>{note}</div>}
        </div>
        {aside && <div style={statStyles.splitAsideCol}>{aside}</div>}
      </div>
    </div>
  );
}

export function CalloutBox({ kind = 'info', children }) {
  const map = {
    info:  { bg: '#F0F9FF', border: '#BAE6FD', text: '#075985' },
    warn:  { bg: '#FFFBEB', border: '#FCD34D', text: '#B45309' },
    error: { bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B' },
    ok:    { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  }[kind] || {};
  return (
    <div style={{
      backgroundColor: map.bg,
      border: `1px solid ${map.border}`,
      color: map.text,
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 13,
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

// ─── Currency/number formatters ─────────────────────────────────────────────
export const fmt = {
  peso: (v) => v == null ? '—' : '₱' + Number(v).toLocaleString('en-PH', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }),
  // Same shape as `peso` but without the leading ₱. Used in tabular layouts
  // (e.g. Summary tab Step 3) where the currency symbol lives in a dedicated
  // column so digits align cleanly across rows.
  pesoNoSymbol: (v) => v == null ? '—' : Number(v).toLocaleString('en-PH', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }),
  pesoCents: (v) => v == null ? '—' : '₱' + Number(v).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }),
  num: (v, dp = 0) => v == null ? '—' : Number(v).toLocaleString('en-PH', {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }),
  pct: (v, dp = 1) => v == null ? '—' : `${(v * 100).toFixed(dp)}%`,
};

// ═══ InfoTooltip ════════════════════════════════════════════════════════════
// A small ⓘ icon button that, when clicked, opens a popover containing
// arbitrary content (text, JSX, embedded SVG bill mockups). Used in Step 1
// to explain Service Type, where to find the rate per kWh on a Meralco bill,
// where to find the monthly charge, and in Step 2B to explain the Rapid
// Shutdown Device safety case.
//
// UX choices:
//   • Click-to-open (not hover) — works on touch, no accidental triggers.
//   • Click outside or × to dismiss.
//   • Pressing Esc also dismisses (keyboard parity).
//   • Anchored via `position: fixed` to viewport coordinates, NOT
//     `position: absolute` inside the wrapper. This is critical because
//     SectionCard has `overflow: hidden` (to clip its rounded corners),
//     which would otherwise clip any popover that extends past the card's
//     bottom edge — exactly what happens with the longer RSD tooltip
//     content. Fixed positioning escapes that overflow context, then we
//     manually compute viewport coords from the wrapper's getBoundingClientRect
//     and re-measure on scroll/resize.
//   • Width caps at 340px so it stays scoped near the field. On mobile
//     the popover gets `maxWidth: 92vw` to cover narrow phones gracefully,
//     and we shift it left if it would overflow the viewport's right edge.
//   • If there isn't enough room below the icon, we flip to render ABOVE
//     the icon — the caret moves to the bottom edge to match.
//   • Solviva orange (#E87722) bordered icon to signal interactivity and
//     stay on-brand.
// ───────────────────────────────────────────────────────────────────────────

export function InfoTooltip({ content, ariaLabel }) {
  const [open, setOpen] = useState(false);
  // Viewport-coordinate position of the popover. We compute it after open
  // (or on scroll/resize) from the wrapper's bounding rect so it stays
  // anchored to the icon even though the popover itself is `position:fixed`.
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'below', caretLeft: 13 });
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);

  // Recompute popover viewport coords. Called once on open, then again on
  // every scroll or resize so the popover tracks the icon if the user
  // scrolls the page while the tooltip is open.
  const reposition = () => {
    if (!wrapperRef.current || !popoverRef.current) return;
    const wrap = wrapperRef.current.getBoundingClientRect();
    const pop = popoverRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;             // breathing room from viewport edges
    const gap = 10;                // distance between icon and popover edge

    // Default placement: below the icon, popover's left edge slightly left
    // of the icon (so the caret sits over the icon at offset 13 from the
    // popover's left edge).
    let placement = 'below';
    let top = wrap.bottom + gap;

    // If there's not enough room below, flip above.
    const spaceBelow = vh - wrap.bottom - margin;
    const spaceAbove = wrap.top - margin;
    if (spaceBelow < pop.height && spaceAbove > spaceBelow) {
      placement = 'above';
      top = wrap.top - gap - pop.height;
    }

    // Horizontal: try to anchor the icon at caret offset 13 from the
    // popover's left edge. Default left is wrap.left - 8 (so caret-at-13
    // sits roughly over the icon center).
    const defaultLeft = wrap.left - 8;
    let left = defaultLeft;
    let caretLeft = 13;

    // Shift left if it would overflow the right edge.
    if (left + pop.width > vw - margin) {
      const shift = (left + pop.width) - (vw - margin);
      left = defaultLeft - shift;
      caretLeft = 13 + shift;
    }
    // Shift right if it would overflow the left edge.
    if (left < margin) {
      const shift = margin - left;
      left = margin;
      caretLeft = Math.max(8, 13 - shift);
    }

    setPos({ top, left, placement, caretLeft });
  };

  // Measure once after the popover renders (initial open).
  useEffect(() => {
    if (!open) return;
    // Run synchronously after layout. requestAnimationFrame ensures the
    // popover has been painted with its content so getBoundingClientRect
    // returns the real height.
    const raf = requestAnimationFrame(() => reposition());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-measure on scroll/resize while open so the popover stays anchored.
  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => reposition();
    window.addEventListener('scroll', onScrollOrResize, true);  // capture for nested scrollers
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (wrapperRef.current && wrapperRef.current.contains(e.target)) return;
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} style={infoStyles.wrap}>
      <button
        type="button"
        className="info-icon-btn"
        onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
        aria-label={ariaLabel || 'More info'}
        aria-expanded={open}
        style={infoStyles.iconBtn}
      >
        <span style={infoStyles.iconChar}>i</span>
      </button>
      {open && (
        <div ref={popoverRef} role="dialog"
             style={{ ...infoStyles.popover, top: pos.top, left: pos.left }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={infoStyles.closeBtn}
          >
            ×
          </button>
          {pos.placement === 'below' ? (
            <span style={{ ...infoStyles.caretTop, left: pos.caretLeft }} aria-hidden="true" />
          ) : (
            <span style={{ ...infoStyles.caretBottom, left: pos.caretLeft }} aria-hidden="true" />
          )}
          <div style={infoStyles.popoverBody}>{content}</div>
        </div>
      )}
    </span>
  );
}

const infoStyles = {
  wrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  iconBtn: {
    width: 18,
    height: 18,
    minWidth: 18,
    minHeight: 18,
    boxSizing: 'border-box',
    borderRadius: '50%',
    border: '1px solid #E87722',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    flexShrink: 0,
    flexGrow: 0,
  },
  iconChar: {
    fontSize: 11,
    fontWeight: 600,
    fontStyle: 'italic',
    color: '#E87722',
    lineHeight: 1,
    fontFamily: '"Times New Roman", serif',
  },
  popover: {
    // position:fixed (not absolute) so the popover escapes any ancestor's
    // overflow:hidden context — most importantly SectionCard, which clips
    // its rounded corners and would otherwise truncate longer popovers
    // (like the RSD safety explainer) at the card's bottom edge. Top and
    // left are computed in JS from the wrapper's getBoundingClientRect.
    position: 'fixed',
    width: 340,
    maxWidth: 'calc(100vw - 24px)',
    backgroundColor: '#FFFFFF',
    border: '0.5px solid #B4B2A9',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    // 100 sits above the SectionCard stacking context (no z-index there)
    // and below the rep-mode confirm dialog overlay (zIndex 1000) so a
    // tooltip never visually competes with a modal.
    zIndex: 100,
    fontWeight: 400,
  },
  // Caret rendered at the TOP of the popover (popover is below the icon).
  caretTop: {
    position: 'absolute',
    top: -6,
    width: 10,
    height: 10,
    backgroundColor: '#FFFFFF',
    borderTop: '0.5px solid #B4B2A9',
    borderLeft: '0.5px solid #B4B2A9',
    transform: 'rotate(45deg)',
  },
  // Caret rendered at the BOTTOM of the popover (popover is above the icon —
  // used when there's not enough room below).
  caretBottom: {
    position: 'absolute',
    bottom: -6,
    width: 10,
    height: 10,
    backgroundColor: '#FFFFFF',
    borderRight: '0.5px solid #B4B2A9',
    borderBottom: '0.5px solid #B4B2A9',
    transform: 'rotate(45deg)',
  },
  closeBtn: {
    position: 'absolute',
    top: 4,
    right: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    color: '#888780',
    fontFamily: 'inherit',
    fontSize: 16,
    lineHeight: 1,
  },
  popoverBody: {
    padding: '14px 16px 14px 16px',
    fontSize: 12,
    lineHeight: 1.55,
    color: '#1F2937',
    // Reset inherited uppercase text-transform from any parent that may carry
    // it (subsectionTitle and chartTitle both set textTransform:'uppercase').
    // The popover uses position:fixed to escape ancestor overflow contexts,
    // but text-transform inherits via the DOM tree, not the visual layout —
    // so it follows the <h3> parent regardless. Reset here once so any
    // future tooltip placed inside any uppercase parent is protected.
    textTransform: 'none',
    // Same defensive reset for letter-spacing (subsectionTitle uses 0.05em
    // tracking which would also inherit and bloat tooltip prose).
    letterSpacing: 'normal',
  },
};

// ═══ RSD info content ══════════════════════════════════════════════════════
// Customer-mode tooltip for the Rapid Shutdown Device checkbox in Step 2B.
// Goal: explain RSD as a safety enhancement, accurately stating its legal
// status. The Philippine Electrical Code (PEC 2017, §6.90.2.6, effective
// 2019-01-01) DOES require a rapid-shutdown FUNCTION for rooftop PV — the
// same intent as the US NEC 690.12 standard. For many residential installs
// with short DC runs the function can be met by the system layout and
// inverter, so a separate module-level DEVICE is not always mandatory; that
// depends on the configuration and the local inspector/AHJ. Tone is
// informative — not alarmist — and ends by deferring to the customer's
// choice while flagging Solviva's recommendation. (Verified v3-96 against
// PEC-citing PH engineering sources — the pre-v3-96 "not required" copy was
// factually wrong and is corrected below.)
export const RSD_INFO = (
  <div>
    <div style={{ marginBottom: 10, color: '#444441' }}>
      A <span style={{ fontWeight: 500, color: '#25543A' }}>Rapid Shutdown Device</span> is a small
      module installed at each panel that lets first responders quickly de-energize the rooftop
      DC wiring during an emergency.
    </div>
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontWeight: 500, color: '#25543A' }}>Why it matters:</span>{' '}
      <span style={{ color: '#444441' }}>
        Without RSD, solar panels keep generating live DC voltage on the roof whenever the sun is
        out — even if the main breaker is off. That can put firefighters at electrocution risk
        if they need to cut into the roof during a fire.
      </span>
    </div>
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontWeight: 500, color: '#25543A' }}>How RSD helps:</span>{' '}
      <span style={{ color: '#444441' }}>
        With one button-press at the AC disconnect, RSD drops each panel's output to a safe
        voltage within 30 seconds. It also adds module-level monitoring so you can spot
        underperforming panels.
      </span>
    </div>
    <div style={{
      fontStyle: 'italic',
      color: '#5F5E5A',
      fontSize: 11,
      paddingTop: 8,
      borderTop: '0.5px dashed #D3D1C7',
    }}>
      A rapid-shutdown function is required by the Philippine Electrical Code (PEC 2017, §6.90.2.6),
      and is the US standard too (NEC 690.12). On many homes with short cable runs that function is
      already met by the system layout and inverter, so a separate module-level device isn't always
      mandatory — it depends on your configuration and your local inspector. Solviva recommends RSD
      on every install, especially for homes with children or in dense neighborhoods. Your agent can
      confirm what your home needs and walk you through the cost during follow-up.
    </div>
  </div>
);

// ═══ DC/AC ratio info content (v3-138) ═════════════════════════════════════
// Anchored on the "DC/AC ratio:" label in Step 2C's summary row, NOT on the
// Subsection header — the header already carries the "BNEF Tier-1" hint, and
// the ratio row is the precise referent. 2C has been PUBLIC since v3-121, so
// this copy is customer-facing: it explains why the ratio is deliberately
// above 1.0 (nameplate is a lab figure) and why there is a cap (clipping),
// without asking the reader to know what "clipping" means first.
// The cap numbers are stated literally (1.3 / 1.6) rather than read from
// PANEL_SETTINGS: ui.jsx holds no imports beyond React by design, and both
// values are already visible in the row this tooltip sits in.
export const DC_AC_RATIO_INFO = (
  <div>
    <div style={{ marginBottom: 10, color: '#444441' }}>
      Your panels are rated in <span style={{ fontWeight: 500, color: '#25543A' }}>DC</span> kilowatts
      (kWp); your inverter is rated in <span style={{ fontWeight: 500, color: '#25543A' }}>AC</span> kilowatts.
      The DC/AC ratio is simply the first divided by the second.
    </div>
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontWeight: 500, color: '#25543A' }}>Why it's above 1.0:</span>{' '}
      <span style={{ color: '#444441' }}>
        panels almost never hit their rated output — that figure is measured in a lab. Under real
        Philippine conditions a typical array peaks at roughly 75–85% of nameplate, so pairing it
        with a slightly smaller inverter costs less and gives up almost nothing.
      </span>
    </div>
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontWeight: 500, color: '#25543A' }}>Why there's a maximum:</span>{' '}
      <span style={{ color: '#444441' }}>
        past the cap the inverter would sit at its ceiling for much of the day and start clipping —
        discarding energy your panels already produced. Solviva caps the ratio so your system isn't
        throwing away production you paid for.
      </span>
    </div>
    <div style={{
      fontStyle: 'italic',
      color: '#5F5E5A',
      fontSize: 11,
      paddingTop: 8,
      borderTop: '0.5px dashed #D3D1C7',
    }}>
      {/* v3-141 — no literal cap values here: the caps are per-phase admin
          parameters (Panel Settings → Max DC/AC Ratio) and hardcoded numbers
          drift the moment they're edited. The live cap already prints beside
          the ratio via sizing.maxRatio. */}
      The exact cap for your setup is shown beside the ratio — Solviva sets it conservatively
      below the inverter manufacturer's own allowable maximum. If your selection goes over,
      add a larger inverter or a second unit — the warning above will clear.
    </div>
  </div>
);

// ═══ Service Type info content ═════════════════════════════════════════════
export const SERVICE_TYPE_INFO = (
  <div>
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontWeight: 500, color: '#25543A' }}>Single-phase:</span>{' '}
      <span style={{ color: '#444441' }}>
        Standard for residential homes and small businesses.
      </span>
    </div>
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontWeight: 500, color: '#25543A' }}>3-phase:</span>{' '}
      <span style={{ color: '#444441' }}>
        For larger commercial buildings, factories, or homes with industrial-scale loads.
        Your electricity bill or meter will indicate "3-phase" or "3Φ" if applicable.
      </span>
    </div>
    <div style={{
      fontStyle: 'italic',
      color: '#5F5E5A',
      fontSize: 11,
      paddingTop: 8,
      borderTop: '0.5px dashed #D3D1C7',
    }}>
      When in doubt, single-phase is the safe default — your Solviva agent can confirm
      during the site visit.
    </div>
  </div>
);

// ═══ Meralco bill mockups (used in 1B and 1C info popovers) ═══════════════
// These are stylized representations of a Meralco bill — fully synthetic, no
// customer PII. Built as inline JSX so they ship in the bundle and render
// crisply at any size, with Solviva orange (#E87722) accents on the field
// being called out.
// ───────────────────────────────────────────────────────────────────────────

function MeralcoRateMockup() {
  return (
    <div style={mockupStyles.bill}>
      <div style={mockupStyles.billHeader}>
        <div>
          <div style={mockupStyles.billHeaderName}>Juan dela Cruz</div>
          <div style={mockupStyles.billHeaderName}>123 Sample St, Metro Manila</div>
        </div>
        <div style={mockupStyles.meralcoBrand}>MERALCO</div>
      </div>

      <div style={mockupStyles.billTitle}>Your electric bill</div>

      <div style={mockupStyles.billMeta}>
        <div>
          <div style={mockupStyles.billMetaLabel}>Billing Period</div>
          <div style={mockupStyles.billMetaValue}>07 Mar — 06 Apr 2026</div>
        </div>
        <div>
          <div style={mockupStyles.billMetaLabel}>Bill Date</div>
          <div style={mockupStyles.billMetaValue}>08 Apr 2026</div>
        </div>
      </div>

      <div style={mockupStyles.highlightBlock}>
        <div style={mockupStyles.highlightLabel}>Your rate this month</div>
        <div style={mockupStyles.highlightValue}>
          ₱15.68{' '}
          <span style={mockupStyles.highlightUnit}>per kWh</span>
        </div>
      </div>

      <div style={mockupStyles.placeholderRows}>
        <div style={{ ...mockupStyles.placeholderRow, width: '70%' }} />
        <div style={{ ...mockupStyles.placeholderRow, width: '85%' }} />
        <div style={{ ...mockupStyles.placeholderRow, width: '60%' }} />
        <div style={{ ...mockupStyles.placeholderRow, width: '78%' }} />
        <div style={{ ...mockupStyles.placeholderRow, width: '50%' }} />
      </div>
    </div>
  );
}

function MeralcoChargesMockup() {
  return (
    <div style={mockupStyles.bill}>
      <div style={mockupStyles.billHeaderRow}>
        <div style={mockupStyles.billTitle}>Bill Computation Summary</div>
        <div style={mockupStyles.meralcoBrand}>MERALCO</div>
      </div>

      <div style={mockupStyles.chargeLine}>
        <span>Remaining Balance from previous bill</span>
        <span style={{ color: '#444441' }}>0.00</span>
      </div>

      <div style={mockupStyles.highlightBlockCharges}>
        <div style={mockupStyles.highlightChargesRow}>
          <span style={mockupStyles.highlightChargesLabel}>Charges for this billing period</span>
          <span style={mockupStyles.highlightChargesValue}>31,122.72</span>
        </div>
      </div>

      <div style={mockupStyles.subCharges}>
        <div style={mockupStyles.subChargeLine}><span>Generation</span><span>16,261.23</span></div>
        <div style={mockupStyles.subChargeLine}><span>Transmission</span><span>2,824.54</span></div>
        <div style={mockupStyles.subChargeLine}><span>System Loss</span><span>1,503.11</span></div>
        <div style={mockupStyles.subChargeLine}><span>Distribution (Meralco)</span><span>5,299.93</span></div>
        <div style={mockupStyles.subChargeLine}><span>Government Taxes</span><span>3,403.86</span></div>
        <div style={{ ...mockupStyles.subChargeLine, opacity: 0.6 }}>
          <span>Universal Charges, FiT-All, etc.</span><span>—</span>
        </div>
      </div>

      <div style={mockupStyles.totalRow}>
        <span style={{ color: '#5F5E5A' }}>Total Amount Due</span>
        <span style={mockupStyles.totalValue}>₱31,122.72</span>
      </div>
    </div>
  );
}

const mockupStyles = {
  bill: {
    backgroundColor: '#FAFAF7',
    border: '0.5px solid #D3D1C7',
    borderRadius: 6,
    padding: '12px 14px',
    fontFamily: 'inherit',
  },
  billHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '0.5px solid #D3D1C7',
  },
  billHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '0.5px solid #D3D1C7',
  },
  billHeaderName: {
    fontSize: 8.5,
    color: '#888780',
    lineHeight: 1.3,
  },
  meralcoBrand: {
    fontSize: 9,
    fontWeight: 500,
    color: '#E87722',
    letterSpacing: 0.3,
  },
  billTitle: {
    fontSize: 11,
    fontWeight: 500,
    color: '#1F2937',
  },
  billMeta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
    fontSize: 8.5,
    color: '#5F5E5A',
  },
  billMetaLabel: {
    color: '#888780',
    marginBottom: 1,
  },
  billMetaValue: {
    color: '#444441',
  },
  highlightBlock: {
    padding: '8px 10px',
    borderRadius: 5,
    backgroundColor: '#FFF3E8',
    border: '1.5px solid #E87722',
    marginBottom: 8,
  },
  highlightLabel: {
    fontSize: 9,
    color: '#5F5E5A',
    marginBottom: 2,
  },
  highlightValue: {
    fontSize: 16,
    fontWeight: 500,
    color: '#1F2937',
    lineHeight: 1.1,
  },
  highlightUnit: {
    fontSize: 10,
    fontWeight: 400,
    color: '#5F5E5A',
  },
  placeholderRows: {
    opacity: 0.35,
  },
  placeholderRow: {
    height: 6,
    backgroundColor: '#D3D1C7',
    borderRadius: 3,
    marginBottom: 4,
  },
  chargeLine: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#5F5E5A',
    padding: '3px 0',
  },
  highlightBlockCharges: {
    padding: '7px 9px',
    borderRadius: 5,
    backgroundColor: '#FFF3E8',
    border: '1.5px solid #E87722',
    margin: '4px 0',
  },
  highlightChargesRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  highlightChargesLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: '#4A1B0C',
  },
  highlightChargesValue: {
    fontSize: 12,
    fontWeight: 500,
    color: '#1F2937',
  },
  subCharges: {
    paddingLeft: 8,
    marginTop: 4,
    fontSize: 9,
    color: '#888780',
    lineHeight: 1.55,
  },
  subChargeLine: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  totalRow: {
    borderTop: '0.5px solid #D3D1C7',
    marginTop: 8,
    paddingTop: 6,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 10,
  },
  totalValue: {
    fontSize: 11,
    fontWeight: 500,
    color: '#444441',
  },
};

// ═══ 1B and 1C info content ═════════════════════════════════════════════
const calloutStripStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 10,
  padding: '8px 10px',
  backgroundColor: '#FFF3E8',
  borderRadius: 6,
  fontSize: 11,
  color: '#4A1B0C',
  lineHeight: 1.4,
};

const calloutArrow = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E87722"
       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0 }} aria-hidden="true">
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
);

export const RATE_INFO = (
  <div>
    <div style={{ marginBottom: 10, color: '#444441' }}>
      Your DU statement should show your effective rate per kWh near the top.
      On Meralco bills, look for{' '}
      <span style={{ fontWeight: 500, color: '#25543A' }}>"Your rate this month"</span>{' '}
      — shown as a peso-per-kWh value (e.g., ₱15.68 per kWh).
    </div>
    <MeralcoRateMockup />
    <div style={calloutStripStyle}>
      {calloutArrow}
      <span>
        Look for <strong style={{ fontWeight: 500 }}>"Your rate this month"</strong> near the top of your bill.
      </span>
    </div>
    <div style={{
      fontStyle: 'italic',
      color: '#5F5E5A',
      fontSize: 11,
      marginTop: 10,
      paddingTop: 8,
      borderTop: '0.5px dashed #D3D1C7',
    }}>
      This rate changes slightly each month. Use the figure from your most recent bill
      for the most accurate estimate.
    </div>
  </div>
);

export const CHARGES_INFO = (
  <div>
    <div style={{ marginBottom: 10, color: '#444441' }}>
      Your DU statement should show a breakdown of charges for the current billing
      period, separate from any carry-over balance. On Meralco bills, look for{' '}
      <span style={{ fontWeight: 500, color: '#25543A' }}>"Charges for this billing period"</span>{' '}
      in the Bill Computation Summary.
    </div>
    <MeralcoChargesMockup />
    <div style={calloutStripStyle}>
      {calloutArrow}
      <span>
        Use <strong style={{ fontWeight: 500 }}>"Charges for this billing period"</strong>, not "Total Amount Due".
      </span>
    </div>
    <div style={{
      fontStyle: 'italic',
      color: '#5F5E5A',
      fontSize: 11,
      marginTop: 10,
      paddingTop: 8,
      borderTop: '0.5px dashed #D3D1C7',
    }}>
      This is more accurate than the total "amount due" or "please pay" figure, which
      can include carry-over from prior over- or underpayments.
    </div>
  </div>
);

// ═══ Major Devices info content (Step 1 · 1D) ══════════════════════════════
// Explains why the major-devices section affects battery sizing (it skews the
// day/night load split, which is otherwise assumed to be 50/50). Shipped in
// v3-37 alongside the Radiance Curve tooltip.
export const MAJOR_DEVICES_INFO = (
  <div style={{ color: '#444441' }}>
    By default, this calculator assumes your daily electricity consumption is split evenly
    between day and night. Consumption that's heavier in the daytime needs{' '}
    <span style={{ fontWeight: 500, color: '#25543A' }}>fewer batteries</span>;
    consumption that's heavier at night needs{' '}
    <span style={{ fontWeight: 500, color: '#25543A' }}>more</span>. Entering the usual{' '}
    <span style={{ fontWeight: 500, color: '#25543A' }}>hours</span> you use your major
    devices and appliances helps determine this.
  </div>
);

// ═══ Radiance Curve info content (Energy Visuals) ═══════════════════════════
// Explains the four chart elements using their canonical "voice" colors —
// each color is also the chart stroke and the legend swatch border for that
// category, so the customer reads "blue" / "orange" / "dark green line" /
// "light green" and can find them at a glance.
//
// v3-43: This block now serves dual duty:
//   1. Always-visible explainer panel on the right side of the desktop
//      Radiance Curve card (replacing the recharts vertical chip-legend).
//   2. Collapsible "How to read this chart" panel below the chart on mobile.
//
// The previous v3-37 single-paragraph form has been split into THREE paragraphs
// with parenthetical category labels — `(Baseload)`, `(Major Devices)`,
// `(Solar Coverage)`, `(Excess Solar)` — to make the colored keywords work as
// a self-contained legend (since the recharts auto-legend is gone). Each
// colored keyword is preceded by a small filled square ("chip") in the same
// fill color the chart uses for that band, so the reader can match the
// keyword to its band on the chart at a glance.
//
// Color rules:
//   • Chip fill           — the chart FILL color (light tint) — visually
//                            matches the band drawn in the chart
//   • Keyword text color  — the canonical "voice" stroke color (darker shade)
//                            — readable on white, echoes the tooltip emphasis
//   • Parenthetical label — also voice color but at body weight, so it's
//                            grouped with the keyword by color but doesn't
//                            compete for emphasis
const RC_VOICE_BLUE       = '#4A6FA5';  // Baseload — voice / stroke
const RC_VOICE_ORANGE     = '#B8730D';  // Major Devices — voice / stroke
const RC_VOICE_DARKGREEN  = '#1F8A4C';  // Solar Coverage — line color
const RC_VOICE_LIGHTGREEN = '#6FA830';  // Excess Solar — voice / stroke
const RC_FILL_BLUE        = '#B8C9E3';  // Baseload fill (chart band tint)
const RC_FILL_ORANGE      = '#F4B860';  // Major Devices fill
const RC_FILL_LIGHTGREEN  = '#C9E089';  // Excess Solar fill

// Chip — small colored square inline before a keyword. The fill is the band
// tint from the chart so it matches what the eye sees in the plot area; the
// border is the same "voice" color used for the keyword text so the chip and
// label feel like one unit.
const rcChipStyle = (fill, border) => ({
  display: 'inline-block',
  width: 10,
  height: 10,
  backgroundColor: fill,
  border: `1px solid ${border}`,
  borderRadius: 2,
  marginRight: 6,
  verticalAlign: 'middle',
  // Lift the chip a hair to optically center against text x-height
  position: 'relative',
  top: -1,
});
// Solar Coverage is a line, not a band. We render its "chip" as a short
// horizontal bar (same dark green) so it visually reads as a line, not a fill.
const rcLineChipStyle = {
  display: 'inline-block',
  width: 14,
  height: 3,
  backgroundColor: RC_VOICE_DARKGREEN,
  marginRight: 6,
  verticalAlign: 'middle',
  position: 'relative',
  top: -2,
};
// The colored keyword itself — bold + voice color so the word reads as a
// proper noun. We deliberately do NOT supersize it (was 16px in v3-37) since
// the explainer is body copy now, not a tooltip headline.
const rcKeywordStyle = (color) => ({
  fontWeight: 700,
  color,
  whiteSpace: 'nowrap',  // avoid orphan wrap on "dark green line"
});
// Parenthetical category label following the keyword — same color as the
// keyword but lighter weight, so the pair reads as one unit but the
// parenthetical doesn't shout.
const rcCatStyle = (color) => ({
  color,
  fontWeight: 500,
});

export const RADIANCE_CURVE_INFO = (
  <div style={{ color: '#444441', lineHeight: 1.55 }}>
    <p style={{ margin: '0 0 12px' }}>
      The <span style={rcChipStyle(RC_FILL_BLUE, RC_VOICE_BLUE)} />
      <span style={rcKeywordStyle(RC_VOICE_BLUE)}>blue</span>{' '}
      <span style={rcCatStyle(RC_VOICE_BLUE)}>(Baseload)</span> and{' '}
      <span style={rcChipStyle(RC_FILL_ORANGE, RC_VOICE_ORANGE)} />
      <span style={rcKeywordStyle(RC_VOICE_ORANGE)}>orange</span>{' '}
      <span style={rcCatStyle(RC_VOICE_ORANGE)}>(Major Devices)</span> areas
      represent your electricity consumption.
    </p>
    <p style={{ margin: '0 0 12px' }}>
      Consumption that falls under the{' '}
      <span style={rcLineChipStyle} />
      <span style={rcKeywordStyle(RC_VOICE_DARKGREEN)}>dark green line</span>{' '}
      <span style={rcCatStyle(RC_VOICE_DARKGREEN)}>(Solar Coverage)</span>{' '}
      represents electricity supplied directly by the solar panels.
    </p>
    <p style={{ margin: 0 }}>
      The <span style={rcChipStyle(RC_FILL_LIGHTGREEN, RC_VOICE_LIGHTGREEN)} />
      <span style={rcKeywordStyle(RC_VOICE_LIGHTGREEN)}>light green</span>{' '}
      <span style={rcCatStyle(RC_VOICE_LIGHTGREEN)}>(Excess Solar)</span> area
      represents energy that can either be stored in batteries
      (@~90&#8209;98% efficiency) or sold back to the grid (credited at
      roughly half the retail rate) for later use.
    </p>
  </div>
);

// ═══ Styles ════════════════════════════════════════════════════════════════
const cardStyles = {
  card: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 12,
    border: `1px solid ${COLORS.divider}`,
    marginBottom: 24,
    overflow: 'hidden',
  },
  header: {
    padding: '24px 28px 16px',
    borderBottom: `1px solid ${COLORS.divider}`,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.brandGreen,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.textBody,
    margin: 0,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    margin: '6px 0 0',
    lineHeight: 1.5,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  resetBtn: {
    background: 'transparent',
    border: `1px solid ${COLORS.divider}`,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  body: {
    padding: '24px 28px',
  },
  subsection: {
    marginBottom: 28,
  },
  subsectionHeader: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `1px dashed ${COLORS.divider}`,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.brandGreen,
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subsectionHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontWeight: 400,
    textTransform: 'none',
    letterSpacing: 0,
  },
};

const fieldStyles = {
  stacked: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 14,
  },
  inline: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 10,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.textBody,
  },
  labelText: {},
  control: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  controlInline: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  recSlot: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 22,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  error: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: 500,
  },
  recPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.recHint,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  recPillActive: {
    backgroundColor: COLORS.brandGreen,
  },
};

const inputStyles = {
  wrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  input: {
    fontSize: 14,
    padding: '8px 12px',
    border: `1px solid ${COLORS.inputBorder}`,
    borderRadius: 6,
    backgroundColor: COLORS.inputTint,
    color: COLORS.textBody,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  // v3-142 — `compact` variant for inputs embedded in admin table cells
  // (misc catalog, delivery locations): tighter padding + smaller font so
  // rows keep their density while gaining NumberInput's peso comma
  // formatting.
  inputCompact: {
    fontSize: 13,
    padding: '4px 6px',
    borderRadius: 4,
    textAlign: 'right',
  },
  // `large` variant for inputs that live inside tile bodies (Section 2A
  // Selected row). Bigger font + vertical padding so the input visually
  // pairs with the supersized read-only values in the Recommended row
  // tiles.
  inputLarge: {
    fontSize: 24,
    fontWeight: 700,
    padding: '8px 12px',
    color: COLORS.brandGreen,
    letterSpacing: -0.3,
  },
  // `xlarge` is used for top-level "driver" inputs whose value DETERMINES
  // the supersized read-out tiles below them — currently the "Desired
  // savings" dropdown in Section 2A and the Tenor + DP% dropdowns in
  // Step 3. v3-52 dropped from 32px to 22px: at 32px, the browser's native
  // dropdown panel inherited the trigger font-size, making the options
  // panel oversized (each option row ~60px tall) — only ~7-8 of the 11/13
  // tenor and DP% values fit before scrolling. 22px is still visibly
  // bigger than ordinary form fields (12-14px) so the "driver input"
  // signal is preserved, but the native options panel now fits all
  // values without scrolling on typical viewports.
  inputXLarge: {
    fontSize: 22,
    fontWeight: 700,
    padding: '8px 14px',
    color: COLORS.brandGreen,
    letterSpacing: -0.3,
  },
  // `amber` variant — same warning palette as CalloutBox kind="warn" and
  // SelectedTile's tileAmber background. Used to flag a value that's been
  // overridden away from the recommendation.
  inputAmber: {
    backgroundColor: '#FEF3C7',
    border: '1px solid #FCD34D',
    color: '#854F0B',
  },
  // v3-142 — red error variant, matching the ad-hoc error styling the admin
  // tables used on their raw inputs (COLORS.error border, faint red fill).
  inputError: {
    backgroundColor: '#FEF2F2',
    border: `1px solid ${COLORS.error}`,
  },
  prefix: {
    position: 'absolute',
    left: 10,
    color: COLORS.textMuted,
    fontSize: 13,
    pointerEvents: 'none',
  },
  suffix: {
    position: 'absolute',
    right: 10,
    color: COLORS.textMuted,
    fontSize: 13,
    pointerEvents: 'none',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    cursor: 'pointer',
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: 'pointer',
  },
};

const statStyles = {
  tile: {
    backgroundColor: COLORS.brandCream,
    borderRadius: 8,
    padding: '14px 16px',
    border: `1px solid ${COLORS.divider}`,
  },
  // v3-63: two-column split used when the `aside` prop is present. The value
  // block keeps its natural width on the left; the aside takes the remaining
  // space on the right. flexWrap lets the aside drop below the value block
  // on narrow (mobile) viewports instead of squeezing both columns.
  splitRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    columnGap: 16,
    rowGap: 10,
  },
  splitLeftCol: {
    flex: '0 1 auto',
    minWidth: 96,
  },
  splitAsideCol: {
    flex: '1 1 180px',
    minWidth: 170,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    textAlign: 'right',
  },
  // Header row holds the label and the optional badge side-by-side. We
  // can't put the badge inline with the label text because it would push
  // the label awkwardly when the badge appears/disappears; flex with
  // space-between keeps the label flush-left and the badge flush-right
  // with consistent spacing whether or not the badge is present.
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Amber "Overridden" pill in the tile header. Same palette as the
  // testing-phase notice and the net-metering callouts so the warning
  // signal is visually consistent across the app.
  badge: {
    backgroundColor: '#FEF3C7',
    border: '1px solid #FCD34D',
    color: '#854F0B',
    fontSize: 9.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 7px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    lineHeight: 1.2,
  },
  value: {
    fontWeight: 700,
    letterSpacing: -0.4,
    lineHeight: 1.1,
  },
  sub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  // Italic muted line below the sub text. Used to surface the customer's
  // overridden value next to the recommendation, or to clarify what the
  // tile's number is computed from (e.g., "Based on 7 panels selected.").
  note: {
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 1.4,
  },
  // ─── stacked variant (v3-51) ────────────────────────────────────────────
  // Horizontal row layout for narrow-column Step 4 contexts: label on the
  // left, value on the right. Vertical-stack of these reads like a clean
  // list of stats; uses about half the height of the default card grid.
  tileStacked: {
    backgroundColor: COLORS.brandCream,
    borderRadius: 8,
    padding: '12px 16px',
    border: `1px solid ${COLORS.divider}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  stackedLabelCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  subStacked: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
  // Label + InfoTooltip icon side-by-side. Used in both default and
  // stacked variants. The wrapper makes the ⓘ icon's click target
  // distinct from the label text.
  labelWithTip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
};
