/**
 * Copies the built web client to the repository root `dist/` folder.
 *
 * The Cloudflare Pages project for BRONEE HRMS is configured with
 * "Build output directory: dist" and "Root directory: /", so the SPA has to
 * land in the root `dist/` for the existing project settings to work without
 * any dashboard changes.
 *
 *   packages/web/dist  ->  dist
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'packages', 'web', 'dist');
const target = path.join(root, 'dist');

if (!existsSync(path.join(source, 'index.html'))) {
  console.error(`✖ Nothing to copy — ${path.relative(root, source)} has no index.html.`);
  console.error('  Run the web build first:  npm run build -w @bronee/web');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

console.log(`✔ Copied ${path.relative(root, source)} → ${path.relative(root, target)}/`);
