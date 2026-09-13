import { ASSETS } from '@/assets/assetMap';
import type { AvatarCatalogue } from '@/features/avatars/types';

/**
 * Every avatar the game ships with, in picker order.
 *
 * `defaultRequiredLevel` is the authored requirement. An admin can override it at
 * runtime from the admin panel; the override is stored separately so editing this
 * file stays meaningful. Keep ids stable — they are what accounts persist.
 */
export const avatarCatalogue: AvatarCatalogue = [
  {
    id: 'rookie',
    name: 'ดาวรุ่ง',
    source: ASSETS.avatars.rookie,
    defaultRequiredLevel: 1,
  },
  {
    id: 'striker',
    name: 'กองหน้า',
    source: ASSETS.avatars.striker,
    defaultRequiredLevel: 5,
  },
  {
    id: 'keeper',
    name: 'ผู้พิทักษ์',
    source: ASSETS.avatars.keeper,
    defaultRequiredLevel: 10,
  },
  {
    id: 'maestro',
    name: 'จอมทัพ',
    source: ASSETS.avatars.maestro,
    defaultRequiredLevel: 20,
  },
  {
    id: 'inferno',
    name: 'เพลิงสังหาร',
    source: ASSETS.avatars.inferno,
    defaultRequiredLevel: 30,
  },
  {
    id: 'phantom',
    name: 'เงามรณะ',
    source: ASSETS.avatars.phantom,
    defaultRequiredLevel: 40,
  },
  {
    id: 'champion',
    name: 'แชมเปี้ยน 50',
    source: ASSETS.avatars.champion,
    defaultRequiredLevel: 50,
    animated: true,
  },
  {
    id: 'legend',
    name: 'ตำนาน',
    source: ASSETS.avatars.legend,
    defaultRequiredLevel: 65,
  },
];
