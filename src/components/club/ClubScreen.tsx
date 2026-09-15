import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import { ASSETS } from '@/assets/assetMap';
import { useAccount, useAuth } from '@/features/auth/AuthContext';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { usePlayers } from '@/features/players/PlayerContext';
import { clubRating } from '@/features/club/club';
import { syncOwned } from '@/features/club/sync';
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
import IconButton from '@/components/ui/IconButton';
import ClubPanel from './ClubPanel';
import PitchSlot from './PitchSlot';
import BenchStrip from './BenchStrip';
import CollectionDrawer from './CollectionDrawer';
import SlotPicker from './SlotPicker';
import SquadCard from './SquadCard';
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
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // A drag that ends on the slot it started from still fires a click. Without this
  // the picker would open every time a card was put back where it came from.
  const draggedAt = useRef(0);

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

  const { drag, over, start } = useCardDrag(handleDrop);

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

  // Same function as the home tile, so the badge reads the same on both screens.
  const rating = useMemo(() => clubRating({ players }), [players]);
  const value = squadValue(squad, owned);

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
      </header>

      <ClubPanel
        name="ทีมของฉัน"
        rating={rating}
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

      {/* The ghost follows the pointer in client pixels, outside the scaled stage, so
          it tracks the cursor exactly whatever the stage scale happens to be. */}
      {drag && draggedPlayer && (
        <div
          className={styles.ghost}
          style={{ left: drag.x, top: drag.y }}
        >
          <SquadCard player={draggedPlayer} scale={1.15} interactive={false} />
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
