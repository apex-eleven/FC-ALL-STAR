import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Home, Share2 } from 'lucide-react';
import { ASSETS } from '@/assets/assetMap';
import { useAccount, useAuth } from '@/features/auth/AuthContext';
import { equip } from '@/features/badges/badges';
import { useBadges } from '@/features/badges/BadgeContext';
import { displayNameOf } from '@/features/auth/constants';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { usePlayers } from '@/features/players/PlayerContext';
import { syncOwned } from '@/features/club/sync';
import { publishLeaderboardEntry } from '@/features/cloud/cloudLeaderboard';
import { isCloudEnabled } from '@/features/cloud/firebase';
import type { LeaderboardCard, LeaderboardEntry } from '@/features/leaderboard/types';
import { shopStamp } from '@/features/shop/shop';
import {
  canClaimShare,
  claimShare,
  facebookShareUrl,
  shareText,
  todayKey as shareTodayKey,
} from '@/features/share/share';
import {
  autoBuild,
  canPlace,
  formationOf,
  duplicateOf,
  indexOwned,
  isInSquad,
  placeInSlot,
  placeOnBench,
  removeFromSquad,
  squadValue,
} from '@/features/squad/squad';
import type { FormationSlot, PlacementCheck } from '@/features/squad/types';
import { useCardDrag, type DropTarget } from '@/hooks/useCardDrag';
import { CARD_WIDTH } from '@/features/squad/constants';
import IconButton from '@/components/ui/IconButton';
import BadgePicker from './BadgePicker';
import ClubPanel from './ClubPanel';
import PitchSlot from './PitchSlot';
import BenchStrip from './BenchStrip';
import CollectionDrawer from './CollectionDrawer';
import SlotPicker from './SlotPicker';
import SquadCard from './SquadCard';
import LeaderboardScreen from '@/components/leaderboard/LeaderboardScreen';
import styles from './ClubScreen.module.css';

const REFUSAL: Record<NonNullable<PlacementCheck['reason']>, string> = {
  'gk-slot-needs-gk': 'ช่องผู้รักษาประตูใส่ได้เฉพาะ GK เท่านั้น',
  'gk-cannot-play-outfield': 'ผู้รักษาประตูลงเล่นตำแหน่งอื่นไม่ได้',
  'duplicate-name': 'นักเตะคนนี้อยู่ในทีมแล้ว ใส่ชื่อซ้ำไม่ได้',
};

/** Which picker is open: a pitch slot, or a bench seat. */
type Picking =
  | { kind: 'slot'; slot: FormationSlot }
  | { kind: 'bench'; index: number };

