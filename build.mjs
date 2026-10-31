// Writes the Vite production build into BUILD_OUT_DIR.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(root, 'main');
const outDir = process.env.BUILD_OUT_DIR;
const base = process.env.BUILD_BASE || './';

if (!outDir) {
  console.error('BUILD_OUT_DIR is not set; run via update-subwebsites.sh');
  process.exit(1);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(resolve(appDir, 'node_modules'))) {
  run('npm', ['ci'], appDir);
}

run('node', ['generate-boot-preset.js'], root);

// Calls vite directly (skips tsc typecheck); --emptyOutDir clears stale output.
run('npx', ['vite', 'build', '--outDir', JSON.stringify(outDir), '--emptyOutDir', '--base', base], appDir);
