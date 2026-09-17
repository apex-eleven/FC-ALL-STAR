import type { CSSProperties } from 'react';
import { AlertTriangle, Info, PartyPopper, X } from 'lucide-react';
import { useAnnouncement } from '@/features/announcement/AnnouncementContext';
import type { AnnouncementTone } from '@/features/announcement/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import styles from './AnnouncementOverlay.module.css';

const TONE_ICON = {
  info: Info,
  event: PartyPopper,
  warning: AlertTriangle,
} as const;

const TONE_COLOUR: Record<AnnouncementTone, string> = {
  info: '#46c8ff',
  event: '#ff9a2e',
  warning: '#ff5470',
};

/**
 * The notice an admin puts in the middle of everyone's screen.
 *
 * Rendered once at the app root, above whatever screen is up, so it does not need
 * every screen to know about it. Always closable — an admin can force it to reappear
 * every visit, but never trap someone behind it, because a notice nobody can shut is
 * a notice that takes the game offline.
 */
export default function AnnouncementOverlay() {
  const { config, visible, dismiss } = useAnnouncement();
  const { navigate } = useNavigation();

  if (!visible) return null;

  const Icon = TONE_ICON[config.tone];
  const style = { '--tone': TONE_COLOUR[config.tone] } as CSSProperties;

  return (
    <div className={styles.screen} style={style} role="dialog" aria-modal="true">
      <button type="button" className={styles.scrim} onClick={dismiss} aria-label="ปิดประกาศ" />

      <div className={styles.panel}>
        {config.image && <img className={styles.banner} src={config.image} alt="" />}

        <div className={styles.head}>
          <span className={styles.icon}>
            <Icon size={26} strokeWidth={2.4} />
          </span>
          <h2 className={styles.title}>{config.title || 'ประกาศ'}</h2>
          <button type="button" className={styles.close} onClick={dismiss} aria-label="ปิด">
            <X size={20} strokeWidth={2.6} />
          </button>
        </div>

        {/* Split on newlines rather than rendering markup: the body is admin-typed
            text, and the moment it is parsed as HTML the panel becomes an injection
            point that reaches every player. */}
        <div className={styles.body}>
          {config.body
            .trimEnd()
            .split('\n')
            .map((line, index) =>
              line.trim() === '' ? <br key={index} /> : <p key={index}>{line}</p>,
            )}
        </div>

        <div className={styles.actions}>
          {config.action !== 'none' && (
            <button
              type="button"
              className={styles.go}
              onClick={() => {
                dismiss();
                navigate(config.action as Exclude<typeof config.action, 'none'>);
              }}
            >
              {config.actionLabel || 'ไปที่หน้านั้น'}
            </button>
          )}
          <button type="button" className={styles.ok} onClick={dismiss}>
            รับทราบ
          </button>
          {/* For a notice telling players an update is out — dismiss the same way
              "รับทราบ" does (so a "once" notice does not reopen after the reload),
              then reload so they land on the latest deployed build. */}
          <button
            type="button"
            className={styles.refresh}
            onClick={() => {
              dismiss();
              window.location.reload();
            }}
          >
            รีเฟรชหน้าจอ
          </button>
        </div>
      </div>
    </div>
  );
}
