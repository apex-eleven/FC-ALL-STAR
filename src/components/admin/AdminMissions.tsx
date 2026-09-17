import { useRef, useState } from 'react';
import {
  MAX_CHESTS,
  MAX_MISSIONS,
  METRICS,
  PERIOD_LABEL,
  TITLE_MAX,
  metricInfo,
  missionId,
} from '@/features/missions/constants';
import { useMissions } from '@/features/missions/MissionContext';
import { missionTitle } from '@/features/missions/missions';
import {
  MISSION_PERIODS,
  type MissionChest,
  type MissionConfig,
  type MissionDef,
  type MissionMetric,
  type MissionPeriod,
} from '@/features/missions/types';
import AdminRewardList from './AdminRewardList';
import styles from './AdminMissions.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

function chestKey(period: MissionPeriod): 'dailyChests' | 'weeklyChests' {
  return period === 'daily' ? 'dailyChests' : 'weeklyChests';
}

/**
 * ภารกิจ settings: on/off and reset hour, the missions of each period with their
 * targets, points and rewards, and the chests on each period's point track.
 */
export default function AdminMissions() {
  const { config, replace, reset } = useMissions();
  const latest = useRef(config);
  latest.current = config;
  const [status, setStatus] = useState<Status>(null);
  const [period, setPeriod] = useState<MissionPeriod>('daily');

  function commit(next: MissionConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<MissionConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchMission(id: string, changes: Partial<MissionDef>) {
    patch({
      missions: latest.current.missions.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
    });
  }

  /** Moves a mission past its neighbour in the same period. */
  function moveMission(id: string, delta: number) {
    const list = [...latest.current.missions];
    const index = list.findIndex((entry) => entry.id === id);
    const current = list[index];
    if (!current) return;
    let target = index + delta;
    while (target >= 0 && target < list.length && list[target]!.period !== current.period) target += delta;
    if (target < 0 || target >= list.length) return;
    list[index] = list[target]!;
    list[target] = current;
    patch({ missions: list });
  }

  function addMission() {
    const mission: MissionDef = {
      id: missionId('ms'),
      enabled: true,
      period,
      metric: 'manager-play',
      target: period === 'daily' ? 1 : 5,
      points: 10,
      rewards: [{ kind: 'exchange', amount: 500 }],
      title: '',
    };
    patch({ missions: [...latest.current.missions, mission] }, 'เพิ่มภารกิจแล้ว');
  }

  function patchChest(id: string, changes: Partial<MissionChest>) {
    const key = chestKey(period);
    patch({ [key]: latest.current[key].map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) });
  }

  function addChest() {
    const key = chestKey(period);
    const top = latest.current[key].reduce((max, entry) => Math.max(max, entry.points), 0);
    const chest: MissionChest = {
      id: missionId(period === 'daily' ? 'dc' : 'wc'),
      points: top + 20,
      rewards: [{ kind: 'exchange', amount: 1_000 }],
    };
    patch({ [key]: [...latest.current[key], chest] }, 'เพิ่มกล่องแล้ว');
  }

  const missions = config.missions.filter((entry) => entry.period === period);
  const chests = config[chestKey(period)];
  const pointsTotal = missions
    .filter((entry) => entry.enabled)
    .reduce((sum, entry) => sum + entry.points, 0);
  const topChest = chests.reduce((max, entry) => Math.max(max, entry.points), 0);

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ภารกิจ (ปุ่ม &quot;ภารกิจ&quot; แถบล่าง) · เกมนับสิ่งที่ผู้เล่นทำในแต่ละวัน/สัปดาห์ ภารกิจคือเป้าหมายของการนับนั้น ·
        ทำครบแล้วผู้เล่นกดรับรางวัลเองและได้แต้ม · แต้มสะสมครบตามกล่องจึงเปิดกล่องได้ · รายวันรีเซ็ตทุกวันตามเวลาที่ตั้ง
        รายสัปดาห์รีเซ็ตทุกวันจันทร์เวลาเดียวกัน
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      <div className={styles.line}>
        <button
          type="button"
          className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
          onClick={() => patch({ enabled: !config.enabled })}
        >
          {config.enabled ? 'เปิดภารกิจอยู่' : 'ปิดภารกิจอยู่'}
        </button>
        <label className={styles.inline}>
          รีเซ็ตเวลา
          <input
            className={styles.num}
            inputMode="numeric"
            defaultValue={config.resetHour}
            key={`reset-${config.resetHour}`}
            onBlur={(event) => patch({ resetHour: Math.min(23, whole(event.target.value)) })}
          />
          น.
        </label>
        <button
          type="button"
          className={styles.danger}
          onClick={() => {
            if (window.confirm('รีเซ็ตภารกิจทั้งหมดกลับเป็นค่าเริ่มต้น?')) {
              const result = reset();
              setStatus(result.ok ? { tone: 'ok', text: 'รีเซ็ตแล้ว' } : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' });
            }
          }}
        >
          รีเซ็ตทั้งหมด
        </button>
      </div>

      <div className={styles.line} role="tablist">
        {MISSION_PERIODS.map((entry) => (
          <button
            type="button"
            role="tab"
            key={entry}
            aria-selected={entry === period}
            className={`${styles.toggle} ${entry === period ? styles.toggleOn : ''}`}
            onClick={() => setPeriod(entry)}
          >
            ภารกิจ{PERIOD_LABEL[entry]}
          </button>
        ))}
      </div>

      <div className={styles.columns}>
        {/* ---- missions ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            ภารกิจ{PERIOD_LABEL[period]} ({missions.length}) · แต้มรวมที่เปิดอยู่ {pointsTotal}
          </h3>
          {missions.length === 0 && <p className={styles.legend}>ยังไม่มีภารกิจ</p>}
          {missions.map((mission) => (
            <div key={mission.id} className={`${styles.mission} ${mission.enabled ? '' : styles.off}`}>
              <div className={styles.line}>
                <button
                  type="button"
                  className={`${styles.toggle} ${mission.enabled ? styles.toggleOn : ''}`}
                  onClick={() => patchMission(mission.id, { enabled: !mission.enabled })}
                >
                  {mission.enabled ? 'เปิด' : 'ปิด'}
                </button>
                <span className={styles.preview}>{missionTitle(mission)}</span>
                <button type="button" className={styles.icon} onClick={() => moveMission(mission.id, -1)} aria-label="เลื่อนขึ้น">
                  ▲
                </button>
                <button type="button" className={styles.icon} onClick={() => moveMission(mission.id, 1)} aria-label="เลื่อนลง">
                  ▼
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() =>
                    patch({ missions: latest.current.missions.filter((entry) => entry.id !== mission.id) }, 'ลบแล้ว')
                  }
                >
                  ลบ
                </button>
              </div>

              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.label}>นับจาก</span>
                  <select
                    className={styles.input}
                    value={mission.metric}
                    onChange={(event) => patchMission(mission.id, { metric: event.target.value as MissionMetric })}
                  >
                    {METRICS.map((entry) => (
                      <option key={entry.metric} value={entry.metric}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>เป้าหมาย</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    defaultValue={mission.target}
                    key={`t-${mission.id}-${mission.target}`}
                    onBlur={(event) => patchMission(mission.id, { target: Math.max(1, whole(event.target.value)) })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>แต้ม</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    defaultValue={mission.points}
                    key={`p-${mission.id}-${mission.points}`}
                    onBlur={(event) => patchMission(mission.id, { points: whole(event.target.value) })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ช่วงเวลา</span>
                  <select
                    className={styles.input}
                    value={mission.period}
                    onChange={(event) => patchMission(mission.id, { period: event.target.value as MissionPeriod })}
                  >
                    {MISSION_PERIODS.map((entry) => (
                      <option key={entry} value={entry}>
                        {PERIOD_LABEL[entry]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>ชื่อภารกิจ (เว้นว่าง = ใช้ชื่ออัตโนมัติ)</span>
                <input
                  className={styles.input}
                  maxLength={TITLE_MAX}
                  placeholder={metricInfo(mission.metric).template.replace('{n}', String(mission.target))}
                  value={mission.title}
                  onChange={(event) => patchMission(mission.id, { title: event.target.value })}
                />
              </label>

              <div className={styles.field}>
                <span className={styles.label}>รางวัล</span>
                <AdminRewardList
                  rewards={mission.rewards}
                  onChange={(rewards) => patchMission(mission.id, { rewards })}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className={styles.ghost}
            disabled={config.missions.length >= MAX_MISSIONS}
            onClick={addMission}
          >
            + เพิ่มภารกิจ{PERIOD_LABEL[period]}
          </button>
        </div>

        {/* ---- chests ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>กล่องแต้มสะสม{PERIOD_LABEL[period]}</h3>
          {topChest > pointsTotal && (
            <p className={`${styles.legend} ${styles.warnText}`}>
              กล่องสูงสุดต้องใช้ {topChest} แต้ม แต่ภารกิจ{PERIOD_LABEL[period]}ที่เปิดอยู่ให้แต้มรวมแค่ {pointsTotal}
            </p>
          )}
          {chests.map((chest) => (
            <div key={chest.id} className={styles.chest}>
              <div className={styles.line}>
                <label className={styles.inline}>
                  ครบ
                  <input
                    className={styles.num}
                    inputMode="numeric"
                    defaultValue={chest.points}
                    key={`c-${chest.id}-${chest.points}`}
                    // Committed on blur: the list re-sorts by points.
                    onBlur={(event) => patchChest(chest.id, { points: Math.max(1, whole(event.target.value)) })}
                  />
                  แต้ม
                </label>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    const key = chestKey(period);
                    patch({ [key]: latest.current[key].filter((entry) => entry.id !== chest.id) }, 'ลบแล้ว');
                  }}
                >
                  ลบ
                </button>
              </div>
              <AdminRewardList rewards={chest.rewards} onChange={(rewards) => patchChest(chest.id, { rewards })} />
            </div>
          ))}
          <button type="button" className={styles.ghost} disabled={chests.length >= MAX_CHESTS} onClick={addChest}>
            + เพิ่มกล่อง
          </button>
        </div>
      </div>
    </div>
  );
}
