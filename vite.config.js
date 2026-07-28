import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

// v3-141 — build stamp. package.json's "3.NNN.0" becomes the display label
// "v3-NNN", injected two ways so "what's live?" is a glance, not forensics:
//   1. __APP_VERSION__ — a compile-time constant for the admin footer.
//   2. The x-solviva-build <meta> in index.html — replaced at build time, so
//      view-source on the deployed site names the exact release. (The meta had
//      read a hand-edited "v3-13" since May 2026, which stalled a deploy
//      diagnosis; this removes the manual step entirely.)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const [major, minor] = pkg.version.split('.');
const BUILD_LABEL = `v${major}-${minor}`;

const stampIndexHtml = () => ({
  name: 'solviva-build-stamp',
  transformIndexHtml(html) {
    return html.replace(
      /(<meta name="x-solviva-build" content=")[^"]*(")/,
      `$1${BUILD_LABEL} — stamped at build from package.json$2`,
    );
  },
});

// Vite config for Solviva Calculator.
// Vite reads environment variables prefixed with VITE_ at build time and
// inlines them into the bundle as `import.meta.env.VITE_*`.
//
// On Netlify, set:
//   VITE_AUDIT_PASSWORD  — 1st-level: view-only access to Inventory & Admin
//   VITE_SUPERADMIN_PASSWORD  — 2nd-level: full edit access
export default defineConfig({
  plugins: [react(), stampIndexHtml()],
  define: {
    // Defined as an import.meta.env member (not a bare global) so the
    // no-undef lint gate — which runs --no-inline-config and thus ignores
    // /* global */ escapes — stays clean without weakening the rule.
    'import.meta.env.APP_VERSION': JSON.stringify(BUILD_LABEL),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Treat .jsx files in src/ as React components (default behavior — declared
    // explicitly here for clarity).
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
});
