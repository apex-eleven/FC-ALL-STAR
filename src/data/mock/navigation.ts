import { ASSETS } from '@/assets/assetMap';
import type { BottomNavItem, RailItem } from '@/features/navigation/types';

/** Left vertical rail, top to bottom. */
export const railItems: RailItem[] = [
  {
    id: 'rail-activities',
    label: 'กิจกรรม',
    artwork: ASSETS.brand.navActivities,
    badge: { variant: 'gift' },
  },
  {
    id: 'rail-redeem',
    label: 'แลกโค้ด',
    artwork: ASSETS.brand.navHighlight,
  },
  {
    id: 'rail-starpass',
    label: 'STAR PASS',
    artwork: ASSETS.brand.navStarPass,
    artworkFile: 'currencylarge_BATTLEPASS_CREDIT.png',
  },
  {
    id: 'rail-fusion',
    label: 'ผสมการ์ด',
    // Replaced at render time by the admin's uploaded icon when one is set — see
    // LeftNavigation. This is only what the tile shows before anything is uploaded.
    artwork: ASSETS.brand.navOvertime,
  },
  {
    id: 'rail-bag',
    label: 'กระเป๋า',
    artwork: ASSETS.brand.navBag,
  },
];

/** Fixed bottom bar, left to right. */
export const bottomNavItems: BottomNavItem[] = [
  { id: 'nav-missions', label: 'ภารกิจ', icon: 'missions' },
  { id: 'nav-league', label: 'ลีก', icon: 'league' },
  { id: 'nav-contracts', label: 'การเซ็นสัญญา', icon: 'contracts' },
  { id: 'nav-rankup', label: 'ตีบวกการ์ด', icon: 'rankup' },
  { id: 'nav-store', label: 'ร้านค้า', icon: 'store', active: true },
];
