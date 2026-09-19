import { useEffect, useState } from 'react';
import { Check, Flame, Gift } from 'lucide-react';
import { useDailyLogin, type LoginClaimResult } from '@/features/dailylogin/DailyLoginContext';
import { claimedToday, tileStatus } from '@/features/dailylogin/dailylogin';
import type { LoginClaimError } from '@/features/dailylogin/types';
import { periodEnd } from '@/features/missions/missions';
import { timeLeft } from '@/features/manager/manager';
import useRewardView from '@/components/shop/useRewardView';
import styles from './DailyLoginCalendar.module.css';

export interface DailyLoginCalendarProps {
  /** Called after a successful claim, with what was paid. */
  onClaimed?(result: LoginClaimResult): void;
}

const CLAIM_ERROR: Record<LoginClaimError, string> = {
  closed: 'ระบบเข้าเกมรายวันปิดอยู่',
  claimed: 'รับของวันนี้ไปแล้ว',
  complete: 'รับครบทุกวันแล้ว',
  'at-cap': 'ยอดเงินเต็มแล้ว ใช้ของก่อนแล้วค่อยรับ',
  'club-full': 'คลังนักเตะเต็ม เคลียร์ที่ว่างก่อนแล้วค่อยรับ',
  'card-missing': 'การ์ดรางวัลของวันนี้ถูกลบไปแล้ว ติดต่อแอดมิน',
};

/**
 * The calendar itself: one tile per day, today's lit up, and the claim button.
 *
 * Draws inside whatever holds it — the home-screen popup and the inbox tab both
 * use this same component, so the two can never disagree about which day it is.
 */
export default function DailyLoginCalendar({ onClaimed }: DailyLoginCalendarProps) {
  const { config, progress, today, tile, canClaim, claim } = useDailyLogin();
  const view = useRewardView();
  const [now, setNow] = useState(() => new Date());
  const [toast, setToast] = useState<{ id: number; text: string; bad: boolean } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!progress) return null;

  const done = claimedToday(progress, today);
  const total = config.days.length;
  const nextDay = timeLeft(periodEnd('daily', now, config), now);

  function take() {
    const result = claim();
    if (result.ok) {
      const text = result.rewards.map((reward) => view(reward).text).join(', ') || 'ของวันนี้';
      setToast({ id: Date.now(), bad: false, text: `วันที่ ${result.day} · ได้รับ ${text}` });
      onClaimed?.(result);
    } else {
      setToast({ id: Date.now(), bad: true, text: CLAIM_ERROR[result.error ?? 'closed'] });
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.progress}>
          รับแล้ว <strong>{progress.claimedDays.length}</strong>/{total} วัน
        </span>
        {progress.streak > 1 && (
          <span className={styles.streak}>
            <Flame size={22} strokeWidth={2.4} />
            ต่อเนื่อง {progress.streak} วัน
          </span>
        )}
        <span className={styles.reset}>
          {config.cycle === 'month' ? 'รีเซ็ตต้นเดือน · ' : ''}
          วันใหม่ใน {nextDay}
        </span>
      </div>

      {!config.enabled ? (
        <p className={styles.closed}>ระบบเข้าเกมรายวันปิดอยู่ในตอนนี้</p>
      ) : (
        <div className={`${styles.grid} ${config.cycle === 'month' ? styles.gridMonth : ''}`}>
          {config.days.map((day) => {
            const status = tileStatus(progress, today, day);
            const first = day.rewards[0];
            const shown = first ? view(first) : null;
            return (
              <div
                key={day.day}
                className={`${styles.tile} ${styles[status]} ${day.big ? styles.big : ''}`}
                title={day.rewards.map((reward) => view(reward).text).join(', ')}
              >
                <span className={styles.day}>วันที่ {day.day}</span>
                {shown ? (
                  <img
                    className={`${styles.icon} ${shown.isCard ? styles.card : ''}`}
                    src={shown.icon}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <Gift className={styles.iconGlyph} size={36} strokeWidth={2} />
                )}
                <span className={styles.amount}>
                  {shown
                    ? first!.kind === 'card'
                      ? `x${first!.amount}`
                      : shown.count
                    : '—'}
                </span>
                {day.rewards.length > 1 && <span className={styles.more}>+{day.rewards.length - 1}</span>}
                {status === 'claimed' && (
                  <span className={styles.mark}>
                    <Check size={26} strokeWidth={3.2} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.foot}>
        {done ? (
          <span className={styles.doneNote}>
            <Check size={24} strokeWidth={3} />
            รับของวันนี้แล้ว · กลับมาใหม่พรุ่งนี้
          </span>
        ) : (
          <button type="button" className={styles.claim} disabled={!canClaim} onClick={take}>
            <Gift size={26} strokeWidth={2.4} />
            รับของวันที่ {tile}
          </button>
        )}
      </div>

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${toast.bad ? styles.toastBad : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
