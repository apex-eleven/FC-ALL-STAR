import type { ReactNode } from 'react';
import HomePage from './HomePage';

export type RouteId =
  | 'home'
  | 'missions'
  | 'league'
  | 'contracts'
  | 'exchange'
  | 'store';

export interface RouteDefinition {
  id: RouteId;
  element: ReactNode;
}

/**
 * Flat route table. Phase 1 only resolves 'home'; the rest are declared so the
 * bottom navigation has real targets to point at in phase 2. No router dependency
 * until more than one screen exists.
 */
export const routes: RouteDefinition[] = [{ id: 'home', element: <HomePage /> }];

export const DEFAULT_ROUTE: RouteId = 'home';

export function resolveRoute(id: RouteId): ReactNode {
  return routes.find((route) => route.id === id)?.element ?? null;
}
