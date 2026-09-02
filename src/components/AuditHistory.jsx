import React, { useEffect, useState } from "react";
import * as paramsService from "../lib/paramsService.js";
import { COLORS, CalloutBox } from "./ui.jsx";

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

function eventValue(event, camelName, snakeName) {
  return event[camelName] ?? event[snakeName];
}

function formatValue(value) {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatWhen(event) {
  const occurredAt = eventValue(event, "occurredAt", "occurred_at");
  if (!occurredAt) return "Unknown time";
  return `${dateFormatter.format(new Date(occurredAt))} GMT+8`;
}

export default function AuditHistory({ accessLevel }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    paramsService.getAuditHistory(accessLevel).then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setEvents(result.events);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [accessLevel]);

  if (accessLevel !== "edit") return null;

  return (
    <section style={styles.container} aria-labelledby="audit-history-title">
      <div style={styles.header}>
        <div>
          <h2 id="audit-history-title" style={styles.title}>Audit History</h2>
          <p style={styles.subtitle}>Parameter changes made by administrators</p>
        </div>
        <span style={styles.count}>{events.length} events</span>
      </div>

      {loading && <p style={styles.muted}>Loading audit history...</p>}
      {!loading && error && <CalloutBox kind="error">{error}</CalloutBox>}
      {!loading && !error && events.length === 0 && (
        <CalloutBox kind="info">No parameter changes have been recorded yet.</CalloutBox>
      )}
      {!loading && !error && events.length > 0 && (
        <div style={styles.list}>
          {events.map((event) => {
            const changes = eventValue(event, "changes", "changes") || [];
            const actor = eventValue(event, "actorEmail", "actor_email") || "Unknown user";
            const role = eventValue(event, "actorRole", "actor_role") || "Unknown role";
            const area = event.area || "Other";
            return (
              <details key={event.id} style={styles.event}>
                <summary style={styles.summary}>
                  <span style={styles.when}>{formatWhen(event)}</span>
                  <span style={styles.actor}>{actor}</span>
                  <span style={styles.area}>{area}</span>
                  <span style={styles.changeCount}>{changes.length} field{changes.length === 1 ? "" : "s"}</span>
                </summary>
                <div style={styles.details}>
                  <div style={styles.meta}>{role} · {event.source || "unknown source"}</div>
                  {changes.length === 0 ? (
                    <p style={styles.muted}>No field-level details available.</p>
                  ) : (
                    <div style={styles.changeList}>
                      {changes.map((change, index) => (
                        <div key={`${event.id}-${index}`} style={styles.change}>
                          <div style={styles.path}>{change.path}</div>
                          <div style={styles.values}>
                            <span style={styles.before}>{formatValue(change.before)}</span>
                            <span style={styles.arrow}>-&gt;</span>
                            <span style={styles.after}>{formatValue(change.after)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

const styles = {
  container: {
    marginBottom: 20,
    padding: "20px 22px",
    border: `1px solid ${COLORS.border || "#d8d8d0"}`,
    background: "#fff",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16,
  },
  title: { margin: 0, fontSize: 22, color: COLORS.darkGreen || "#1f522b" },
  subtitle: { margin: "5px 0 0", color: "#777", fontSize: 13 },
  count: { marginLeft: "auto", color: "#777", fontSize: 13 },
  muted: { color: "#777", fontSize: 14 },
  list: { display: "grid", gap: 8 },
  event: { border: "1px solid #e1e1da", background: "#fafaf7" },
  summary: {
    display: "grid",
    gridTemplateColumns: "minmax(170px, 1.2fr) minmax(150px, 1fr) minmax(110px, .7fr) auto",
    alignItems: "center",
    gap: 12,
    padding: "13px 14px",
    cursor: "pointer",
    listStylePosition: "inside",
    fontSize: 13,
  },
  when: { color: "#555" },
  actor: { fontWeight: 600, overflowWrap: "anywhere" },
  area: { color: COLORS.darkGreen || "#1f522b", fontWeight: 600 },
  changeCount: { color: "#777", textAlign: "right" },
  details: { padding: "0 14px 14px 34px", borderTop: "1px solid #e1e1da" },
  meta: { padding: "11px 0", color: "#777", fontSize: 12 },
  changeList: { display: "grid", gap: 7 },
  change: { padding: "9px 10px", background: "#fff", border: "1px solid #ecece6" },
  path: { fontFamily: "monospace", fontSize: 12, overflowWrap: "anywhere", marginBottom: 5 },
  values: { display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, overflowWrap: "anywhere" },
  before: { color: "#8b3a32" },
  arrow: { color: "#999" },
  after: { color: COLORS.darkGreen || "#1f522b" },
};
