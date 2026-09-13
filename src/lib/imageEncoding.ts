export type UploadedImageError =
  | 'not-an-image'
  | 'too-large-to-store'
  | 'decode-failed'
  | 'encode-failed';

export interface UploadedImageResult {
  ok: boolean;
  error: UploadedImageError | null;
  /** Data URL, present when ok. */
  dataUrl: string | null;
  bytes: number;
}

export interface EncodeOptions {
  maxWidth: number;
  maxHeight: number;
  /** Hard ceiling for the encoded payload. */
  maxBytes: number;
  /** Tried in order until one fits under maxBytes. */
  qualitySteps?: number[];
}

const DEFAULT_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];

function fail(error: UploadedImageError): UploadedImageResult {
  return { ok: false, error, dataUrl: null, bytes: 0 };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    image.src = url;
  });
}

/** Rough byte count of a data URL's payload, without allocating a Blob. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Turns an uploaded file into a data URL small enough to live in localStorage.
 *
 * Uploads are re-encoded rather than stored as-is: a 1.4 MB PNG would spend a
 * quarter of the origin's whole storage budget, and nothing here renders at print
 * resolution. WebP is tried first and JPEG is the fallback, because a canvas that
 * does not support WebP silently returns PNG — which is much bigger than either.
 *
 * Shared by every admin upload surface; each caller supplies its own size budget.
 */
export async function encodeUploadedImage(
  file: File,
  { maxWidth, maxHeight, maxBytes, qualitySteps = DEFAULT_QUALITY_STEPS }: EncodeOptions,
): Promise<UploadedImageResult> {
  if (!file.type.startsWith('image/')) return fail('not-an-image');

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return fail('decode-failed');
  }

  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return fail('encode-failed');
  context.drawImage(image, 0, 0, width, height);

  const webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  const mime = webpSupported ? 'image/webp' : 'image/jpeg';

  let smallest: { dataUrl: string; bytes: number } | null = null;

  for (const quality of qualitySteps) {
    const dataUrl = canvas.toDataURL(mime, quality);
    const bytes = dataUrlBytes(dataUrl);
    if (!smallest || bytes < smallest.bytes) smallest = { dataUrl, bytes };
    if (bytes <= maxBytes) return { ok: true, error: null, dataUrl, bytes };
  }

  // Even the lowest quality is too big — report it rather than silently storing
  // something that will throw QuotaExceededError on the next save.
  return { ok: false, error: 'too-large-to-store', dataUrl: null, bytes: smallest?.bytes ?? 0 };
}
