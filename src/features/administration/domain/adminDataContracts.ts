export type AdminTab =
  | 'dashboard'
  | 'authority'
  | 'logs'
  | 'players'
  | 'runs'
  | 'analytics'
  | 'balance'
  | 'moderation';
export type AdminDataSection = 'stats';
export type AdminDataErrors = Record<AdminDataSection, string | null>;

export type AdminStats = Record<string, string | null>;
