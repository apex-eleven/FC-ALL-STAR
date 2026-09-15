import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, ChevronsUp, Dna, Home, Plus, Star, Dumbbell } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount, useAuth } from '@/features/auth/AuthContext';
import { syncOwned } from '@/features/club/sync';
import type { OwnedPlayer } from '@/features/club/types';
import { formatCurrency } from '@/features/currencies/constants';
import { useWallet } from '@/features/currencies/useWallet';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { usePlayers } from '@/features/players/PlayerContext';
import { MAX_PLUS, plusTone } from '@/features/rankup/constants';
import { clampPlus, ratingWithPlus } from '@/features/rankup/plus';
import { useRankUp } from '@/features/rankup/RankUpContext';
import { FAIL_LABEL, attempt, checkReady, isMaterial } from '@/features/rankup/rankup';
import type { RankUpOutcome } from '@/features/rankup/types';
import { useSound } from '@/features/sound/SoundContext';
import { isInSquad, removeFromSquad } from '@/features/squad/squad';
import IconButton from '@/components/ui/IconButton';
import SquadCard from '@/components/club/SquadCard';
import CardPicker from './CardPicker';
import RankUpResult from './RankUpResult';
import styles from './RankUpScreen.module.css';

/** The reference screen's four modes. Only the first is built. */
const MODES = [
  { id: 'rankup', label: 'ตีบวก', icon: ChevronsUp, ready: true },
  { id: 'training', label: 'ฝึกซ้อม', icon: Dumbbell, ready: false },
  { id: 'skill', label: 'สกิล', icon: Star, ready: false },
  { id: 'evolution', label: 'วิวัฒนาการ', icon: Dna, ready: false },
] as const;

/** How long the button spins before the result lands. */
const ROLL_MS = 900;

type Picking = { kind: 'target' } | { kind: 'material' };

