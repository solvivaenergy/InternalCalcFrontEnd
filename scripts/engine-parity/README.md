# Engine parity harness

Proves that a change to `src/engine/` (a move, a refactor, a dependency
swap) did not change a single number. It runs 46 calculator scenarios through
`computeProposal()` against a real `app_parameters` payload, in plain Node,
and compares two captures byte for byte — the merged parameter objects
included.

It was written for the 2026-09-27 move of the engine out of `src/lib` and
`src/data` (141/141 identical across the staging and production rows) and is
the bar for the next move, into the backend repo.

```
# 1. the payload (COGS + margins — keep it out of git and chat)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/engine-parity/fetch-params.mjs /tmp/params-staging.json

# 2. "before": the engine at the last known-good commit
git archive <sha> src package.json | tar -x -C /tmp/before
node scripts/engine-parity/capture.mjs /tmp/before /tmp/params-staging.json /tmp/before.json

# 3. "after": the working tree
node scripts/engine-parity/capture.mjs . /tmp/params-staging.json /tmp/after.json

# 4. compare — exit 0 means identical
node scripts/engine-parity/compare.mjs /tmp/before.json /tmp/after.json
```

Run it against the production row as well as staging; the two rows differ
(devices, margins) and have caught different things.

A commit older than 2026-09-27 has no `src/engine/`; its engine lived in
`src/lib` and `src/data` with the pipeline inside App.jsx's `model` memo, so
`capture.mjs` cannot load it. The original move was checked by lifting that
memo out by text markers into a temporary module — repeat that if you ever
need a capture from that era.

A deliberate formula change will fail this comparison. That is the point:
make the change, run the harness, and read the diff to confirm it changed
exactly the scenarios and fields you meant it to.
