import { useState, type CSSProperties, type ReactNode } from 'react';

export interface BrandGlyphProps {
  /** File name inside `public/brand/`, e.g. `league_star.png`. */
  file: string;
  /** Rendered instead when the file is not there — usually a lucide icon. */
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

/**
 * Drop-in artwork with a *rendered* fallback rather than a second image.
 *
 * `ArtImage` falls back to another file, which is right for icons that ship in the
 * bundle. These do not: the league art is dropped into `public/brand/` by hand, and
 * until it is there the screen should draw its own glyph instead of a broken image.
 *
 * Layering the two — art on top, glyph behind — was the obvious alternative and is
 * wrong: when the art loads, the glyph is still painted underneath it, and any
 * transparency in the artwork shows the stand-in bleeding through.
 */
export default function BrandGlyph({
  file,
  children,
  className,
  style,
  alt = '',
}: BrandGlyphProps) {
  const [missing, setMissing] = useState(false);

  if (missing) return <>{children}</>;

  return (
    <img
      className={className}
      style={style}
      src={`/brand/${file}`}
      alt={alt}
      // Fires once; after it, the component renders the glyph and never the image.
      onError={() => setMissing(true)}
    />
  );
}
