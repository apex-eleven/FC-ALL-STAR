import { RotateCcw } from 'lucide-react';
import { useAvatars } from '@/features/avatars/AvatarContext';
import { MAX_REQUIRED_LEVEL, MIN_REQUIRED_LEVEL } from '@/features/avatars/constants';
import styles from './AdminAvatars.module.css';

/**
 * Level requirements are game configuration, not player data: one setting applies to
 * every account in the browser. Changes take effect immediately — an avatar a player
 * already chose stays stored even if it becomes locked, so lowering the level again
 * gives it back.
 */
export default function AdminAvatars() {
  const { avatars, setRequiredLevel, clearOverride, resetAll, hasOverrides } = useAvatars();

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          กำหนดเลเวลที่ต้องถึงเพื่อปลดล็อกแต่ละรูป ({MIN_REQUIRED_LEVEL}–{MAX_REQUIRED_LEVEL})
          มีผลกับทุกไอดีในเครื่องนี้
        </p>
        <button
          type="button"
          className={styles.reset}
          onClick={resetAll}
          disabled={!hasOverrides}
        >
          คืนค่าเริ่มต้นทั้งหมด
        </button>
      </div>

      <div className={styles.list}>
        {avatars.map((avatar) => (
          <div
            key={avatar.id}
            className={`${styles.row} ${avatar.overridden ? styles.rowOverridden : ''}`}
          >
            <img className={styles.thumb} src={avatar.source} alt="" />

            <span className={styles.meta}>
              <span className={styles.name}>{avatar.name}</span>
              <span className={`${styles.default} ${avatar.overridden ? styles.changed : ''}`}>
                {avatar.overridden
                  ? `แก้แล้ว · เดิมเลเวล ${avatar.defaultRequiredLevel}`
                  : `ค่าเริ่มต้น เลเวล ${avatar.defaultRequiredLevel}`}
              </span>
            </span>

            <span className={styles.control}>
              <span className={styles.label}>เลเวล</span>
              <input
                className={styles.input}
                value={avatar.requiredLevel}
                inputMode="numeric"
                aria-label={`เลเวลที่ปลดล็อก ${avatar.name}`}
                onChange={(event) => {
                  const digits = event.target.value.replace(/[^\d]/g, '');
                  // An empty field would clamp to 1 on every keystroke, so ignore it
                  // and let the value settle when they type a digit.
                  if (digits === '') return;
                  setRequiredLevel(avatar.id, Number.parseInt(digits, 10));
                }}
              />
              <button
                type="button"
                className={styles.undo}
                onClick={() => clearOverride(avatar.id)}
                disabled={!avatar.overridden}
                aria-label={`คืนค่าเริ่มต้นของ ${avatar.name}`}
              >
                <RotateCcw size={17} strokeWidth={2.4} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
