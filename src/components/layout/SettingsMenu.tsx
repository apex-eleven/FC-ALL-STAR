import { useEffect } from 'react';
import { useAccount, useAuth } from '@/features/auth/AuthContext';
import { requiredXPForLevel } from '@/features/profile/leveling';
import { useSound } from '@/features/sound/SoundContext';
import styles from './SettingsMenu.module.css';

export interface SettingsMenuProps {
  onClose(): void;
}

/**
 * The only way out of a session now that the dev strip is gone, plus the sound
 * switches. Audio lives here rather than in the admin panel because it is a per-
 * device preference, not game tuning: a player on a quiet train needs it without
 * being an admin.
 */
export default function SettingsMenu({ onClose }: SettingsMenuProps) {
  const account = useAccount();
  const { signOut } = useAuth();
  const { config, update, play } = useSound();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.menu} role="menu">
        <div className={styles.who}>
          <span className={styles.name}>{account.username}</span>
          <span className={styles.meta}>
            เลเวล {account.level} · {account.currentXP}/{requiredXPForLevel(account.level)} XP
          </span>
        </div>

        <div className={styles.group}>
          <span className={styles.groupTitle}>เสียง</span>

          <div className={styles.row}>
            <span className={styles.rowLabel}>เสียงปุ่ม</span>
            <button
              type="button"
              data-sound="toggle"
              aria-pressed={config.uiEnabled}
              className={`${styles.switch} ${config.uiEnabled ? styles.switchOn : ''}`}
              onClick={() => update({ uiEnabled: !config.uiEnabled })}
            >
              {config.uiEnabled ? 'เปิด' : 'ปิด'}
            </button>
          </div>

          {/* The preview tick fires on release, not on every drag step: one click per
              pixel of travel is a buzz, not a preview. The slider itself is
              data-sound="off" for the same reason. */}
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            value={Math.round(config.uiVolume * 100)}
            aria-label="ระดับเสียงปุ่ม"
            disabled={!config.uiEnabled}
            data-sound="off"
            onChange={(event) => update({ uiVolume: Number(event.target.value) / 100 })}
            onPointerUp={() => play('click')}
          />

          <div className={styles.row}>
            <span className={styles.rowLabel}>เสียงวิดีโอ walkout</span>
            <button
              type="button"
              data-sound="toggle"
              aria-pressed={config.videoEnabled}
              className={`${styles.switch} ${config.videoEnabled ? styles.switchOn : ''}`}
              onClick={() => update({ videoEnabled: !config.videoEnabled })}
            >
              {config.videoEnabled ? 'เปิด' : 'ปิด'}
            </button>
          </div>

          <input
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            value={Math.round(config.videoVolume * 100)}
            aria-label="ระดับเสียงวิดีโอ"
            disabled={!config.videoEnabled}
            data-sound="off"
            onChange={(event) => update({ videoVolume: Number(event.target.value) / 100 })}
          />
        </div>

        <button
          type="button"
          role="menuitem"
          data-sound="back"
          className={`${styles.item} ${styles.danger}`}
          onClick={() => {
            onClose();
            void signOut();
          }}
        >
          ออกจากระบบ
        </button>
      </div>
    </>
  );
}
