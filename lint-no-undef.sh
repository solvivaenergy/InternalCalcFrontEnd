#!/bin/bash
# RUN BEFORE EVERY RELEASE.
#
# PASS 1 — no-undef, across src/ AND netlify/.
#   v3-84: a prop added to the WRONG function's signature left an identifier
#   undeclared at its use site. React threw on render; the whole Admin screen went
#   blank. vite compiled it happily.
#
# PASS 2 — no-use-before-define, on netlify/functions ONLY.
#   v3-89: a `const` was declared BELOW a block that read it — a temporal dead
#   zone. `const` hoists but stays uninitialised, so the read threw
#   ReferenceError, the Function crashed, and Netlify returned HTTP 502 on EVERY
#   admin save. Undetected for four releases because netlify/ was not linted at
#   all, and because no-undef cannot see TDZ (the name IS declared, just later).
#
#   Scoped to netlify/ deliberately: src/ uses `function Foo(){...styles...}` with
#   `const styles = {}` at the bottom throughout — closures evaluated at call time,
#   perfectly safe, and ~620 false positives if this rule were applied there.
set -o pipefail
run() { npx --yes eslint@8 --no-eslintrc --no-inline-config --ext .js,.jsx \
  --parser-options=ecmaVersion:2022,sourceType:module,ecmaFeatures:{jsx:true} \
  --env browser,es2022,node --rule "$1" "${@:2}" 2>&1 | grep -vE '^npm warn|^$'; }

A=$(run '{"no-undef":"error"}' src/components src/lib src/data netlify/functions)
B=$(run '{"no-use-before-define":["error",{"functions":false,"classes":false,"variables":true}]}' netlify/functions)

if [ -n "$A$B" ]; then
  [ -n "$A" ] && { echo "--- no-undef (src/ + netlify/) ---"; echo "$A"; }
  [ -n "$B" ] && { echo "--- no-use-before-define (netlify/) ---"; echo "$B"; }
  echo "lint gate: FAILED"; exit 1
fi
echo "lint gate: CLEAN — no undefined identifiers (src/ + netlify/), no TDZ in netlify/"
