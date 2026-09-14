import type { MusicTrack } from './types';

/**
 * Every background track the game can play.
 *
 * Files live in `public/music/`, not `src/assets/`, for the same reason card art
 * does: a track is content, not structure. Serving it from `public/` means swapping
 * a song is dropping a file and editing one line here, with no bundler hash to chase
 * and no rebuild for a file that was only ever going to be fetched at runtime.
 *
 * Adding a song:
 *   1. drop the file at public/music/<name>.mp3
 *   2. add an entry below
 * The settings menu grows a picker on its own the moment there is more than one.
 */
export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: 'time-bomb',
    title: 'Time-Bomb',
    artist: 'All Time Low',
    src: '/music/time-bomb.mp3',
  },
];

export const DEFAULT_TRACK_ID = MUSIC_TRACKS[0]?.id ?? '';

/**
 * Turns a stored id back into a track.
 *
 * Ids are what the config holds, so a song removed from the list above leaves every
 * player who had it selected pointing at nothing. Falling back to the first track
 * keeps those players with music rather than with silence they have to go and fix.
 */
export function resolveTrack(id: string): MusicTrack | null {
  return MUSIC_TRACKS.find((track) => track.id === id) ?? MUSIC_TRACKS[0] ?? null;
}

export function isKnownTrack(id: unknown): id is string {
  return typeof id === 'string' && MUSIC_TRACKS.some((track) => track.id === id);
}
