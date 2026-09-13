import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import AdminPanel from '@/components/admin/AdminPanel';
import AvatarPicker from '@/components/profile/AvatarPicker';
import SettingsMenu from './SettingsMenu';
import Stage from './Stage';
import TopBar from './TopBar';
import LeftNavigation from './LeftNavigation';
import BottomNavigation from './BottomNavigation';

export interface GameLayoutProps {
  children: ReactNode;
}

type Overlay = 'none' | 'avatars' | 'admin' | 'settings';

/**
 * Screen content plus the three persistent chrome regions. Content is passed as
 * children and positions itself on the same stage.
 */
export default function GameLayout({ children }: GameLayoutProps) {
  const { isAdmin } = useAuth();
  const [overlay, setOverlay] = useState<Overlay>('none');

  const close = () => setOverlay('none');

  return (
    <Stage>
      {children}

      <TopBar
        onAvatarClick={() => setOverlay('avatars')}
        onSettingsClick={() => setOverlay((current) => (current === 'settings' ? 'none' : 'settings'))}
        onAdminClick={isAdmin ? () => setOverlay('admin') : undefined}
      />
      <LeftNavigation />
      <BottomNavigation />

      {overlay === 'settings' && <SettingsMenu onClose={close} />}
      {overlay === 'avatars' && <AvatarPicker onClose={close} />}
      {overlay === 'admin' && isAdmin && <AdminPanel onClose={close} />}
    </Stage>
  );
}
