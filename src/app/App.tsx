import type { ReactNode } from 'react';
import GameLayout from '@/components/layout/GameLayout';
import MobileGate from '@/components/layout/MobileGate';
import Stage from '@/components/layout/Stage';
import AnnouncementOverlay from '@/components/announcement/AnnouncementOverlay';
import AuthScreen from '@/components/auth/AuthScreen';
import DraftScreen from '@/components/draft/DraftScreen';
import ClubScreen from '@/components/club/ClubScreen';
import LeagueScreen from '@/components/league/LeagueScreen';
import RankUpScreen from '@/components/rankup/RankUpScreen';
import TransferScreen from '@/components/transfer/TransferScreen';
import ShopScreen from '@/components/shop/ShopScreen';
import ManagerScreen from '@/components/manager/ManagerScreen';
import MissionScreen from '@/components/missions/MissionScreen';
import StarPassScreen from '@/components/starpass/StarPassScreen';
import BagScreen from '@/components/items/BagScreen';
import GachaScreen from '@/components/gacha/GachaScreen';
import { useAuth } from '@/features/auth/AuthContext';
import { useNavigation } from '@/features/navigation/NavigationContext';
import HomePage from './HomePage';

export default function App() {
  // Rendered beside whatever screen is up, not around it: the gate is fixed and
  // covers the viewport itself, so it does not need to own the tree to work.
  const { status } = useAuth();
  const { route } = useNavigation();

  // Reading the stored account is synchronous in practice, so this frame is brief.
  if (status === 'loading') {
    return (
      <>
        <MobileGate />
        <Stage dimmed />
      </>
    );
  }

  if (status === 'signed-out') {
    return (
      <>
        <MobileGate />
        <Stage dimmed>
          <AuthScreen />
        </Stage>
      </>
    );
  }

  /**
   * The screen for the current route.
   *
   * Draft, league, rank-up and club bring their own chrome — back button, screen
   * title, home shortcut — so they sit directly in the stage rather than inside
   * GameLayout's home chrome.
   */
  let screen: ReactNode;
  if (route === 'draft') {
    screen = (
      <Stage>
        <DraftScreen />
      </Stage>
    );
  } else if (route === 'league') {
    screen = (
      <Stage>
        <LeagueScreen />
      </Stage>
    );
  } else if (route === 'rankup') {
    screen = (
      <Stage>
        <RankUpScreen />
      </Stage>
    );
  } else if (route === 'transfer') {
    screen = (
      <Stage>
        <TransferScreen />
      </Stage>
    );
  } else if (route === 'shop') {
    screen = (
      <Stage>
        <ShopScreen />
      </Stage>
    );
  } else if (route === 'manager') {
    screen = (
      <Stage>
        <ManagerScreen />
      </Stage>
    );
  } else if (route === 'missions') {
    screen = (
      <Stage>
        <MissionScreen />
      </Stage>
    );
  } else if (route === 'starpass') {
    screen = (
      <Stage>
        <StarPassScreen />
      </Stage>
    );
  } else if (route === 'bag') {
    screen = (
      <Stage>
        <BagScreen />
      </Stage>
    );
  } else if (route === 'gacha') {
    screen = (
      <Stage>
        <GachaScreen />
      </Stage>
    );
  } else if (route === 'club') {
    screen = (
      <Stage>
        <ClubScreen />
      </Stage>
    );
  } else {
    screen = (
      <GameLayout>
        <HomePage />
      </GameLayout>
    );
  }

  // The announcement is mounted once here rather than per screen: it is fixed to the
  // viewport and has to reach a signed-in player wherever they happen to be. It
  // renders nothing at all unless an admin has one live.
  return (
    <>
      <MobileGate />
      {screen}
      <AnnouncementOverlay />
    </>
  );
}
