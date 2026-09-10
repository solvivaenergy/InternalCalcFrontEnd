// =============================================================================
// DEV BACKEND LAUNCHER — starts the Express API alongside `vite` for local dev
// -----------------------------------------------------------------------------
// Invoked by `npm run dev` (see package.json) through `concurrently`.
//
// Three things the old one-liner got wrong, all fixed here:
//
//   1. CWD. `node ../SomeDir/dev-server.js` runs the backend with the FRONTEND
//      as cwd. The backend resolves both its local parameter store
//      (src/parametersService.js → path.join(process.cwd(), 'data', …)) and its
//      .env (dotenv reads from cwd) relative to the working directory, so it
//      would look for Frontend/data/parameters.local.json and Frontend/.env and
//      fail. We spawn with cwd set to the backend directory.
//
//   2. DIRECTORY NAME. Checkouts differ: ARCHITECTURE.md documents the repo
//      names (InternalCalcBackEnd), while this working copy uses Backend/. We
//      probe the known candidates instead of hardcoding one.
//
//   3. NODE 20. @supabase/supabase-js needs a global WebSocket, which Node 20
//      only exposes behind --experimental-websocket. Without it every
//      Supabase-backed route dies with "native WebSocket not found". We add the
//      flag automatically below Node 22 and omit it at 22+, where it is
//      built in (and passing an unknown flag would be fatal).
// =============================================================================

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoParent = resolve(here, '..', '..');

// Ordered by likelihood for this working copy; both layouts are supported.
const CANDIDATES = ['Backend', 'InternalCalcBackEnd'];

const backendDir = CANDIDATES
  .map((name) => join(repoParent, name))
  .find((dir) => existsSync(join(dir, 'dev-server.js')));

if (!backendDir) {
  console.error(
    '\n[dev-backend] Could not find the backend.\n' +
    `  Looked for dev-server.js in, relative to ${repoParent}:\n` +
    CANDIDATES.map((c) => `    - ${c}/`).join('\n') +
    '\n\n  Clone the backend repo next to this one, or run `npm run dev:web`\n' +
    '  to start Vite alone against a remote VITE_API_BASE_URL.\n',
  );
  process.exit(1);
}

// Node 20 hides WebSocket behind a flag; 22+ has it and rejects the flag.
const major = Number(process.versions.node.split('.')[0]);
const nodeArgs = major < 22 ? ['--experimental-websocket'] : [];

console.log(`[dev-backend] ${backendDir}` + (nodeArgs.length ? ' (--experimental-websocket)' : ''));

const child = spawn(
  process.execPath,
  [...nodeArgs, 'dev-server.js'],
  { cwd: backendDir, stdio: 'inherit' },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on('error', (err) => {
  console.error('[dev-backend] failed to start:', err.message);
  process.exit(1);
});

// concurrently -k sends SIGTERM/SIGINT on shutdown; pass it through so the
// backend does not survive as an orphan holding port 3000.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { if (!child.killed) child.kill(sig); });
}
