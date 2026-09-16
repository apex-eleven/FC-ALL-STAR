import type { ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Shown instead of the confirm button's normal state when the action cannot go ahead. */
  blockedReason?: string | null;
  onConfirm(): void;
  onClose(): void;
}

/** The last step before points move — buying one card, or selling a selection. */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  blockedReason,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />

      <div className={styles.panel}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.body}>{children}</div>
        {blockedReason && <p className={styles.blocked}>{blockedReason}</p>}

        <footer className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={Boolean(blockedReason)}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
