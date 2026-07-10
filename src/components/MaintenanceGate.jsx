// =============================================================================
// MAINTENANCE GATE — password-only entry screen
// -----------------------------------------------------------------------------
// Replaces the old ContactGate.jsx (v3-50 and earlier). The gate now has ONLY
// one purpose: when the calculator is in maintenance mode, block customer
// entry until a valid access password is provided. There is no contact form,
// no name/email/mobile capture, no "Welcome back" returning-visitor flow —
// customers land directly on the Calculator otherwise.
//
// THREE-SIGNAL ACTIVATION (same gating as v3-50):
//   1. AUTH.testingPassword set (VITE_MAINTENANCE_PASSWORD env var present)
//   2. ADMIN_PARAMS.gateAuthEnabled === true (admin toggle ON)
//   3. sessionStorage GATE_PASS_KEY === '1' is NOT set (customer hasn't
//      already authed in this session)
// All three must be true for the gate to render. App.jsx computes this
// composite signal and only mounts MaintenanceGate when it's true.
//
// ACCEPTED PASSWORDS (any of the 6 configured):
//   • VITE_MAINTENANCE_PASSWORD (the customer-facing maintenance password)
//   • VITE_SUPERADMIN_PASSWORD
//   • VITE_ENGINEERING_PASSWORD
//   • VITE_PRODUCT_PASSWORD
//   • VITE_AUDIT_PASSWORD (view-only)
//   • VITE_REP_PASSWORD
// Rationale: anyone Solviva has issued any password to should be able to
// access the calculator during maintenance without needing a separate password.
// =============================================================================

import React, { useState } from 'react';
import { AUTH } from '../config.js';
import { PasswordInput } from './ui.jsx';

// Session flag — set to '1' on successful password entry; checked by App.jsx
// before deciding to mount this component. Clears automatically on browser/
// tab close (sessionStorage semantics).
const GATE_PASS_KEY = 'solviva_gate_pw_ok';

export function readGatePass() {
  try {
    return sessionStorage.getItem(GATE_PASS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGatePass() {
  try {
    sessionStorage.setItem(GATE_PASS_KEY, '1');
  } catch {
    // Best-effort. If sessionStorage is unavailable, the customer just gets
    // re-prompted on each reload — annoying but functional.
  }
}

export default function MaintenanceGate({ onUnlock, agent, brand }) {
  const [pwDraft, setPwDraft] = useState('');
  const [pwError, setPwError] = useState(null);

  const handleSubmit = () => {
    // Accept ANY of the 6 configured passwords. Empty env vars filter out
    // so a missing var can't accidentally match an empty input.
    const accepted = [
      AUTH.testingPassword,
      AUTH.editPassword,
      AUTH.engineeringPassword,
      AUTH.productPassword,
      AUTH.viewPassword,
      AUTH.repPassword,
    ].filter(Boolean);

    if (!accepted.includes(pwDraft)) {
      setPwError('Incorrect password. Please try again.');
      return;
    }
    writeGatePass();
    onUnlock();
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="/logo-full-v2.png" alt="Solviva Energy" style={styles.logo} />

        <h1 style={styles.heroHeadline}>We'll be right back.</h1>
        <p style={styles.subtitle}>
          The calculator is temporarily restricted while we perform
          maintenance. If you have an access password, enter it below.
        </p>

        <div style={styles.form}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Access Password</span>
            <PasswordInput
              value={pwDraft}
              onChange={e => { setPwDraft(e.target.value); if (pwError) setPwError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="Enter the password you were given"
              style={styles.input}
              inputErrorStyle={pwError ? styles.inputError : null}
              autoFocus
            />
            {pwError && <span style={styles.errorText}>{pwError}</span>}
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={pwDraft.length === 0}
          style={{
            ...styles.button,
            ...(pwDraft.length === 0 ? styles.buttonDisabled : {}),
          }}>
          Continue →
        </button>

        <div style={styles.maintenanceNote}>
          <strong>Under Maintenance.</strong>{' '}
          The calculator is temporarily restricted while we perform
          maintenance. For assistance, contact Solviva Customer Support —
          see contact details below.
        </div>

        <div style={styles.agentBlock}>
          {agent?.name ? (
            <>
              <div style={styles.agentLabel}>Your Solviva Agent</div>
              <div style={styles.agentName}>{agent.name}</div>
              <div style={styles.agentContact}>{agent.email} · {agent.phone}</div>
            </>
          ) : (
            <>
              <div style={styles.agentName}>Solviva Customer Support</div>
              <div style={styles.agentContact}>{agent?.email} · {agent?.phone}</div>
            </>
          )}
        </div>
      </div>
      {brand?.legalEntity && (
        <div style={styles.copyrightLine}>
          © 2026 {brand.legalEntity}. An AboitizPower Company.
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F7F4ED',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 18,
    fontFamily: '"Inter", "Segoe UI", -apple-system, sans-serif',
  },
  copyrightLine: {
    fontSize: 12,
    opacity: 0.7,
    color: '#5F5E5A',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: '48px 40px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(37, 84, 58, 0.08)',
  },
  logo: {
    height: 'auto',
    maxHeight: 135,
    width: 'auto',
    maxWidth: '100%',
    display: 'block',
    marginBottom: 24,
  },
  heroHeadline: {
    fontSize: 28,
    fontWeight: 700,
    color: '#25543A',
    margin: '0 0 8px',
    letterSpacing: -0.5,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 1.6,
    margin: '0 0 32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    marginBottom: 28,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 15,
    padding: '11px 14px',
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    fontFamily: 'inherit',
    color: '#1F2937',
    outline: 'none',
    transition: 'border-color 150ms',
  },
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEE2E2',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 2,
  },
  button: {
    width: '100%',
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 600,
    backgroundColor: '#25543A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background-color 150ms',
    fontFamily: 'inherit',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    cursor: 'not-allowed',
  },
  maintenanceNote: {
    marginTop: 16,
    padding: '10px 14px',
    backgroundColor: '#FFFBEB',
    border: '1px solid #FCD34D',
    borderRadius: 6,
    color: '#854F0B',
    fontSize: 12,
    lineHeight: 1.55,
  },
  agentBlock: {
    marginTop: 24,
    paddingTop: 20,
    borderTop: '1px solid #E5E7EB',
    fontSize: 13,
  },
  agentLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  agentName: {
    fontWeight: 600,
    color: '#1F2937',
    marginBottom: 2,
  },
  agentContact: {
    color: '#6B7280',
  },
};
