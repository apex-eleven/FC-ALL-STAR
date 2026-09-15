import { useMemo } from 'react';
import { club, hero, playCard } from '@/data/mock/home';
import { FEATURED_DRAFT_ID } from '@/data/mock/draft';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { useAccount } from '@/features/auth/AuthContext';
import { syncOwned } from '@/features/club/sync';
import { usePlayers } from '@/features/players/PlayerContext';
import { indexOwned, squadRating } from '@/features/squad/squad';
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

  /**
   * The same number the squad panel and the league table show.
   *
   * It used to be the average of the best eleven cards owned, which is a different
   * question — it ignores who is actually picked and the penalty for playing a card
   * out of position. The two answers happened to agree while every card was worth
   * its printed rating; rank-up bonuses pulled them apart, and the home tile started
   * claiming an OVR the club screen disagreed with.
   *
   * Cards are re-synced against the catalogue first, exactly as the club and league
   * screens do, so an admin editing a card moves all three together.
   */
  const rating = useMemo(() => {
    const owned = indexOwned(syncOwned(account.club.players, byId));
    // An empty club falls back to the catalogue number rather than showing 0.
    return squadRating(account.squad, owned) || club.overallRating;
  }, [account.club.players, account.squad, byId]);

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
      <PlayCard content={playCard} />
    </>
  );
}
