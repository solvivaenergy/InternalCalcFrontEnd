// =============================================================================
// AUTH DIALOG — Supabase login form with optional legacy password-gate mode
// -----------------------------------------------------------------------------
// Default usage — email/password login via Supabase Auth.
// Legacy password-gate usage is still supported behind `mode="legacy"` for
// the remaining summary / rep-mode flows that have not been migrated yet.
// =============================================================================

import React, { useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { resolveUserRole } from '../lib/supabaseAuth.js';
import { COLORS, PasswordInput } from './ui.jsx';

export default function AuthDialog({
  onAuth,
  onCancel,
  mode = 'login',
  // Legacy password-gate mode (used by the remaining non-Supabase flows).
  acceptedPasswords,
  repOnly = false,
  repPassword,
  editPassword,
  engineeringPassword,
  productPassword,
  viewPassword,
  customTitle,
  customSubtitle,
  modal = false,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const tryAuth = async () => {
    if (mode === 'legacy') {
      if (Array.isArray(acceptedPasswords)) {
        const accepted = acceptedPasswords.filter(Boolean);
        if (accepted.includes(password)) {
          onAuth?.();
        } else {
          setError('Incorrect password');
          setPassword('');
        }
        return;
      }
      if (repOnly) {
        if (password === repPassword) {
          onAuth?.('rep');
        } else {
          setError('Incorrect password');
          setPassword('');
        }
        return;
      }
      if (password === editPassword) {
        onAuth?.('edit');
      } else if (password === engineeringPassword) {
        onAuth?.('engineering');
      } else if (password === productPassword) {
        onAuth?.('product');
      } else if (password === viewPassword) {
        onAuth?.('view');
      } else {
        setError('Incorrect password');
        setPassword('');
      }
      return;
    }

    const supabase = getSupabaseClient();
    setLoading(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      const session = data?.session || null;
      if (!session?.user) throw new Error('Login succeeded but no session was returned.');
      const role = await resolveUserRole(session.user);
      onAuth?.({ session, role });
    } catch (err) {
      setError(err?.message || 'Login failed');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const title = customTitle ?? (mode === 'legacy' && repOnly ? 'Sales Rep Access' : 'Secure Sign In');
  const subtitle = customSubtitle ?? (mode === 'legacy'
    ? (repOnly
      ? 'Enter the rep password to unlock the full calculator view.'
      : 'Enter password to view or edit calculator parameters.')
    : 'Use your Supabase email and password to continue.');

  // Modal-mode overlay: semi-transparent backdrop, centered card. Uses
  // position: fixed so the underlying view scrolls/renders normally
  // beneath the dialog.
  const overlayStyle = modal ? styles.overlayModal : styles.overlay;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={styles.card}>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.subtitle}>{subtitle}</p>
        {mode === 'legacy' ? (
          <PasswordInput
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') tryAuth(); }}
            autoFocus
            placeholder="Password"
            style={styles.input}
          />
        ) : (
          <>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') tryAuth(); }}
              placeholder="Email address"
              autoFocus
              style={styles.input}
            />
            <PasswordInput
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') tryAuth(); }}
              placeholder="Password"
              style={styles.input}
            />
          </>
        )}
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.buttonRow}>
          {onCancel && (
            <button onClick={onCancel} style={styles.cancelButton}>
              Cancel
            </button>
          )}
          <button onClick={tryAuth} style={styles.button} disabled={loading}>
            {loading ? 'Signing in…' : (mode === 'legacy' ? 'Continue →' : 'Sign in')}
          </button>
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
