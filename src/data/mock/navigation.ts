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
    id: 'rail-highlight',
    label: 'ไฮไลต์',
    artwork: ASSETS.brand.navHighlight,
  },
  {
    id: 'rail-starpass',
    label: 'STAR PASS',
    artwork: ASSETS.brand.navStarPass,
    artworkFile: 'currencylarge_BATTLEPASS_CREDIT.png',
  },
  {
    id: 'rail-overtime',
    label: 'ต่อเวลาพิเศษ',
    artwork: ASSETS.brand.navOvertime,
    badge: { variant: 'dot' },
  },
];

/** Fixed bottom bar, left to right. */
export const bottomNavItems: BottomNavItem[] = [
  { id: 'nav-missions', label: 'ภารกิจ', icon: 'missions' },
  { id: 'nav-league', label: 'ลีก', icon: 'league', badge: { variant: 'dot' } },
  { id: 'nav-contracts', label: 'การเซ็นสัญญา', icon: 'contracts' },
  { id: 'nav-rankup', label: 'ตีบวกการ์ด', icon: 'rankup', badge: { variant: 'dot' } },
  { id: 'nav-store', label: 'ร้านค้า', icon: 'store', badge: { variant: 'dot' }, active: true },
];
