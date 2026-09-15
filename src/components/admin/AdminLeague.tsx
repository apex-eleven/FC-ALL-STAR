import { useState } from 'react';
import { currencies } from '@/data/mock/currencies';
import { useLeague } from '@/features/league/LeagueContext';
import { MAX_TEAMS, MIN_TEAMS } from '@/features/league/constants';
import type { LeagueConfig, RankReward } from '@/features/league/types';
import styles from './AdminLeague.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

export default function AdminLeague() {
  const { config, state, rank, rating, updateConfig, resetConfig, setStars, restartSeason } =
    useLeague();
  const [status, setStatus] = useState<Status>(null);
  const [starDraft, setStarDraft] = useState('');

  function apply(changes: Partial<LeagueConfig>, message = 'บันทึกแล้ว') {
    const result = updateConfig(changes);
    setStatus(
      result.ok
        ? { tone: 'ok', text: message }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function number(raw: string, fallback: number): number {
    const value = Number.parseInt(raw.replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(value) ? value : fallback;
  }

  function patchReward(index: number, changes: Partial<RankReward>) {
    const rewards = config.rewards.map((band, i) => (i === index ? { ...band, ...changes } : band));
    apply({ rewards });
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ลีกประจำวัน · จับคู่แข่งแบบพบกันหมดจริง (round-robin) ทุกทีมเจอทุกทีมครบ
        ไม่ใช่การจำลองแบบสุ่ม · สรุปคะแนนวันละครั้ง · ค่าที่ตั้งที่นี่มีผลกับทุกไอดีในเครื่องนี้
      </p>

      <div className={styles.columns}>
        {/* ---- match rules ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ผู้เล่นและรอบการแข่ง</h3>

          <div className={styles.line}>
            <span className={styles.lineLabel}>เปิดใช้งาน</span>
            <button
              type="button"
              data-sound="toggle"
              aria-pressed={config.enabled}
              className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
              onClick={() => apply({ enabled: !config.enabled }, config.enabled ? 'ปิดลีกแล้ว' : 'เปิดลีกแล้ว')}
            >
              {config.enabled ? 'เปิด' : 'ปิด'}
            </button>
          </div>

          <div className={styles.line}>
            <span className={styles.lineLabel}>จำนวนทีมในลีก</span>
            <input
              className={styles.num}
              value={config.teamCount}
              inputMode="numeric"
              onChange={(event) => apply({ teamCount: number(event.target.value, config.teamCount) })}
            />
            <span className={styles.unit}>
              ทีม (รวมผู้เล่น) · {MIN_TEAMS}–{MAX_TEAMS}
            </span>
          </div>

          <div className={styles.line}>
            <span className={styles.lineLabel}>เจอคู่แข่งทุก</span>
            <input
              className={styles.num}
              value={config.matchIntervalMinutes}
              inputMode="numeric"
              onChange={(event) =>
                apply({ matchIntervalMinutes: number(event.target.value, config.matchIntervalMinutes) })
              }
            />
            <span className={styles.unit}>นาที · 30 = ทุกครึ่งชั่วโมง, 60 = ทุกชั่วโมง</span>
          </div>

          <p className={styles.legend}>
            รอบพบกันหมดครบ 1 รอบใช้ {config.teamCount % 2 === 0 ? config.teamCount - 1 : config.teamCount} ช่วงเวลา
            (ทีมคู่ = จำนวนทีม−1 รอบ, ทีมคี่ = จำนวนทีมรอบ เพราะมีทีมพักหนึ่งทีมต่อรอบ) แล้ววนรอบใหม่ต่อในวันเดียวกัน
          </p>

          <div className={styles.line}>
            <span className={styles.lineLabel}>สรุปคะแนนเวลา</span>
            <input
              className={styles.num}
              value={config.resetHour}
              inputMode="numeric"
              onChange={(event) => apply({ resetHour: number(event.target.value, config.resetHour) })}
            />
            <span className={styles.unit}>นาฬิกา (0–23) · ใช้เวลาเครื่องผู้เล่น</span>
          </div>

          <div className={styles.line}>
            <span className={styles.lineLabel}>OVR คู่แข่ง</span>
            <input
              className={styles.num}
              value={config.rivalMinRating}
              inputMode="numeric"
              onChange={(event) =>
                apply({ rivalMinRating: number(event.target.value, config.rivalMinRating) })
              }
            />
            <input
              className={styles.num}
              value={config.rivalMaxRating}
              inputMode="numeric"
              onChange={(event) =>
                apply({ rivalMaxRating: number(event.target.value, config.rivalMaxRating) })
              }
            />
            <span className={styles.unit}>ต่ำสุด – สูงสุด</span>
          </div>

          <p className={styles.legend}>
            คู่แข่งถูกสร้างจากไอดีผู้เล่นกับวันที่ ค่าเดิมให้ลีกเดิมเสมอ — รีเฟรชกี่ครั้ง
            ก็ได้ตารางเดิม ไม่ใช่สุ่มใหม่
          </p>
        </div>

        {/* ---- stars ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ดาว</h3>

          {(
            [
              { key: 'winStars', label: 'ชนะได้' },
              { key: 'drawStars', label: 'เสมอได้' },
              { key: 'lossStars', label: 'แพ้ได้' },
            ] as const
          ).map((field) => (
            <div className={styles.line} key={field.key}>
              <span className={styles.lineLabel}>{field.label}</span>
              <input
                className={styles.num}
                value={config[field.key]}
                inputMode="numeric"
                onChange={(event) =>
                  apply({ [field.key]: number(event.target.value, config[field.key]) })
                }
              />
              <span className={styles.unit}>ดาว · ใส่ค่าติดลบได้</span>
            </div>
          ))}

          <div className={styles.line}>
            <span className={styles.lineLabel}>ดาวต่ำสุด</span>
            <input
              className={styles.num}
              value={config.starFloor}
              inputMode="numeric"
              onChange={(event) => apply({ starFloor: number(event.target.value, config.starFloor) })}
            />
            <span className={styles.unit}>ดาวจะไม่ลดต่ำกว่านี้</span>
          </div>

          <h3 className={styles.blockTitle}>ไอดีที่กำลังล็อกอิน</h3>
          <p className={styles.legend}>
            ตอนนี้อันดับ {rank} · {state.stars} ดาว · แข่งไป {state.played} นัด · ทีม OVR {rating}
          </p>

          <div className={styles.line}>
            <span className={styles.lineLabel}>ตั้งดาวเป็น</span>
            <input
              className={styles.num}
              value={starDraft}
              placeholder={String(state.stars)}
              inputMode="numeric"
              onChange={(event) => setStarDraft(event.target.value.replace(/[^\d-]/g, ''))}
            />
            <button
              type="button"
              className={styles.ghost}
              disabled={starDraft === ''}
              onClick={() => {
                setStars(number(starDraft, state.stars));
                setStarDraft('');
                setStatus({ tone: 'ok', text: 'ตั้งดาวแล้ว' });
              }}
            >
              ตั้งค่า
            </button>
            <button
              type="button"
              className={styles.ghost}
              data-sound="back"
              onClick={() => {
                restartSeason();
                setStatus({ tone: 'ok', text: 'เริ่มวันใหม่ให้ไอดีนี้แล้ว' });
              }}
            >
              เริ่มวันใหม่
            </button>
          </div>
          <p className={styles.legend}>
            "เริ่มวันใหม่" ล้างตารางกับดาวของไอดีนี้แล้วสร้างคู่แข่งใหม่ทันที
            ไม่จ่ายรางวัลของวันที่ถูกล้าง
          </p>
        </div>

        {/* ---- rewards ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>รางวัลตามอันดับ</h3>

          <div className={styles.rewardHead}>
            <span>ตั้งแต่อันดับ</span>
            <span>{currencies.ticket.label}</span>
            <span>{currencies.gem.label}</span>
            <span>{currencies.fcpoint.label}</span>
            <span />
          </div>

          {config.rewards.map((band, index) => (
            <div className={styles.rewardRow} key={`${band.fromRank}-${index}`}>
              <input
                className={styles.num}
                value={band.fromRank}
                inputMode="numeric"
                onChange={(event) =>
                  patchReward(index, { fromRank: number(event.target.value, band.fromRank) })
                }
              />
              <input
                className={styles.num}
                value={band.ticket}
                inputMode="numeric"
                onChange={(event) => patchReward(index, { ticket: number(event.target.value, band.ticket) })}
              />
              <input
                className={styles.num}
                value={band.gem}
                inputMode="numeric"
                onChange={(event) => patchReward(index, { gem: number(event.target.value, band.gem) })}
              />
              <input
                className={styles.num}
                value={band.fcpoint}
                inputMode="numeric"
                onChange={(event) =>
                  patchReward(index, { fcpoint: number(event.target.value, band.fcpoint) })
                }
              />
              <button
                type="button"
                className={styles.danger}
                data-sound="back"
                disabled={config.rewards.length <= 1}
                onClick={() => apply({ rewards: config.rewards.filter((_, i) => i !== index) })}
              >
                ลบ
              </button>
            </div>
          ))}

          <div className={styles.row}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() =>
                apply({
                  rewards: [
                    ...config.rewards,
                    {
                      fromRank: Math.min(
                        MAX_TEAMS,
                        (config.rewards.at(-1)?.fromRank ?? 1) + 1,
                      ),
                      ticket: 0,
                      gem: 0,
                      fcpoint: 0,
                    },
                  ],
                })
              }
            >
              เพิ่มช่วงอันดับ
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                const result = resetConfig();
                setStatus(
                  result.ok
                    ? { tone: 'ok', text: 'คืนค่าเริ่มต้นแล้ว' }
                    : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' },
                );
              }}
            >
              คืนค่าเริ่มต้นทั้งหมด
            </button>
          </div>

          <p className={styles.legend}>
            แต่ละแถวคือ "ตั้งแต่อันดับนี้ลงไป" จนกว่าจะถึงแถวถัดไป — อันดับ 4 ที่ตั้งไว้
            จึงครอบอันดับ 4 จนถึงท้ายตารางโดยไม่ต้องกรอกทีละอันดับ
            <br />
            ใส่ 0 = ไม่ได้สกุลนั้น · จ่ายอัตโนมัติตอนสรุปคะแนน เข้ากระเป๋าพร้อมบันทึกในประวัติ
            <br />
            ไอดีที่ไม่ได้แข่งสักนัดในวันนั้นจะไม่ได้รางวัล
          </p>
        </div>
      </div>

      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}
    </div>
  );
}
