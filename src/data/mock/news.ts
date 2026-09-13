import { ASSETS } from '@/assets/assetMap';
import type { NewsCatalogue } from '@/features/news/types';

/**
 * The four banner slides the game ships with, in carousel order.
 *
 * An admin can replace any heading or image at runtime; overrides are stored
 * separately so editing this file stays meaningful. Keep ids stable — they are what
 * the overrides are keyed by.
 *
 * `focus` is the artwork's `object-position`. The banner is 1.79:1 and this art is
 * 1.60:1, so the crop has to drop about 11% of the height; biasing upward keeps the
 * wordmark clear of the green heading strip.
 */
export const newsCatalogue: NewsCatalogue = [
  {
    id: 'news-1',
    heading: 'ดราฟต์สุดยอดของโลก: แชมเปี้ยนส์ A',
    draftId: 'draft-world-a',
    artwork: ASSETS.home.newsNumero,
    focus: '50% 18%',
  },
  {
    id: 'news-2',
    heading: 'ดราฟต์ NUMERO 4 B',
    draftId: 'draft-numero-4b',
    artwork: ASSETS.home.newsNumero,
    focus: '50% 18%',
  },
  {
    id: 'news-3',
    heading: 'ดราฟต์ NUMERO 10 A',
    draftId: 'draft-numero-10a',
    artwork: ASSETS.home.newsNumero,
    focus: '50% 18%',
  },
  {
    id: 'news-4',
    heading: 'ดราฟต์สุดยอดของโลก: แชมเปี้ยนส์ D',
    draftId: 'draft-world-a',
    artwork: ASSETS.home.newsNumero,
    focus: '50% 18%',
  },
];
