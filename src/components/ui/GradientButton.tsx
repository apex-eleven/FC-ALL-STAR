import type { CSSProperties, ReactNode } from 'react';
import styles from './GradientButton.module.css';

export interface GradientButtonProps {
  children: ReactNode;
  fontSize?: number;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

export default function GradientButton({
  children,
  fontSize = 30,
  type = 'button',
  disabled = false,
  onClick,
  className,
  style,
}: GradientButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[styles.button, className].filter(Boolean).join(' ')}
      style={{ fontSize, ...style }}
    >
      <span className={styles.label}>{children}</span>
    </button>
  );
}
