import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { ROUTE_IDS, ROUTE_LABEL } from '@/features/navigation/routes';
import {
  BODY_MAX,
  MAX_MAILS,
  SCREEN_TITLE_MAX,
  SENDER_MAX,
  TITLE_MAX,
  TO_MAX,
  inboxId,
} from '@/features/notifications/constants';
import { isLive } from '@/features/notifications/inbox';
import { useInbox } from '@/features/notifications/InboxContext';
import type { InboxConfig, InboxMail } from '@/features/notifications/types';
import AdminRewardList from './AdminRewardList';
import styles from './AdminInbox.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

/** '' or 'YYYY-MM-DDTHH:mm' for a datetime-local input. */
function forInput(iso: string): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const local = new Date(time - new Date(time).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromInput(value: string): string {
  if (!value) return '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

/**
 * กล่องจดหมาย settings: the mails, who each one is for, what it carries, and how
 * long it stays.
 *
 * What a player has opened or collected is on their account, not here — this tab
 * can say a mail exists, never how many people have taken it.
 */
export default function AdminInbox() {
  const { config, replace, reset } = useInbox();
  const { listAccounts } = useAuth();
  const [status, setStatus] = useState<Status>(null);
  const [usernames, setUsernames] = useState<string[]>([]);
  // Several edits can land before a re-render, so patches build on the last one saved.
  const latest = useRef(config);
  latest.current = config;

  // For the recipient picker only. A name typed by hand that is not on the list is
  // still saved: on the cloud the list is whoever this admin can see.
  useEffect(() => {
    let alive = true;
    void listAccounts().then((accounts) => {
      if (alive) setUsernames(accounts.map((account) => account.username).sort());
    });
    return () => {
      alive = false;
    };
  }, [listAccounts]);

  function commit(next: InboxConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<InboxConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchMail(id: string, changes: Partial<InboxMail>) {
    patch({
      mails: latest.current.mails.map((mail) => (mail.id === id ? { ...mail, ...changes } : mail)),
    });
  }

  function addMail() {
    const mail: InboxMail = {
      id: inboxId(),
      enabled: true,
      to: '',
      title: '',
      body: '',
      sender: 'ทีมงาน FC ALL-STAR',
      rewards: [],
      sentAt: new Date().toISOString(),
      expiresAt: '',
      route: null,
    };
    // Newest on top, the same order the player sees.
    patch({ mails: [mail, ...latest.current.mails] }, 'เพิ่มจดหมายแล้ว');
  }

  const now = new Date();
  const live = config.mails.filter((mail) => isLive(mail, now)).length;

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        กล่องจดหมาย (ไอคอนซองจดหมายมุมขวาบน) · ส่งถึงทุกคนหรือระบุไอดี ·
        แนบของได้ทุกอย่างที่เกมมี: สกุลเงิน การ์ดนักเตะ หรือไอเท็ม · ผู้เล่นกดรับเอง
        และลบได้เฉพาะจดหมายที่รับของแล้ว
      </p>
      <p className={styles.legend}>
        จดหมายถึงทุกคนจะไปถึงไอดีที่สมัครหลังส่งด้วย ตราบใดที่ยังไม่หมดอายุ ·
        ปิดจดหมายแล้วหายจากทุกคนทันที แต่ของที่รับไปแล้วไม่ถูกดึงคืน
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      <div className={styles.columns}>
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ตั้งค่าทั่วไป</h3>
          <button
            type="button"
            className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
            onClick={() => patch({ enabled: !config.enabled })}
          >
            {config.enabled ? 'เปิดกล่องจดหมายอยู่' : 'ปิดกล่องจดหมายอยู่'}
          </button>
          <p className={styles.legend}>ปิดแล้วหน้าจดหมายจะว่าง และป้ายแดงบนไอคอนหายไป</p>

          <label className={styles.field}>
            <span className={styles.label}>ชื่อหน้าจอ</span>
            <input
              className={styles.input}
              maxLength={SCREEN_TITLE_MAX}
              value={config.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>

          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (window.confirm('ลบจดหมายทั้งหมดและรีเซ็ตกลับเป็นค่าเริ่มต้น?')) {
                const result = reset();
                setStatus(
                  result.ok
                    ? { tone: 'ok', text: 'รีเซ็ตแล้ว' }
                    : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' },
                );
              }
            }}
          >
            รีเซ็ตทั้งหมด
          </button>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            จดหมายทั้งหมด ({config.mails.length} ฉบับ · กำลังแสดง {live})
          </h3>

          <button
            type="button"
            className={styles.ghost}
            disabled={config.mails.length >= MAX_MAILS}
            onClick={addMail}
          >
            + เขียนจดหมายใหม่
          </button>

          {config.mails.length === 0 && (
            <p className={styles.legend}>ยังไม่มีจดหมาย — กด &quot;เขียนจดหมายใหม่&quot;</p>
          )}

          <datalist id="admin-inbox-usernames">
            {usernames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          {config.mails.map((mail) => (
            <div key={mail.id} className={`${styles.mail} ${mail.enabled ? '' : styles.mailOff}`}>
              <div className={styles.mailTop}>
                <label className={styles.field}>
                  <span className={styles.label}>หัวข้อ</span>
                  <input
                    className={styles.input}
                    maxLength={TITLE_MAX}
                    value={mail.title}
                    onChange={(event) => patchMail(mail.id, { title: event.target.value })}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>ผู้ส่ง</span>
                  <input
                    className={styles.input}
                    maxLength={SENDER_MAX}
                    value={mail.sender}
                    onChange={(event) => patchMail(mail.id, { sender: event.target.value })}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>ถึงไอดี (เว้นว่าง = ทุกคน)</span>
                  <input
                    className={styles.input}
                    list="admin-inbox-usernames"
                    maxLength={TO_MAX}
                    placeholder="ทุกคน"
                    value={mail.to}
                    onChange={(event) => patchMail(mail.id, { to: event.target.value.trim() })}
                  />
                </label>

                <div className={styles.mailSide}>
                  <button
                    type="button"
                    className={`${styles.toggle} ${mail.enabled ? styles.toggleOn : ''}`}
                    onClick={() => patchMail(mail.id, { enabled: !mail.enabled })}
                  >
                    {mail.enabled ? 'แสดง' : 'ซ่อน'}
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => {
                      if (window.confirm(`ลบจดหมาย "${mail.title || '(ไม่มีหัวข้อ)'}"?`)) {
                        patch(
                          { mails: latest.current.mails.filter((entry) => entry.id !== mail.id) },
                          'ลบจดหมายแล้ว',
                        );
                      }
                    }}
                  >
                    ลบ
                  </button>
                </div>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>เนื้อหา</span>
                <textarea
                  className={styles.area}
                  maxLength={BODY_MAX}
                  rows={4}
                  value={mail.body}
                  onChange={(event) => patchMail(mail.id, { body: event.target.value })}
                />
              </label>

              <div className={styles.window}>
                <label className={styles.field}>
                  <span className={styles.label}>ส่งเมื่อ (ตั้งล่วงหน้าได้)</span>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={forInput(mail.sentAt)}
                    onChange={(event) =>
                      patchMail(mail.id, {
                        sentAt: fromInput(event.target.value) || new Date().toISOString(),
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>หมดอายุ (เว้นว่าง = ไม่หมด)</span>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={forInput(mail.expiresAt)}
                    onChange={(event) => patchMail(mail.id, { expiresAt: fromInput(event.target.value) })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ปุ่มไปที่หน้า</span>
                  <select
                    className={styles.input}
                    value={mail.route ?? ''}
                    onChange={(event) =>
                      patchMail(mail.id, {
                        route: event.target.value === '' ? null : (event.target.value as InboxMail['route']),
                      })
                    }
                  >
                    <option value="">ไม่มีปุ่ม</option>
                    {ROUTE_IDS.filter((route) => route !== 'inbox' && route !== 'home').map((route) => (
                      <option key={route} value={route}>
                        {ROUTE_LABEL[route]}
                      </option>
                    ))}
                  </select>
                </label>
                <span className={styles.mine}>
                  {isLive(mail, now) ? 'กำลังแสดง' : mail.enabled ? 'นอกช่วงเวลา' : 'ซ่อนอยู่'}
                </span>
              </div>

              <span className={styles.label}>ของแนบ (เว้นว่าง = จดหมายแจ้งข่าวเฉย ๆ)</span>
              <AdminRewardList
                rewards={mail.rewards}
                onChange={(rewards) => patchMail(mail.id, { rewards })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
