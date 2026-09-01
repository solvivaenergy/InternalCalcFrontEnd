#!/bin/bash
# TWO maps must stay in sync between src/lib/permissions.js and
# netlify/functions/parameters.js, not one:
#   1. PARAM_KEY_TO_SECTION  — which section a param belongs to
#   2. ROLE_ADMIN_SECTIONS   — which sections a ROLE may edit
#
# The standing rule only ever mentioned #1. In v3-83 'margins' was added to the
# CLIENT's role map but not the SERVER's, so the server silently STRIPPED
# grossMargin from every PUT as not-permitted-for-role: no validation error, no
# save. The admin sees "saved" and nothing changes. Worse than a crash.
#
# v3-180 — BOTH COMPARISONS WERE TOO WEAK TO CATCH A SECTION MOVE.
#   Map 1 compared KEY NAMES ONLY (the value was stripped by `tr -d ' :'`), so
#   re-pointing minDpTiers from 'quoteLimits' to 'financingTerms' on one side
#   only passed clean.
#   Map 2 compared the POOLED UNION of section strings across all roles, so
#   moving 'interestRates' from product to finco on one side only left the
#   sorted union byte-identical and passed clean.
#   Both halves of the FinCo split were invisible to the gate that exists
#   precisely to catch them — the v3-89 failure class, one layer deeper. The
#   comparisons below are now key:value and per-role respectively.
set -o pipefail
fail=0

# --- Map 1: full key:value pairs (NOT just the keys) ------------------------
for f in src/lib/permissions.js netlify/functions/parameters.js; do
  sed -n '/PARAM_KEY_TO_SECTION = {/,/^};/p' "$f" \
    | grep -oE "^  [a-zA-Z0-9_]+: +'[a-zA-Z0-9]+'," \
    | sed -E "s/^ +//; s/: +'/=/; s/',$//" \
    | sort > "/tmp/sync.k.$(basename "$f")"
done
if diff -q /tmp/sync.k.permissions.js /tmp/sync.k.parameters.js > /dev/null; then
  echo "  OK    PARAM_KEY_TO_SECTION - $(wc -l < /tmp/sync.k.permissions.js) key:section pairs, in sync"
else
  echo "  DRIFT PARAM_KEY_TO_SECTION (key=section):"
  diff /tmp/sync.k.permissions.js /tmp/sync.k.parameters.js | sed 's/^/        /'; fail=1
fi

# Guard against the extraction silently matching nothing (a reformat would
# otherwise produce two empty files that diff clean and pass the gate).
if [ ! -s /tmp/sync.k.permissions.js ]; then
  echo "  ERROR PARAM_KEY_TO_SECTION extraction matched 0 rows - the map's formatting changed."
  fail=1
fi

# --- Map 2: PER-ROLE membership (NOT the pooled union) ----------------------
for f in src/lib/permissions.js netlify/functions/parameters.js; do
  sed -n '/ROLE_ADMIN_SECTIONS = {/,/^};/p' "$f" \
    | awk '
        /^  [a-zA-Z0-9]+: +new Set\(\[/ { role = $1; sub(/:$/, "", role); next }
        /^  \]\),?$/                     { role = ""; next }
        # ONLY a bare entry line counts: four spaces, a quoted name, a comma.
        # v3-180 — an earlier pass matched ANY quoted lowercase word on ANY line
        # inside the block, so a section name mentioned in a trailing COMMENT
        # ("// left for \047financingTerms\047 at the split") was extracted as a real
        # grant. It was symmetric across both files, so it diffed clean while
        # reporting that Product could edit a FinCo section. Anchored now.
        /^    \047[a-zA-Z0-9]+\047,/ {
          if (role != "") {
            line = $0
            match(line, /\047[a-zA-Z0-9]+\047/)
            print role "=" substr(line, RSTART + 1, RLENGTH - 2)
          }
        }' \
    | sort > "/tmp/sync.r.$(basename "$f")"
done
if diff -q /tmp/sync.r.permissions.js /tmp/sync.r.parameters.js > /dev/null; then
  echo "  OK    ROLE_ADMIN_SECTIONS  - $(wc -l < /tmp/sync.r.permissions.js) role:section pairs, in sync"
else
  echo "  DRIFT ROLE_ADMIN_SECTIONS (role=section):"
  diff /tmp/sync.r.permissions.js /tmp/sync.r.parameters.js | sed 's/^/        /'; fail=1
fi

if [ ! -s /tmp/sync.r.permissions.js ]; then
  echo "  ERROR ROLE_ADMIN_SECTIONS extraction matched 0 rows - the map's formatting changed."
  fail=1
fi

# --- Map 3: every section a role may edit must be a REAL section ------------
# A typo'd section name in a role's Set is otherwise inert: it grants nothing,
# matches nothing, and both sides agree on the typo so Maps 1-2 pass.
if [ -s /tmp/sync.k.permissions.js ] && [ -s /tmp/sync.r.permissions.js ]; then
  cut -d= -f2 /tmp/sync.k.permissions.js | sort -u > /tmp/sync.known
  UNKNOWN=$(cut -d= -f2 /tmp/sync.r.permissions.js | sort -u | grep -vxFf /tmp/sync.known || true)
  if [ -z "$UNKNOWN" ]; then
    echo "  OK    role sections all resolve to real PARAM_KEY_TO_SECTION sections"
  else
    echo "  ERROR role allowlist names sections that own no parameter:"
    echo "$UNKNOWN" | sed 's/^/        /'
    fail=1
  fi
fi

# --- Map 4 (v3-187): IRR_YEARS_OPTIONS -------------------------------------
# The Step 4 dropdown and the FinCo default selector share one list in
# src/data/adminParams.js. netlify/functions/parameters.js cannot import from
# src/, so it keeps a copy to validate against — the same duplication that
# PARAM_KEY_TO_SECTION has, and the same drift risk. If the server's copy fell
# behind, FinCo could save a horizon the server rejects (or worse, accept one
# the customer dropdown cannot offer, leaving the <select> with nothing
# selected).
CLIENT_IRR=$(grep -oE 'export const IRR_YEARS_OPTIONS = \[[0-9, ]+\]' src/data/adminParams.js \
             | grep -oE '\[[0-9, ]+\]' | tr -d ' ')
SERVER_IRR=$(grep -oE 'const IRR_YEARS_OPTIONS = \[[0-9, ]+\]' netlify/functions/parameters.js \
             | grep -oE '\[[0-9, ]+\]' | tr -d ' ')
if [ -z "$CLIENT_IRR" ] || [ -z "$SERVER_IRR" ]; then
  echo "  ERROR IRR_YEARS_OPTIONS not found on one or both sides."
  fail=1
elif [ "$CLIENT_IRR" = "$SERVER_IRR" ]; then
  echo "  OK    IRR_YEARS_OPTIONS      - $CLIENT_IRR, in sync"
else
  echo "  DRIFT IRR_YEARS_OPTIONS: client $CLIENT_IRR vs server $SERVER_IRR"
  fail=1
fi

[ $fail -eq 0 ] && echo "param-sync gate: CLEAN" || { echo "param-sync gate: FAILED"; exit 1; }
