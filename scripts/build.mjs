import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const workspaceRoot = resolve(import.meta.dirname, '..');
const packageJsonPath = resolve(workspaceRoot, 'package.json');
const packageLockPath = resolve(workspaceRoot, 'package-lock.json');

function bumpPatch(version) {
  const parts = String(version || '0.0.0').split('.').map((part) => parseInt(part, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return `${major}.${minor}.${patch + 1}`;
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const nextVersion = bumpPatch(packageJson.version);
packageJson.version = nextVersion;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
packageLock.version = nextVersion;
if (packageLock.packages && packageLock.packages['']) {
  packageLock.packages[''].version = nextVersion;
}
writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);

await build({
  entryPoints: [resolve(workspaceRoot, 'src/index.js')],
  bundle: true,
  format: 'iife',
  globalName: '_b',
  footer: {
    js: 'var init=_b.init;var plugin=_b.plugin;var commands=_b.commands;'
  },
  outfile: resolve(workspaceRoot, 'dist/MatchStatsAPI.js'),
  define: {
    __PLUGIN_VERSION__: JSON.stringify(nextVersion)
  }
});

console.log(`Built MatchStatsAPI.js with version ${nextVersion}`);
