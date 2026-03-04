import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { context } from 'esbuild';

const workspaceRoot = resolve(import.meta.dirname, '..');
const packageJsonPath = resolve(workspaceRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = String(packageJson.version || '0.0.0-dev');

const ctx = await context({
  entryPoints: [resolve(workspaceRoot, 'src/index.js')],
  bundle: true,
  format: 'iife',
  globalName: '_b',
  footer: {
    js: 'var init=_b.init;var plugin=_b.plugin;var commands=_b.commands;'
  },
  outfile: resolve(workspaceRoot, 'dist/MatchStatsAPI.js'),
  define: {
    __PLUGIN_VERSION__: JSON.stringify(version)
  }
});

await ctx.watch();
console.log(`Watching MatchStatsAPI.js with version ${version}`);
