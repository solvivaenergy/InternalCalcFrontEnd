// =============================================================================
// ODOO SYNC BANNER — outcome of the Odoo hand-offs (stories 064A / 064C)
// -----------------------------------------------------------------------------
// Rendered by App.jsx under the header in rep mode. Two moments feed it:
//   • a deep link from Odoo loaded (or failed to load) the customer (064A);
//   • a generated proposal was pushed (or failed to push) as a quotation (064C).
// Green for success, amber for anything the rep needs to act on. The PDF is
// never held back by a failure here, and the copy says so.
// =============================================================================

import React from 'react';

export default function OdooSyncBanner({ sync, onDismiss }) {
  if (!sync) return null;
  const good = sync.status === 'success';
  const palette = good ? styles.good : styles.warn;
  const warnings = Array.isArray(sync.warnings) ? sync.warnings.filter(Boolean) : [];
  return (
    <div style={styles.wrap} role={good ? 'status' : 'alert'} aria-live="polite">
      <div style={{ ...styles.box, ...palette.box }}>
        <div style={styles.row}>
          <div style={styles.text}>
            <strong>{sync.title}</strong>{sync.message ? ` ${sync.message}` : ''}
            {warnings.length > 0 && (
              <ul style={styles.list}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
          <button type="button" onClick={onDismiss} style={{ ...styles.dismiss, ...palette.dismiss }}
                  aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    maxWidth: 1200,
    margin: '12px auto 0',
    padding: '0 24px',
    fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  box: {
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    lineHeight: 1.55,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  text: { flex: '1 1 320px' },
  list: { margin: '6px 0 0', paddingLeft: 20 },
  dismiss: {
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
    backgroundColor: 'transparent',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flex: '0 0 auto',
  },
  good: {
    box: { backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534' },
    dismiss: { color: '#166534', border: '1px solid #BBF7D0' },
  },
  warn: {
    box: { backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', color: '#854F0B' },
    dismiss: { color: '#854F0B', border: '1px solid #FCD34D' },
  },
};
