import type { CSSProperties, ReactNode } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  children: ReactNode;
  label: string;
  size?: number;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Wrapper for every icon affordance. Real artwork replaces the lucide glyph inside
 * this one component rather than at each call site.
 */
export default function IconButton({
  children,
  label,
  size = 40,
  onClick,
  className,
  style,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={[styles.button, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, ...style }}
    >
      {children}
    </button>
  );
}
