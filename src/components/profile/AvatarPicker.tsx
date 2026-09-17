import { Lock } from 'lucide-react';
import { X } from 'lucide-react';
import { useAccount, useAuth } from '@/features/auth/AuthContext';
import { isItemAvatarId } from '@/features/avatars/extraAvatars';
import { useItems } from '@/features/items/ItemsContext';
import { isUnlocked, unlockedCount } from '@/features/avatars/unlocks';
import GlassPanel from '@/components/ui/GlassPanel';
import styles from './AvatarPicker.module.css';

export interface AvatarPickerProps {
  onClose(): void;
}

export default function AvatarPicker({ onClose }: AvatarPickerProps) {
  const account = useAccount();
  const { setAvatar } = useAuth();
  const extra = account.inventory?.avatars ?? [];
  // Item avatars appear once the item has been used; until then there is nothing to pick.
  const avatars = useItems().avatars.filter((avatar) => !isItemAvatarId(avatar.id) || extra.includes(avatar.id));
  const unlocked = unlockedCount(avatars, account.level, extra);

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="เลือกรูปโปรไฟล์">
      <GlassPanel edged className={styles.panel}>
        <div className={styles.head}>
          <h1 className={styles.title}>เลือกรูปโปรไฟล์</h1>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={22} strokeWidth={2.6} />
          </button>
        </div>
        <p className={styles.intro}>
          ปลดล็อกเพิ่มได้เมื่อเลเวลสูงขึ้น ตอนนี้คุณอยู่เลเวล {account.level}
        </p>

        <div className={styles.grid}>
          {avatars.map((avatar) => {
            const open = isUnlocked(avatar, account.level, extra);
            const selected = avatar.id === account.avatarId;

            return (
              <button
                type="button"
                key={avatar.id}
                disabled={!open}
                aria-pressed={selected}
                className={`${styles.card} ${selected ? styles.selected : ''} ${open ? '' : styles.locked}`}
                onClick={() => {
                  if (!open) return;
                  setAvatar(avatar.id);
                  onClose();
                }}
              >
                <span className={styles.thumb}>
                  <img className={styles.image} src={avatar.source} alt="" />
                  {avatar.animated && <span className={styles.animatedTag}>GIF</span>}
                  {!open && (
                    <span className={styles.lockOverlay}>
                      <Lock size={30} strokeWidth={2.4} />
                    </span>
                  )}
                </span>

                <span className={styles.name}>{avatar.name}</span>
                <span
                  className={`${styles.requirement} ${open ? '' : styles.requirementLocked} ${
                    selected ? styles.current : ''
                  }`}
                >
                  {selected
                    ? 'กำลังใช้อยู่'
                    : open
                      ? 'พร้อมใช้งาน'
                      : `ปลดล็อกที่เลเวล ${avatar.requiredLevel}`}
                </span>
              </button>
            );
          })}
        </div>

        <p className={styles.footer}>
          ปลดล็อกแล้ว {unlocked} จาก {avatars.length} รูป
        </p>
      </GlassPanel>
    </div>
  );
}
