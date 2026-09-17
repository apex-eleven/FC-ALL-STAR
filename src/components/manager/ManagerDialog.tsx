import { Check, Shield, Star, X } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { formatCurrency } from '@/features/currencies/constants';
import { seasonEnd } from '@/features/manager/manager';
import { useManager } from '@/features/manager/ManagerContext';
import { avatarSrc } from './avatarSrc';
import ManagerTrophy from './ManagerTrophy';
import styles from './ManagerDialog.module.css';

export type ManagerDialogMode = 'rules' | 'rewards' | 'history';

export interface ManagerDialogProps {
  mode: ManagerDialogMode;
  onClose(): void;
}

const TITLE: Record<ManagerDialogMode, string> = {
  rules: 'แรงค์และกติกา',
  rewards: 'รางวัลประจำสัปดาห์',
  history: 'ประวัติการแข่ง',
};

const OUTCOME = { win: 'ชนะ', draw: 'เสมอ', loss: 'แพ้' } as const;

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The ladder and rules, the week's reward track, or the last matches. */
export default function ManagerDialog({ mode, onClose }: ManagerDialogProps) {
  const { config, state } = useManager();
  const end = seasonEnd(new Date(), config);

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={TITLE[mode]}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />
      <div className={styles.panel}>
        <header className={styles.head}>
          <h2>{TITLE[mode]}</h2>
          <button type="button" className={styles.close} data-sound="back" onClick={onClose} aria-label="ปิด">
            <X size={26} strokeWidth={2.6} />
          </button>
        </header>

        {mode === 'rules' && (
          <div className={styles.body}>
            <ul className={styles.rules}>
              <li>แมตช์จัดอันดับ: ชนะ +1 ดาว · แพ้ -1 ดาว · เสมอไม่เปลี่ยน</li>
              <li>ชนะจนดาวครบจะเลื่อนแรงค์ · ดาวเป็น 0 แล้วแพ้จะตกแรงค์ (ยกเว้นแรงค์ที่มีโล่)</li>
              <li>
                ซีซั่นละ {config.seasonDays} วัน จบซีซั่นนี้{' '}
                {end.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{' '}
                · ขึ้นซีซั่นใหม่แรงค์ลด {config.seasonDrop} ขั้น
              </li>
              <li>คู่แข่งคือทีมของผู้เล่นจริงที่ OVR ใกล้เคียง ถ้าไม่มีจะเจอทีมบอท</li>
              <li>
                ดูทีมตัวจริงลงเตะสด ~{Math.round(config.matchSeconds / 60)} นาที เร่งได้ x2/x4 · ปรับแทคติก
                บุก/สมดุล/ตั้งรับ และเปลี่ยนตัวได้ 5 ครั้ง
              </li>
              <li>ออกจากแมตช์จัดอันดับกลางคันหรือปิดเกม นับเป็นแพ้ 0-3</li>
              <li>แมตช์ไม่จัดอันดับไม่นับแรงค์และไม่นับชนะสะสม</li>
            </ul>
            <div className={styles.ladder}>
              {[...config.tiers].reverse().map((tier) => {
                const index = config.tiers.indexOf(tier);
                const current = state?.tier === index;
                return (
                  <div key={tier.id} className={`${styles.tier} ${current ? styles.tierOn : ''}`}>
                    <span className={styles.tierArt}>
                      <ManagerTrophy image={tier.image} name={tier.name} />
                    </span>
                    <span className={styles.tierName}>{tier.name}</span>
                    <span className={styles.tierStars}>
                      {Array.from({ length: tier.stars }, (_, star) => (
                        <Star key={star} size={18} strokeWidth={0} fill="currentColor" />
                      ))}
                    </span>
                    {tier.floor && (
                      <span className={styles.floor} title="แพ้แล้วไม่ตกแรงค์">
                        <Shield size={18} strokeWidth={2.6} />
                      </span>
                    )}
                    {current && <span className={styles.you}>คุณอยู่ที่นี่</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'rewards' && (
          <div className={styles.body}>
            <p className={styles.lead}>
              ชนะแมตช์จัดอันดับสะสมในสัปดาห์นี้ <b>{state?.weekWins ?? 0}</b> นัด · รีเซ็ตทุกวันจันทร์{' '}
              {String(config.resetHour).padStart(2, '0')}:00
            </p>
            <div className={styles.milestones}>
              {config.milestones.map((milestone) => {
                const done = state?.claimed.includes(milestone.id) ?? false;
                return (
                  <div key={milestone.id} className={`${styles.milestone} ${done ? styles.done : ''}`}>
                    <span className={styles.wins}>ชนะ {milestone.wins} นัด</span>
                    <span className={styles.lines}>
                      {milestone.rewards.map((line, index) => (
                        <span key={index} className={styles.line}>
                          <img src={currencies[line.kind].icon} alt="" />
                          x{formatCurrency(line.amount)}
                        </span>
                      ))}
                    </span>
                    <span className={styles.status}>
                      {done ? (
                        <>
                          <Check size={20} strokeWidth={3} /> ได้รับแล้ว
                        </>
                      ) : (
                        `${Math.min(state?.weekWins ?? 0, milestone.wins)}/${milestone.wins}`
                      )}
                    </span>
                  </div>
                );
              })}
              {config.milestones.length === 0 && <p className={styles.empty}>สัปดาห์นี้ยังไม่มีรางวัล</p>}
            </div>
          </div>
        )}

        {mode === 'history' && (
          <div className={styles.body}>
            <div className={styles.history}>
              {(state?.history ?? []).map((match) => (
                <div key={match.id} className={`${styles.row} ${styles[match.outcome]}`}>
                  <span className={styles.result}>{OUTCOME[match.outcome]}</span>
                  <span className={styles.score}>
                    {match.score[0]} - {match.score[1]}
                  </span>
                  <img className={styles.face} src={avatarSrc(match.opponent.avatarId)} alt="" />
                  <span className={styles.rival}>
                    {match.opponent.name}
                    <small>
                      OVR {match.opponent.rating}
                      {match.opponent.bot ? ' · บอท' : ''}
                    </small>
                  </span>
                  <span className={styles.kind}>{match.ranked ? 'จัดอันดับ' : 'ไม่จัดอันดับ'}</span>
                  <span className={styles.time}>{when(match.at)}</span>
                </div>
              ))}
              {(state?.history.length ?? 0) === 0 && <p className={styles.empty}>ยังไม่เคยลงแข่ง</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
