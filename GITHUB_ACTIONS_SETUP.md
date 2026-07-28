# GitHub Actions Setup Guide

## What was created

1. **Frontend workflow** (`.github/workflows/deploy.yml`): Builds Vite app with env vars → deploys to GitHub Pages
2. **Backend workflow** (`.github/workflows/deploy.yml`): Triggers Render deployment on push

---

## Setup Steps

### 1. Frontend: Create GitHub Secrets

Go to **InternalCalcFrontEnd** repo → Settings → Secrets and variables → Actions → New repository secret

Add these 6 secrets:

| Secret Name | Value | Example |
|---|---|---|
| `VITE_AUDIT_PASSWORD` | View-only access password | `audit-pass-123` |
| `VITE_SUPERADMIN_PASSWORD` | Full admin password | `superadmin-pass-456` |
| `VITE_ENGINEERING_PASSWORD` | Engineering team password | `eng-pass-789` |
| `VITE_PRODUCT_PASSWORD` | Product team password | `prod-pass-101` |
| `VITE_REP_PASSWORD` | Sales rep mode password | `rep-pass-112` |
| `VITE_MAINTENANCE_PASSWORD` | Maintenance mode password | `maint-pass-113` |

### 2. Frontend: Update Render Backend URL

In `.github/workflows/deploy.yml`, find this line:

```yaml
RENDER_BACKEND_URL: "https://internalcalc-backend.onrender.com"
```

Replace `internalcalc-backend.onrender.com` with your actual Render app URL.

**To find it:**
- Go to Render dashboard → Your backend app → Copy the URL from "Web Services" tab

### 3. Enable GitHub Pages

Go to **InternalCalcFrontEnd** repo → Settings → Pages

- **Source**: Deploy from a branch
- **Branch**: `gh-pages` (Actions will create this automatically)
- **Folder**: `/ (root)`

Click Save. The workflow will auto-deploy to GitHub Pages on next push.

### 4. Backend: Optional Render Deploy Hook

If you want automatic Render deployments on push:

1. Go to Render dashboard → Your backend app → Deploys → Deploy hook
2. Copy the webhook URL
3. Go to **InternalCalcBackEnd** repo → Settings → Secrets and variables → Actions
4. Create secret: `RENDER_DEPLOY_HOOK` = `[paste webhook URL]`

If you skip this, Render will only redeploy if you've connected it to GitHub (which you probably have).

---

## Testing

1. **Push to GitHub** — workflow runs automatically
2. **Frontend** — Check Actions tab, then visit `https://solvivaenergy.github.io/InternalCalcFrontEnd/`
3. **Backend** — Check Render dashboard to verify deployment

---

## If errors occur

**Frontend build fails:** Check that all 6 secrets are set with correct values.

**Backend doesn't deploy:** Render might be auto-deploying already. Check Render dashboard → Activity tab.

**Frontend can't reach backend:** Verify `RENDER_BACKEND_URL` in `.github/workflows/deploy.yml` is correct.

