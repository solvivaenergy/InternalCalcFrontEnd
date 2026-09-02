# Developer Setup Guide

Welcome! This guide gets the **Solviva Internal Calculator** running on your machine so you can
contribute. Follow it top to bottom. Where it says _"ask the team"_, you need a value from a
teammate — those are secrets that are **never** stored in Git.

The app is two repositories that run together:

| Repo                   | What it is                             | Local URL             |
| ---------------------- | -------------------------------------- | --------------------- |
| `InternalCalcFrontEnd` | Vite + React UI (the calculator)       | http://localhost:5173 |
| `InternalCalcBackEnd`  | Node/Express API + Supabase (Postgres) | http://localhost:3000 |

You'll work against the **staging** environment (a safe sandbox), not production.

---

## 0. Prerequisites

Install these first:

- **Node.js 18 LTS or newer** — check with `node -v`
- **Git** — check with `git -v`
- A code editor (**VS Code** recommended)
- Access you should have been granted (ask the team if any are missing):
  - **GitHub** collaborator (Write) on both repos
  - **Supabase** project member (staging)
  - A **login account** for the staging app (email + password)
  - The **secret values** for the two `.env` files (shared via a password manager)

---

## 1. Clone both repos side by side

Put them in the **same parent folder**:

```powershell
cd C:\Users\<you>\Documents\GitHub
git clone https://github.com/solvivaenergy/InternalCalcFrontEnd.git
git clone https://github.com/solvivaenergy/InternalCalcBackEnd.git
```

---

## 2. Set up the backend

```powershell
cd InternalCalcBackEnd
npm install
```

Create a file named **`.env`** in `InternalCalcBackEnd/` with these keys (values: **ask the team**):

```
SUPABASE_URL=            # staging Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=   # staging service-role key — SECRET, do not share/commit
PORT=3000
CORS_ORIGINS=http://localhost:5173
```

For a local-only parameter database, run the frontend's development command.
It automatically starts the backend with the JSON store:

```powershell
npm run dev
```

This stores parameter changes in `InternalCalcBackEnd/data/parameters.local.json`.
Development builds always call `http://localhost:3000`, regardless of the
configured production or staging API URL. The file is tracked so changes can be
reviewed and committed to GitHub; they do not update either Supabase database.

> ⚠️ `.env` is git-ignored on purpose. **Never commit it** and never paste the service-role key
> anywhere public — it has full database access.

Start the backend:

```powershell
npm start
```

You should see: `InternalCalc backend listening on port 3000`. Leave this terminal running.

---

## 3. Set up the frontend

Open a **second terminal**:

```powershell
cd C:\Users\<you>\Documents\GitHub\InternalCalcFrontEnd
npm install
```

Create a file named **`.env.local`** in `InternalCalcFrontEnd/` (values: **ask the team**):

```
VITE_SUPABASE_URL=           # same staging Supabase project URL
VITE_SUPABASE_ANON_KEY=      # staging anon/public key (safe for the browser)
VITE_API_BASE_URL=http://localhost:3000

# Access-gate passwords (ask the team)
VITE_AUDIT_PASSWORD=
VITE_SUPERADMIN_PASSWORD=
VITE_ENGINEERING_PASSWORD=
VITE_PRODUCT_PASSWORD=
VITE_REP_PASSWORD=
VITE_MAINTENANCE_PASSWORD=
```

> `VITE_API_BASE_URL` points the UI at your **local** backend from step 2. (To test against the
> deployed staging backend instead, use `https://internalcalcbackend-staging.onrender.com`.)

Start the frontend:

```powershell
npm run dev
```

Open the URL it prints (usually **http://localhost:5173**).

---

## 4. Verify everything is connected

- [ ] The calculator page loads at http://localhost:5173
- [ ] You can **log in** with your staging account → confirms **frontend ↔ Supabase** works
- [ ] An **admin or quote action** succeeds (e.g. open the Admin tab and load parameters) →
      confirms **frontend ↔ backend ↔ database** works

**If admin/quote calls fail with a CORS error:** make sure the backend `.env` has
`CORS_ORIGINS=http://localhost:5173` and restart the backend.

**If login fails:** double-check `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and confirm the
team created your staging user.

---

## 5. Learn the codebase

Read these in the repos to get oriented:

- `ARCHITECTURE.md` — how the pieces fit together
- `HANDOFF.md` / `HANDOFF_INPUT_GUIDE.md` — project history and conventions
- `GITHUB_ACTIONS_SETUP.md` — how deployment works
- **`MATH_REFERENCE.md`** — every pricing/financing/energy formula, mapped to source and Excel cells

---

## 6. How we collaborate (please follow this)

We protect production, so **all changes go through a pull request** — never push straight to `main`.

**Every change starts from an up-to-date `main`:**

```powershell
git checkout main
git pull
git checkout -b feature/short-description
```

Make your changes, then:

```powershell
git add -A
git commit -m "Describe what you changed"
git push -u origin feature/short-description
```

**Test on staging first**, then open a PR into `main`:

1. Push your branch (above).
2. Open a PR from your branch **into `staging`** (or merge to `staging`) → it auto-deploys to
   **staging-internalcalc.solvivaenergy.com**. Verify your change there.
3. When it looks good, open a PR **into `main`** and request a review. A teammate approves and
   merges → it auto-deploys to production.

**Two hard rules:**

- 🔒 **Never commit `.env`, `.env.local`, or any secret.** They're git-ignored — keep it that way.
- 🔒 **Never push directly to `main`.** Everything goes through a reviewed PR.

Before starting new work each day: `git checkout main && git pull` so you're in sync.

---

## Quick reference

| Task                        | Command (in the repo folder)                             |
| --------------------------- | -------------------------------------------------------- |
| Install deps                | `npm install`                                            |
| Run backend                 | `npm start` (port 3000)                                  |
| Run frontend                | `npm run dev` (port 5173)                                |
| Production build (frontend) | `npm run build`                                          |
| New feature branch          | `git checkout main; git pull; git checkout -b feature/x` |

Stuck on setup? Ask the team — most issues are a missing `.env` value or a not-yet-created staging
account.
