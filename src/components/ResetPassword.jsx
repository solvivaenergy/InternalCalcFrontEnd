// =============================================================================
// RESET PASSWORD — recovery screen shown after a password-reset email link
// -----------------------------------------------------------------------------
// App.jsx renders this when Supabase fires a PASSWORD_RECOVERY auth event (the
// user arrived from a reset link). The recovery session is already active, so
// we only collect + set a new password via updateUserPassword(). On success we
// hand control back to App.jsx, which signs the user out so they log in fresh.
// =============================================================================

import React, { useState } from 'react';
import { updateUserPassword } from '../lib/supabaseClient.js';
import { COLORS } from './ui.jsx';

const MIN_LENGTH = 8;

export default function ResetPassword({ onDone }) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    if (newPw.length < MIN_LENGTH) return `New password must be at least ${MIN_LENGTH} characters.`;
    if (newPw !== confirmPw) return 'The passwords do not match.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const v = validate();
    if (v) { setError(v); return; }

    setSubmitting(true);
    setError(null);
    const { error: updateError } = await updateUserPassword(newPw);
    if (updateError) {
      setError(updateError.message || 'Could not set your new password. The reset link may have expired — request a new one.');
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    setSubmitting(false);
  };

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <img src="/logo-full-v2.png" alt="Solviva Energy" style={styles.logo} />
        <h1 style={styles.title}>Set a new password</h1>

        {success ? (
          <>
            <div style={styles.success} role="status">
              Your password has been updated. Sign in with your new password.
            </div>
            <button type="button" onClick={onDone} style={styles.button}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <p style={styles.subtitle}>
              Choose a new password for your Solviva Energy account.
            </p>

            <label style={styles.label} htmlFor="rp-new">New password</label>
            <input
              id="rp-new"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setError(null); }}
              placeholder={`At least ${MIN_LENGTH} characters`}
              style={styles.input}
              autoFocus
            />

            <label style={styles.label} htmlFor="rp-confirm">Confirm new password</label>
            <div style={styles.pwWrap}>
              <input
                id="rp-confirm"
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

            <button type="submit" disabled={submitting} style={{
              ...styles.button,
              ...(submitting ? styles.buttonDisabled : {}),
            }}>
              {submitting ? 'Saving…' : 'Update password'}
            </button>
            <button type="button" onClick={onDone} style={styles.linkButton}>
              Cancel
            </button>
          </>
        )}
      </form>
      <div style={styles.footer}>
        © 2026 Solviva Energy. An AboitizPower Company.
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: COLORS.brandCream,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: '40px 34px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(37, 84, 58, 0.08)',
    display: 'flex',
    flexDirection: 'column',
  },
  logo: { height: 44, width: 'auto', alignSelf: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: COLORS.brandGreen, margin: '0 0 6px' },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: '0 0 24px', lineHeight: 1.5 },
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
    fontSize: 13, color: COLORS.brandGreen, marginBottom: 16, fontWeight: 500,
    backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0',
    borderRadius: 6, padding: '8px 12px',
  },
  button: {
    width: '100%', padding: '12px', fontSize: 14, fontWeight: 600,
    backgroundColor: COLORS.brandGreen, color: '#FFFFFF', border: 'none',
    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
  },
  buttonDisabled: { backgroundColor: '#9CA3AF', cursor: 'not-allowed' },
  linkButton: {
    background: 'transparent', border: 'none', color: COLORS.textMuted,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    marginTop: 12, padding: 4, alignSelf: 'center',
  },
  footer: { marginTop: 24, fontSize: 12, color: COLORS.textMuted, opacity: 0.8 },
};
