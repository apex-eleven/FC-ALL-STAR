import type { RouteId } from '@/features/navigation/routes';

/** Colour and icon treatment. Nothing about it changes behaviour. */
export type AnnouncementTone = 'info' | 'event' | 'warning';

/** Where the optional button sends the player. `none` hides the button. */
export type AnnouncementAction = 'none' | RouteId;

export interface AnnouncementConfig {
  enabled: boolean;
  /**
   * Bumped every time an admin publishes.
   *
   * This is what makes "show once" work across edits: a player who closed the last
   * notice has that revision stored on their device, so a fixed typo re-opens the
   * notice for everyone while an unchanged one stays closed.
   */
  revision: string;
  title: string;
  body: string;
  tone: AnnouncementTone;
  /** Banner image as a data URL, or '' for none. */
  image: string;
  /** ISO timestamps, or '' for no bound. */
  startAt: string;
  endAt: string;
  /**
   * Closed once and it stays closed on that device until the next publish.
   *
   * Off means it re-opens on every visit while it is live — right for a maintenance
   * warning, wrong for an event blurb.
   */
  once: boolean;
  action: AnnouncementAction;
  actionLabel: string;
}
