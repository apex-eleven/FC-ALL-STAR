import { useState } from 'react';

export interface ArtImageProps {
  /**
   * File name inside `public/brand/`, e.g. `currencylarge_COIN.png`. Not a path and
   * not a URL — the folder is the convention.
   */
  file: string;
  /** Bundled asset used until that file exists. */
  fallback: string;
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
}

/**
 * An icon that prefers a drop-in file over the bundled one.
 *
 * Artwork like this changes far more often than the code around it, and going
 * through `assetMap.ts` means an import line and a rebuild for every swap. This
 * looks in `public/brand/` first and quietly falls back to the bundled asset when
 * the file is not there, so the screen is never broken by art that has not been
 * added yet.
 */
export default function ArtImage({
  file,
  fallback,
  className,
  alt = '',
  width,
  height,
}: ArtImageProps) {
  const [failed, setFailed] = useState(false);

  return (
    <img
      className={className}
      src={failed ? fallback : `/brand/${file}`}
      alt={alt}
      width={width}
      height={height}
      // Fires once. After the swap the src is the bundled asset, which cannot fail
      // the same way, so there is no loop to guard against.
      onError={() => setFailed(true)}
    />
  );
}
