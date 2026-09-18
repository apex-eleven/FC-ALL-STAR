/**
 * Writes public/players/thumbs/ — one small still per card.
 *
 * Card art is animated and big: 512×512, forty-five frames, about 1.3 MB each. On the
 * pitch that is the point. In the collection drawer a hundred and twenty of them are
 * drawn at 102 px, and the phone has to download and animate every one — 150 MB of
 * transfer for pictures the size of a stamp, and the reason the team screen used to
 * crawl.
 *
 * This makes the small copy once, here, instead of in every player's browser:
 * the first frame, scaled to 256 px, still. About 10 KB each. The game asks for
 * /players/thumbs/<name>.webp first and only falls back to the full file if it is
 * missing, so running this is optional — it just makes the drawer far lighter.
 *
 * Run it after dropping new art in (and after `npm run media:compress`, which renames
 * files):
 *
 *   npm run players:thumbs           see what it would write
 *   npm run players:thumbs -- --apply  write them
 *
 * Needs `sharp` (npm install brings it; it reads animated WebP, which ffmpeg does
 * not).
 */
import { readdir, mkdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');

const PLAYERS = join(root, 'public', 'players');
const THUMBS = join(PLAYERS, 'thumbs');

/** Card art sources. Everything else in the folder is left alone. */
const ART = new Set(['.webp', '.png', '.gif', '.jpg', '.jpeg', '.avif']);

/**
 * Wide enough for a 110 px card on a 2× screen, with room for the drag ghost to
 * borrow it while the real picture loads.
 */
const SIZE = 256;

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    console.error('ต้องติดตั้ง sharp ก่อน:  npm install');
    return null;
  }
}

async function main() {
  const sharp = apply ? await loadSharp() : null;
  if (apply && !sharp) {
    process.exitCode = 1;
    return;
  }

  if (!existsSync(PLAYERS)) {
    console.error('ไม่พบโฟลเดอร์ public/players');
    process.exitCode = 1;
    return;
  }

  const files = (await readdir(PLAYERS, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && ART.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    console.log('ไม่มีไฟล์รูปการ์ดใน public/players');
    return;
  }

  if (apply) await mkdir(THUMBS, { recursive: true });

  let sourceBytes = 0;
  let thumbBytes = 0;
  let made = 0;
  let skipped = 0;

  for (const name of files) {
    const from = join(PLAYERS, name);
    const to = join(THUMBS, `${name.slice(0, -extname(name).length)}.webp`);
    const before = await sizeOf(from);
    sourceBytes += before;

    // A thumb newer than its source is already right.
    if (existsSync(to)) {
      const [source, thumb] = await Promise.all([stat(from), stat(to)]);
      if (thumb.mtimeMs >= source.mtimeMs) {
        thumbBytes += thumb.size;
        skipped += 1;
        continue;
      }
    }

    if (!apply) {
      made += 1;
      continue;
    }

    try {
      // The first frame of an animated file, scaled to fit SIZE, aspect kept.
      await sharp(from)
        .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(to);
      thumbBytes += await sizeOf(to);
      made += 1;
    } catch (error) {
      // A file that cannot be read is not worth stopping for: the game falls back to
      // the full picture for that card.
      console.warn(`ข้าม ${name}: ${error.message.split('\n')[0]}`);
      await unlink(to).catch(() => undefined);
    }
  }

  console.log(
    apply
      ? `เขียนแล้ว ${made} ไฟล์ (ข้ามที่มีอยู่แล้ว ${skipped}) · ต้นฉบับ ${kb(sourceBytes)} → ย่อ ${kb(thumbBytes)}`
      : `จะเขียน ${made} ไฟล์ (ข้ามที่มีอยู่แล้ว ${skipped}) · ใส่ --apply เพื่อทำจริง`,
  );
}

await main();
