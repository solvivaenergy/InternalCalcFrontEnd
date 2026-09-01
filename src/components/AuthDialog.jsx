// =============================================================================
// AUTH DIALOG — password gate for Inventory/Admin and (optionally) Rep mode
// -----------------------------------------------------------------------------
// Default (admin) usage — four passwords, match order, first hit wins:
//   • editPassword         → 'edit'        (Super Admin — edits everything)
//   • engineeringPassword  → 'engineering' (Engineering Team)
//   • productPassword      → 'product'     (Product Team)
//   • fincoPassword        → 'finco'       (FinCo Admin — v3-180)
//   • viewPassword         → 'view'        (read-only)
//
// Rep-only usage — pass `repOnly` + `repPassword`:
//   The dialog renders with rep-mode copy ("Sales Rep Access") and only
//   accepts the rep password. On success, onAuth('rep') is called.
//   This is what the footer 🔒 Rep mode lock opens.
//
// v3-203 — unified staff mode: pass `unified` + ALL passwords. One dialog for
//   every staff tier (D1). Match order: admin tiers first (Super Admin →
//   Engineering → Product → FinCo → Audit) so a password duplicated into the
//   rep slot never downgrades a role; then repPassword / testingPassword →
//   onAuth('rep'). The caller maps admin tiers to rep-mode + adminAccess.
// =============================================================================

import React, { useState } from 'react';
import { COLORS, PasswordInput } from './ui.jsx';

export default function AuthDialog({
  onAuth,
  onCancel,
  // Admin tier passwords (used when repOnly is false)
  viewPassword,
  editPassword,
  engineeringPassword,
  productPassword,
  fincoPassword,
  // Rep-only mode
  repOnly = false,
  repPassword,
  // v3-203 unified staff mode — accepts every configured password; admin
  // tiers report their level, rep/maintenance report 'rep'.
  unified = false,
  testingPassword,
  // v3-51: optional generic-accept mode for the Summary tab's Expand-detail
  // gate. Pass an array of acceptable passwords and a callback that's called
  // (with no arg) when ANY of them matches. Title/subtitle can be overridden
  // to fit the specific use case. When `acceptedPasswords` is set, the
  // repOnly/admin branches above are bypassed.
  acceptedPasswords,
  customTitle,
  customSubtitle,
  // v3-51: render as a centered modal overlay (semi-transparent backdrop)
  // instead of a full-screen page. Used by the Summary tab so authenticating
  // doesn't replace the entire view.
  modal = false,
}) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(null);

  const tryAuth = () => {
    // v3-207 — the v3-205 empty-submit → public-view exit is REMOVED (Pat):
    // with the "Go back to Public View" pill retained, the key switches
    // between STAFF views only, and the pill is the sole public exit. An
    // empty submit now just falls through to "Incorrect password".
    // v3-51: generic-accept path takes precedence when caller supplied a
    // password list. Used by the Summary Expand-detail button.
    if (Array.isArray(acceptedPasswords)) {
      const accepted = acceptedPasswords.filter(Boolean);
      if (accepted.includes(pw)) {
        onAuth();
      } else {
        setError('Incorrect password');
        setPw('');
      }
      return;
    }
    if (repOnly) {
      // Rep-only branch: single password, single role.
      if (pw === repPassword) {
        onAuth('rep');
      } else {
        setError('Incorrect password');
        setPw('');
      }
      return;
    }
    // Admin branch — order matters: Super Admin first so a duplicated
    // password (intentional or accidental) doesn't get downgraded to a
    // lower role. v3-203: the unified branch shares this ladder and appends
    // rep/maintenance at the BOTTOM for the same reason.
    if (pw === editPassword) {
      onAuth('edit');
    } else if (pw === engineeringPassword) {
      onAuth('engineering');
    } else if (pw === productPassword) {
      onAuth('product');
    } else if (pw === fincoPassword) {
      onAuth('finco');
    } else if (pw === viewPassword) {
      onAuth('view');
    } else if (unified && ((repPassword && pw === repPassword)
                        || (testingPassword && pw === testingPassword))) {
      onAuth('rep');
    } else {
      setError('Incorrect password');
      setPw('');
    }
  };

  const title    = customTitle    ?? (unified ? 'Staff Sign-in'
                                   : repOnly  ? 'Sales Rep Access' : 'Admin Access');
  const subtitle = customSubtitle ?? (unified
                    ? 'Enter your Solviva access password to switch views.'
                    : repOnly
                    ? 'Enter the rep password to unlock the full calculator view.'
                    : 'Enter password to view or edit calculator parameters.');

  // Modal-mode overlay: semi-transparent backdrop, centered card. Uses
  // position: fixed so the underlying view scrolls/renders normally
  // beneath the dialog.
  const overlayStyle = modal ? styles.overlayModal : styles.overlay;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={styles.card}>
        {/* v3-122 — empty-string title/subtitle render NOTHING (the Summary
            price-reveal gate passes '' so the dialog shows only the password
            field — user-directed: don't explain what the control is for). */}
        {title !== '' && <h2 style={styles.title}>{title}</h2>}
        {subtitle !== '' && <p style={styles.subtitle}>{subtitle}</p>}
        <PasswordInput
          value={pw}
          onChange={e => { setPw(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') tryAuth(); }}
          autoFocus
          placeholder="Password"
          style={styles.input}
        />
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.buttonRow}>
          {onCancel && (
            <button onClick={onCancel} style={styles.cancelButton}>
              Cancel
            </button>
          )}
          <button onClick={tryAuth} style={styles.button}>Continue →</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    minHeight: '100vh',
    backgroundColor: COLORS.brandCream,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  // v3-51: modal variant — semi-transparent backdrop pinned to the viewport
  // so the underlying tab content (e.g. Summary) stays in place beneath
  // the dialog rather than being replaced wholesale.
  overlayModal: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(31, 41, 55, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(37, 84, 58, 0.08)',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: COLORS.brandGreen,
    margin: '0 0 6px',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    margin: '0 0 20px',
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    fontSize: 15,
    padding: '11px 14px',
    border: `1px solid ${COLORS.inputBorder}`,
    borderRadius: 8,
    backgroundColor: COLORS.inputTint,
    color: COLORS.textBody,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 12,
  },
  error: {
    fontSize: 13,
    color: COLORS.error,
    marginBottom: 12,
    fontWeight: 500,
  },
  buttonRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
  button: {
    flex: 1,
    padding: '12px',
    fontSize: 14,
    fontWeight: 600,
    backgroundColor: COLORS.brandGreen,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelButton: {
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 500,
    backgroundColor: 'transparent',
    color: COLORS.textMuted,
    border: `1px solid ${COLORS.inputBorder}`,
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
