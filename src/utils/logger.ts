type LogDetails = unknown[];

const debugEnabled = import.meta.env.DEV;

export const logger = {
  debug(message: string, ...details: LogDetails): void {
    if (debugEnabled) console.debug(message, ...details);
  },
  info(message: string, ...details: LogDetails): void {
    if (debugEnabled) console.info(message, ...details);
  },
  warn(message: string, ...details: LogDetails): void {
    console.warn(message, ...details);
  },
  error(message: string, ...details: LogDetails): void {
    console.error(message, ...details);
  },
};
