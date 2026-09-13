import type { CSSProperties, ReactNode } from 'react';
import styles from './GlassPanel.module.css';

export interface GlassPanelProps {
  children?: ReactNode;
  /** Draws the dark outer / light inner double stroke used by game panels. */
  edged?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function GlassPanel({
  children,
  edged = false,
  className,
  style,
}: GlassPanelProps) {
  return (
    <div
      className={[styles.panel, edged ? styles.edged : '', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}