export default function ClubScreen() {
  const account = useAccount();
  const { updateAccount } = useAuth();
  const { navigate, back } = useNavigation();

  const { byId } = usePlayers();
  const { config: badgeConfig, ratingOf, bonusOf, slotsOf } = useBadges();
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(null);
  // Which crest slot is open, or null.
  const [badgeSlot, setBadgeSlot] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // A drag that ends on the slot it started from still fires a click. Without this
  // the picker would open every time a card was put back where it came from.
  const draggedAt = useRef(0);
  // What was last published to the leaderboard, so a re-render that changed nothing
  // does not turn into a write. Compared without `updatedAt`, which always differs.
  const lastPublished = useRef<string | null>(null);

  /**
   * Owned cards, refreshed from the catalogue.
   *
   * Without this, editing a card to GK in the admin panel leaves every copy already
   * in a club still reading as a striker — and the keeper slot keeps refusing it.
   */
  const players = useMemo(
    () => syncOwned(account.club.players, byId),
    [account.club.players, byId],
  );

  const owned = useMemo(() => indexOwned(players), [players]);
  const squad = account.squad;
  const formation = formationOf(squad);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleDrop = useCallback(
    (cardId: string, target: DropTarget | null) => {
      draggedAt.current = Date.now();

      updateAccount((current) => {
        // Synced here too: the placement rules read `position`, and the stored
        // snapshot may predate the admin edit that made this card a keeper.
        const index = indexOwned(syncOwned(current.club.players, byId));

        if (!target || target.kind === 'remove') {
          return { ...current, squad: removeFromSquad(current.squad, cardId) };
        }

        const result =
          target.kind === 'slot'
            ? placeInSlot(current.squad, index, target.id, cardId)
            : placeOnBench(current.squad, index, cardId, Number.parseInt(target.id, 10));

        if (!result.check.ok && result.check.reason) {
          // Set during the update so the message names the rule that refused it, not
          // a guess made before the placement was evaluated.
          setToast(REFUSAL[result.check.reason]);
          return current;
        }

        return { ...current, squad: result.squad };
      });
    },
    [updateAccount, byId],
  );

  const { drag, over, start, ghostRef, ghostSize } = useCardDrag(handleDrop);

  /** Places a card from the picker, applying the same rules a drop would. */
  const pickInto = useCallback(
    (where: Picking, cardId: string) => {
      updateAccount((current) => {
        const index = indexOwned(syncOwned(current.club.players, byId));
        const result =
          where.kind === 'slot'
            ? placeInSlot(current.squad, index, where.slot.id, cardId)
            : placeOnBench(current.squad, index, cardId, where.index);

        if (!result.check.ok && result.check.reason) {
          setToast(REFUSAL[result.check.reason]);
          return current;
        }

        return { ...current, squad: result.squad };
      });
      setPicking(null);
    },
    [updateAccount, byId],
  );

  const clearSlot = useCallback(
    (cardId: string) => {
      updateAccount((current) => ({
        ...current,
        squad: removeFromSquad(current.squad, cardId),
      }));
      setPicking(null);
    },
    [updateAccount],
  );

  const draggedPlayer = drag ? owned.get(drag.cardId) : undefined;

  // A slot highlights red while a keeper hovers an outfield place, or vice versa, so
  // the refusal is visible before the card is released.
  const blockedSlot = useMemo(() => {
    if (!over || over.kind !== 'slot' || !draggedPlayer) return false;
    const slot = formation.slots.find((candidate) => candidate.id === over.id);
    return slot ? !canPlace(slot.position, draggedPlayer).ok : false;
  }, [over, draggedPlayer, formation]);

  // The eleven actually on the pitch, not the best eleven owned: a card benched or
  // stuck on the bench doesn't count, and one played out of position is docked by
  // the same penalty `effectiveRating` shows on its own card. Active crests add
  // their bonus on top — the same number the home tile shows.
  const rating = useMemo(() => ratingOf(squad, owned), [ratingOf, squad, owned]);
  const bonus = useMemo(() => bonusOf(squad, owned), [bonusOf, squad, owned]);
  const badgeSlots = useMemo(() => slotsOf(squad, owned), [slotsOf, squad, owned]);
  const value = squadValue(squad, owned);

  /**
   * Publishes this account's starting eleven to the leaderboard whenever it
   * actually changes — placing a card, swapping one out, a rank-up, an admin edit
   * synced in from the catalogue. Never on a timer, and skipped entirely with no
   * squad worth showing, so an empty club does not put a hollow row in the table.
   */
  useEffect(() => {
    if (!isCloudEnabled() || rating <= 0) return;

    const cards: LeaderboardCard[] = formation.slots.flatMap((slot) => {
      const cardId = squad.starters[slot.id];
      const player = cardId ? owned.get(cardId) : undefined;
      if (!player) return [];
      return [
        {
          slotId: slot.id,
          position: player.position,
          name: player.name,
          rating: player.rating,
          plus: player.plus ?? 0,
          portrait: player.portrait,
        },
      ];
    });

    const snapshot = {
      uid: account.id,
      username: displayNameOf(account),
      avatarId: account.avatarId,
      rating,
      formation: squad.formation,
      cards,
    };
    const signature = JSON.stringify(snapshot);
    if (lastPublished.current === signature) return;
    lastPublished.current = signature;

    const entry: LeaderboardEntry = { ...snapshot, updatedAt: new Date().toISOString() };
    void publishLeaderboardEntry(entry);
  }, [account.id, account.username, account.displayName, account.avatarId, formation, squad, owned, rating]);

  // Whether pressing "แชร์ทีม" right now would still pay today's reward — shown as
  // a dot on the button, and decides whether the click also grants it.
  const shareRewardAvailable = useMemo(
    () => canClaimShare(account.share, shareTodayKey(new Date())),
    [account.share],
  );

  /**
   * Opens the Facebook share dialog with the current starting eleven, then — once
   * per day — pays the share reward. Sharing always works; the reward is the once-a-
   * day bonus on top, same all-or-nothing rule as every other reward line (a wallet
   * at its cap leaves the day open so the next share still tries to pay it).
   */
  const handleShare = useCallback(() => {
    const starters = formation.slots
      .map((slot) => squad.starters[slot.id])
      .filter((id): id is string => Boolean(id))
      .map((id) => owned.get(id))
      .filter((player): player is NonNullable<typeof player> => Boolean(player))
      .map((player) => ({ name: player.name, rating: player.rating, position: player.position }));

    const text = shareText({
      teamName: displayNameOf(account),
      rating,
      formationName: formation.name,
      starters,
    });
    window.open(facebookShareUrl(text), '_blank', 'noopener,noreferrer,width=640,height=520');

    const today = shareTodayKey(new Date());
    if (!canClaimShare(account.share, today)) {
      setToast('แชร์ทีมอีกครั้ง! วันนี้รับรางวัลไปแล้ว พรุ่งนี้มาแชร์รับรางวัลใหม่ได้');
      return;
    }

    // Clock and stamp fixed here, not inside updateAccount: the mutator may run
    // twice, and both runs have to agree on which day was paid.
    const now = new Date();
    const stamp = shopStamp();
    const preview = claimShare(account, now, byId, stamp);
    if (!preview.ok) {
      setToast('รับรางวัลแชร์ทีมไม่สำเร็จ ลองใหม่อีกครั้ง');
      return;
    }

    updateAccount((current) => {
      const outcome = claimShare(current, now, byId, stamp);
      return outcome.ok ? outcome.account : current;
    });
    setToast('แชร์ทีมสำเร็จ! ได้รับกุญแจกาชาปอง x20, FC Point x100, Gem x3,000');
  }, [account, formation, squad, owned, rating, byId, updateAccount]);

  const pointerFor = useCallback(
    (cardId: string) => (event: PointerEvent) => start(cardId, event),
    [start],
  );

  return (
    <>
      <div className={styles.backdrop} />
      <img className={styles.stadium} src={ASSETS.backgrounds.pitchStadium} alt="" />
      <div className={styles.leftScrim} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.removeZone} data-drop-kind="remove" data-drop-id="squad" />

      <header className={styles.topBar}>
        <div className={styles.scrim} />
        <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
          <ChevronLeft size={36} strokeWidth={3} />
        </button>
        <h1 className={styles.title}>ทีมของฉัน</h1>
        <span className={styles.home}>
          <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </span>
        <span className={styles.shareButton}>
          <IconButton
            label={
              shareRewardAvailable
                ? 'แชร์ทีม — รับกุญแจกาชาปอง x20, FC Point x100, Gem x3,000'
                : 'แชร์ทีม — รับรางวัลวันนี้ไปแล้ว'
            }
            size={46}
            onClick={handleShare}
          >
            <Share2 size={40} strokeWidth={2} />
            {shareRewardAvailable && <span className={styles.shareDot} aria-hidden="true" />}
          </IconButton>
        </span>
      </header>

      <ClubPanel
        name="ทีมของฉัน"
        rating={rating}
        bonus={bonus}
        badgeSlots={badgeSlots}
        badgesEnabled={badgeConfig.enabled}
        formationName={formation.name}
        value={value}
        collectionOpen={collectionOpen}
        canAutoBuild={players.length > 0}
        onAutoBuild={() =>
          updateAccount((current) => ({
            ...current,
            squad: autoBuild(current.squad, syncOwned(current.club.players, byId)),
          }))
        }
        onToggleCollection={() => setCollectionOpen((open) => !open)}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onBadgeClick={(index) => setBadgeSlot(index)}
      />

      {formation.slots.map((slot) => {
        const cardId = squad.starters[slot.id] ?? null;
        const player = cardId ? (owned.get(cardId) ?? null) : null;

        return (
          <PitchSlot
            key={slot.id}
            slot={slot}
            player={player}
            dragging={drag?.cardId === cardId}
            over={over?.kind === 'slot' && over.id === slot.id}
            blocked={blockedSlot}
            onPointerDown={player ? pointerFor(player.id) : () => {}}
            onOpen={() => {
              // 200ms covers the click that follows a pointerup; anything slower is
              // a deliberate tap.
              if (Date.now() - draggedAt.current < 200) return;
              setPicking({ kind: 'slot', slot });
            }}
          />
        );
      })}

      <BenchStrip
        squad={squad}
        owned={owned}
        draggingId={drag?.cardId ?? null}
        overIndex={over?.kind === 'bench' ? Number.parseInt(over.id, 10) : null}
        onPointerDown={(cardId, event) => start(cardId, event)}
        onOpen={(index) => {
          if (Date.now() - draggedAt.current < 200) return;
          setPicking({ kind: 'bench', index });
        }}
      />

      {picking && (
        <SlotPicker
          label={picking.kind === 'slot' ? picking.slot.position : `ตัวสำรอง ${picking.index + 1}`}
          position={picking.kind === 'slot' ? picking.slot.position : null}
          players={players}
          inSquad={(cardId) => isInSquad(squad, cardId)}
          isDuplicate={(cardId) => duplicateOf(squad, owned, cardId) !== null}
          currentId={
            picking.kind === 'slot'
              ? (squad.starters[picking.slot.id] ?? null)
              : (squad.bench[picking.index] ?? null)
          }
          onPick={(cardId) => pickInto(picking, cardId)}
          onClear={() => {
            const current =
              picking.kind === 'slot'
                ? squad.starters[picking.slot.id]
                : squad.bench[picking.index];
            if (current) clearSlot(current);
          }}
          onClose={() => setPicking(null)}
          onHome={() => navigate('home')}
          onShop={() => navigate('shop')}
        />
      )}

      {collectionOpen && (
        <CollectionDrawer
          players={players}
          squad={squad}
          draggingId={drag?.cardId ?? null}
          onClose={() => setCollectionOpen(false)}
          onPointerDown={(cardId, event) => start(cardId, event)}
        />
      )}

      {/* The ghost lives outside the scaled stage (a portal to body) so it is placed in
          the same client pixels as the pointer. The hook moves it every frame with a
          transform; React does not re-render while it travels. */}
      {drag &&
        draggedPlayer &&
        ghostSize &&
        createPortal(
          <div
            ref={ghostRef}
            className={styles.ghost}
            style={{ width: ghostSize.width, height: ghostSize.height }}
          >
            <SquadCard
              player={draggedPlayer}
              scale={ghostSize.width / CARD_WIDTH}
              interactive={false}
            />
          </div>,
          document.body,
        )}

      {toast && <div className={styles.toast}>{toast}</div>}

      {badgeSlot !== null && (
        <BadgePicker
          slot={badgeSlot}
          squad={squad}
          owned={owned}
          onPick={(badgeId) => {
            const slot = badgeSlot;
            updateAccount((current) => ({ ...current, squad: equip(current.squad, slot, badgeId) }));
            setBadgeSlot(null);
          }}
          onClose={() => setBadgeSlot(null)}
        />
      )}

      {leaderboardOpen && (
        <LeaderboardScreen selfUid={account.id} onClose={() => setLeaderboardOpen(false)} />
      )}
    </>
  );
}
