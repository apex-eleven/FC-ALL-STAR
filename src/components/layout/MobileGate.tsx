import { Maximize, RotateCcw } from 'lucide-react';
import { useFullscreen, useIsPortrait, useIsTouch } from '@/hooks/useFullscreen';
import styles from './MobileGate.module.css';

/**
 * What a phone sees before it can play.
 *
 * The stage is 2048x942, wider than 2:1. Upright, a phone shows it at about a third
 * of the size it needs, and every button becomes a guess. Rather than let the game
 * render into that, this covers it and asks for landscape.
 *
 * The fullscreen button sits here because entering fullscreen needs a tap: the
 * browser will not grant it from code that runs on load, and the orientation lock
 * that comes with it only works while fullscreen is active. One tap does both.
 */
export default function MobileGate() {
  const isTouch = useIsTouch();
  const isPortrait = useIsPortrait();
  const { isFullscreen, supported, enter } = useFullscreen();

  // Desktop is left alone entirely, including a narrow window — nobody rotates a
  // monitor, and a letterboxed stage there is perfectly playable.
  if (!isTouch || !isPortrait) return null;

  return (
    <div className={styles.gate}>
      <div className={styles.card}>
        <RotateCcw size={54} strokeWidth={2.2} className={styles.icon} />
        <h1 className={styles.title}>หมุนเครื่องเป็นแนวนอน</h1>
        <p className={styles.text}>
          เกมนี้ออกแบบมาสำหรับจอแนวนอน
          <br />
          หมุนเครื่องแล้วจะเข้าเกมให้เอง
        </p>

        {supported && !isFullscreen && (
          <button type="button" className={styles.button} onClick={() => void enter()}>
            <Maximize size={20} strokeWidth={2.6} />
            เล่นเต็มหน้าจอ
          </button>
        )}

        <p className={styles.hint}>
          {supported
            ? 'กดปุ่มนี้จะเข้าเต็มจอและหมุนจอให้อัตโนมัติ'
            : 'ถ้าหมุนแล้วไม่เปลี่ยน ให้ปิดล็อกหมุนหน้าจอในเครื่องก่อน'}
        </p>
      </div>
    </div>
  );
}
