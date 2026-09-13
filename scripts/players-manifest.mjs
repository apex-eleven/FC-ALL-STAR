/**
 * Writes public/players/manifest.json — the list of card art files.
 *
 * A browser cannot read a directory, and these files deliberately do not go through
 * the bundler (a few hundred animated cards would be read on every build), so the
 * admin picker needs someone to tell it what is there. Run this once after dropping
 * new art in:
 *
 *   npm run players:manifest
 *
 * Nothing else depends on it: a missing manifest only means the picker is empty and
 * the file name has to be typed by hand.
 */
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ART_EXTENSIONS = new Set(['.webp', '.png', '.gif', '.jpg', '.jpeg', '.avif']);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const folder = join(root, 'public', 'players');
const target = join(folder, 'manifest.json');

await mkdir(folder, { recursive: true });

const entries = await readdir(folder, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => ART_EXTENSIONS.has(name.slice(name.lastIndexOf('.')).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

await writeFile(target, `${JSON.stringify({ files }, null, 2)}\n`, 'utf8');

console.log(`players:manifest — ${files.length} ไฟล์ -> public/players/manifest.json`);