export default function RankUpScreen() {
  const account = useAccount();
  const { updateAccount } = useAuth();
  const { navigate, back } = useNavigation();
  const { byId } = usePlayers();
  const { config } = useRankUp();
  const { balances, spend } = useWallet();
  const { play } = useSound();

  const [targetId, setTargetId] = useState<string | null>(null);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<{ outcome: RankUpOutcome; card: OwnedPlayer } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Cleared on unmount so a roll that is still pending cannot write to a screen the
  // player has already left.
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  /** Owned cards, refreshed from the catalogue — same rule as the club screen. */
  const players = useMemo(
    () => syncOwned(account.club.players, byId),
    [account.club.players, byId],
  );

  const index = useMemo(() => new Map(players.map((card) => [card.id, card])), [players]);

  const target = targetId ? (index.get(targetId) ?? null) : null;
  const plus = clampPlus(target?.plus);

  const materials = useMemo(
    () => materialIds.map((id) => index.get(id)).filter((card): card is OwnedPlayer => !!card),
    [materialIds, index],
  );

  const readiness = useMemo(() => {
    const currency = config.levels[Math.min(plus, MAX_PLUS - 1)]?.currency ?? 'exchange';
    return checkReady({ config, target, materials, balance: balances[currency] });
  }, [config, target, materials, balances, plus]);

  const rule = readiness.rule;
  const cost = rule?.cost ?? 0;
  const currency = rule ? currencies[rule.currency] : null;

  /** Cards this level would accept, minus the target and anything already placed. */
  const eligible = useMemo(() => {
    if (!rule || !target) return [];
    const taken = new Set(materialIds);
    return players.filter((card) => !taken.has(card.id) && isMaterial(config, rule, card, target.id));
  }, [players, config, rule, target, materialIds]);

  const pickTarget = useCallback((cardId: string) => {
    // Materials are cleared with the target: the next level may accept a different
    // list entirely, and silently carrying an ineligible card over would fail the
    // readiness check with no visible cause.
    setTargetId(cardId);
    setMaterialIds([]);
    setPicking(null);
  }, []);

  const addMaterial = useCallback(
    (cardId: string) => {
      setMaterialIds((current) =>
        current.includes(cardId) ? current : [...current, cardId].slice(0, rule?.materials ?? 0),
      );
      setPicking(null);
    },
    [rule],
  );

  const autoFill = useCallback(() => {
    if (!rule) return;
    const need = rule.materials - materialIds.length;
    if (need <= 0) return;

    // Weakest first, and never a card that is currently in the eleven or on the
    // bench — an auto-fill that quietly ate a starter would be a trap.
    const pool = eligible
      .filter((card) => !isInSquad(account.squad, card.id))
      .sort((a, b) => ratingWithPlus(a) - ratingWithPlus(b))
      .slice(0, need)
      .map((card) => card.id);

    if (pool.length === 0) {
      setToast('ไม่มีการ์ดว่างที่ใช้เป็นวัสดุได้');
      play('error');
      return;
    }

    setMaterialIds((current) => [...current, ...pool]);
  }, [rule, materialIds.length, eligible, account.squad, play]);

  function run() {
    if (!rule || !target || !readiness.ok || rolling) return;

    const outcome = attempt(config, target, materials);
    const snapshot = target;

    setRolling(true);
    play('shake');

    timer.current = window.setTimeout(() => {
      const paid = spend(rule.currency, rule.cost, 'purchase');
      if (!paid.ok) {
        setRolling(false);
        setToast('เงินไม่พอ');
        play('error');
        return;
      }

      updateAccount((current) => {
        const gone = new Set(outcome.consumed);
        if (outcome.destroyed) gone.add(snapshot.id);

        // Cards leave the squad before they leave the club: a slot pointing at a
        // card that no longer exists reads as an empty position the player cannot
        // fill until they happen to touch it.
        let squad = current.squad;
        for (const id of gone) squad = removeFromSquad(squad, id);

        const nextPlayers = current.club.players
          .filter((card) => !gone.has(card.id))
          .map((card) => (card.id === snapshot.id ? { ...card, plus: outcome.to } : card));

        return { ...current, squad, club: { players: nextPlayers } };
      });

      setMaterialIds([]);
      if (outcome.destroyed) setTargetId(null);

      setRolling(false);
      setResult({ outcome, card: snapshot });
      play(outcome.success ? 'tear' : 'error');
    }, ROLL_MS);
  }

  const blockMessage = (() => {
    if (players.length === 0) return 'ยังไม่มีการ์ดในสโมสร เปิดแพ็คก่อน';
    switch (readiness.reason) {
      case 'no-target':
        return 'เลือกการ์ดหลักที่จะตีบวก';
      case 'maxed':
        return `การ์ดใบนี้อยู่ที่ +${MAX_PLUS} แล้ว`;
      case 'need-materials':
        return `ต้องใส่วัสดุอีก ${(rule?.materials ?? 0) - materials.length} ใบ`;
      case 'bad-material':
        return 'มีวัสดุที่ระดับนี้ไม่รับ';
      case 'cannot-afford':
        return 'เงินไม่พอสำหรับค่าธรรมเนียม';
      default:
        return null;
    }
  })();

  const tone = plusTone(Math.max(1, plus + 1));
  const screenStyle = { '--tone': tone } as CSSProperties;

  if (!config.enabled) {
    return (
      <div className={styles.closed}>
        <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
          <ChevronLeft size={36} strokeWidth={3} />
        </button>
        <p>ระบบตีบวกปิดปรับปรุงอยู่</p>
      </div>
    );
  }

  return (
    <div className={styles.screen} style={screenStyle}>
      {/* Admin-supplied backdrop when there is one, the built-in wash otherwise. The
          fallback is a gradient rather than an asset so swapping the theme never
          leaves a missing file behind. */}
      {config.background ? (
        <img className={styles.backdrop} src={config.background} alt="" />
      ) : (
        <div className={styles.fallbackBackdrop} aria-hidden="true" />
      )}
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.topBar}>
        <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
          <ChevronLeft size={36} strokeWidth={3} />
        </button>
        <span className={styles.titleBlock}>
          <h1 className={styles.title}>RANK UP</h1>
          <span className={styles.subtitle}>ตีบวกการ์ด</span>
        </span>
        <span className={styles.homeButton}>
          <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </span>
      </header>

      <nav className={styles.modes} aria-label="โหมด">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              type="button"
              key={mode.id}
              className={`${styles.mode} ${mode.ready ? styles.modeOn : ''}`}
              disabled={!mode.ready}
              aria-current={mode.ready ? 'page' : undefined}
            >
              <Icon size={30} strokeWidth={2.4} />
              <span>{mode.label}</span>
              {!mode.ready && <span className={styles.soon}>เร็ว ๆ นี้</span>}
            </button>
          );
        })}
      </nav>

      <section className={styles.targetPanel}>
        <button
          type="button"
          className={styles.targetSlot}
          onClick={() => setPicking({ kind: 'target' })}
          disabled={players.length === 0}
        >
          {target ? (
            <>
              <SquadCard player={target} scale={3.1} interactive={false} />
              <span className={styles.targetBadge}>
                <span className={styles.targetRating}>{ratingWithPlus(target)}</span>
                <span className={styles.targetPosition}>{target.position}</span>
              </span>
              <span className={styles.targetName}>{target.name}</span>
            </>
          ) : (
            <span className={styles.emptyTarget}>
              <Plus size={44} strokeWidth={2.4} />
              แตะเพื่อเลือกการ์ดหลัก
            </span>
          )}
        </button>
      </section>

      <section className={styles.stats}>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>ระดับตีบวก</span>
          <span className={styles.pips}>
            {Array.from({ length: MAX_PLUS }, (_, i) => (
              <span
                key={i}
                className={`${styles.pip} ${i < plus ? styles.pipOn : ''}`}
                style={{ '--pip': plusTone(i + 1) } as CSSProperties}
              />
            ))}
          </span>
        </div>

        <div className={styles.statRow}>
          <span className={styles.statLabel}>ค่าธรรมเนียม</span>
          <span className={styles.statValue}>
            {currency && <img className={styles.coin} src={currency.icon} alt="" />}
            {rule ? formatCurrency(cost) : '—'}
          </span>
        </div>

        <div className={styles.statRow}>
          <span className={styles.statLabel}>วัสดุที่ต้องใช้</span>
          <span className={styles.statValue}>
            {materials.length} / {rule?.materials ?? 0}
          </span>
        </div>

        <div className={styles.statRow}>
          <span className={styles.statLabel}>เมื่อล้มเหลว</span>
          <span className={styles.statValue}>{rule ? FAIL_LABEL[rule.onFail] : '—'}</span>
        </div>

        <div className={styles.statRow}>
          <span className={styles.statLabel}>โอกาสสำเร็จ</span>
          <span className={`${styles.statValue} ${styles.chance}`}>{rule?.chance ?? 0}%</span>
        </div>

        <div className={styles.bar}>
          <span className={styles.barFill} style={{ width: `${rule?.chance ?? 0}%` }} />
        </div>
      </section>

      <section className={styles.fusion}>
        <div className={styles.fusionHead}>
          <h2 className={styles.fusionTitle}>เลือกการ์ดวัสดุ</h2>
          <button
            type="button"
            className={styles.auto}
            onClick={autoFill}
            disabled={!rule || materials.length >= rule.materials}
          >
            เติมอัตโนมัติ
          </button>
        </div>

        <div className={styles.slots}>
          {Array.from({ length: rule?.materials ?? 0 }, (_, slot) => {
            const card = materials[slot];
            return (
              <button
                type="button"
                key={slot}
                className={`${styles.slot} ${card ? styles.slotFilled : ''}`}
                onClick={() =>
                  card
                    ? setMaterialIds((current) => current.filter((id) => id !== card.id))
                    : setPicking({ kind: 'material' })
                }
                aria-label={card ? `เอา ${card.name} ออก` : `เพิ่มวัสดุช่องที่ ${slot + 1}`}
              >
                {card ? (
                  <SquadCard player={card} scale={1.05} interactive={false} />
                ) : (
                  <Plus size={30} strokeWidth={2.4} />
                )}
              </button>
            );
          })}

          {!rule && <p className={styles.fusionEmpty}>เลือกการ์ดหลักก่อน</p>}
        </div>

        <p className={styles.fusionHint}>
          {rule
            ? 'แตะช่องว่างเพื่อเพิ่มการ์ด แตะการ์ดที่ใส่แล้วเพื่อเอาออก'
            : 'ระบบจะแสดงช่องวัสดุตามระดับที่จะตีบวก'}
        </p>
      </section>

      <div className={styles.ladder}>
        {Array.from({ length: MAX_PLUS }, (_, i) => {
          const level = i + 1;
          const reached = level <= plus;
          const nextUp = level === plus + 1;

          return (
            <span className={styles.step} key={level}>
              <span
                className={`${styles.tile} ${reached ? styles.tileOn : ''} ${
                  nextUp ? styles.tileNext : ''
                }`}
                style={{ '--pip': plusTone(level) } as CSSProperties}
              >
                +{level}
              </span>
              {level < MAX_PLUS && <ChevronRight className={styles.arrow} size={22} strokeWidth={3} />}
            </span>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.action}
        onClick={run}
        disabled={!readiness.ok || rolling}
      >
        {rolling ? 'กำลังตีบวก…' : 'RANK UP'}
      </button>

      {blockMessage && !rolling && <p className={styles.block}>{blockMessage}</p>}

      <span className={styles.brand}>FC ALL-STAR</span>

      {picking?.kind === 'target' && (
        <CardPicker
          title="เลือกการ์ดหลัก"
          note="การ์ดใบนี้คือใบที่จะถูกตีบวก"
          players={players}
          onPick={pickTarget}
          onClose={() => setPicking(null)}
        />
      )}

      {picking?.kind === 'material' && (
        <CardPicker
          title="เลือกการ์ดวัสดุ"
          note={
            (rule?.materialIds.length ?? 0) > 0 || config.materialIds.length > 0
              ? 'แสดงเฉพาะการ์ดที่แอดมินกำหนดให้ใช้ได้ในระดับนี้'
              : 'ระดับนี้รับการ์ดใบไหนก็ได้'
          }
          players={eligible}
          usedIds={new Set(materialIds)}
          onPick={addMaterial}
          onClose={() => setPicking(null)}
        />
      )}

      {result && (
        <RankUpResult
          outcome={result.outcome}
          card={result.card}
          onClose={() => setResult(null)}
        />
      )}

      {toast && <p className={styles.toast}>{toast}</p>}
    </div>
  );
}
