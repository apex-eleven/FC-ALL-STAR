import { CalendarCheck, X } from 'lucide-react';
import { useDailyLogin } from '@/features/dailylogin/DailyLoginContext';
import DailyLoginCalendar from './DailyLoginCalendar';
import styles from './DailyLoginOverlay.module.css';

export interface DailyLoginOverlayProps {
  onClose(): void;
}

/**
 * The calendar as a popup over the home screen.
 *
 * Opened by GameLayout when today's tile is unclaimed, and closable without
 * claiming — a player who wants to get on with something else is not held at
 * the door. Closing tells the feature not to open it again this launch.
 */
export default function DailyLoginOverlay({ onClose }: DailyLoginOverlayProps) {
  const { config, dismissPrompt } = useDailyLogin();

  const close = () => {
    dismissPrompt();
    onClose();
  };

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={config.title}>
      <button type="button" className={styles.scrim} onClick={close} aria-label="ปิด" />

      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.icon}>
            <CalendarCheck size={30} strokeWidth={2.4} />
          </span>
          <h2 className={styles.title}>{config.title}</h2>
          <button type="button" className={styles.close} onClick={close} aria-label="ปิด">
            <X size={24} strokeWidth={2.6} />
          </button>
        </div>

        <div className={styles.body}>
          <DailyLoginCalendar />
        </div>
      </div>
    </div>
  );
}
