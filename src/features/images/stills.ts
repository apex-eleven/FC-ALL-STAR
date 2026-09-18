import { useEffect, useState } from 'react';

/**
 * Still copies of card art, at the size they are actually drawn.
 *
 * Card art is a 45-frame animated WebP, 512×512, about 1.3 MB each. On the pitch,
 * eleven of them at once is what the artwork is for. In the collection drawer it is a
 * hundred and twenty of them at 102 px wide: a hundred and twenty animations running
 * at once, every one decoding 512×512 frames for a picture the size of a thumbnail.
 * That is what makes the team screen crawl on a phone, and it is most of the dropped
 * frames when the drawer is scrolled.
 *
 * So below a certain size the art is drawn once into a canvas — which takes the first
 * frame of an animated file — and the result is used instead. The cards look the same
 * standing still, the animation stays where it can be seen, and the browser paints a
 * 102 px picture instead of resampling a 512 px one for every frame.
 *
 * The cache is keyed by source and size and shared by every screen, so scrolling back
 * up the drawer costs nothing.
 */

const cache = new Map<string, string>();
const building = new Map<string, Promise<string | null>>();

/** Roughly a full drawer page at three sizes; each entry is a ~40 KB blob. */
const LIMIT = 500;

function keyOf(src: string, width: number, height: number): string {
  return `${Math.round(width)}x${Math.round(height)}|${src}`;
}

/** Enough pixels for a sharp picture on a retina screen, and no more. */
function pixelRatio(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

function remember(key: string, url: string): void {
  cache.set(key, url);
  if (cache.size <= LIMIT) return;
  // Oldest first: a Map keeps insertion order.
  const oldest = cache.keys().next();
  if (oldest.done) return;
  const stale = cache.get(oldest.value);
  cache.delete(oldest.value);
  if (stale) URL.revokeObjectURL(stale);
}

async function draw(src: string, width: number, height: number): Promise<string | null> {
  try {
    // createImageBitmap takes the first frame of an animated file, which is the point.
    const bitmap = await createImageBitmap(await (await fetch(src)).blob());
    const ratio = pixelRatio();
    const fit = Math.min((width * ratio) / bitmap.width, (height * ratio) / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * fit));
    canvas.height = Math.max(1, Math.round(bitmap.height * fit));
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return await new Promise<string | null>((done) => {
      canvas.toBlob((out) => done(out ? URL.createObjectURL(out) : null), 'image/webp', 0.92);
    });
  } catch {
    // A missing file, a tainted canvas, a browser without createImageBitmap: the
    // caller falls back to the original picture, which is what it was showing anyway.
    return null;
  }
}

function ensure(src: string, width: number, height: number): Promise<string | null> {
  const key = keyOf(src, width, height);
  const ready = cache.get(key);
  if (ready) return Promise.resolve(ready);

  const already = building.get(key);
  if (already) return already;

  const job = draw(src, width, height).then((url) => {
    building.delete(key);
    if (url) remember(key, url);
    return url;
  });
  building.set(key, job);
  return job;
}

/**
 * The still for this picture at this size, or null until there is one (and for good
 * when it cannot be made). `enabled` false returns null without doing any work — a
 * card big enough to show the animation asks for nothing.
 */
export function useStill(
  src: string,
  width: number,
  height: number,
  enabled: boolean,
): string | null {
  // Started the moment the card mounts — not when it scrolls into view, and not
  // after the picture has loaded. Measured on a throttled CPU, both of those kept
  // the work for the scroll, which is the one moment it must not happen in.
  const key = enabled && src ? keyOf(src, width, height) : '';
  const [url, setUrl] = useState<string | null>(() => (key ? (cache.get(key) ?? null) : null));

  useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }
    const ready = cache.get(key);
    if (ready) {
      setUrl(ready);
      return;
    }
    let alive = true;
    setUrl(null);
    void ensure(src, width, height).then((made) => {
      if (alive) setUrl(made);
    });
    return () => {
      alive = false;
    };
    // The key already carries the picture and the size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return url;
}
