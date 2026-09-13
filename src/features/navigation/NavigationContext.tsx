import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_ROUTE, type RouteId } from './routes';

interface NavigationValue {
  route: RouteId;
  /** Extra context for the current route — which draft event to open, and so on. */
  param: string | null;
  navigate(route: RouteId, param?: string): void;
  back(): void;
  canGoBack: boolean;
}

interface Entry {
  route: RouteId;
  param: string | null;
}

const NavigationContext = createContext<NavigationValue | null>(null);

export interface NavigationProviderProps {
  children: ReactNode;
  initialRoute?: RouteId;
}

/**
 * A stack, not a router. The game has no URLs to sync with and two screens to move
 * between, so pulling in a router would mean a dependency, a history integration,
 * and a base-path problem for the sake of one back button.
 *
 * Swap this for a real router when screens need to be linkable.
 */
export function NavigationProvider({
  children,
  initialRoute = DEFAULT_ROUTE,
}: NavigationProviderProps) {
  const [stack, setStack] = useState<Entry[]>([{ route: initialRoute, param: null }]);

  const navigate = useCallback((route: RouteId, param?: string) => {
    setStack((current) => {
      const top = current[current.length - 1];
      // Re-selecting the current screen replaces its param instead of stacking a
      // duplicate, so back always leaves rather than cycling.
      if (top && top.route === route) {
        return [...current.slice(0, -1), { route, param: param ?? null }];
      }
      return [...current, { route, param: param ?? null }];
    });
  }, []);

  const back = useCallback(() => {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const top = stack[stack.length - 1] ?? { route: DEFAULT_ROUTE, param: null };

  const value = useMemo<NavigationValue>(
    () => ({
      route: top.route,
      param: top.param,
      navigate,
      back,
      canGoBack: stack.length > 1,
    }),
    [top.route, top.param, navigate, back, stack.length],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be used inside a NavigationProvider');
  return value;
}
