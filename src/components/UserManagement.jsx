// =============================================================================
// USER MANAGEMENT — Super Admin page: list accounts, create new ones (v3-215)
// -----------------------------------------------------------------------------
// Until now a new rep or admin meant someone with the service-role key running
// scripts/seed-*.mjs in the backend repo. This page moves that to the
// calculator for Super Admins (accessLevel 'edit'), on the same gate as Audit
// History: the tab only appears for 'edit', the component renders nothing for
// anyone else, and the backend re-checks user_roles.role = 'admin' on every
// call — the UI is not the boundary.
//
// Nothing privileged happens in this bundle. lib/usersService.js sends the
// caller's own JWT to /api/users; the backend holds the service-role key and
// writes the three places a role lives (app_metadata, user_metadata,
// public.user_roles) exactly as the seed scripts do.
//
// ONBOARDING MODEL — two ways to give the new person a way in:
//   • Password: a generated (or typed) password, shown ONCE in the success
//     panel with a Copy button. It is not stored anywhere in the app.
//   • Google only: no password; they use "Sign in with Google" with their
//     @solvivaenergy.com Workspace account. Refused for other domains because
//     that account could never sign in (see SSO_ALLOWED_DOMAINS).
// =============================================================================

import React, { useEffect, useState } from 'react';
import { COLORS, CalloutBox } from './ui.jsx';
import { isValidPhPhone, formatPhPhone, PH_PHONE_HINT } from '../lib/validation.js';
import { isSsoAllowedEmail, SSO_ALLOWED_DOMAINS } from '../lib/supabaseClient.js';
import {
  listUsers, createUser, generatePassword, ROLE_OPTIONS, userRoleLabel,
} from '../lib/usersService.js';

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Same regex the backend validates with, so a bad address never leaves here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8; // matches ChangePasswordDialog / ResetPassword

function formatWhen(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown' : dateFormatter.format(d);
}

// Which identities the account carries. "Email" rather than "Password" on
// purpose: a Google-only account still has an email identity, and the Admin
// API does not say whether a password is set.
function signInLabel(user) {
  const p = Array.isArray(user.providers) ? user.providers : [];
  const google = p.includes('google');
  const email = p.includes('email');
  if (google && email) return 'Email + Google';
  if (google) return 'Google';
  if (email) return 'Email';
  return p.join(', ') || '—';
}

export default function UserManagement({ accessLevel }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  // { user, password|null } for the success panel; cleared on Dismiss.
  const [justCreated, setJustCreated] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listUsers().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setUsers(result.users);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [accessLevel, reloadKey]);

  if (accessLevel !== 'edit') return null;

  const refresh = () => setReloadKey((k) => k + 1);

  const q = filter.trim().toLowerCase();
  const visible = q
    ? users.filter((u) =>
        [u.email, u.displayName, u.role, userRoleLabel(u.role)]
          .some((v) => String(v || '').toLowerCase().includes(q)))
    : users;

  return (
    <>
      <section style={styles.container} aria-labelledby="user-management-title">
        <div style={styles.header}>
          <div>
            <h2 id="user-management-title" style={styles.title}>User Accounts</h2>
            <p style={styles.subtitle}>Who can sign in to the calculator, and with which role</p>
          </div>
          <div style={styles.headerActions}>
            <span style={styles.count}>{users.length} account{users.length === 1 ? '' : 's'}</span>
            <button type="button" style={styles.primaryBtn}
                    onClick={() => setShowCreate(true)}>
              + Add user
            </button>
          </div>
        </div>

        {justCreated && (
          <CreatedNotice user={justCreated.user} password={justCreated.password}
                         onDismiss={() => setJustCreated(null)} />
        )}

        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by email, name or role"
          aria-label="Filter users"
          style={styles.filter}
        />

        {loading && <p style={styles.muted}>Loading accounts...</p>}
        {!loading && error && <CalloutBox kind="error">{error}</CalloutBox>}
        {!loading && !error && users.length === 0 && (
          <CalloutBox kind="info">No accounts found.</CalloutBox>
        )}
        {!loading && !error && users.length > 0 && visible.length === 0 && (
          <CalloutBox kind="info">No accounts match "{filter.trim()}".</CalloutBox>
        )}
        {!loading && !error && visible.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Account</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Sign-in</th>
                  <th style={styles.th}>Last sign-in</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.email}>{u.email || '—'}</div>
                      {u.displayName && <div style={styles.name}>{u.displayName}</div>}
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.rolePill,
                        ...(u.role === 'admin' ? styles.rolePillAdmin : {}),
                      }}>
                        {userRoleLabel(u.role)}
                      </span>
                    </td>
                    <td style={styles.td}>{signInLabel(u)}</td>
                    <td style={styles.td}>{formatWhen(u.lastSignInAt)}</td>
                    <td style={styles.td}>
                      {u.disabled
                        ? <span style={styles.statusDisabled}>Disabled</span>
                        : <span style={styles.statusActive}>Active</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={(user, password) => {
            setShowCreate(false);
            setJustCreated({ user, password });
            setFilter('');
            refresh();
          }}
        />
      )}
    </>
  );
}

