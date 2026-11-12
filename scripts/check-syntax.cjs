/**
 * Parses every TypeScript source file in the repo with esbuild and reports
 * syntax errors. Run before building to catch malformed sources early.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['packages'];
const skipDirs = new Set(['node_modules', 'dist', '.wrangler', 'build', '.git']);

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(path.join(dir, entry.name));
    }
  }
}
for (const r of roots) walk(r);

let failed = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  try {
    esbuild.transformSync(src, { loader: file.endsWith('.tsx') ? 'tsx' : 'ts', sourcefile: file });
  } catch (e) {
    failed++;
    console.log(`\nFAIL ${file}`);
    for (const err of e.errors ?? []) {
      console.log(`  line ${err.location.line}:${err.location.column} ${err.text}`);
      console.log(`    > ${err.location.lineText}`);
    }
  }
}

console.log(`\n${files.length} files checked, ${failed} with syntax errors.`);
process.exit(failed ? 1 : 0);
