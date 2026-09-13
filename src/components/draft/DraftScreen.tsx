import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ASSETS } from '@/assets/assetMap';
import { useDraft } from '@/features/draft/DraftContext';
import { useDraftRun } from '@/features/draft/useDraftRun';
import type { PullOutcome } from '@/features/draft/pull';
import type { DraftPack } from '@/features/draft/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import DraftTopBar from './DraftTopBar';
import DraftEventRail from './DraftEventRail';
import DraftShowcase from './DraftShowcase';
import DraftGuarantees from './DraftGuarantees';
import DraftActions from './DraftActions';
import DraftResult from './DraftResult';
import PackOpening from './PackOpening';
import WalkoutOverlay from '@/components/walkout/WalkoutOverlay';
import { pickWalkout, useWalkout } from '@/features/walkout/WalkoutContext';
import styles from './DraftScreen.module.css';

const RUN_ERROR: Record<string, string> = {
  'empty-pool': 'ดราฟต์นี้ยังไม่มีนักเตะในพูล',
  'insufficient-funds': 'ตั๋วดราฟต์ไม่พอ',
  'limit-reached': 'ซื้อแพ็คนี้ครบตามจำนวนที่จำกัดไว้แล้ว',
  'not-live': 'ดราฟต์นี้ปิดรับแล้ว',
};

export default function DraftScreen() {
  const { param } = useNavigation();
  // Only live events reach the player. Hidden ones, ones outside their window, and
  // ones with an empty pool are configuration in progress, not shop stock.
  const { liveEvents: events } = useDraft();
  const { countersFor, run, totalPulls, remainingOf } = useDraftRun();
  const { config } = useWalkout();
  const [selectedId, setSelectedId] = useState<string | null>(param);
  const [outcomes, setOutcomes] = useState<PullOutcome[] | null>(null);
  const [walkout, setWalkout] = useState<PullOutcome | null>(null);
  // What was drawn, waiting behind the pack. Held separately from `outcomes` so the
  // grid and the walkout stay hidden until the player has torn it open.
  const [pack, setPack] = useState<PullOutcome[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // A deep link that arrives after mount, or an event removed by an admin, both
  // resolve here rather than leaving the screen blank.
  const selected = useMemo(
    () => events.find((event) => event.id === selectedId) ?? events[0],
    [events, selectedId],
  );

  useEffect(() => {
    if (param && events.some((event) => event.id === param)) setSelectedId(param);
  }, [param, events]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Every draft can be hidden or expire, and an admin mid-setup will see exactly
  // that. Better than a blank screen with no explanation.
  if (!selected) {
    return (
      <>
        <div
          className={styles.backdrop}
          style={{ '--halftone-url': `url(${ASSETS.backgrounds.halftone})` } as CSSProperties}
        />
        <DraftTopBar title="ดราฟต์" />
        <p className={styles.tally}>ตอนนี้ยังไม่มีดราฟต์ที่เปิดให้เล่น</p>
      </>
    );
  }

  const counters = countersFor(selected);

  function pull(pack: DraftPack) {
    if (!selected) return;
    const result = run(selected, pack);

    if (!result.ok) {
      setToast(RUN_ERROR[result.error ?? ''] ?? 'สุ่มไม่สำเร็จ');
      return;
    }

    // The cards are already in the club at this point. The pack is presentation on
    // top of a finished transaction, which is why skipping it cannot lose anything.
    setPack(result.outcomes);
  }

  /**
   * The pack has been opened (or skipped). The walkout runs first and the grid
   * follows, so a ten-pull that contained one special card still ends on the full
   * list of what was drawn.
   */
  function revealPack(drawn: PullOutcome[]) {
    setPack(null);
    setOutcomes(drawn);
    setWalkout(pickWalkout(drawn, config));
  }

  return (
    <>
      <div
        className={styles.backdrop}
        style={{ '--halftone-url': `url(${ASSETS.backgrounds.halftone})` } as CSSProperties}
      />
      <div className={styles.texture} aria-hidden="true" />

      <DraftTopBar title="ดราฟต์" />
      <DraftEventRail events={events} selectedId={selected.id} onSelect={setSelectedId} />
      <DraftShowcase event={selected} />
      <DraftGuarantees pity={selected.pity} counters={counters} />
      <DraftActions
        packs={selected.packs}
        onPull={pull}
        remainingFor={(pack) => remainingOf(selected.id, pack)}
      />

      <p className={styles.tally}>เปิดไปแล้ว {totalPulls(selected.id)} ครั้ง</p>

      {pack && <PackOpening outcomes={pack} onOpened={() => revealPack(pack)} />}
      {!pack && walkout && (
        <WalkoutOverlay outcome={walkout} onFinish={() => setWalkout(null)} />
      )}
      {!pack && !walkout && outcomes && (
        <DraftResult outcomes={outcomes} onClose={() => setOutcomes(null)} />
      )}
      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
