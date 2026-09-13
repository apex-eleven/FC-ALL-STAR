import GameLayout from '@/components/layout/GameLayout';
import MobileGate from '@/components/layout/MobileGate';
import Stage from '@/components/layout/Stage';
import AuthScreen from '@/components/auth/AuthScreen';
import DraftScreen from '@/components/draft/DraftScreen';
import ClubScreen from '@/components/club/ClubScreen';
import LeagueScreen from '@/components/league/LeagueScreen';
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

  // The draft screen brings its own chrome — back button, screen title, home
  // shortcut — so it does not sit inside GameLayout's home chrome.
  if (route === 'draft') {
    return (
      <>
        <MobileGate />
        <Stage>
          <DraftScreen />
        </Stage>
      </>
    );
  }

  if (route === 'league') {
    return (
      <>
        <MobileGate />
        <Stage>
          <LeagueScreen />
        </Stage>
      </>
    );
  }

  if (route === 'club') {
    return (
      <>
        <MobileGate />
        <Stage>
          <ClubScreen />
        </Stage>
      </>
    );
  }

  return (
    <>
      <MobileGate />
      <GameLayout>
        <HomePage />
      </GameLayout>
    </>
  );
}
