/**
 * บีบไฟล์สื่อให้เล็กลงก่อนขึ้น GitHub / Vercel
 *
 * ทำสามอย่าง:
 *   1. แปลง public/players/*.gif เป็น .webp แบบเคลื่อนไหว (เล็กลงราว 60%)
 *   2. เข้ารหัสวิดีโอ walkout ใหม่ (77 MB -> ~7 MB)
 *   3. **แก้ชื่อไฟล์ที่อ้างถึงใน catalogue.json และ admin.json ให้ตรงกับนามสกุลใหม่**
 *
 * ข้อ 3 คือข้อที่ลืมแล้วพัง: คลังการ์ดเก็บชื่อไฟล์ไว้ ("Mbappé_fc_25_download.gif")
 * แปลงรูปแล้วไม่แก้ชื่อที่อ้าง = การ์ดทุกใบรูปหายหมดโดยไม่มี error อะไรขึ้นเลย
 *
 * ต้องมี ffmpeg ในเครื่อง (https://ffmpeg.org/download.html)
 *
 *   node scripts/compress-media.mjs           ดูว่าจะเปลี่ยนอะไรบ้าง (ไม่แตะไฟล์)
 *   node scripts/compress-media.mjs --apply   ทำจริง
 */
import { readdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');

const PLAYERS = join(root, 'public', 'players');
const VIDEO = join(root, 'src', 'assets', 'video');
const CATALOGUE = join(PLAYERS, 'catalogue.json');
const ADMIN_CONFIG = join(root, 'public', 'config', 'admin.json');

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function haveFfmpeg() {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** gif -> animated webp. Quality 55 keeps card art readable at the size it is shown. */
async function convertGifs() {
  const files = (await readdir(PLAYERS)).filter((name) => name.toLowerCase().endsWith('.gif'));
  if (files.length === 0) return new Map();

  const renames = new Map();
  let before = 0;
  let after = 0;

  for (const name of files) {
    const from = join(PLAYERS, name);
    const target = `${name.replace(/\.gif$/i, '')}.webp`;
    const to = join(PLAYERS, target);

    before += await sizeOf(from);
    renames.set(name, target);

    if (!apply) continue;

    await run('ffmpeg', [
      '-y', '-i', from,
      '-c:v', 'libwebp',
      '-lossless', '0',
      '-q:v', '55',
      '-loop', '0',
      '-an',
      '-vsync', '0',
      to,
    ]);

    after += await sizeOf(to);
    await unlink(from);
  }

  console.log(
    `รูปการ์ด: ${files.length} ไฟล์ · ${mb(before)}${apply ? ` -> ${mb(after)}` : ' (ยังไม่แปลง)'}`,
  );
  return renames;
}

/**
 * Rewrites every place a file name is stored.
 *
 * Both files hold the same card list — catalogue.json is the mirror the app restores
 * from, admin.json is the whole-config backup — so both have to move together or the
 * next restore puts the old names back.
 */
async function rewriteReferences(renames) {
  if (renames.size === 0) return;

  for (const file of [CATALOGUE, ADMIN_CONFIG]) {
    if (!existsSync(file)) continue;

    let text = await readFile(file, 'utf8');
    let hits = 0;

    for (const [from, to] of renames) {
      // JSON-escaped and raw both appear: catalogue.json stores the name plainly,
      // admin.json stores it inside a stringified blob.
      const plain = text.split(from).length - 1;
      if (plain > 0) {
        hits += plain;
        text = text.split(from).join(to);
      }
    }

    console.log(`${file.replace(root, '.')}: แก้ชื่อไฟล์ที่อ้างถึง ${hits} จุด`);
    if (apply && hits > 0) await writeFile(file, text, 'utf8');
  }
}

/** Rebuilds the art manifest so the admin picker lists the new names. */
async function rebuildManifest() {
  if (!apply) return;
  await run(process.execPath, [join(root, 'scripts', 'players-manifest.mjs')]);
}

/**
 * CRF 23 at 1080 wide. The source clips are 1440x1080 at 29 Mbps — far beyond what a
 * looping overlay needs, and the single biggest thing in the repo.
 */
async function compressVideos() {
  const clips = ['walkout-flight.mp4', 'walkout-stage.mp4'];

  for (const name of clips) {
    const from = join(VIDEO, name);
    if (!existsSync(from)) continue;

    const before = await sizeOf(from);
    if (!apply) {
      console.log(`วิดีโอ ${name}: ${mb(before)} (ยังไม่บีบ)`);
      continue;
    }

    const temp = join(VIDEO, `_tmp_${name}`);
    await run('ffmpeg', [
      '-y', '-i', from,
      '-c:v', 'libx264',
      '-crf', '23',
      '-preset', 'medium',
      '-vf', 'scale=1080:-2',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      temp,
    ]);

    const after = await sizeOf(temp);
    // Only replaces when the new file is actually smaller. Re-running the script on
    // already-compressed clips should be a no-op, not a slow quality loss.
    if (after > 0 && after < before) {
      await unlink(from);
      await rename(temp, from);
      console.log(`วิดีโอ ${name}: ${mb(before)} -> ${mb(after)}`);
    } else {
      await unlink(temp);
      console.log(`วิดีโอ ${name}: ${mb(before)} — บีบแล้วไม่เล็กลง ข้ามไป`);
    }
  }
}

if (!(await haveFfmpeg())) {
  console.error('ไม่พบ ffmpeg ในเครื่อง — ติดตั้งก่อนที่ https://ffmpeg.org/download.html');
  process.exit(1);
}

if (!apply) console.log('โหมดดูอย่างเดียว · ใส่ --apply เพื่อทำจริง\n');

const renames = await convertGifs();
await rewriteReferences(renames);
await rebuildManifest();
await compressVideos();

console.log(apply ? '\nเสร็จแล้ว · เปิดเกมเช็ครูปการ์ดก่อนคอมมิต' : '\nยังไม่ได้แตะไฟล์อะไร');
