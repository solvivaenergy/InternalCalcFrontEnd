// =============================================================================
// PARAMS SOURCE BANNER — "you are not on live pricing data" notice
// -----------------------------------------------------------------------------
// Rendered by App.jsx above the calculator (desktop and mobile) whenever
// paramsService.load() could not get LIVE values — i.e. its status source is
// 'cache' (this device's last good copy) or 'defaults' (the bundled data
// files). Returns null for 'backend' and 'supabase' (both live), and while
// nothing has loaded yet.
//
// Why it exists: until 2026-09-22 a failed load left only a console warning.
// Reps quoted on bundled margins and a 10% down-payment floor for two days
// without anyone being able to tell, and staging showed a maintenance screen
// nobody had switched on. The banner names the situation in plain words, lets
// the user retry the whole load chain, and keeps the technical errors one
// click away for whoever has to debug the device.
// =============================================================================

import React, { useState } from 'react';

function formatWhen(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function ParamsSourceBanner({ status, onRetry, retrying, compact }) {
  const [showDetails, setShowDetails] = useState(false);
  const source = status?.source;
  if (source !== 'cache' && source !== 'defaults') return null;

  const when = formatWhen(status.cachedAt);
  const body = source === 'cache'
    ? `This device could not load the current pricing configuration, so the calculator is showing the last copy saved here${when ? ` on ${when}` : ''}. Prices, margins, and payment terms may have changed since then.`
    : 'This device could not load the current pricing configuration, so the calculator is using the defaults built into this version. Prices, margins, and payment terms may not match what is currently configured.';

  const errors = Array.isArray(status.errors) ? status.errors : [];

  return (
    <div style={{ ...styles.wrap, ...(compact ? styles.wrapCompact : {}) }} role="alert">
      <div style={styles.box}>
        <div style={styles.row}>
          <div style={styles.text}>
            <strong>Live pricing settings unavailable.</strong>{' '}
            {body}{' '}
            Retry before quoting; if it keeps failing, contact support with the details below.
          </div>
          <div style={styles.actions}>
            <button type="button" onClick={onRetry} disabled={retrying}
                    style={{ ...styles.retry, ...(retrying ? styles.retryBusy : {}) }}>
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
            {errors.length > 0 && (
              <button type="button" onClick={() => setShowDetails(v => !v)}
                      style={styles.details}>
                {showDetails ? 'Hide details' : 'Details'}
              </button>
            )}
          </div>
        </div>
        {showDetails && errors.length > 0 && (
          <ul style={styles.errorList}>
            {errors.map((e, i) => <li key={i} style={styles.errorItem}>{e}</li>)}
          </ul>
        )}
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
  wrapCompact: {
    maxWidth: 480,
    margin: '8px auto 0',
    padding: '0 12px',
  },
  box: {
    backgroundColor: '#FFFBEB',
    border: '1px solid #FCD34D',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#854F0B',
    fontSize: 13,
    lineHeight: 1.55,
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  text: { flex: '1 1 320px' },
  actions: { display: 'flex', gap: 8, flex: '0 0 auto' },
  retry: {
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: '#FFFFFF',
    backgroundColor: '#25543A',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  retryBusy: { backgroundColor: '#9CA3AF', cursor: 'wait' },
  details: {
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
    color: '#854F0B',
    backgroundColor: 'transparent',
    border: '1px solid #FCD34D',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  errorList: {
    margin: '10px 0 0',
    padding: '8px 12px 8px 28px',
    backgroundColor: '#FFF7D6',
    borderRadius: 6,
    fontSize: 12,
  },
  errorItem: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    wordBreak: 'break-word',
  },
};
