import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { EnginePlayer, MatchPlayer } from '@/features/manager/matchEngine';
import styles from './MatchSubsDialog.module.css';

export interface MatchSubsDialogProps {
  onPitch: readonly EnginePlayer[];
  bench: readonly MatchPlayer[];
  subsLeft: number;
  /** 0..1 energy of a player on the pitch. */
  energyOf(player: EnginePlayer): number;
  onSwap(outId: string, inId: string): void;
  onClose(): void;
}

function face(player: MatchPlayer) {
  return player.portrait ? <img src={player.portrait} alt="" /> : <b>{player.name.slice(0, 1)}</b>;
}

/**
 * Substitutions, with the match paused: pick who comes off, pick who goes on. The
 * replacement takes the same spot on the pitch. Each player on the pitch shows how
 * much energy they have left — a tired player is slower.
 */
export default function MatchSubsDialog({
  onPitch,
  bench,
  subsLeft,
  energyOf,
  onSwap,
  onClose,
}: MatchSubsDialogProps) {
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);

  const confirm = () => {
    if (!outId || !inId) return;
    onSwap(outId, inId);
    setOutId(null);
    setInId(null);
    if (subsLeft <= 1) onClose();
  };

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="เปลี่ยนตัว">
      <div className={styles.panel}>
        <header className={styles.head}>
          <h2>เปลี่ยนตัว</h2>
          <span className={styles.left}>เหลือ {subsLeft} ครั้ง · เกมหยุดระหว่างเลือก</span>
          <button type="button" className={styles.close} data-sound="back" onClick={onClose} aria-label="ปิด">
            <X size={24} strokeWidth={2.6} />
          </button>
        </header>

        <div className={styles.columns}>
          <div className={styles.column}>
            <span className={styles.columnTitle}>ออก (ในสนาม) · แถบ = พลังงาน</span>
            {onPitch.map((player) => (
              <button
                key={player.id}
                type="button"
                className={`${styles.row} ${outId === player.id ? styles.rowOut : ''}`}
                onClick={() => setOutId(player.id)}
              >
                <span className={styles.face}>{face(player)}</span>
                <span className={styles.name}>
                  {player.name}
                  <small>
                    {player.position} · OVR {player.rating}
                  </small>
                </span>
                <span className={styles.meters} title="พลังงาน">
                  <i
                    className={energyOf(player) < 0.45 ? styles.low : ''}
                    style={{ width: `${Math.round(energyOf(player) * 100)}%` }}
                  />
                </span>
              </button>
            ))}
          </div>

          <ArrowRight className={styles.arrow} size={40} strokeWidth={2.6} />

          <div className={styles.column}>
            <span className={styles.columnTitle}>เข้า (ตัวสำรอง)</span>
            {bench.map((player) => (
              <button
                key={player.id}
                type="button"
                className={`${styles.row} ${inId === player.id ? styles.rowIn : ''}`}
                onClick={() => setInId(player.id)}
              >
                <span className={styles.face}>{face(player)}</span>
                <span className={styles.name}>
                  {player.name}
                  <small>
                    {player.position} · OVR {player.rating}
                  </small>
                </span>
              </button>
            ))}
            {bench.length === 0 && <p className={styles.empty}>ไม่มีตัวสำรองเหลือ</p>}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            กลับไปเล่นต่อ
          </button>
          <button type="button" className={styles.primary} disabled={!outId || !inId || subsLeft <= 0} onClick={confirm}>
            ยืนยันเปลี่ยนตัว
          </button>
        </div>
      </div>
    </div>
  );
}
