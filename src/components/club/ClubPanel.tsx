import { ChevronDown, Plus, RefreshCw, Shield, Trophy, Users } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import type { BadgeStatus } from '@/features/badges/types';
import { formatCurrency } from '@/features/currencies/constants';
import ArtImage from '@/components/ui/ArtImage';
import OvrBadge from '@/components/ui/OvrBadge';
import styles from './ClubPanel.module.css';

export interface ClubPanelProps {
  name: string;
  rating: number;
  /** OVR the active crests add — drawn beside the shield when above zero. */
  bonus: number;
  /** The three crest slots. null = empty. */
  badgeSlots: (BadgeStatus | null)[];
  /** Off when the admin has switched crests off; the slots then stay inert. */
  badgesEnabled: boolean;
  formationName: string;
  value: number;
  collectionOpen: boolean;
  canAutoBuild: boolean;
  onAutoBuild(): void;
  onToggleCollection(): void;
  onOpenLeaderboard(): void;
  onBadgeClick(index: number): void;
}

export default function ClubPanel({
  name,
  rating,
  bonus,
  badgeSlots,
  badgesEnabled,
  formationName,
  value,
  collectionOpen,
  canAutoBuild,
  onAutoBuild,
  onToggleCollection,
  onOpenLeaderboard,
  onBadgeClick,
}: ClubPanelProps) {
  return (
    <>
      <div className={styles.panel}>
        <div className={styles.select}>
          {name}
          <ChevronDown className={styles.chevron} size={26} strokeWidth={2.6} />
        </div>

        <div className={styles.ovrRow}>
          <OvrBadge rating={rating} size={132} labelSize={17} valueSize={48} />
          {bonus > 0 && (
            <span className={styles.bonus} title="โบนัสจากตราทีม">
              +{bonus}
            </span>
          )}
        </div>

        <div className={styles.divider} />

        <p className={styles.formation}>{formationName}</p>
        <div className={styles.value}>
          {/* Team value is counted in coins, so it gets the coin rather than the
              wallet's FC point icon. Drop-in art, with the old icon as the fallback. */}
          <ArtImage
            className={styles.valueIcon}
            file="currencylarge_COIN.png"
            fallback={currencies.fcpoint.icon}
          />
          <span className={styles.valueText}>{formatCurrency(value)}</span>
        </div>

        <div className={styles.badges}>
          {badgeSlots.map((status, index) => {
            const badge = status?.badge ?? null;
            const label = badge
              ? `${badge.name || 'ตราทีม'} · ${status!.have}/${status!.need}${status!.active ? ` · +${badge.bonus}` : ''}`
              : badgesEnabled
                ? `ช่องตราทีมที่ ${index + 1} — กดเพื่อเลือก`
                : 'ช่องตราทีม — ปิดอยู่';
            return (
              <button
                type="button"
                key={index}
                className={`${styles.badge} ${badge ? styles.badgeSet : ''} ${status?.active ? styles.badgeActive : ''}`}
                title={label}
                aria-label={label}
                disabled={!badgesEnabled}
                onClick={() => onBadgeClick(index)}
              >
                {badge ? (
                  <>
                    {badge.image ? (
                      <img className={styles.badgeArt} src={badge.image} alt="" draggable={false} />
                    ) : (
                      <Shield className={styles.badgeGlyph} size={30} strokeWidth={2.2} />
                    )}
                    <span className={styles.badgeCount}>
                      {status!.have}/{status!.need}
                    </span>
                  </>
                ) : (
                  <Plus size={22} strokeWidth={2.6} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={onAutoBuild}
          disabled={!canAutoBuild}
        >
          <RefreshCw size={28} strokeWidth={2.4} />
          สร้างอัตโนมัติ
        </button>

        <button
          type="button"
          className={`${styles.action} ${collectionOpen ? styles.actionActive : ''}`}
          onClick={onToggleCollection}
          aria-pressed={collectionOpen}
        >
          <Users size={28} strokeWidth={2.4} />
          ตัวสำรอง
        </button>

        <button type="button" className={styles.action} onClick={onOpenLeaderboard}>
          <Trophy size={28} strokeWidth={2.4} />
          Leaderboard
        </button>
      </div>

      <p className={styles.hint}>
        ลากการ์ดไปวางในตำแหน่งที่ต้องการ · ลากออกนอกสนามเพื่อถอดออกจากทีม
      </p>
    </>
  );
}
