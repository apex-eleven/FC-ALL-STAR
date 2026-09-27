import { checkUsername, isAdminUsername } from '@/features/auth/constants';

/**
 * Login IDs that read like the ones Thai players actually type.
 *
 * Latin only on purpose: the signup rule (`USERNAME_PATTERN`) accepts letters and
 * digits but not combining marks, so a Thai name with a tone mark (น้อง, ต้น) can never
 * be a real player's ID — a bot using one would be the only account in the game that
 * could.
 */

const BASES = [
  'bank', 'boss', 'ton', 'mike', 'arm', 'tee', 'nut', 'aof', 'golf', 'beer', 'earth', 'film',
  'fluke', 'game', 'jay', 'kong', 'max', 'new', 'oat', 'pond', 'toey', 'win', 'top', 'palm',
  'bew', 'best', 'first', 'guy', 'ice', 'james', 'jo', 'kit', 'knot', 'mark', 'mos', 'nine',
  'north', 'pete', 'peach', 'pun', 'sun', 'tar', 'tle', 'view', 'yo', 'zen', 'tae', 'bom',
  'kan', 'pee', 'nong', 'ohm', 'art', 'champ', 'dome', 'fai', 'gun', 'harn', 'jom', 'man',
  'por', 'tong', 'benz', 'bas', 'poom', 'kla', 'moo', 'nick', 'tan', 'weerawat', 'kittipong',
  'somchai', 'thanakorn', 'pakorn', 'chayut', 'nattapong', 'apichat', 'wuttichai', 'sarawut',
];

const TAGS = [
  'fc', 'zaa', 'gg', 'pro', 'king', 'ball', 'goal', 'kick', 'x', 'th', 'za', 'dz', 'ez',
  'boy', 'man', 'z', 'jr', 'ace', 'hero', 'noob', 'lnw', 'kub', 'ja',
];

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length) % list.length]!;
}

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function digits(rng: () => number): string {
  const roll = rng();
  if (roll < 0.25) return String(Math.floor(rng() * 90) + 10); // 27
  if (roll < 0.45) return String(1990 + Math.floor(rng() * 20)).slice(2); // 04
  if (roll < 0.6) return pick(['007', '99', '69', '88', '123', '555', '2k', '11', '10'], rng);
  if (roll < 0.75) return String(Math.floor(rng() * 900) + 100); // 482
  return '';
}

/** One candidate name. Not guaranteed free — `uniqueNames` checks that. */
export function randomName(rng: () => number = Math.random): string {
  const base = pick(BASES, rng);
  const style = rng();
  let name: string;

  if (style < 0.2) name = `${capital(base)}${digits(rng) || pick(TAGS, rng)}`;
  else if (style < 0.35) name = `${base}_${pick(TAGS, rng)}`;
  else if (style < 0.5) name = `${capital(base)}${capital(pick(TAGS, rng))}`;
  else if (style < 0.62) name = `${base}.${pick(TAGS, rng)}${digits(rng)}`;
  else if (style < 0.72) name = `${capital(base)}_${capital(pick(BASES, rng))}`;
  else if (style < 0.82) name = `${base}${base.slice(-1)}${base.slice(-1)}${digits(rng)}`;
  else if (style < 0.9) name = `${pick(TAGS, rng)}${capital(base)}${digits(rng)}`;
  else name = `${base}${digits(rng) || '99'}`;

  // Trimmed to the signup limit, never cut on a separator.
  return name.slice(0, 16).replace(/[._-]+$/, '');
}

/**
 * `count` distinct names that pass the signup rules and are not in `taken`
 * (lowercase). Gives up quietly after enough tries rather than looping forever.
 */
export function uniqueNames(count: number, taken: ReadonlySet<string>, rng: () => number = Math.random): string[] {
  const out: string[] = [];
  const seen = new Set(taken);
  let tries = 0;
  while (out.length < count && tries < count * 60) {
    tries += 1;
    const name = randomName(rng);
    const key = name.toLowerCase();
    if (seen.has(key) || checkUsername(name) !== null || isAdminUsername(name)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
