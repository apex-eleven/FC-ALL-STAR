import { useState } from 'react';
import styles from './ManagerTrophy.module.css';

export interface ManagerTrophyProps {
  /** Uploaded art, or '' for the drawn trophy. */
  image: string;
  /** "ตำนาน IV" — the last word is engraved on the drawn trophy. */
  name: string;
  className?: string;
}

/** Engraving for the drawn trophy: a trailing roman numeral, else the first letter. */
function mark(name: string): string {
  const last = name.trim().split(/\s+/).pop() ?? '';
  return /^[IVX]+$/.test(last) ? last : (name.trim()[0] ?? '');
}

/**
 * The tier trophy. The admin uploads one per tier; until then a generic inverted
 * shield on a plinth is drawn, engraved with the tier's numeral.
 */
export default function ManagerTrophy({ image, name, className = '' }: ManagerTrophyProps) {
  const [broken, setBroken] = useState(false);

  if (image && !broken) {
    return (
      <img
        className={`${styles.art} ${className}`}
        src={image}
        alt={name}
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <svg className={`${styles.art} ${className}`} viewBox="0 0 280 310" role="img" aria-label={name}>
      <defs>
        <linearGradient id="mt-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3b8" />
          <stop offset="0.45" stopColor="#e2b44c" />
          <stop offset="1" stopColor="#8a5a17" />
        </linearGradient>
        <linearGradient id="mt-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e4cf0" />
          <stop offset="1" stopColor="#3b137e" />
        </linearGradient>
        <linearGradient id="mt-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3d46" />
          <stop offset="1" stopColor="#101217" />
        </linearGradient>
      </defs>
      <path d="M8 6 L272 6 L140 230 Z" fill="url(#mt-gold)" />
      <path d="M34 22 L246 22 L140 202 Z" fill="url(#mt-face)" />
      <path d="M34 22 L140 22 L140 202 Z" fill="#ffffff" opacity="0.08" />
      <text
        x="140"
        y="118"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="84"
        fontWeight="700"
        fill="url(#mt-gold)"
        stroke="#5a3a0c"
        strokeWidth="2"
      >
        {mark(name)}
      </text>
      <path d="M112 236 L168 236 L178 268 L102 268 Z" fill="url(#mt-gold)" />
      <path d="M86 268 L194 268 L204 302 L76 302 Z" fill="url(#mt-base)" />
    </svg>
  );
}
