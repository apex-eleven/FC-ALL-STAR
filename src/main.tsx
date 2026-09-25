import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/app/App';
import { AuthProvider } from '@/features/auth/AuthContext';
import { AvatarProvider } from '@/features/avatars/AvatarContext';
import { NewsProvider } from '@/features/news/NewsContext';
import { PlayerProvider } from '@/features/players/PlayerContext';
import { BadgeProvider } from '@/features/badges/BadgeContext';
import { MissionProvider } from '@/features/missions/MissionContext';
import { StarPassProvider } from '@/features/starpass/StarPassContext';
import { ItemsProvider } from '@/features/items/ItemsContext';
import { GachaProvider } from '@/features/gacha/GachaContext';
import { FusionProvider } from '@/features/fusion/FusionContext';
import { RedeemProvider } from '@/features/redeem/RedeemContext';
import { SpecialProvider } from '@/features/special/SpecialContext';
import { InboxProvider } from '@/features/notifications/InboxContext';
import { DailyLoginProvider } from '@/features/dailylogin/DailyLoginContext';
import { DraftProvider } from '@/features/draft/DraftContext';
import { CupProvider } from '@/features/cup/CupContext';
import { AnnouncementProvider } from '@/features/announcement/AnnouncementContext';
import { RankUpProvider } from '@/features/rankup/RankUpContext';
import { TransferProvider } from '@/features/transfers/TransferContext';
import { ShopProvider } from '@/features/shop/ShopContext';
import { ManagerProvider } from '@/features/manager/ManagerContext';
import { WalkoutProvider } from '@/features/walkout/WalkoutContext';
import { SoundProvider } from '@/features/sound/SoundContext';
import { NavigationProvider } from '@/features/navigation/NavigationContext';
import { applyFx, loadFx } from '@/features/fx/fx';
import { applyMotion, loadMotion } from '@/features/motion/motion';
import { restoreConfigFromRepo } from '@/features/backup/backup';
import { pullConfigFromCloud } from '@/features/cloud/cloudConfig';
import CloudConfigSync from '@/features/cloud/CloudConfigSync';
import '@/styles/globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

const root = createRoot(container);

// Sound wraps everything, including the sign-in screen: the click layer is attached
// by the provider, so anything mounted outside it would be silent.
//
// Players sits above drafts because a draft's pool is a list of card ids that the
// catalogue resolves — the packs cannot be built without it. Crests sit right under
// it: they add to the team rating that the cup and manager mode read. Star Pass and missions
// sit right under it (card rewards resolve there too) and above everything that
// counts toward them; missions give Star Pass XP, so the pass is outermost. Items
// sit between: the premium ticket needs the pass, manager mode needs the shield. The
// gachapon sits with them: its prizes are paid through the same reward path, and
// redeem codes, the inbox and the login calendar sit beside it for exactly the same
// reason.
function render() {
  root.render(
    <StrictMode>
      <SoundProvider>
        <AuthProvider>
          <AvatarProvider>
            <NewsProvider>
              <PlayerProvider>
                <BadgeProvider>
                  <StarPassProvider>
                    <GachaProvider>
                      <RedeemProvider>
                      <SpecialProvider>
                        <InboxProvider>
                          <DailyLoginProvider>
                            <ItemsProvider>
                              <MissionProvider>
                                <DraftProvider>
                                  <CupProvider>
                                    <WalkoutProvider>
                                      <RankUpProvider>
                                        <TransferProvider>
                                          <FusionProvider>
                                          <ShopProvider>
                                            <ManagerProvider>
                                              <NavigationProvider>
                                                <AnnouncementProvider>
                                                  <CloudConfigSync />
                                                  <App />
                                                </AnnouncementProvider>
                                              </NavigationProvider>
                                            </ManagerProvider>
                                          </ShopProvider>
                                          </FusionProvider>
                                        </TransferProvider>
                                      </RankUpProvider>
                                    </WalkoutProvider>
                                  </CupProvider>
                                </DraftProvider>
                              </MissionProvider>
                            </ItemsProvider>
                          </DailyLoginProvider>
                        </InboxProvider>
                      </SpecialProvider>
                      </RedeemProvider>
                    </GachaProvider>
                  </StarPassProvider>
                </BadgeProvider>
              </PlayerProvider>
            </NewsProvider>
          </AvatarProvider>
        </AuthProvider>
      </SoundProvider>
    </StrictMode>,
  );
}

// Before anything renders: these two attributes decide whether the first screen
// animates and how much it spends on looks.
applyMotion(loadMotion());
applyFx(loadFx());

/**
 * Fills an empty browser from public/config/admin.json, then renders.
 *
 * Every provider reads its storage as it mounts, so the restore cannot happen later:
 * rendering first would show defaults that are silently contradicted a frame after.
 * A promise chain rather than top-level await, so the build target does not have to
 * support TLA — and `render` is passed as both handlers, because a failed restore
 * must still start the game.
 */
/**
 * Two sources, in order of authority.
 *
 * The committed JSON fills an empty browser so the game always has settings, even
 * offline or with no Firebase at all. The cloud document then overwrites them,
 * because that is what "the admin edited it and everyone sees it" means — a stale
 * local copy must lose to the live one, or the first visit would pin a player to that
 * day's cards forever.
 *
 * Both are awaited before the first render: every provider reads its storage as it
 * mounts, so settings arriving a frame later would show defaults and then contradict
 * them. Failures on either side still render — a game that will not start because a
 * config fetch timed out is worse than one running on yesterday's settings.
 */
void restoreConfigFromRepo()
  .then(() => pullConfigFromCloud())
  .then(render, render);
