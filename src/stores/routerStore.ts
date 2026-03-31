import { create } from 'zustand';

// ─── Route Definitions ──────────────────────────────────────────────────────

export const ROUTES = {
  MENU: '/',
  STARTER_SELECT: '/starter-select',
  RUN: '/run',
  COMBAT: '/combat',
  SHOP: '/shop',
  REST: '/rest',
  EVENT: '/event',
  RECRUIT: '/recruit',
  GAME_OVER: '/game-over',
  DATABASE: '/database',
  SETTINGS: '/settings',
  CREDITS: '/credits',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

// ─── Navigation State ───────────────────────────────────────────────────────

interface RouterState {
  /** Current route path */
  currentRoute: RoutePath;
  /** Previous route (for back navigation) */
  previousRoute: RoutePath | null;
  /** Whether navigation is in progress */
  isNavigating: boolean;
  /** Set the current route */
  setCurrentRoute: (route: RoutePath) => void;
  /** Navigate to a route (updates state) */
  navigateTo: (route: RoutePath) => void;
  /** Go back to previous route */
  goBack: () => void;
  /** Set navigating state */
  setNavigating: (value: boolean) => void;
}

export const useRouterStore = create<RouterState>((set, get) => ({
  currentRoute: ROUTES.MENU,
  previousRoute: null,
  isNavigating: false,

  setCurrentRoute: (route) =>
    set((state) => ({
      currentRoute: route,
      previousRoute: state.currentRoute,
    })),

  navigateTo: (route) => {
    set((state) => ({
      currentRoute: route,
      previousRoute: state.currentRoute,
      isNavigating: false,
    }));
  },

  goBack: () => {
    const { previousRoute } = get();
    if (previousRoute) {
      set((state) => ({
        currentRoute: state.previousRoute!,
        previousRoute: state.currentRoute,
      }));
    }
  },

  setNavigating: (value) => set({ isNavigating: value }),
}));
