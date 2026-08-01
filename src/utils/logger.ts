type LogDetails = unknown[];

const debugEnabled = import.meta.env.DEV;

function safeDetails(details: LogDetails): LogDetails {
  return details.map((detail) => {
    if (detail instanceof Error) return { name: detail.name, message: detail.message };
    if (typeof detail === 'string') return detail.slice(0, 1_024);
    return detail;
  });
}

export const logger = {
  debug(message: string, ...details: LogDetails): void {
    if (debugEnabled) console.debug(message, ...safeDetails(details));
  },
  info(message: string, ...details: LogDetails): void {
    if (debugEnabled) console.info(message, ...safeDetails(details));
  },
  warn(message: string, ...details: LogDetails): void {
    if (debugEnabled) console.warn(message, ...safeDetails(details));
  },
  error(message: string, ...details: LogDetails): void {
    if (debugEnabled) console.error(message, ...safeDetails(details));
  },
};
