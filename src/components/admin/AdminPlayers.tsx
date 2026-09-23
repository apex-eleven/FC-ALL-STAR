import { useMemo, useRef, useState } from 'react';
import { playerArtUrl } from '@/features/players/artManifest';
import {
  CATALOGUE_FILE,
  downloadCatalogue,
  readCatalogueUpload,
} from '@/features/players/catalogueFile';
import { usePlayers } from '@/features/players/PlayerContext';
import {
  MAX_PLAYERS,
  PLAYER_CLUB_MAX,
  PLAYER_CODE_MAX,
  PLAYER_NAME_MAX,
  PLAYER_NATION_MAX,
  POSITIONS,
  RATING_MAX,
  RATING_MIN,
} from '@/features/players/constants';
import { cleanCode, type SaveResult } from '@/features/players/playerStore';
import type { PlayerCard } from '@/features/players/types';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import styles from './AdminPlayers.module.css';

const SAVE_ERROR: Record<'quota' | 'unavailable' | 'too-many', string> = {
  quota: 'พื้นที่เก็บข้อมูลเต็ม — ลบการ์ดที่ไม่ใช้ออกก่อน',
  unavailable: 'บันทึกไม่สำเร็จ — ข้อมูลการ์ดไม่ครบ',
  'too-many': `เก็บได้สูงสุด ${MAX_PLAYERS} ใบ`,
};

type Status = { tone: 'ok' | 'bad'; text: string } | null;

interface Form {
  /** Card number — see PlayerCard.code. Admin-only. */
  code: string;
  name: string;
  rating: string;
  position: string;
  set: PlayerSet;
  nation: string;
  club: string;
  artId: string | null;
}

const EMPTY_FORM: Form = {
  code: '',
  name: '',
  rating: '100',
  position: 'ST',
  set: 'C',
  nation: 'THA',
  club: '',
  artId: null,
};

function toForm(card: PlayerCard): Form {
  return {
    code: card.code,
    name: card.name,
    rating: String(card.rating),
    position: card.position,
    set: card.set,
    nation: card.nation,
    club: card.club,
    artId: card.artId,
  };
}

/** `p021.webp` -> `p021`, used as the starting name when generating cards from art. */
function stem(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}

/**
 * The card catalogue.
 *
 * Cards live here; packs hold ids into them. That split is what makes a rating fix
 * apply to every pack at once — and it is also why deleting a card only affects
 * future pulls: what a player already owns is a snapshot taken when they pulled it.
 */
