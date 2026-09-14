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
import { readdir, readFile, writeFile, rename, unlink, stat, mkdir, rm } from 'node:fs/promises';
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

/**
 * The flag that tells ffmpeg to keep every source frame, which differs by version.
 *
 * ffmpeg 9 removed `-vsync` outright; older builds do not know `-fps_mode`. Rather
 * than pin a version, the first file tries each form and the working one is reused
 * for the rest — a script that only runs on the author's ffmpeg is not a tool.
 */
let frameFlags = null;

const FRAME_FLAG_VARIANTS = [
  ['-fps_mode', 'passthrough'], // ffmpeg 5+
  ['-vsync', '0'], // ffmpeg 4 and earlier
  [], // last resort: let ffmpeg decide
];

async function encodeWebp(from, to) {
  const build = (flags) => [
    '-y', '-i', from,
    '-c:v', 'libwebp',
    '-lossless', '0',
    '-q:v', '55',
    '-loop', '0',
    '-an',
    ...flags,
    to,
  ];

  if (frameFlags) {
    await run('ffmpeg', build(frameFlags));
    return;
  }

  let lastError;
  for (const flags of FRAME_FLAG_VARIANTS) {
    try {
      await run('ffmpeg', build(flags));
      frameFlags = flags;
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Turns off per-frame alpha blending in an animated webp.
 *
 * THE BUG THIS EXISTS FOR: ffmpeg's libwebp encoder writes every frame as BLEND +
 * DISPOSE_NONE. Each frame is full-canvas, so blending is not just unnecessary, it is
 * wrong — a pixel that is opaque in one frame and transparent in the next keeps the
 * OLD frame's colour forever, because nothing ever clears the canvas. On card art
 * whose sparks and flames move every frame, that residue piles up: measured across
 * these cards the dark area grew from 7% on frame 1 to as much as 16% by frame 45, so
 * the card visibly blackens as it loops and resets only when the image reloads.
 *
 * ffmpeg cannot set the flag, so the file is taken apart and reassembled with
 * NO_BLEND and DISPOSE_BACKGROUND. The frame payloads are copied untouched — the
 * output is byte-for-byte the same size, nothing is re-encoded, no quality is lost.
 *
 * Needs `webpmux` from libwebp (apt install webp / brew install webp). Missing is not
 * fatal: the art still works, it just darkens as it animates.
 */
async function clearBlendFlag(file) {
  const info = await run('webpmux', ['-info', file]);
  const frames = Number(/Number of frames:\s*(\d+)/.exec(info.stdout)?.[1] ?? 0);
  if (frames < 2) return false;

  const duration = Number(info.stdout.split('\n')[5]?.trim().split(/\s+/)[6] ?? 60);
  const scratch = join(PLAYERS, `.blend-${Date.now()}`);
  await mkdir(scratch, { recursive: true });

  try {
    const args = [];
    for (let i = 1; i <= frames; i += 1) {
      const part = join(scratch, `${String(i).padStart(4, '0')}.webp`);
      await run('webpmux', ['-get', 'frame', String(i), file, '-o', part]);
      // +duration+x+y+dispose+blend — dispose 1 = background, -b = do not blend
      args.push('-frame', part, `+${duration}+0+0+1-b`);
    }
    await run('webpmux', [...args, '-loop', '0', '-bgcolor', '255,255,255,0', '-o', file]);
    return true;
  } finally {
    await rm(scratch, { recursive: true, force: true });
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

    await encodeWebp(from, to);
    try {
      await clearBlendFlag(to);
    } catch {
      console.warn(`  เตือน: ปิด blend ของ ${target} ไม่ได้ (ต้องมี webpmux) การ์ดจะค่อย ๆ ดำตอนเล่น`);
    }
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