// ─── Success panel ──────────────────────────────────────────────────────────
// The one place the password is ever visible. Copy puts both lines on the
// clipboard so the admin can paste them straight into a private message.
function CreatedNotice({ user, password, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${user.email}\nPassword: ${password}`);
      setCopied(true);
    } catch (_) {
      setCopied(false);
    }
  };
  return (
    <div style={styles.created} role="status">
      <div style={styles.createdTitle}>
        Account created: <strong>{user.email}</strong> as {userRoleLabel(user.role)}
      </div>
      {password ? (
        <>
          <p style={styles.createdText}>
            Share these sign-in details over a private channel. The password is shown
            once and is not stored here — they can change it from the header menu.
          </p>
          <div style={styles.credBox}>
            <div style={styles.credRow}>
              <span style={styles.credLabel}>Email</span>
              <code style={styles.credValue}>{user.email}</code>
            </div>
            <div style={styles.credRow}>
              <span style={styles.credLabel}>Password</span>
              <code style={styles.credValue}>{password}</code>
            </div>
          </div>
          <div style={styles.createdActions}>
            <button type="button" style={styles.primaryBtn} onClick={copy}>
              {copied ? 'Copied' : 'Copy sign-in details'}
            </button>
            <button type="button" style={styles.secondaryBtn} onClick={onDismiss}>Dismiss</button>
          </div>
        </>
      ) : (
        <>
          <p style={styles.createdText}>
            No password was set. They sign in with the <strong>Sign in with Google</strong> button
            using their {user.email} Workspace account.
          </p>
          <div style={styles.createdActions}>
            <button type="button" style={styles.secondaryBtn} onClick={onDismiss}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Create dialog ──────────────────────────────────────────────────────────
// Same modal idiom as ChangePasswordDialog: fixed overlay, Escape + backdrop
// close (both suppressed while submitting), plain useState per field, errors
// cleared on every keystroke.
function CreateUserDialog({ onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('rep');
  const [signIn, setSignIn] = useState('password'); // 'password' | 'google'
  // Pre-filled with a generated value so the default path is a strong random
  // password; visible by default because the admin has to hand it over.
  const [password, setPassword] = useState(() => generatePassword());
  const [showPw, setShowPw] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const roleOption = ROLE_OPTIONS.find((o) => o.value === role);
  const ssoDomains = SSO_ALLOWED_DOMAINS.map((d) => `@${d}`).join(' or ');
  const googleAllowed = isSsoAllowedEmail(email);

  const validate = () => {
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (!roleOption) return 'Choose a role.';
    if (mobile.trim() && !isValidPhPhone(mobile)) return PH_PHONE_HINT;
    if (signIn === 'google') {
      if (!googleAllowed) {
        return `Google-only sign-in needs an ${ssoDomains} address. Set a password instead.`;
      }
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const v = validate();
    if (v) { setError(v); return; }

    setSubmitting(true);
    setError(null);
    const payload = {
      email: email.trim(),
      role,
      displayName: displayName.trim() || undefined,
      mobile: mobile.trim() || undefined,
    };
    if (signIn === 'google') payload.ssoOnly = true;
    else payload.password = password;

    const result = await createUser(payload);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    onCreated(result.user, signIn === 'google' ? null : password);
  };

  const clearErr = (setter) => (e) => { setter(e.target.value); setError(null); };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Add user"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h2 style={styles.dialogTitle}>Add user</h2>
        <p style={styles.dialogSubtitle}>
          The account can sign in immediately — no confirmation email is sent.
        </p>

        <label style={styles.label} htmlFor="um-email">Email</label>
        <input
          id="um-email" type="email" autoComplete="off" spellCheck={false}
          value={email} onChange={clearErr(setEmail)}
          placeholder="name@solvivaenergy.com"
          style={styles.input} autoFocus
        />

        <label style={styles.label} htmlFor="um-role">Role</label>
        <select id="um-role" value={role} onChange={clearErr(setRole)} style={styles.input}>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{userRoleLabel(o.value)}</option>
          ))}
        </select>
        {roleOption && <p style={styles.hint}>{roleOption.hint}</p>}

        <div style={styles.twoCol}>
          <div style={{ flex: 1 }}>
            <label style={styles.label} htmlFor="um-name">Display name (optional)</label>
            <input
              id="um-name" type="text" autoComplete="off"
              value={displayName} onChange={clearErr(setDisplayName)}
              placeholder="Juan dela Cruz" style={styles.input}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label} htmlFor="um-mobile">Mobile (optional)</label>
            <input
              id="um-mobile" type="tel" inputMode="numeric" autoComplete="off"
              value={mobile}
              onChange={(e) => { setMobile(formatPhPhone(e.target.value)); setError(null); }}
              placeholder="0917-123-4567" style={styles.input}
            />
          </div>
        </div>
        {role === 'rep' && (
          <p style={styles.hint}>
            For reps, the display name and mobile prefill the Solviva Agent details on their quotes.
          </p>
        )}

        <fieldset style={styles.fieldset}>
          <legend style={styles.label}>How they sign in</legend>
          <label style={styles.radioRow}>
            <input type="radio" name="um-signin" value="password"
                   checked={signIn === 'password'}
                   onChange={() => { setSignIn('password'); setError(null); }} />
            <span>
              <span style={styles.radioTitle}>Password</span>
              <span style={styles.radioHint}>You hand them the password below; they can change it later.</span>
            </span>
          </label>
          <label style={styles.radioRow}>
            <input type="radio" name="um-signin" value="google"
                   checked={signIn === 'google'}
                   onChange={() => { setSignIn('google'); setError(null); }} />
            <span>
              <span style={styles.radioTitle}>Google only</span>
              <span style={styles.radioHint}>
                No password. Requires an {ssoDomains} Workspace address.
              </span>
            </span>
          </label>
        </fieldset>

        {signIn === 'password' && (
          <>
            <label style={styles.label} htmlFor="um-password">Password</label>
            <div style={styles.pwRow}>
              <input
                id="um-password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password" spellCheck={false}
                value={password} onChange={clearErr(setPassword)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                style={{ ...styles.input, marginBottom: 0, fontFamily: showPw ? 'monospace' : 'inherit' }}
              />
              <button type="button" style={styles.smallBtn}
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw ? 'Hide' : 'Show'}
              </button>
              <button type="button" style={styles.smallBtn}
                      onClick={() => { setPassword(generatePassword()); setShowPw(true); setError(null); }}>
                Generate
              </button>
            </div>
            <p style={styles.hint}>Shown once more after creation, with a Copy button.</p>
          </>
        )}

        {error && <div style={styles.error} role="alert">{error}</div>}

        <div style={styles.actions}>
          <button type="button" onClick={onClose} disabled={submitting} style={styles.secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}
                  style={{ ...styles.primaryBtn, flex: 1, ...(submitting ? styles.btnDisabled : {}) }}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  // ── page ──
  container: {
    marginBottom: 20,
    padding: '20px 22px',
    border: `1px solid ${COLORS.divider}`,
    background: '#fff',
  },
  header: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' },
  headerActions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 },
  title: { margin: 0, fontSize: 22, color: COLORS.brandGreen },
  subtitle: { margin: '5px 0 0', color: '#777', fontSize: 13 },
  count: { color: '#777', fontSize: 13 },
  muted: { color: '#777', fontSize: 14 },
  filter: {
    width: '100%', maxWidth: 360, fontSize: 13, padding: '8px 12px',
    border: `1px solid ${COLORS.divider}`, borderRadius: 6, marginBottom: 14,
    fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700,
    color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.divider}`, whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #ecece6' },
  td: { padding: '10px 10px', verticalAlign: 'top', color: COLORS.textBody },
  email: { fontWeight: 600, overflowWrap: 'anywhere' },
  name: { color: '#777', fontSize: 12, marginTop: 2 },
  rolePill: {
    display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
    padding: '2px 8px', borderRadius: 4, background: '#F3F4F6', color: COLORS.textBody,
    whiteSpace: 'nowrap',
  },
  rolePillAdmin: { background: '#ECFDF5', color: '#065F46' },
  statusActive: { color: '#065F46', fontWeight: 600 },
  statusDisabled: { color: '#991B1B', fontWeight: 600 },

  // ── success panel ──
  created: {
    marginBottom: 16, padding: '14px 16px', borderRadius: 8,
    backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534',
    fontSize: 13, lineHeight: 1.5,
  },
  createdTitle: { fontWeight: 600, marginBottom: 6 },
  createdText: { margin: '0 0 10px' },
  credBox: {
    background: '#fff', border: '1px solid #BBF7D0', borderRadius: 6,
    padding: '8px 12px', marginBottom: 10, display: 'grid', gap: 6,
  },
  credRow: { display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' },
  credLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 70, color: COLORS.textMuted },
  credValue: { fontFamily: 'monospace', fontSize: 14, color: COLORS.textBody, overflowWrap: 'anywhere', userSelect: 'all' },
  createdActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },

  // ── buttons ──
  primaryBtn: {
    padding: '9px 16px', fontSize: 13, fontWeight: 600,
    backgroundColor: COLORS.brandGreen, color: '#FFFFFF', border: 'none',
    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    padding: '9px 16px', fontSize: 13, fontWeight: 600,
    backgroundColor: '#FFFFFF', color: COLORS.textBody,
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  smallBtn: {
    padding: '0 12px', fontSize: 12, fontWeight: 600,
    backgroundColor: '#FFFFFF', color: COLORS.brandGreen,
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnDisabled: { backgroundColor: '#9CA3AF', cursor: 'not-allowed' },

  // ── dialog (mirrors ChangePasswordDialog) ──
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, overflowY: 'auto',
    fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: '28px 26px',
    width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)', maxHeight: '100%', overflowY: 'auto',
  },
  dialogTitle: { fontSize: 19, fontWeight: 700, color: COLORS.brandGreen, margin: '0 0 4px' },
  dialogSubtitle: { fontSize: 13, color: COLORS.textMuted, margin: '0 0 18px', lineHeight: 1.5 },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  input: {
    width: '100%', fontSize: 14, padding: '10px 12px',
    border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8,
    backgroundColor: COLORS.inputTint, color: COLORS.textBody,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    marginBottom: 14,
  },
  hint: { fontSize: 12, color: COLORS.textMuted, margin: '-8px 0 14px', lineHeight: 1.45 },
  twoCol: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  fieldset: { border: 'none', padding: 0, margin: '0 0 14px', minWidth: 0 },
  radioRow: {
    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0',
    fontSize: 13, color: COLORS.textBody, cursor: 'pointer',
  },
  radioTitle: { display: 'block', fontWeight: 600 },
  radioHint: { display: 'block', fontSize: 12, color: COLORS.textMuted, lineHeight: 1.4 },
  pwRow: { display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 8 },
  error: {
    fontSize: 13, color: COLORS.error, marginBottom: 14, fontWeight: 500,
    backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: 6, padding: '8px 12px',
  },
  actions: { display: 'flex', gap: 10, marginTop: 4 },
};
