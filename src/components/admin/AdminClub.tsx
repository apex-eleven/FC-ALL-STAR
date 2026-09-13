import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account } from '@/features/auth/types';
import { useAuth } from '@/features/auth/AuthContext';
import { addPlayers } from '@/features/club/club';
import { CLUB_CAPACITY } from '@/features/club/constants';
import type { OwnedPlayer } from '@/features/club/types';
import { cardToPlayer } from '@/features/draft/pool';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { playerArtUrl } from '@/features/players/artManifest';
import { removeFromSquad } from '@/features/squad/squad';
import styles from './AdminClub.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function newOwnedId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `oc-${crypto.randomUUID()}`;
  return `oc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cards in a player's club — hand them out, take them away.
 *
 * The draft is the only other way a card reaches an account, and it costs currency
 * and obeys the odds. This is the back door: for testing a squad, fixing a bad pull,
 * or setting up a demo account without spending an hour on packs.
 */
export default function AdminClub() {
  const { listAccounts, updateOther } = useAuth();
  const { players: catalogue } = usePlayers();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [ownedQuery, setOwnedQuery] = useState('');
  const [cardQuery, setCardQuery] = useState('');
  const [tier, setTier] = useState<PlayerSet | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [copies, setCopies] = useState(1);

  const refresh = useCallback(async () => {
    const list = await listAccounts();
    setAccounts(list);
    setUsername((current) => current ?? list[0]?.username ?? null);
  }, [listAccounts]);

  useEffect(() => void refresh(), [refresh]);

  const target = accounts.find((account) => account.username === username) ?? null;

  const owned = useMemo(() => {
    const needle = ownedQuery.trim().toLowerCase();
    const list = target?.club.players ?? [];
    return needle ? list.filter((card) => card.name.toLowerCase().includes(needle)) : list;
  }, [target, ownedQuery]);

  const candidates = useMemo(() => {
    const needle = cardQuery.trim().toLowerCase();
    return catalogue
      .filter((card) => (tier === 'all' ? true : card.set === tier))
      .filter((card) => !needle || card.name.toLowerCase().includes(needle))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 60);
  }, [catalogue, cardQuery, tier]);

  /** Every write goes through updateOther, the same path the currency tools use. */
  async function apply(mutate: (account: Account) => Account, success: string) {
    if (!target) return;
    setBusy(true);
    const done = await updateOther(target.username, mutate);
    await refresh();
    setBusy(false);
    setStatus(done ? { tone: 'ok', text: success } : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' });
  }

  function grant(cardId: string) {
    const card = catalogue.find((entry) => entry.id === cardId);
    if (!card || !target) return;

    const acquiredAt = new Date().toISOString();
    const base = cardToPlayer(card);

    // One OwnedPlayer per copy: each is its own card with its own id, exactly as if
    // it had come out of a pack. eventId records where it really came from.
    const minted: OwnedPlayer[] = Array.from({ length: copies }, () => ({
      ...base,
      id: newOwnedId(),
      playerId: card.id,
      eventId: 'admin-grant',
      acquiredAt,
    }));

    void apply(
      (account) => ({ ...account, club: addPlayers(account.club, minted) }),
      `เสก ${card.name} ให้ ${target.username} ${copies} ใบแล้ว`,
    );
  }

  function removeSelected() {
    if (selected.size === 0) return;
    const gone = new Set(selected);

    void apply((account) => {
      // Taken out of the squad first: a slot pointing at a card that no longer
      // exists would leave a hole the player cannot fill until they touch it.
      let squad = account.squad;
      for (const id of gone) squad = removeFromSquad(squad, id);

      return {
        ...account,
        squad,
        club: { players: account.club.players.filter((card) => !gone.has(card.id)) },
      };
    }, `ลบการ์ด ${gone.size} ใบแล้ว`);

    setSelected(new Set());
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        เสกการ์ดเข้าไอดีผู้เล่น หรือลบการ์ดออกจากสโมสรของเขา ·
        การ์ดที่เสกจะถูกบันทึกว่ามาจากแอดมิน ไม่ใช่จากดราฟต์
      </p>

      <div className={styles.columns}>
        {/* ---- accounts ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ไอดี ({accounts.length})</h3>
          <div className={styles.list}>
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`${styles.account} ${
                  account.username === username ? styles.accountOn : ''
                }`}
                onClick={() => {
                  setUsername(account.username);
                  setSelected(new Set());
                  setConfirmWipe(false);
                }}
              >
                <span className={styles.accountName}>{account.username}</span>
                <span className={styles.accountMeta}>
                  การ์ด {account.club.players.length} / {CLUB_CAPACITY}
                </span>
              </button>
            ))}
            {accounts.length === 0 && <p className={styles.legend}>ยังไม่มีไอดีในเครื่องนี้</p>}
          </div>
        </div>

        {/* ---- grant ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>เสกการ์ดจากคลัง</h3>

          <div className={styles.filters}>
            <input
              className={styles.input}
              placeholder="ค้นหาการ์ดในคลัง"
              value={cardQuery}
              onChange={(event) => setCardQuery(event.target.value)}
            />
            <div className={styles.chips}>
              <button
                type="button"
                className={`${styles.chip} ${tier === 'all' ? styles.chipOn : ''}`}
                onClick={() => setTier('all')}
              >
                ทุกชุด
              </button>
              {PLAYER_SETS.map((set) => (
                <button
                  key={set}
                  type="button"
                  className={`${styles.chip} ${tier === set ? styles.chipOn : ''}`}
                  onClick={() => setTier(set)}
                >
                  {set}
                </button>
              ))}
            </div>
            <div className={styles.chips}>
              <span className={styles.legend}>จำนวนต่อครั้ง</span>
              {[1, 3, 5, 10].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`${styles.chip} ${copies === count ? styles.chipOn : ''}`}
                  onClick={() => setCopies(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.cardGrid}>
            {candidates.map((card) => (
              <button
                key={card.id}
                type="button"
                className={styles.cardCell}
                disabled={!target || busy}
                title={`เสก ${card.name} ให้ ${target?.username ?? '—'}`}
                onClick={() => grant(card.id)}
              >
                <img
                  className={styles.cardArt}
                  src={playerArtUrl(card.artId) ?? ''}
                  alt=""
                  loading="lazy"
                />
                <span className={styles.cardName}>{card.name}</span>
                <span className={styles.cardMeta}>
                  {card.set} · {card.position} · {card.rating}
                </span>
              </button>
            ))}
            {catalogue.length === 0 && (
              <p className={styles.legend}>คลังการ์ดยังว่าง — สร้างการ์ดที่แท็บ "การ์ดนักเตะ" ก่อน</p>
            )}
          </div>
        </div>

        {/* ---- owned ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            การ์ดของ {target?.username ?? '—'} ({target?.club.players.length ?? 0})
          </h3>

          <div className={styles.deleteBar}>
            <span className={styles.legend}>เลือกไว้ {selected.size} ใบ</span>
            <button
              type="button"
              className={styles.ghost}
              disabled={owned.length === 0}
              onClick={() => setSelected(new Set(owned.map((card) => card.id)))}
            >
              เลือกทั้งหมดที่เห็น
            </button>
            <button
              type="button"
              className={styles.danger}
              data-sound="back"
              disabled={selected.size === 0 || busy}
              onClick={removeSelected}
            >
              ลบที่เลือก
            </button>
            {confirmWipe ? (
              <>
                <button
                  type="button"
                  className={styles.danger}
                  data-sound="back"
                  onClick={() => {
                    void apply(
                      (account) => ({ ...account, squad: account.squad, club: { players: [] } }),
                      'ลบการ์ดทั้งสโมสรแล้ว',
                    );
                    setConfirmWipe(false);
                    setSelected(new Set());
                  }}
                >
                  ยืนยันลบทั้งหมด
                </button>
                <button type="button" className={styles.ghost} onClick={() => setConfirmWipe(false)}>
                  ยกเลิก
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.danger}
                disabled={!target || target.club.players.length === 0}
                onClick={() => setConfirmWipe(true)}
              >
                ลบทั้งสโมสร
              </button>
            )}
          </div>

          <input
            className={styles.input}
            placeholder="ค้นหาการ์ดของผู้เล่น"
            value={ownedQuery}
            onChange={(event) => setOwnedQuery(event.target.value)}
          />

          <div className={styles.list}>
            {owned.slice(0, 200).map((card) => (
              <label
                key={card.id}
                className={`${styles.row} ${selected.has(card.id) ? styles.rowOn : ''}`}
              >
                <input
                  type="checkbox"
                  className={styles.tick}
                  data-sound="off"
                  checked={selected.has(card.id)}
                  onChange={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(card.id)) next.delete(card.id);
                      else next.add(card.id);
                      return next;
                    })
                  }
                />
                <img className={styles.rowArt} src={card.portrait} alt="" loading="lazy" />
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{card.name}</span>
                  <span className={styles.rowMeta}>
                    {card.set} · {card.position} · {card.rating}
                    {card.eventId === 'admin-grant' && ' · เสกโดยแอดมิน'}
                  </span>
                </span>
              </label>
            ))}

            {owned.length === 0 && <p className={styles.legend}>ไม่มีการ์ดที่ตรงกับที่ค้นหา</p>}
            {owned.length > 200 && (
              <p className={styles.legend}>แสดง 200 ใบแรก · พิมพ์ค้นหาเพื่อแคบลง</p>
            )}
          </div>
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
