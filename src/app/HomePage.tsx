import { useMemo } from 'react';
import { club, hero, playCard } from '@/data/mock/home';
import { FEATURED_DRAFT_ID } from '@/data/mock/draft';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { useAccount } from '@/features/auth/AuthContext';
import { syncOwned } from '@/features/club/sync';
import { usePlayers } from '@/features/players/PlayerContext';
import { indexOwned } from '@/features/squad/squad';
import { useBadges } from '@/features/badges/BadgeContext';
import HeroSection from '@/components/home/HeroSection';
import NewsBanner from '@/components/home/NewsBanner';
import ClubCard from '@/components/home/ClubCard';
import PlayCard from '@/components/home/PlayCard';

/**
 * Composition only. Static values come from data/mock; the news banner reads its
 * slides from NewsContext because an admin can edit them at runtime.
 */
export default function HomePage() {
  const { navigate } = useNavigation();
  const account = useAccount();
  const { byId } = usePlayers();
  const { ratingOf } = useBadges();

  /**
   * Strength of the actual starting eleven, rank-up included and docked for anyone
   * out of position, plus any active crest bonus — the same number the club panel
   * shows, so the two screens cannot disagree. Cards are re-synced against the catalogue first, as
   * every other screen does, so an admin editing a card moves both at once.
   */
  const rating = useMemo(() => {
    const players = syncOwned(account.club.players, byId);
    const owned = indexOwned(players);
    // An empty/unfilled squad falls back to the catalogue number rather than showing 0.
    return ratingOf(account.squad, owned) || club.overallRating;
  }, [account.club.players, account.squad, byId, ratingOf]);

  return (
    <>
      <HeroSection
        content={hero}
        onCta={() => navigate('draft', FEATURED_DRAFT_ID)}
      />
      <NewsBanner onOpen={(draftId) => navigate('draft', draftId ?? FEATURED_DRAFT_ID)} />
      <ClubCard
        club={{ ...club, overallRating: rating }}
        playerCount={account.club.players.length}
        onClick={() => navigate('club')}
      />
      <PlayCard content={playCard} onClick={() => navigate('manager')} />
    </>
  );
}
