import React, { useEffect, useMemo, useState } from 'react';
import AuthDialog from './AuthDialog.jsx';
import { COLORS } from './ui.jsx';
import { getActiveSession, resolveUserRole, signOutSupabase } from '../lib/supabaseAuth.js';

const LOADING_STYLE = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  backgroundColor: COLORS.brandCream,
};

export default function ProtectedAdminRoute({
  onCancel,
  children,
}) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState('none');
  const [roleError, setRoleError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const currentSession = await getActiveSession();
        if (!mounted) return;
        setSession(currentSession);
        if (currentSession?.user) {
          const resolvedRole = await resolveUserRole(currentSession.user);
          if (!mounted) return;
          setRole(resolvedRole);
          setRoleError(null);
        } else {
          setRole('none');
        }
      } catch (error) {
        if (!mounted) return;
        setRoleError(error?.message || 'Failed to load session.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    return () => { mounted = false; };
  }, []);

  const accessLevel = useMemo(() => role, [role]);

  const handleLogin = async ({ session: nextSession, role: nextRole }) => {
    setSession(nextSession || null);
    setRole(nextRole || 'view');
    setRoleError(null);
    setLoading(false);
  };

  const handleLogout = async () => {
    await signOutSupabase();
    setSession(null);
    setRole('none');
    onCancel?.();
  };

  if (loading) {
    return (
      <div style={LOADING_STYLE}>
        <div style={{ fontSize: 14, color: COLORS.textMuted }}>Checking access…</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <AuthDialog
        onAuth={handleLogin}
        onCancel={onCancel}
        customTitle="Secure Sign In"
        customSubtitle="Use your Supabase email and password to access the admin tools."
      />
    );
  }

  if (roleError) {
    return (
      <div style={LOADING_STYLE}>
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #FECACA',
          color: '#991B1B',
          borderRadius: 12,
          padding: 20,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Access error</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>{roleError}</div>
          <button onClick={handleLogout} style={buttonStyle}>Sign out</button>
        </div>
      </div>
    );
  }

  return children({ accessLevel, session, signOut: handleLogout });
}

const buttonStyle = {
  padding: '10px 14px',
  border: 'none',
  borderRadius: 8,
  backgroundColor: COLORS.brandGreen,
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};