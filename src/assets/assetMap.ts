/**
 * Single point of truth for every image in the app.
 *
 * Components import ASSETS and never a file path. To swap a placeholder for real
 * artwork, drop the new file at the same path with the same name — no code change.
 * If the extension changes, this file is the only edit.
 *
 * Required slots and their aspect ratios: docs/UI_ANALYSIS.md section 13.
 */

import heroBackground from './images/backgrounds/hero-background.svg';
import halftone from './images/backgrounds/halftone.svg';
import pitchStadium from './images/backgrounds/pitch-stadium.webp';

// Hero key art: one full-frame 4:3 image. HeroArtwork crops a window out of it for
// the sharp figure layer; Stage reuses the same file, blurred, as the backdrop wash.
// Placement lives in data/mock/home.ts -> heroBackdrop, not in CSS.
import heroKeyArt from './images/home/hero-key-art.webp';
import newsNumero from './images/home/news-numero.webp';
import clubLogo from './images/home/club-logo.svg';

// Card backgrounds: 244x120, already composed with their own gradient and photo.
// The cards render them at cover and layer a scrim under the text.
import clubBackground from './images/home/card-club-bg.png';
import playBackground from './images/home/card-play-bg.png';

// Draft screen. Banner and thumbnails are admin-replaceable; the card frame and
// portraits are structural placeholders until real card art exists.
import draftBannerNumero10 from './images/draft/draft-banner-numero10.svg';
import draftThumbWorld from './images/draft/draft-thumb-world.svg';
import draftThumbNumero4 from './images/draft/draft-thumb-numero4.svg';
import draftThumbNumero10 from './images/draft/draft-thumb-numero10.svg';
import cardFrame from './images/draft/card-frame.svg';
// Pack pouch, 256x256 with the pouch itself at 150x232 in the centre. PackOpening
// tears the top strip off in CSS, so a replacement must keep the crimp inside the
// top 56px of the box or the rip will land in the middle of the artwork.
import packFoil from './images/draft/pack-foil.png';
import portraitA from './images/draft/portrait-a.svg';
import portraitB from './images/draft/portrait-b.svg';
import portraitC from './images/draft/portrait-c.svg';
import portraitD from './images/draft/portrait-d.svg';

import avatar from './images/brand/avatar.svg';

// Profile avatars. 128x128, square with their own frame — AvatarFrame clips them to
// a rounded square and draws nothing behind. One is an animated GIF.
import avatarRookie from './images/avatars/avatar-rookie.gif';
import avatarStriker from './images/avatars/avatar-striker.png';
import avatarKeeper from './images/avatars/avatar-keeper.png';
import avatarMaestro from './images/avatars/avatar-maestro.gif';
import avatarInferno from './images/avatars/avatar-inferno.png';
import avatarPhantom from './images/avatars/avatar-phantom.gif';
import avatarLegend from './images/avatars/avatar-legend.gif';
import avatarChampion from './images/avatars/avatar-champion.gif';

// Rail tile icons: 256x256 PNG, round medallion on a transparent background.
// Keep that shape when replacing — NavItem draws its own tile behind them.
// Currency icons: transparent PNG, already framed. CurrencyItem draws no ring.
import currencyExchange from './images/brand/currency-exchange.png';
import currencyGem from './images/brand/currency-gem.png';
import currencyFcPoint from './images/brand/currency-fcpoint.png';
import currencyTicket from './images/brand/currency-ticket.png';

import navActivities from './images/brand/nav-activities.png';
import navHighlight from './images/brand/nav-highlight.png';
import navStarPass from './images/brand/nav-starpass.png';
import navOvertime from './images/brand/nav-overtime.png';

export const ASSETS = {
  backgrounds: {
    heroBackground,
    halftone,
    pitchStadium,
  },
  home: {
    heroKeyArt,
    newsNumero,
    clubLogo,
    clubBackground,
    playBackground,
  },
  brand: {
    avatar,
    currencyExchange,
    currencyGem,
    currencyFcPoint,
    currencyTicket,
    navActivities,
    navHighlight,
    navStarPass,
    navOvertime,
  },
  draft: {
    bannerNumero10: draftBannerNumero10,
    thumbWorld: draftThumbWorld,
    thumbNumero4: draftThumbNumero4,
    thumbNumero10: draftThumbNumero10,
    cardFrame,
    packFoil,
    portraitA,
    portraitB,
    portraitC,
    portraitD,
  },
  avatars: {
    rookie: avatarRookie,
    striker: avatarStriker,
    keeper: avatarKeeper,
    maestro: avatarMaestro,
    inferno: avatarInferno,
    phantom: avatarPhantom,
    legend: avatarLegend,
    champion: avatarChampion,
  },
} as const;

/**
 * Slots still holding generated placeholder art. The four rail tile icons and the
 * avatar aside, everything below is waiting on real artwork.
 */
export const PLACEHOLDER_SLOTS = [
  'backgrounds.heroBackground',
  'backgrounds.halftone',
  'home.clubLogo',
  'draft.packFoil',
  'brand.avatar',
  'avatars.rookie',
  'avatars.striker',
  'avatars.keeper',
  'avatars.maestro',
  'avatars.inferno',
  'avatars.phantom',
  'avatars.legend',
] as const;
