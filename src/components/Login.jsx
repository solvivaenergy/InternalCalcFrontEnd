// =============================================================================
// LOGIN — Supabase email/password landing page
// -----------------------------------------------------------------------------
// The app's default route. The calculator and admin editor are hidden until a
// user authenticates here. On success, App.jsx reads the user's role from
// public.user_roles and routes to the appropriate view.
//
// Replaces the legacy floating "Sales Rep" / "Admin" env-var password buttons.
// =============================================================================

import React, { useState } from 'react';
import { supabase, sendPasswordReset } from '../lib/supabaseClient.js';
import { COLORS } from './ui.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // 'signin' = credentials form; 'forgot' = request a reset email.
  const [view, setView] = useState('signin');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const canSubmit = email.trim() !== '' && password !== '' && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      // Supabase returns a generic "Invalid login credentials" for both a
      // wrong password and an unknown email — we surface it verbatim so we
      // don't leak which accounts exist.
      setError(authError.message || 'Sign in failed. Please try again.');
      setSubmitting(false);
      return;
    }
    // On success we do NOT flip local state here: App.jsx subscribes to
    // onAuthStateChange and will re-render into the routed view automatically.
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (resetSubmitting) return;
    if (email.trim() === '') { setError('Enter your account email first.'); return; }
    setResetSubmitting(true);
    setError(null);
    await sendPasswordReset(email.trim(), window.location.origin);
    // Always show a neutral confirmation — never reveal whether the email is
    // registered, so the form can't be used to enumerate accounts.
    setResetSent(true);
    setResetSubmitting(false);
  };

  const goForgot = () => { setView('forgot'); setError(null); setResetSent(false); };
  const goSignin = () => { setView('signin'); setError(null); };

  return (
    <div style={styles.page}>
      {view === 'signin' ? (
      <form style={styles.card} onSubmit={handleSubmit}>
        <img src="/logo-full-v2.png" alt="Solviva Energy" style={styles.logo} />
        <h1 style={styles.title}>Sign in</h1>
        <p style={styles.subtitle}>
          Enter your Solviva Energy account to continue.
        </p>

        <label style={styles.label} htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="you@solvivaenergy.com"
          style={styles.input}
          autoFocus
        />

        <label style={styles.label} htmlFor="login-password">Password</label>
        <div style={styles.pwWrap}>
          <input
            id="login-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="Password"
            style={{ ...styles.input, marginBottom: 0, paddingRight: 64 }}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            style={styles.pwToggle}
            tabIndex={-1}
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        <button type="button" onClick={goForgot} style={styles.forgotLink}>
          Forgot password?
        </button>

        {error && <div style={styles.error} role="alert">{error}</div>}

        <button type="submit" disabled={!canSubmit} style={{
          ...styles.button,
          ...(canSubmit ? {} : styles.buttonDisabled),
        }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      ) : (
      <form style={styles.card} onSubmit={handleReset}>
        <img src="/logo-full-v2.png" alt="Solviva Energy" style={styles.logo} />
        <h1 style={styles.title}>Reset password</h1>

        {resetSent ? (
          <>
            <div style={styles.success} role="status">
              If an account exists for <strong>{email.trim()}</strong>, a
              password-reset link is on its way. Check your inbox (and spam).
            </div>
            <button type="button" onClick={goSignin} style={styles.button}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <p style={styles.subtitle}>
              Enter your account email and we&rsquo;ll send you a link to set a
              new password.
            </p>

            <label style={styles.label} htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="you@solvivaenergy.com"
              style={styles.input}
              autoFocus
            />

            {error && <div style={styles.error} role="alert">{error}</div>}

            <button type="submit" disabled={resetSubmitting} style={{
              ...styles.button,
              ...(resetSubmitting ? styles.buttonDisabled : {}),
            }}>
              {resetSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" onClick={goSignin} style={styles.linkButton}>
              Back to sign in
            </button>
          </>
        )}
      </form>
      )}
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
    borderRadius: 6, padding: '8px 12px', lineHeight: 1.5,
  },
  forgotLink: {
    background: 'transparent', border: 'none', color: COLORS.brandGreen,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    padding: 0, marginBottom: 16, alignSelf: 'flex-end',
  },
  linkButton: {
    background: 'transparent', border: 'none', color: COLORS.textMuted,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    marginTop: 12, padding: 4, alignSelf: 'center',
  },
  button: {
    width: '100%', padding: '12px', fontSize: 14, fontWeight: 600,
    backgroundColor: COLORS.brandGreen, color: '#FFFFFF', border: 'none',
    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
  },
  buttonDisabled: { backgroundColor: '#9CA3AF', cursor: 'not-allowed' },
  footer: { marginTop: 24, fontSize: 12, color: COLORS.textMuted, opacity: 0.8 },
};
