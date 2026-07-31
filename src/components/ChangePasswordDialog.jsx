// =============================================================================
// CHANGE PASSWORD — modal for the signed-in user to set a new password
// -----------------------------------------------------------------------------
// Opened from the Header. Verifies the CURRENT password first (via a fresh
// signInWithPassword on the same account — so an unattended session can't be
// hijacked to change the password), then calls updateUserPassword().
// =============================================================================

import React, { useEffect, useState } from 'react';
import {
  supabase, getCurrentUserEmail, updateUserPassword,
} from '../lib/supabaseClient.js';
import { COLORS } from './ui.jsx';

const MIN_LENGTH = 8;

export default function ChangePasswordDialog({ onClose }) {
  const [email, setEmail] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    getCurrentUserEmail().then((e) => { if (alive) setEmail(e); });
    return () => { alive = false; };
  }, []);

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const validate = () => {
    if (!currentPw) return 'Enter your current password.';
    if (newPw.length < MIN_LENGTH) return `New password must be at least ${MIN_LENGTH} characters.`;
    if (newPw !== confirmPw) return 'The new passwords do not match.';
    if (newPw === currentPw) return 'The new password must be different from the current one.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const v = validate();
    if (v) { setError(v); return; }

    setSubmitting(true);
    setError(null);

    // 1. Re-authenticate to confirm the current password is correct.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPw,
    });
    if (authError) {
      setError('Your current password is incorrect.');
      setSubmitting(false);
      return;
    }

    // 2. Set the new password on the active session.
    const { error: updateError } = await updateUserPassword(newPw);
    if (updateError) {
      setError(updateError.message || 'Could not update your password. Please try again.');
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Change password"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h2 style={styles.title}>Change password</h2>
        {email && (
          <p style={styles.subtitle}>
            Updating the password for <strong>{email}</strong>.
          </p>
        )}

        {success ? (
          <>
            <div style={styles.success} role="status">
              Your password has been updated. Use it the next time you sign in.
            </div>
            <button type="button" onClick={onClose} style={styles.button}>Done</button>
          </>
        ) : (
          <>
            <label style={styles.label} htmlFor="cp-current">Current password</label>
            <input
              id="cp-current"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => { setCurrentPw(e.target.value); setError(null); }}
              style={styles.input}
              autoFocus
            />

            <label style={styles.label} htmlFor="cp-new">New password</label>
            <input
              id="cp-new"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setError(null); }}
              placeholder={`At least ${MIN_LENGTH} characters`}
              style={styles.input}
            />

            <label style={styles.label} htmlFor="cp-confirm">Confirm new password</label>
            <div style={styles.pwWrap}>
              <input
                id="cp-confirm"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => { setConfirmPw(e.target.value); setError(null); }}
                style={{ ...styles.input, marginBottom: 0, paddingRight: 64 }}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                style={styles.pwToggle}
                tabIndex={-1}
                aria-label={showPw ? 'Hide passwords' : 'Show passwords'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>

            {error && <div style={styles.error} role="alert">{error}</div>}

            <div style={styles.actions}>
              <button type="button" onClick={onClose} disabled={submitting}
                      style={styles.secondaryBtn}>
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                      style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : {}) }}>
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
    fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: '28px 26px',
    width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  },
  title: { fontSize: 19, fontWeight: 700, color: COLORS.brandGreen, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: '0 0 20px', lineHeight: 1.5 },
  label: {
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  input: {
    width: '100%', fontSize: 15, padding: '11px 14px',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8,
    backgroundColor: COLORS.inputTint, color: COLORS.textBody,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    marginBottom: 16,
  },
  pwWrap: { position: 'relative', marginBottom: 16 },
  pwToggle: {
    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', color: COLORS.brandGreen,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
    fontFamily: 'inherit',
  },
  error: {
    fontSize: 13, color: COLORS.error, marginBottom: 16, fontWeight: 500,
    backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: 6, padding: '8px 12px',
  },
  success: {
    fontSize: 13, color: '#166534', marginBottom: 16, fontWeight: 500,
    backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0',
    borderRadius: 6, padding: '10px 12px', lineHeight: 1.5,
  },
  actions: { display: 'flex', gap: 10, marginTop: 4 },
  button: {
    flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
    backgroundColor: COLORS.brandGreen, color: '#FFFFFF', border: 'none',
    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
  },
  buttonDisabled: { backgroundColor: '#9CA3AF', cursor: 'not-allowed' },
  secondaryBtn: {
    flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
    backgroundColor: '#FFFFFF', color: COLORS.textBody,
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
