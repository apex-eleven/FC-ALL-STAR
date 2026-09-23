import { RefreshCw, WifiOff } from 'lucide-react';
import { useSyncHealth } from '@/features/cloud/useSyncHealth';
import styles from './SyncHealthBanner.module.css';

/**
 * แถบเตือนบางๆ ที่แสดงเมื่อดึงตั้งค่าจากคลาวด์ไม่สำเร็จ
 * หายเองเมื่อ Firestore sync กลับมาได้ ไม่บล็อคการเล่น
 */
export default function SyncHealthBanner() {
  const { health } = useSyncHealth();
  if (health === 'ok') return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <WifiOff size={20} />
      <span>ข้อมูลเกมอาจยังไม่ล่าสุด — กำลังลองใหม่</span>
      <RefreshCw size={16} className={styles.spin} aria-hidden="true" />
    </div>
  );
}
