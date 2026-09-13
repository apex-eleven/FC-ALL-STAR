import { ASSETS } from '@/assets/assetMap';
import type { DraftCatalogue } from '@/features/draft/types';

/**
 * Draft events, in left-rail order.
 *
 * An admin can rename an event, replace its artwork, retune its odds and pity
 * thresholds, and edit the pool. Overrides are stored separately so editing this
 * file stays meaningful. Keep ids stable — overrides and owned cards reference them.
 *
 * Pools ship EMPTY. They used to hold generated placeholders ("แชมเปี้ยน B2" and
 * friends) so the screen had something to draw before the card catalogue existed.
 * Now that packs are filled from the catalogue in the admin panel, those placeholders
 * were only ever noise — drawable, fieldable, and indistinguishable from real cards
 * at a glance. An event with no pool is simply not live until an admin fills it.
 *
 * `odds` are relative weights, not percentages: they are normalised at pull time, so
 * a set with nobody in it drops out of the roll instead of eating its share.
 *
 * The two pity rules are what the reference shows under the showcase: a "ชุด B or
 * better" guarantee every 10 pulls, and a "ชุด A" guarantee every 70.
 */
export const draftCatalogue: DraftCatalogue = [
  {
    id: 'draft-world-a',
    railName: 'สุดยอดของโลก: แชมเปี้ยนส์ A',
    title: 'ดราฟต์ สุดยอดของโลก A',
    thumbnail: ASSETS.draft.thumbWorld,
    banner: ASSETS.draft.bannerNumero10,
    hot: true,
    endsInDays: 12,
    odds: { A: 1, B: 7, C: 27, D: 65 },
    pity: [
      {
        id: 'draft-world-a-pity-b',
        set: 'B',
        threshold: 10,
        label: 'ชุด B',
        description: 'หรือรับประกันสูงกว่าใน:',
        tone: 'primary',
      },
      {
        id: 'draft-world-a-pity-a',
        set: 'A',
        threshold: 70,
        label: 'ชุด A',
        description: 'รับประกันใน:',
        tone: 'secondary',
      },
    ],
    packs: [
      { id: 'draft-world-a-pack-1', label: '1 ดราฟต์', cost: 1, currency: 'ticket', pulls: 1 },
      { id: 'draft-world-a-pack-10', label: '10 ดราฟต์', cost: 10, currency: 'ticket', pulls: 10 },
    ],
    pool: [],
  },
  {
    id: 'draft-numero-4b',
    railName: 'NUMERO 4 B',
    title: 'ดราฟต์ NUMERO 4 B',
    thumbnail: ASSETS.draft.thumbNumero4,
    banner: ASSETS.draft.bannerNumero10,
    hot: true,
    endsInDays: 8,
    odds: { A: 1, B: 7, C: 27, D: 65 },
    pity: [
      {
        id: 'draft-numero-4b-pity-b',
        set: 'B',
        threshold: 10,
        label: 'ชุด B',
        description: 'หรือรับประกันสูงกว่าใน:',
        tone: 'primary',
      },
      {
        id: 'draft-numero-4b-pity-a',
        set: 'A',
        threshold: 70,
        label: 'ชุด A',
        description: 'รับประกันใน:',
        tone: 'secondary',
      },
    ],
    packs: [
      { id: 'draft-numero-4b-pack-1', label: '1 ดราฟต์', cost: 1, currency: 'ticket', pulls: 1 },
      { id: 'draft-numero-4b-pack-10', label: '10 ดราฟต์', cost: 10, currency: 'ticket', pulls: 10 },
    ],
    pool: [],
  },
  {
    id: 'draft-numero-10a',
    railName: 'NUMERO 10 A',
    title: 'ดราฟต์ NUMERO 10 A',
    thumbnail: ASSETS.draft.thumbNumero10,
    banner: ASSETS.draft.bannerNumero10,
    hot: true,
    endsInDays: 5,
    odds: { A: 1, B: 7, C: 27, D: 65 },
    pity: [
      {
        id: 'draft-numero-10a-pity-b',
        set: 'B',
        threshold: 10,
        label: 'ชุด B',
        description: 'หรือรับประกันสูงกว่าใน:',
        tone: 'primary',
      },
      {
        id: 'draft-numero-10a-pity-a',
        set: 'A',
        threshold: 70,
        label: 'ชุด A',
        description: 'รับประกันใน:',
        tone: 'secondary',
      },
    ],
    packs: [
      { id: 'draft-numero-10a-pack-1', label: '1 ดราฟต์', cost: 1, currency: 'ticket', pulls: 1 },
      { id: 'draft-numero-10a-pack-10', label: '10 ดราฟต์', cost: 10, currency: 'ticket', pulls: 10 },
    ],
    pool: [],
  },
];

/** Which event the home screen's CTA and news banner open. */
export const FEATURED_DRAFT_ID = 'draft-numero-10a';
