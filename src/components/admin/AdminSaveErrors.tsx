import { useCallback, useEffect, useState } from 'react';
import {
  clearSaveError,
  fetchSaveErrors,
  type SaveErrorReport,
} from '@/features/cloud/cloudSaveErrors';
import { isCloudEnabled } from '@/features/cloud/firebase';
import styles from './AdminSaveErrors.module.css';

/**
 * Players whose saves the cloud refused.
 *
 * Each row is filed by that player's own browser the moment a save fails (at most
 * once a minute), so this list fills without anyone having to report anything. A row
 * stays until an admin clears it — a player whose saves recovered on their own still
 * lost whatever they did while it was failing, and that is worth knowing.
 *
 * Clearing a row does not fix anything by itself. It is for "dealt with": the cause
 * is fixed and, if needed, the player has been given back what they lost.
 */
export default function AdminSaveErrors() {
  const [rows, setRows] = useState<SaveErrorReport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    void fetchSaveErrors().then(setRows);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clear = async (uid: string) => {
    setBusy(uid);
    const ok = await clearSaveError(uid);
    setBusy(null);
    if (ok) setRows((current) => current?.filter((row) => row.uid !== uid) ?? null);
  };

  if (!isCloudEnabled()) {
    return (
      <div className={styles.wrap}>
        <p className={styles.note}>ระบบนี้ใช้ได้เฉพาะตอนเปิดคลาวด์ — โหมดเก็บในเครื่องไม่มีเซฟขึ้นเซิร์ฟเวอร์ให้พัง</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          ผู้เล่นที่เซฟขึ้นคลาวด์ไม่ผ่าน · เบราว์เซอร์ของผู้เล่นแจ้งเข้ามาเองทันทีที่เซฟพัง
          (ไม่เกินนาทีละครั้งต่อคน) · ของที่เล่นไปตอนเซฟพังจะหายเมื่อผู้เล่นเปิดเกมใหม่
          ต้องเสกคืนให้เองทางแท็บจัดการผู้เล่น
        </p>
        <button type="button" className={styles.refresh} onClick={load}>
          รีเฟรช
        </button>
      </div>

      {rows === null ? (
        <p className={styles.note}>กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>ไม่มีรายงาน — เซฟทุกคนผ่านปกติ</p>
      ) : (
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.rowHead}`}>
            <span>ผู้เล่น</span>
            <span>ล่าสุด</span>
            <span>พลาด</span>
            <span>สาเหตุ</span>
            <span />
          </div>
          {rows.map((row) => (
            <div className={styles.row} key={row.uid}>
              <span className={styles.who}>{row.username}</span>
              <span className={styles.when}>
                {row.at ? row.at.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              </span>
              <span className={styles.count}>{row.count}</span>
              <span className={styles.why} title={row.message}>
                {row.message}
              </span>
              <button
                type="button"
                className={styles.clear}
                disabled={busy === row.uid}
                onClick={() => void clear(row.uid)}
              >
                {busy === row.uid ? '…' : 'จัดการแล้ว'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
