import type { Player } from '@/features/profile/types';
import LevelProgress from './LevelProgress';
import styles from './PlayerProfile.module.css';

export interface PlayerProfileProps {
  player: Player;
  /** Opens the avatar picker. */
  onAvatarClick?: () => void;
  /** When set and the player is an admin, the ADMIN chip opens the admin panel. */
  onAdminClick?: () => void;
}

export default function PlayerProfile({
  player,
  onAvatarClick,
  onAdminClick,
}: PlayerProfileProps) {
  const interactiveChip = player.isAdmin && onAdminClick;

  return (
    <div className={styles.profile}>
      <button
        type="button"
        className={styles.avatarFrame}
        onClick={onAvatarClick}
        aria-label="เปลี่ยนรูปโปรไฟล์"
        title="เปลี่ยนรูปโปรไฟล์"
      >
        <img className={styles.avatar} src={player.avatar} alt="" />
      </button>
      <div className={styles.details}>
        <span className={styles.nameRow}>
          <span className={styles.name}>{player.name}</span>
          {interactiveChip ? (
            <button
              type="button"
              className={`${styles.adminChip} ${styles.adminChipButton}`}
              onClick={onAdminClick}
              title="เปิดแผงควบคุมแอดมิน"
            >
              ADMIN
            </button>
          ) : (
            player.isAdmin && <span className={styles.adminChip}>ADMIN</span>
          )}
        </span>
        <LevelProgress
          progress={{
            level: player.level,
            currentXP: player.currentXP,
            requiredXP: player.requiredXP,
          }}
        />
      </div>
    </div>
  );
}
