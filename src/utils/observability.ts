import { dbLogger } from './dbLogger';
import { sanitizeLogDetails, sanitizeLogText } from './logSanitizer';

export type TechnicalEvent =
  | { type: 'frontend_error'; source: string; message: string }
  | { type: 'save_failure'; reason: string; retryable: boolean }
  | { type: 'retry'; operation: string; attempt: number }
  | { type: 'asset_failure'; assetKind: string; cacheKey: string }
  | { type: 'rehydration_error'; store: string; reason: string }
  | {
      type: 'transition_duration';
      transition: string;
      durationMs: number;
      outcome: 'ok' | 'error';
    };

export interface CorrelationContext {
  runId?: string | null;
  commandId?: string | null;
}

export interface ObservedTechnicalEvent {
  timestamp: number;
  event: TechnicalEvent;
  correlation: CorrelationContext;
}

const MAX_HISTORY = 200;
const MAX_PER_TYPE_PER_MINUTE = 20;
const history: ObservedTechnicalEvent[] = [];
const windows = new Map<TechnicalEvent['type'], number[]>();
let activeCorrelation: CorrelationContext = {};

function withinBudget(type: TechnicalEvent['type'], now: number): boolean {
  const recent = (windows.get(type) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= MAX_PER_TYPE_PER_MINUTE) {
    windows.set(type, recent);
    return false;
  }
  recent.push(now);
  windows.set(type, recent);
  return true;
}

function sanitizeEvent(event: TechnicalEvent): TechnicalEvent {
  return sanitizeLogDetails(
    event as unknown as Record<string, unknown>,
  ) as unknown as TechnicalEvent;
}

export function recordTechnicalEvent(
  event: TechnicalEvent,
  correlation: CorrelationContext = activeCorrelation,
): boolean {
  const now = Date.now();
  if (!withinBudget(event.type, now)) return false;
  const safeEvent = sanitizeEvent(event);
  const safeCorrelation = {
    runId: correlation.runId ? sanitizeLogText(correlation.runId, 100) : undefined,
    commandId: correlation.commandId ? sanitizeLogText(correlation.commandId, 100) : undefined,
  };
  history.push({ timestamp: now, event: safeEvent, correlation: safeCorrelation });
  history.splice(0, Math.max(0, history.length - MAX_HISTORY));

  dbLogger.log({
    level: event.type.endsWith('error') || event.type === 'save_failure' ? 'error' : 'info',
    repository: 'client_observability',
    method: event.type,
    operation: 'other',
    details: { ...safeEvent, ...safeCorrelation },
  });
  return true;
}

export function measureTransition(
  transition: string,
  correlation: CorrelationContext = {},
): (outcome?: 'ok' | 'error') => void {
  const startedAt = performance.now();
  return (outcome = 'ok') =>
    recordTechnicalEvent(
      {
        type: 'transition_duration',
        transition,
        durationMs: Math.max(0, performance.now() - startedAt),
        outcome,
      },
      correlation,
    );
}

export function getTechnicalEvents(): readonly ObservedTechnicalEvent[] {
  return [...history];
}

export function resetTechnicalEvents(): void {
  history.length = 0;
  windows.clear();
  activeCorrelation = {};
}

export function setTechnicalCorrelation(correlation: CorrelationContext): void {
  activeCorrelation = {
    runId: correlation.runId ?? undefined,
    commandId: correlation.commandId ?? undefined,
  };
}

export function installGlobalErrorCapture(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onError = (event: ErrorEvent) => {
    recordTechnicalEvent({
      type: 'frontend_error',
      source: 'window_error',
      message: event.error instanceof Error ? event.error.message : event.message,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordTechnicalEvent({
      type: 'frontend_error',
      source: 'unhandled_rejection',
      message: event.reason instanceof Error ? event.reason.message : 'Unhandled promise rejection',
    });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
