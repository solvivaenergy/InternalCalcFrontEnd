import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

// Vite config for Solviva Calculator.
// Vite reads environment variables prefixed with VITE_ at build time and
// inlines them into the bundle as `import.meta.env.VITE_*`.
//
// On Netlify, set:
//   VITE_AUDIT_PASSWORD  — 1st-level: view-only access to Inventory & Admin
//   VITE_SUPERADMIN_PASSWORD  — 2nd-level: full edit access
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base =
    env.VITE_BASE_PATH || (mode === "production" ? "/internalcalc/" : "/");

  return {
    base,
    plugins: [react()],
    build: {
      outDir: "dist",
      sourcemap: false,
      // Treat .jsx files in src/ as React components (default behavior — declared
      // explicitly here for clarity).
    },
    esbuild: {
      loader: "jsx",
      include: /src\/.*\.jsx?$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: { ".js": "jsx" },
      },
    },
  };
});
