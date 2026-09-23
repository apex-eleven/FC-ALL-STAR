import { useEffect, useState } from 'react';

export type SyncHealth = 'ok' | 'failed';

/**
 * ติดตามว่าการดึงตั้งค่าจากคลาวด์ครั้งล่าสุดสำเร็จไหม
 * ใช้กับทุกผู้เล่น ไม่ใช่แค่แอดมิน
 *
 * 'ok'     = ยังไม่เคยล้มเหลวในเซสชั่นนี้ (รวมถึงตอนโหลด)
 * 'failed' = pull ล้มเหลว จะกลับเป็น 'ok' เองเมื่อ Firestore ส่งข้อมูลใหม่สำเร็จ
 */
export function useSyncHealth(): { health: SyncHealth; reason: string } {
  const [health, setHealth] = useState<SyncHealth>('ok');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const onFail = (event: Event) => {
      setHealth('failed');
      setReason((event as CustomEvent<string>).detail ?? 'ไม่ทราบสาเหตุ');
    };
    const onOk = () => {
      setHealth('ok');
      setReason('');
    };
    window.addEventListener('fcallstar:sync-failed', onFail);
    window.addEventListener('fcallstar:sync-ok', onOk);
    return () => {
      window.removeEventListener('fcallstar:sync-failed', onFail);
      window.removeEventListener('fcallstar:sync-ok', onOk);
    };
  }, []);

  return { health, reason };
}
