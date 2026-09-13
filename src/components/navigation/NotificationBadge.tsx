import { Gift } from 'lucide-react';
import type { BadgeInfo } from '@/types/common';
import styles from './NotificationBadge.module.css';

export interface NotificationBadgeProps {
  badge: BadgeInfo;
}

export default function NotificationBadge({ badge }: NotificationBadgeProps) {
  if (badge.variant === 'count') {
    if (!badge.count) return null;
    return (
      <span className={`${styles.badge} ${styles.count}`}>
        {badge.count > 99 ? '99+' : badge.count}
      </span>
    );
  }

  if (badge.variant === 'gift') {
    return (
      <span className={`${styles.badge} ${styles.gift}`}>
        <Gift size={18} strokeWidth={2.6} />
      </span>
    );
  }

  return <span className={`${styles.badge} ${styles.dot}`} />;
}