export default function AdminPlayers() {
  const {
    players,
    create,
    update,
    remove,
    removeMany,
    importMany,
    replaceAll,
    art,
    reloadArt,
    fileState,
  } = usePlayers();
  const uploadInput = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<PlayerSet | 'all'>('all');
  /** Show only cards that still need a number — the backlog after numbers arrived. */
  const [noCodeOnly, setNoCodeOnly] = useState(false);
  const [artQuery, setArtQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [bulk, setBulk] = useState<Set<string>>(new Set());
  /** Cards ticked for deletion. Separate from `bulk`, which holds art file names. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmWipe, setConfirmWipe] = useState(false);

  const report = (result: SaveResult, success: string) =>
    setStatus(
      result.ok ? { tone: 'ok', text: success } : { tone: 'bad', text: SAVE_ERROR[result.reason] },
    );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return players
      .filter((card) => (tierFilter === 'all' ? true : card.set === tierFilter))
      .filter((card) => !noCodeOnly || card.code === '')
      .filter(
        (card) =>
          !needle ||
          card.code.toLowerCase().includes(needle) ||
          card.name.toLowerCase().includes(needle) ||
          card.club.toLowerCase().includes(needle) ||
          card.nation.toLowerCase().includes(needle),
      )
      .sort((a, b) => b.rating - a.rating);
  }, [players, query, tierFilter, noCodeOnly]);

  const missingCodes = useMemo(() => players.filter((card) => card.code === '').length, [players]);

  const usedArt = useMemo(
    () => new Set(players.map((card) => card.artId).filter((id): id is string => id !== null)),
    [players],
  );

  const artFiles = useMemo(() => {
    const needle = artQuery.trim().toLowerCase();
    return needle ? art.files.filter((file) => file.toLowerCase().includes(needle)) : art.files;
  }, [art.files, artQuery]);

  function submit() {
    const rating = Number.parseInt(form.rating, 10);
    if (!form.name.trim()) {
      setStatus({ tone: 'bad', text: 'ต้องใส่ชื่อนักเตะ' });
      return;
    }

    // The number is how crests tell cards apart, so every saved card must have one
    // and no two cards may share it.
    const code = cleanCode(form.code);
    if (!code) {
      setStatus({ tone: 'bad', text: 'ต้องใส่เลขประจำตัวการ์ด' });
      return;
    }
    const taken = players.find((card) => card.code === code && card.id !== editing);
    if (taken) {
      setStatus({
        tone: 'bad',
        text: `เลข ${code} ใช้กับ ${taken.name} (OVR ${taken.rating}) แล้ว — ใช้เลขอื่น`,
      });
      return;
    }

    const draft = {
      code,
      name: form.name.trim(),
      rating: Number.isFinite(rating) ? rating : RATING_MIN,
      position: form.position.toUpperCase(),
      set: form.set,
      nation: form.nation.toUpperCase(),
      club: form.club.trim() || '—',
      artId: form.artId,
    };

    if (editing) {
      report(update(editing, draft), `แก้ไข ${draft.name} แล้ว`);
    } else {
      report(create(draft), `เพิ่ม ${draft.name} แล้ว`);
      setForm({ ...EMPTY_FORM, set: form.set, nation: form.nation });
    }
  }

  /**
   * Turns selected art files into draft cards in one write.
   *
   * With a few hundred files in the folder, adding them one at a time is the kind of
   * job people give up halfway through. Names come from the file name and are meant
   * to be edited afterwards — this is a starting point, not an import format.
   */
  function generateFromArt() {
    if (bulk.size === 0) return;
    const drafts = Array.from(bulk).map((file) => ({
      name: stem(file),
      rating: 100,
      position: 'ST',
      set: 'C' as PlayerSet,
      nation: '—',
      club: '—',
      artId: file,
    }));

    report(importMany(drafts), `สร้างการ์ดจากรูป ${drafts.length} ใบแล้ว`);
    setBulk(new Set());
  }

  function toggleBulk(file: string) {
    setBulk((current) => {
      const next = new Set(current);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  const preview = playerArtUrl(form.artId);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          คลังการ์ดนักเตะ {players.length} ใบ · แพ็คอ้างถึงการ์ดด้วยไอดี
          แก้การ์ดที่นี่ที่เดียวมีผลกับทุกแพ็คที่ใช้ใบนั้น
        </p>
        <button type="button" className={styles.ghost} onClick={reloadArt}>
          โหลดรายการรูปใหม่
        </button>
      </div>

      <div className={styles.fileBar}>
        <span className={`${styles.fileState} ${fileState === 'failed' ? styles.fileBad : ''}`}>
          {fileState === 'saved' && `บันทึกลงไฟล์อัตโนมัติแล้ว · ${CATALOGUE_FILE}`}
          {fileState === 'unavailable' &&
            'โหมดนี้เขียนไฟล์เองไม่ได้ (ต้องรันด้วย npm run dev) · ใช้ปุ่มดาวน์โหลดแทน'}
          {fileState === 'failed' && 'เขียนไฟล์ไม่สำเร็จ — แก้ล่าสุดยังอยู่ในเบราว์เซอร์'}
        </span>

        <button type="button" className={styles.ghost} onClick={() => downloadCatalogue(players)}>
          ดาวน์โหลด catalogue.json
        </button>

        <input
          ref={uploadInput}
          className={styles.hiddenInput}
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared right away so the same file can be picked again after a failure.
            event.target.value = '';
            if (!file) return;

            void readCatalogueUpload(file).then((cards) => {
              if (!cards) {
                setStatus({ tone: 'bad', text: 'อ่านไฟล์ไม่ได้ — ต้องเป็น catalogue.json ที่ดาวน์โหลดไป' });
                return;
              }
              report(replaceAll(cards), `โหลดการ์ดจากไฟล์ ${cards.length} ใบแล้ว`);
            });
          }}
        />
        <button type="button" className={styles.ghost} onClick={() => uploadInput.current?.click()}>
          โหลดจากไฟล์ (ทับของเดิม)
        </button>
      </div>

      {art.status === 'missing' && (
        <p className={styles.warn}>
          ยังไม่พบรายการรูปการ์ด · วางไฟล์รูปไว้ที่ <code>public/players/</code> แล้วรัน{' '}
          <code>npm run players:manifest</code> หนึ่งครั้ง
          <br />
          (ถ้ายังไม่ทำก็ยังสร้างการ์ดได้ แค่ต้องพิมพ์ชื่อไฟล์รูปเอง)
        </p>
      )}

      <div className={styles.columns}>
        {/* ---- editor ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>{editing ? 'แก้ไขการ์ด' : 'สร้างการ์ดใหม่'}</h3>

          <div className={styles.editor}>
            <button
              type="button"
              className={styles.artSlot}
              onClick={() => setPicking((open) => !open)}
              title="เลือกรูปการ์ด"
            >
              {preview ? (
                <img className={styles.artImage} src={preview} alt="" />
              ) : (
                <span className={styles.artEmpty}>เลือกรูป</span>
              )}
            </button>

            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.label}>เลขประจำตัวการ์ด · เห็นเฉพาะแอดมิน</span>
                <input
                  className={`${styles.input} ${styles.codeInput}`}
                  value={form.code}
                  maxLength={PLAYER_CODE_MAX}
                  placeholder="เช่น 1001"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setForm({ ...form, code: cleanCode(event.target.value) })}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>ชื่อ</span>
                <input
                  className={styles.input}
                  value={form.name}
                  maxLength={PLAYER_NAME_MAX}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>

              <div className={styles.pair}>
                <label className={styles.field}>
                  <span className={styles.label}>OVR</span>
                  <input
                    className={styles.input}
                    value={form.rating}
                    inputMode="numeric"
                    onChange={(event) =>
                      setForm({ ...form, rating: event.target.value.replace(/[^\d]/g, '') })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ชาติ</span>
                  <input
                    className={styles.input}
                    value={form.nation}
                    maxLength={PLAYER_NATION_MAX}
                    onChange={(event) => setForm({ ...form, nation: event.target.value })}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>สโมสร</span>
                <input
                  className={styles.input}
                  value={form.club}
                  maxLength={PLAYER_CLUB_MAX}
                  onChange={(event) => setForm({ ...form, club: event.target.value })}
                />
              </label>

              <span className={styles.label}>ตำแหน่ง</span>
              <div className={styles.chips}>
                {POSITIONS.map((position) => (
                  <button
                    key={position}
                    type="button"
                    className={`${styles.chip} ${form.position === position ? styles.chipOn : ''}`}
                    onClick={() => setForm({ ...form, position })}
                  >
                    {position}
                  </button>
                ))}
              </div>

              <span className={styles.label}>ชุด (ยิ่งดีโอกาสยิ่งน้อย)</span>
              <div className={styles.chips}>
                {PLAYER_SETS.map((set) => (
                  <button
                    key={set}
                    type="button"
                    className={`${styles.chip} ${styles[`set${set}`] ?? ''} ${
                      form.set === set ? styles.chipOn : ''
                    }`}
                    onClick={() => setForm({ ...form, set })}
                  >
                    ชุด {set}
                  </button>
                ))}
              </div>

              <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={submit}>
                  {editing ? 'บันทึกการแก้ไข' : 'เพิ่มเข้าคลัง'}
                </button>
                {editing && (
                  <button
                    type="button"
                    className={styles.ghost}
                    data-sound="back"
                    onClick={() => {
                      setEditing(null);
                      setForm(EMPTY_FORM);
                    }}
                  >
                    ยกเลิก
                  </button>
                )}
              </div>
              <p className={styles.legend}>
                OVR {RATING_MIN}–{RATING_MAX} · ตัวเลขนี้คือตัวที่ walkout ใช้ตัดสินว่าจะเล่นวิดีโอไหม
              </p>
              <p className={styles.legend}>
                เลขประจำตัวการ์ดห้ามซ้ำกัน · ตราทีมใช้เลขนี้ตัดสินว่าเป็นการ์ดใบไหน ·
                ถ้าลบการ์ดแล้วเพิ่มใหม่ ให้ใส่เลขเดิม การ์ดที่ผู้เล่นมีอยู่แล้วจะยังนับเข้าตรา ·
                ผู้เล่นไม่เห็นเลขนี้ในเกม (แต่ไม่ใช่ข้อมูลลับ อย่าใส่ข้อมูลส่วนตัว)
              </p>
            </div>
          </div>

          {picking && (
            <div className={styles.picker}>
              <div className={styles.pickerHead}>
                <input
                  className={styles.input}
                  placeholder="ค้นหาชื่อไฟล์รูป"
                  value={artQuery}
                  onChange={(event) => setArtQuery(event.target.value)}
                />
                <span className={styles.count}>{artFiles.length} ไฟล์</span>
              </div>

              <div className={styles.artGrid}>
                {artFiles.slice(0, 120).map((file) => (
                  <button
                    key={file}
                    type="button"
                    className={`${styles.artCell} ${form.artId === file ? styles.artCellOn : ''} ${
                      usedArt.has(file) ? styles.artUsed : ''
                    }`}
                    title={usedArt.has(file) ? `${file} (ใช้แล้ว)` : file}
                    onClick={() => {
                      setForm({ ...form, artId: file });
                      setPicking(false);
                    }}
                  >
                    <img className={styles.artThumb} src={playerArtUrl(file) ?? ''} alt="" loading="lazy" />
                  </button>
                ))}
              </div>

              {artFiles.length > 120 && (
                <p className={styles.legend}>
                  แสดง 120 ไฟล์แรก · พิมพ์ค้นหาเพื่อแคบลง (โหลดรูปทั้งหมดพร้อมกันจะหน่วง)
                </p>
              )}

              <div className={styles.bulkRow}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setBulk(new Set(artFiles.filter((file) => !usedArt.has(file)).slice(0, 50)))}
                >
                  เลือก 50 รูปที่ยังไม่ได้ใช้
                </button>
                <button type="button" className={styles.ghost} onClick={() => setBulk(new Set())}>
                  ล้างที่เลือก
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={bulk.size === 0}
                  onClick={generateFromArt}
                >
                  สร้างการ์ดจาก {bulk.size} รูป
                </button>
              </div>

              {bulk.size > 0 && (
                <div className={styles.artGrid}>
                  {Array.from(bulk).map((file) => (
                    <button
                      key={file}
                      type="button"
                      className={`${styles.artCell} ${styles.artCellOn}`}
                      onClick={() => toggleBulk(file)}
                      title={`เอา ${file} ออก`}
                    >
                      <img className={styles.artThumb} src={playerArtUrl(file) ?? ''} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}

              <p className={styles.legend}>
                กดที่รูปเพื่อเลือกเป็นรูปของการ์ดที่กำลังแก้ · ปุ่มด้านบนใช้สร้างการ์ดทีละหลายใบ
                แล้วค่อยมาแก้ชื่อ/OVR/เลขประจำตัวการ์ดทีหลัง
              </p>
            </div>
          )}
        </div>

        {/* ---- catalogue ---- */}
        <div className={styles.block}>
          <div className={styles.deleteBar}>
            <span className={styles.fileState}>
              เลือกไว้ {selected.size} ใบ
              {selected.size > 0 && ' · การ์ดที่ผู้เล่นได้ไปแล้วจะไม่หายไปจากสโมสร'}
            </span>

            <button
              type="button"
              className={styles.ghost}
              disabled={visible.length === 0}
              onClick={() => setSelected(new Set(visible.map((card) => card.id)))}
            >
              เลือกทั้งหมดที่เห็น ({visible.length})
            </button>

            <button
              type="button"
              className={styles.ghost}
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
            >
              ล้างที่เลือก
            </button>

            <button
              type="button"
              className={styles.danger}
              data-sound="back"
              disabled={selected.size === 0}
              onClick={() => {
                const count = selected.size;
                report(removeMany([...selected]), `ลบการ์ด ${count} ใบแล้ว`);
                setSelected(new Set());
                if (editing && selected.has(editing)) {
                  setEditing(null);
                  setForm(EMPTY_FORM);
                }
              }}
            >
              ลบที่เลือก ({selected.size})
            </button>

            {confirmWipe ? (
              <>
                <button
                  type="button"
                  className={styles.danger}
                  data-sound="back"
                  onClick={() => {
                    const count = players.length;
                    report(replaceAll([]), `ลบการ์ดทั้งหมด ${count} ใบแล้ว`);
                    setSelected(new Set());
                    setEditing(null);
                    setForm(EMPTY_FORM);
                    setConfirmWipe(false);
                  }}
                >
                  ยืนยันลบทั้งคลัง {players.length} ใบ
                </button>
                <button type="button" className={styles.ghost} onClick={() => setConfirmWipe(false)}>
                  ยกเลิก
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.danger}
                disabled={players.length === 0}
                onClick={() => setConfirmWipe(true)}
              >
                ลบทั้งหมด
              </button>
            )}
          </div>

          <div className={styles.filters}>
            <input
              className={styles.input}
              placeholder="ค้นหาเลขการ์ด / ชื่อ / สโมสร / ชาติ"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className={styles.chips}>
              <button
                type="button"
                className={`${styles.chip} ${tierFilter === 'all' ? styles.chipOn : ''}`}
                onClick={() => setTierFilter('all')}
              >
                ทั้งหมด
              </button>
              {PLAYER_SETS.map((set) => (
                <button
                  key={set}
                  type="button"
                  className={`${styles.chip} ${styles[`set${set}`] ?? ''} ${
                    tierFilter === set ? styles.chipOn : ''
                  }`}
                  onClick={() => setTierFilter(set)}
                >
                  {set}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.chip} ${noCodeOnly ? styles.chipOn : ''}`}
                onClick={() => setNoCodeOnly((on) => !on)}
              >
                ยังไม่มีเลข ({missingCodes})
              </button>
            </div>
          </div>

          {missingCodes > 0 && (
            <p className={styles.warn}>
              มีการ์ด {missingCodes} ใบที่ยังไม่มีเลขประจำตัว · กด “ยังไม่มีเลข” แล้วแก้ไขใส่เลขให้ครบ ·
              ระหว่างนี้ตราทีมจะเทียบการ์ดพวกนี้ด้วยชื่อ/รูปแทน
            </p>
          )}

          <div className={styles.list}>
            {visible.map((card) => (
              <div
                key={card.id}
                className={`${styles.row} ${selected.has(card.id) ? styles.rowOn : ''}`}
              >
                <input
                  type="checkbox"
                  className={styles.tick}
                  checked={selected.has(card.id)}
                  aria-label={`เลือก ${card.name}`}
                  data-sound="off"
                  onChange={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(card.id)) next.delete(card.id);
                      else next.add(card.id);
                      return next;
                    })
                  }
                />
                <img
                  className={styles.rowArt}
                  src={playerArtUrl(card.artId) ?? ''}
                  alt=""
                  loading="lazy"
                />
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>
                    <span className={card.code ? styles.rowCode : styles.rowNoCode}>
                      {card.code ? `#${card.code}` : 'ไม่มีเลข'}
                    </span>{' '}
                    {card.name}
                  </span>
                  <span className={styles.rowMeta}>
                    {card.position} · {card.nation} · {card.club}
                  </span>
                </span>
                <span className={`${styles.rowTier} ${styles[`set${card.set}`] ?? ''}`}>
                  {card.set}
                </span>
                <span className={styles.rowRating}>{card.rating}</span>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    setEditing(card.id);
                    setForm(toForm(card));
                  }}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  data-sound="back"
                  onClick={() => {
                    if (editing === card.id) {
                      setEditing(null);
                      setForm(EMPTY_FORM);
                    }
                    report(remove(card.id), `ลบ ${card.name} แล้ว`);
                  }}
                >
                  ลบ
                </button>
              </div>
            ))}

            {visible.length === 0 && (
              <p className={styles.legend}>
                {players.length === 0
                  ? 'ยังไม่มีการ์ดในคลัง — สร้างใบแรกจากฟอร์มด้านซ้าย'
                  : 'ไม่พบการ์ดที่ตรงกับที่ค้นหา'}
              </p>
            )}
          </div>

          <p className={styles.legend}>
            ลบการ์ดออกจากคลังไม่กระทบการ์ดที่ผู้เล่นได้ไปแล้ว — ของที่ครอบครองคือสำเนา
            ณ ตอนที่สุ่มได้ แต่แพ็คที่อ้างถึงใบนี้จะเหลือตัวเลือกน้อยลง
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
