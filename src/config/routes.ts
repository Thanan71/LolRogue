// Central route definitions. React Router is the sole navigation state owner.

export const ROUTES = {
  MENU: '/',
  AUTH: '/auth',
  STARTER_SELECT: '/starter-select',
  DAILY_RUN: '/daily-run',
  RUN: '/run',
  COMBAT: '/combat',
  SHOP: '/shop',
  REST: '/rest',
  EVENT: '/event',
  RECRUIT: '/recruit',
  TREASURE: '/treasure',
  GAME_OVER: '/game-over',
  DATABASE: '/database',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  CREDITS: '/credits',
  RULES: '/rules',
  ADMIN: '/admin',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
