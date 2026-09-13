import { club, hero, playCard } from '@/data/mock/home';
import { FEATURED_DRAFT_ID } from '@/data/mock/draft';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { useAccount } from '@/features/auth/AuthContext';
import { clubRating } from '@/features/club/club';
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

  // OVR is derived from what the account actually owns, so pulling a good card on
  // the draft screen is visible on the home screen straight away. An empty club
  // falls back to the catalogue number rather than showing 0.
  const rating = clubRating(account.club) || club.overallRating;

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
