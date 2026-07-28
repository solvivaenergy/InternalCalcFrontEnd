# Solviva Solar Calculator

Web calculator built from the original Excel model. All financial math has
been verified to match the spreadsheet to the centavo.

## What's in this repo

```
.
├── index.html              ← Vite entry HTML
├── package.json            ← dependencies (React, Recharts, Vite)
├── vite.config.js          ← Vite build config
├── netlify.toml            ← Netlify build & redirect config
├── .env.example            ← template for environment variables
├── public/
│   ├── logo-full.png       ← page header logo (sun + wordmark)
│   ├── logo-sun.png        ← sun-only mark (used in radiance chart)
│   ├── favicon.png         ← 32x32 browser tab icon
│   └── apple-touch-icon.png← 180x180 iOS home-screen icon
└── src/
    ├── main.jsx            ← React entry point
    ├── config.js           ← passwords (read from env), branding
    ├── components/         ← UI components
    ├── data/               ← all admin-editable parameters
    └── lib/                ← financial math (pure functions)
```

## Local development

```bash
cp .env.example .env.local        # add your two passwords
npm install
npm run dev                       # serves on localhost:5173
```

## Deployment to Netlify

The site is configured to deploy via Netlify's "Deploy manually" flow.

1. **Set environment variables in Netlify:**
   Site configuration → Environment variables → Add a variable
   - `VITE_AUDIT_PASSWORD` (1st-level: read-only access to Inventory & Admin)
   - `VITE_SUPERADMIN_PASSWORD` (2nd-level: full edit access)

2. **Drop-zip deploy:**
   - Zip this entire folder (excluding `node_modules` and `dist`).
   - In Netlify: Deploys → Drag the zip into the drop zone.
   - Netlify will run `npm install` and `npm run build`, baking in the
     env vars at build time, and serve the result.

3. **Custom domain:**
   Domains → Add domain → Enter your domain. Netlify will issue an HTTPS
   certificate automatically.

## Rotating passwords

1. Site configuration → Environment variables → Edit values.
2. Deploys → Trigger deploy → Deploy site (forces a rebuild).
3. New passwords take effect once the deploy completes.

## Editing calculator parameters

The Admin and Inventory pages let an authorized user edit parameters live
through the UI. Edits are saved to Netlify Blobs and become the active
values for **every** user of the calculator on their next page load.

To edit:

1. Click the **Admin** button (top-right on desktop only) and enter the
   editor password.
2. Make changes on the **Admin Parameters** or **Inventory** page.
3. Click **Save changes globally**.

The save validates that the cabling tier table has at least one row before
writing — saving an empty table is blocked because the calculator depends
on at least one tier being present.

If you ever need to roll back to bundled defaults, delete the `parameters`
key in the `solviva-config` blob store via the Netlify dashboard
(**Blobs** in the project sidebar). The next page load will fall back to
the defaults compiled from `src/data/`.

## Editing baseline (bundled) defaults

The defaults compiled into the bundle live in `src/data/`:

1. Edit `src/data/adminParams.js` (well-commented; each constant maps to
   its Excel cell reference).
2. Or edit `src/data/inventory.js` for inverter/panel changes.
3. Or edit `src/data/devices.js` for the device library.
4. Commit and redeploy. These take effect when no override is saved
   in Netlify Blobs.

## Architecture notes

- All math is in `src/lib/calculations.js` and `src/lib/schedule.js` as
  pure functions. These are tested against the original Excel and match
  it to the centavo.
- React state is held in `src/components/App.jsx` and flows down. A
  single `useMemo` recomputes the entire model derivation on any input
  change.
- The model exposes both `recommended` values (computed from inputs)
  and the user's `state` (overrides). The UI shows recommendations as
  green pills next to inputs that have been overridden — clicking a pill
  snaps the input back to its recommendation.

## Security

Passwords are inlined into the client JavaScript bundle at build time.
A determined person CAN extract them via browser developer tools. This
is the same security model as the original .xlsm macro password and is
sufficient for an internal-tool gate. For a public-facing real-money
flow, server-side authentication would be required.
