export function getLogLevelClass(level: string): string {
  return ['error', 'warn', 'info', 'debug'].includes(level)
    ? `admin-log-level--${level}`
    : 'admin-log-level--default';
}
