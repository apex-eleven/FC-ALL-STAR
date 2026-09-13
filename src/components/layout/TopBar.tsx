import { Newspaper } from 'lucide-react';
import { newsButtonLabel } from '@/data/mock/home';
import { useAccount } from '@/features/auth/AuthContext';
import { useAvatars } from '@/features/avatars/AvatarContext';
import { resolveDisplayAvatar } from '@/features/avatars/unlocks';
import { requiredXPForLevel } from '@/features/profile/leveling';
import PlayerProfile from '@/components/profile/PlayerProfile';
import CurrencyBar from '@/components/currency/CurrencyBar';
import styles from './TopBar.module.css';

export interface TopBarProps {
  onAvatarClick?: () => void;
  onSettingsClick?: () => void;
  /** Passed only for admin accounts; turns the ADMIN chip into a button. */
  onAdminClick?: () => void;
}

export default function TopBar({
  onAvatarClick,
  onSettingsClick,
  onAdminClick,
}: TopBarProps) {
  const account = useAccount();
  const { avatars } = useAvatars();

  // Falls back to the default if an admin has since raised the requirement above
  // this player's level. The stored choice is kept, so lowering it restores them.
  const avatar = resolveDisplayAvatar(avatars, account.avatarId, account.level);

  return (
    <header className={styles.bar}>
      <div className={styles.scrim} />

      <div className={styles.left}>
        <PlayerProfile
          player={{
            id: account.id,
            name: account.username,
            level: account.level,
            currentXP: account.currentXP,
            requiredXP: requiredXPForLevel(account.level),
            avatar: avatar?.source ?? '',
            isAdmin: account.role === 'admin',
          }}
          onAvatarClick={onAvatarClick}
          onAdminClick={onAdminClick}
        />

        <button type="button" className={styles.newsButton}>
          <span className={styles.newsGlyph}>
            <Newspaper size={30} strokeWidth={2.2} />
          </span>
          <span className={styles.newsLabel}>{newsButtonLabel}</span>
        </button>
      </div>

      <div className={styles.right}>
        <CurrencyBar
          balances={account.wallet}
          mailBadge={{ variant: 'count', count: 1 }}
          onSettings={onSettingsClick}
        />
      </div>
    </header>
  );
}
