import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSaveErrors } from '@/features/cloud/cloudSaveErrors';
import { isCloudEnabled } from '@/features/cloud/firebase';
import styles from './SaveErrorBanner.module.css';

/** How often an admin's browser re-counts the reports. */
const ADMIN_POLL_MS = 5 * 60_000;

/**
 * Two bars, fixed to the top of the window rather than drawn on the stage — they have
 * to be readable at any scale and sit above every screen, including the live match.
 *
 * The red one is for whoever's save is failing right now. It stays up until a save
 * goes through, and it cannot be dismissed: dismissing it is how a player ends up
 * playing another hour into a save that is not being kept.
 *
 * The amber one is for admins only, and says how many players have filed a failure
 * report. That is the "admin finds out" half — the player's own browser files the
 * report when its save is refused, so an admin hears about it without that player
 * having to say anything.
 */
export default function SaveErrorBanner() {
  const { account, isAdmin, saveError } = useAuth();
  const [reports, setReports] = useState(0);
  const [hidden, setHidden] = useState(false);

  const recount = useCallback(() => {
    void fetchSaveErrors().then((rows) => setReports(rows.length));
  }, []);

  useEffect(() => {
    if (!isAdmin || !account || !isCloudEnabled()) return;
    recount();
    const timer = window.setInterval(recount, ADMIN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isAdmin, account, recount]);

  // An admin whose own save just failed has, by definition, a report to look at.
  useEffect(() => {
    if (isAdmin && saveError) recount();
  }, [isAdmin, saveError, recount]);

  if (!account) return null;

  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {saveError && (
        <div className={`${styles.bar} ${styles.bad}`}>
          <AlertTriangle size={20} strokeWidth={2.4} />
          <span className={styles.text}>
            <b>บันทึกไม่สำเร็จ</b> — ความคืบหน้าล่าสุดยังไม่ถูกเซฟ อย่าเพิ่งปิดเกม
            ระบบกำลังลองใหม่ทุกครั้งที่มีการเปลี่ยนแปลง และแจ้งแอดมินแล้ว
            {saveError.count > 1 && <span className={styles.count}> · พลาดแล้ว {saveError.count} ครั้ง</span>}
            {/* The raw reason is for an admin to act on, not for a player to decode. */}
            {isAdmin && <span className={styles.detail}>{saveError.message}</span>}
          </span>
        </div>
      )}

      {isAdmin && reports > 0 && !hidden && (
        <div className={`${styles.bar} ${styles.warn}`}>
          <ShieldAlert size={20} strokeWidth={2.4} />
          <span className={styles.text}>
            <b>แอดมิน:</b> มีผู้เล่นเซฟไม่ผ่าน {reports} คน — ดูรายชื่อที่ แผงแอดมิน › เซฟล้มเหลว
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={() => setHidden(true)}
            aria-label="ซ่อนจนกว่าจะเปิดเกมใหม่"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}
