// =============================================================================
// VALIDATION — shared input-validation helpers
// -----------------------------------------------------------------------------
// Centralizes input rules so all forms use the same validation. Currently:
//   • Philippine mobile numbers (validation + auto-formatting)
// =============================================================================

// Strip all non-digit characters from a phone string for evaluation.
// Accepts user-entered formats like "0917-867-5309", "(0917) 8675309",
// " +63 917 867 5309 ", etc.
function digitsOf(s) {
  return (s || '').replace(/\D+/g, '');
}

// Phone rules (mobile-only):
//   • Once stripped of formatting, the number must start with `09`
//     (Philippine mobile prefix).
//   • Must contain at least 11 digits in total.
// Examples that PASS: "0917-867-5309" (11 digits, starts 09)
// Examples that FAIL: "02-8866-3685"  (not 09 — landline, rejected)
//                     "0917867"        (too short)
//                     "8917-867-5309"  (no leading 0)
//                     "+63 917 867 5309" (starts with 6 after stripping)
//
// Used for both the customer mobile and the Solviva agent mobile — both
// must be reachable via SMS, so landlines are rejected. All PH mobile
// numbers start with 09.
export function isValidPhPhone(value) {
  const d = digitsOf(value);
  return d.length >= 11 && d.startsWith('09');
}

// User-facing helper text for invalid phone numbers — reused by every form
// that validates a phone field, so the message stays consistent.
export const PH_PHONE_HINT = 'Enter a valid mobile number — at least 11 digits long starting with a 09 (e.g., 0917-123-4567).';

// Auto-format a partially-typed mobile number into XXXX-XXX-XXXX (4-3-4)
// grouping as the user types. Behavior:
//   • Strips formatting characters, caps at 11 digits.
//   • If the digits start with "09" → format with dashes.
//   • Otherwise → return the user's input UNCHANGED. We don't try to be
//     clever about international forms ("+63...") because the rule is
//     mobile-only with leading 09; if the input doesn't start that way
//     the validator will surface the error and the user can correct it
//     without surprise rewrites of what they typed.
//
// Progressive examples:
//   ""           → ""
//   "0"          → "0"
//   "09"         → "09"
//   "0917"       → "0917"
//   "09178"      → "0917-8"
//   "091786"     → "0917-86"
//   "0917867"    → "0917-867"
//   "09178675"   → "0917-867-5"
//   "09178675309" → "0917-867-5309"
//   "0917-867-5309" → "0917-867-5309"  (idempotent — re-formatting is safe)
//   "0917867530999" → "0917-867-5309"  (caps at 11 digits)
//   "8675309"    → "8675309"           (no leading 09 — passed through)
//   "+639178675309" → "+639178675309"  (no leading 09 — passed through)
export function formatPhPhone(value) {
  if (!value) return value || '';
  const d = digitsOf(value);
  if (!d.startsWith('09')) return value;            // pass through bad input as-is
  const capped = d.slice(0, 11);
  if (capped.length <= 4) return capped;
  if (capped.length <= 7) return `${capped.slice(0, 4)}-${capped.slice(4)}`;
  return `${capped.slice(0, 4)}-${capped.slice(4, 7)}-${capped.slice(7)}`;
}
