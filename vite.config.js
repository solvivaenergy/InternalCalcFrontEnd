import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for Solviva Calculator.
// Vite reads environment variables prefixed with VITE_ at build time and
// inlines them into the bundle as `import.meta.env.VITE_*`.
//
// On Netlify, set:
//   VITE_AUDIT_PASSWORD  — 1st-level: view-only access to Inventory & Admin
//   VITE_SUPERADMIN_PASSWORD  — 2nd-level: full edit access
export default defineConfig({
  plugins: [react()],
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
