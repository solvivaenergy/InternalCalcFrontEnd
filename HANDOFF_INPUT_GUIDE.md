# Handoff Input Guide

Use BOTH source snapshots and handoff files as required inputs for every update cycle.

## Required input artifacts

1. Source snapshot (code baseline)

- Preferred: tagged/released source folder (example: `solvivacalc-source-v3-76`)
- Alternate: git commit/branch reference if source snapshot folder is unavailable

2. Handoff document set (change intent)

- Primary: `HANDOFF.md`
- Optional add-ons: `HANDOFF-<date>.md`, release notes, issue notes

## Required sections in each handoff

1. Scope

- What changed
- What must stay unchanged

2. Files touched

- Frontend files
- Backend files (if any)

3. Behavior changes

- User-visible changes
- Admin/auth/permission changes

4. Data contract changes

- New fields
- Deprecated fields
- Migration notes

5. Validation

- Build/test commands
- Expected outputs

6. Deployment notes

- Env vars required
- Hosting/deploy steps

## Update workflow

1. Lock the source baseline to one explicit version (folder or commit SHA).
2. Read latest handoff file(s) before making edits.
3. Compare handoff scope to baseline and current code.
4. Apply code changes.
5. Run validation commands.
6. Update `HANDOFF.md` with:

- Summary of changes
- File list
- Validation result
- Deployment result

## Rule for future sessions

Every new change request should include BOTH:

- a source baseline reference, and
- the latest handoff file(s).

If either is missing, create/confirm them before closing the update.
