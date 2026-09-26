import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account } from '@/features/auth/types';
import { useAuth } from '@/features/auth/AuthContext';
import type { OwnedPlayer } from '@/features/club/types';
import { listOneOfOne, removeOneOfOne, setOneOfOne } from '@/features/rankup/claimOneOfOne';
import {
  ONE_OF_ONE_LEVELS,
  oneOfOneKey,
  oneOfOneRecordFor,
  withOneOfOne,
  withoutOneOfOne,
  type OneOfOneRecord,
} from '@/features/rankup/oneOfOne';
import { goldNameProps } from '@/features/rankup/constants';
import styles from './AdminOneOfOne.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

/** A grant that would take the title off another copy, waiting for the admin to say yes. */
interface PendingTransfer {
  card: OwnedPlayer;
  level: number;
  holder: OneOfOneRecord;
}

function formatAt(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * ป้าย 1 OF 1 — the admin's hand on the register.
 *
 * The game only ever hands a title to the first copy to reach +9 / +10. This tab can
 * give one to any copy, move one from its holder to another copy, or withdraw one so
 * the next copy to get there wins it. Every change touches both halves — the register
 * (who holds the title) and the card in the holder's save (the plate it shows) — so
 * the two never disagree about who has it.
 */
export default function AdminOneOfOne() {
  const { listAccounts, updateOther } = useAuth();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [register, setRegister] = useState<OneOfOneRecord[] | null>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [highOnly, setHighOnly] = useState(false);
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [list, titles] = await Promise.all([listAccounts(), listOneOfOne()]);
    setAccounts(list);
    setRegister(titles);
    setUsername((current) => current ?? list[0]?.username ?? null);
  }, [listAccounts]);

  useEffect(() => void refresh(), [refresh]);

  const target = accounts.find((account) => account.username === username) ?? null;
  const byKey = useMemo(() => new Map((register ?? []).map((record) => [record.key, record])), [register]);
  const byUid = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const cards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (target?.club.players ?? [])
      .filter((card) => !highOnly || (card.plus ?? 0) >= 9 || (card.oneOfOne?.length ?? 0) > 0)
      .filter((card) => !needle || card.name.toLowerCase().includes(needle) || (card.code ?? '').toLowerCase().includes(needle))
      .sort((a, b) => (b.oneOfOne?.length ?? 0) - (a.oneOfOne?.length ?? 0) || (b.plus ?? 0) - (a.plus ?? 0) || b.rating - a.rating);
  }, [target, query, highOnly]);

  const titles = useMemo(
    () => [...(register ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
    [register],
  );

  /** Where a register entry's card is now: still owned, gone, or on an account not listed. */
  function holderState(record: OneOfOneRecord): 'owned' | 'gone' | 'unknown' {
    const owner = byUid.get(record.uid);
    if (!owner) return 'unknown';
    return owner.club.players.some((card) => card.id === record.cardId) ? 'owned' : 'gone';
  }

  async function run(work: () => Promise<boolean>, success: string) {
    setBusy(true);
    const done = await work();
    await refresh();
    setBusy(false);
    setStatus(done ? { tone: 'ok', text: success } : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' });
  }

  /** Strips a title off the holder's card, found by uid (the register keeps a display name). */
  async function stripFromHolder(record: OneOfOneRecord): Promise<boolean> {
    const owner = byUid.get(record.uid);
    if (!owner) return true;
    if (!owner.club.players.some((card) => card.id === record.cardId && card.oneOfOne?.includes(record.level))) return true;
    return updateOther(owner.username, (account) => ({
      ...account,
      club: { ...account.club, players: withoutOneOfOne(account.club.players, record.cardId, record.level) },
    }));
  }

  function grant(card: OwnedPlayer, level: number, confirmed = false) {
    if (!target) return;
    const holder = byKey.get(oneOfOneKey(card, level)) ?? null;
    if (holder && holder.cardId !== card.id && !confirmed) {
      setPending({ card, level, holder });
      return;
    }
    setPending(null);
    const record = oneOfOneRecordFor(target, card, level, new Date().toISOString());

    void run(async () => {
      // Register first: if it refuses, nothing else has moved.
      if (!(await setOneOfOne(record))) return false;
      const given = await updateOther(target.username, (account) => ({
        ...account,
        club: { ...account.club, players: withOneOfOne(account.club.players, card.id, level) },
      }));
      if (!given) return false;
      return holder && holder.cardId !== card.id ? stripFromHolder(holder) : true;
    }, holder && holder.cardId !== card.id
      ? `โอนป้าย 1 OF 1 +${level} ของ ${card.name} จาก ${holder.username} ให้ ${target.username} แล้ว`
      : `มอบป้าย 1 OF 1 +${level} ให้ ${card.name} ของ ${target.username} แล้ว`);
  }

  /** Withdraws a title from a card row. Frees the register only if it points at this copy. */
  function revokeCard(card: OwnedPlayer, level: number) {
    if (!target) return;
    const holder = byKey.get(oneOfOneKey(card, level));
    void run(async () => {
      if (holder && holder.cardId === card.id && !(await removeOneOfOne(holder.key))) return false;
      return updateOther(target.username, (account) => ({
        ...account,
        club: { ...account.club, players: withoutOneOfOne(account.club.players, card.id, level) },
      }));
    }, `ถอนป้าย 1 OF 1 +${level} จาก ${card.name} แล้ว`);
  }

  /** Withdraws a title from the register list — also for a card that is no longer owned. */
  function revokeRecord(record: OneOfOneRecord) {
    void run(async () => {
      if (!(await removeOneOfOne(record.key))) return false;
      return stripFromHolder(record);
    }, `ถอนป้าย 1 OF 1 +${record.level} ของ ${record.name} แล้ว · ใบถัดไปที่ตีติดจะได้ป้ายนี้`);
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        มอบป้าย 1 OF 1 ให้การ์ดใบใดก็ได้ · ป้ายหนึ่งใบต่อการ์ดหนึ่งตัวต่อระดับ (+9 / +10) ·
        ถ้าป้ายมีเจ้าของอยู่แล้ว การมอบจะเป็นการโอนป้ายมาให้ใบนี้ · ถอนป้ายแล้วใบถัดไปที่ตีติดจะได้ป้ายแทน
      </p>

      <div className={styles.columns}>
        {/* ---- accounts ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ไอดี ({accounts.length})</h3>
          <div className={styles.list}>
            {accounts.map((account) => {
              const held = account.club.players.filter((card) => (card.oneOfOne?.length ?? 0) > 0).length;
              return (
                <button
                  key={account.id}
                  type="button"
                  className={`${styles.account} ${account.username === username ? styles.accountOn : ''}`}
                  onClick={() => {
                    setUsername(account.username);
                    setPending(null);
                  }}
                >
                  <span className={styles.accountName}>{account.username}</span>
                  <span className={styles.accountMeta}>
                    การ์ด {account.club.players.length}
                    {held > 0 && ` · มีป้าย ${held} ใบ`}
                  </span>
                </button>
              );
            })}
            {accounts.length === 0 && <p className={styles.legend}>ยังไม่มีไอดี</p>}
          </div>
        </div>

        {/* ---- the account's cards ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            การ์ดของ {target?.username ?? '—'} ({target?.club.players.length ?? 0})
          </h3>

          <div className={styles.filters}>
            <input
              className={styles.input}
              placeholder="ค้นหาชื่อหรือเลขการ์ด"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className={`${styles.chip} ${highOnly ? styles.chipOn : ''}`}
              onClick={() => setHighOnly((on) => !on)}
            >
              เฉพาะ +9 ขึ้นไป / มีป้าย
            </button>
          </div>

          {pending && (
            <div className={styles.confirm}>
              <span>
                ป้าย 1 OF 1 +{pending.level} ของ {pending.card.name} เป็นของ{' '}
                <b>{pending.holder.username || 'ไอดีอื่น'}</b> อยู่แล้ว — โอนมาให้ใบนี้ของ {target?.username}?
              </span>
              <button
                type="button"
                className={styles.gold}
                disabled={busy}
                onClick={() => grant(pending.card, pending.level, true)}
              >
                ยืนยันโอนป้าย
              </button>
              <button type="button" className={styles.ghost} onClick={() => setPending(null)}>
                ยกเลิก
              </button>
            </div>
          )}

          <div className={styles.list}>
            {cards.slice(0, 200).map((card) => (
              <div key={card.id} className={styles.row}>
                <img className={styles.rowArt} src={card.portrait} alt="" loading="lazy" />
                <span className={styles.rowMain}>
                  <span className={styles.rowName} {...goldNameProps(card.plus ?? 0)}>
                    {card.name}
                  </span>
                  <span className={styles.rowMeta}>
                    {card.code ? `#${card.code} · ` : ''}
                    {card.set} · {card.position} · {card.rating}
                    {(card.plus ?? 0) > 0 && ` · +${card.plus}`}
                  </span>
                </span>
                <span className={styles.levels}>
                  {ONE_OF_ONE_LEVELS.map((level) => {
                    const mine = card.oneOfOne?.includes(level) ?? false;
                    const holder = byKey.get(oneOfOneKey(card, level));
                    const elsewhere = !mine && holder && holder.cardId !== card.id;
                    return mine ? (
                      <button
                        key={level}
                        type="button"
                        className={styles.plate}
                        disabled={busy}
                        title={`ถอนป้าย 1 OF 1 +${level}`}
                        data-sound="back"
                        onClick={() => revokeCard(card, level)}
                      >
                        1 OF 1 +{level} ✕
                      </button>
                    ) : (
                      <button
                        key={level}
                        type="button"
                        className={styles.give}
                        disabled={busy || !target}
                        title={
                          elsewhere
                            ? `ป้ายนี้เป็นของ ${holder.username} — กดเพื่อโอน`
                            : `มอบป้าย 1 OF 1 +${level}`
                        }
                        onClick={() => grant(card, level)}
                      >
                        {elsewhere ? `โอน +${level}` : `มอบ +${level}`}
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
            {cards.length === 0 && <p className={styles.legend}>ไม่มีการ์ดที่ตรงกับที่ค้นหา</p>}
            {cards.length > 200 && <p className={styles.legend}>แสดง 200 ใบแรก · พิมพ์ค้นหาเพื่อแคบลง</p>}
          </div>
        </div>

        {/* ---- the register ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ป้ายที่มีเจ้าของแล้ว ({titles.length})</h3>
          {register === null && <p className={styles.legend}>อ่านทะเบียนป้ายไม่สำเร็จ</p>}
          <div className={styles.list}>
            {titles.map((record) => {
              const state = holderState(record);
              return (
                <div key={record.key} className={styles.row}>
                  <span className={styles.badge}>+{record.level}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{record.name || record.playerId}</span>
                    <span className={styles.rowMeta}>
                      {byUid.get(record.uid)?.username ?? record.username} · {formatAt(record.at)}
                      {state === 'gone' && ' · การ์ดใบนี้ไม่อยู่แล้ว'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.danger}
                    data-sound="back"
                    disabled={busy}
                    onClick={() => revokeRecord(record)}
                  >
                    ถอนป้าย
                  </button>
                </div>
              );
            })}
            {register !== null && titles.length === 0 && (
              <p className={styles.legend}>ยังไม่มีการ์ดใบไหนได้ป้าย 1 OF 1</p>
            )}
          </div>
        </div>
      </div>

      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>{status.text}</span>
      )}
    </div>
  );
}
