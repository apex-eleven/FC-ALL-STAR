/**
 * Every screen the app can show.
 *
 * The list is the runtime half of the type: anything reading a route out of storage
 * or admin config needs something to check it against, and a second hand-written
 * list would drift the first time a screen is added.
 */
export const ROUTE_IDS = ['home', 'draft', 'club', 'league', 'rankup', 'transfer', 'shop', 'manager', 'missions'] as const;

export type RouteId = (typeof ROUTE_IDS)[number];

export const DEFAULT_ROUTE: RouteId = 'home';
