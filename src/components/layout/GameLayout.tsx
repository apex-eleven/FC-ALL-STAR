import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useDailyLogin } from '@/features/dailylogin/DailyLoginContext';
import { useNavigation } from '@/features/navigation/NavigationContext';
import AdminPanel from '@/components/admin/AdminPanel';
import DailyLoginOverlay from '@/components/dailylogin/DailyLoginOverlay';
import AvatarPicker from '@/components/profile/AvatarPicker';
import SettingsMenu from './SettingsMenu';
import Stage from './Stage';
import TopBar from './TopBar';
import LeftNavigation from './LeftNavigation';
import BottomNavigation from './BottomNavigation';

export interface GameLayoutProps {
  children: ReactNode;
}

type Overlay = 'none' | 'avatars' | 'admin' | 'settings' | 'login';

/**
 * Screen content plus the three persistent chrome regions. Content is passed as
 * children and positions itself on the same stage.
 */
export default function GameLayout({ children }: GameLayoutProps) {
  const { isAdmin } = useAuth();
  const { navigate } = useNavigation();
  const { shouldPrompt } = useDailyLogin();
  // The login calendar opens by itself the first time home is shown with today's
  // tile unclaimed. Read once at mount: a prompt that could re-fire on every render
  // would snap the calendar back open under whatever the player opened next.
  const [overlay, setOverlay] = useState<Overlay>(() => (shouldPrompt ? 'login' : 'none'));

  const close = () => setOverlay('none');

  return (
    <Stage>
      {children}

      <TopBar
        onAvatarClick={() => setOverlay('avatars')}
        onMailClick={() => navigate('inbox')}
        onSettingsClick={() => setOverlay((current) => (current === 'settings' ? 'none' : 'settings'))}
        onAdminClick={isAdmin ? () => setOverlay('admin') : undefined}
      />
      <LeftNavigation />
      <BottomNavigation />

      {overlay === 'settings' && <SettingsMenu onClose={close} />}
      {overlay === 'avatars' && <AvatarPicker onClose={close} />}
      {overlay === 'admin' && isAdmin && <AdminPanel onClose={close} />}
      {overlay === 'login' && <DailyLoginOverlay onClose={close} />}
    </Stage>
  );
}
