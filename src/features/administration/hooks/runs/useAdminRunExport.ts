import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import { locale } from '@/i18n/fr';
import type { Json } from '@/types/database';
import type { AdminExplorerScope } from '../../domain/explorer/adminExplorerTypes';
import { ADMIN_REQUEST_TIMEOUT_MS } from '../useAdminSection';
import { buildAdminRunExplorerCsv } from '../../domain/runs/adminRunCsv';
import {
  ADMIN_RUN_EXPORT_CAP,
  AdminRunExportError,
  validateRunExport,
} from '../../domain/runs/adminRunExport';
import { downloadAdminExplorerCsv } from '../../infrastructure/runs/adminRunDownload';
import type { AdminRunPopulation } from '../../domain/runs/adminRunFilters';
import { type AdminRunListItem } from '../../domain/runs/adminRunContracts';
import { fetchAdminRunExport } from '../../infrastructure/runs/adminRunQueries';

export function useAdminRunExport({
  access,
  queryKey,
  population,
  filters,
  items,
  total,
  snapshotAt,
  ready,
}: {
  access: AdminExplorerScope;
  queryKey: string;
  population: AdminRunPopulation;
  filters: Record<string, Json>;
  items: AdminRunListItem[];
  total: number | null;
  snapshotAt: string | null;
  ready: boolean;
}) {
  const copy = getAdminRunExplorerCopy(locale);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [confirmation, setConfirmation] = useState<{
    total: number;
    snapshotAt: string;
  } | null>(null);
  const [state, setState] = useState<{
    busy: boolean;
    completed: number;
    message: string | null;
  }>({
    busy: false,
    completed: 0,
    message: null,
  });
  const cancel = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    setConfirmation(null);
    setState((previous) =>
      previous.busy ? { busy: false, completed: 0, message: copy.exportCancelled } : previous,
    );
  }, [copy.exportCancelled]);
  useEffect(() => {
    cancel();
    setState({ busy: false, completed: 0, message: null });
    return () => {
      generation.current += 1;
      request.current?.abort();
    };
  }, [access.scope, queryKey, cancel]);
  const save = (rows: readonly AdminRunListItem[], scope: 'page' | 'filtered') => {
    const csv = buildAdminRunExplorerCsv(rows, population, locale);
    downloadAdminExplorerCsv(
      csv,
      `admin_${population}_${scope}_${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };
  const exportPage = () => {
    if (!access.enabled || !ready || items.length === 0 || !access.captureScope()()) return;
    save(items, 'page');
    setState({ busy: false, completed: items.length, message: copy.exported });
  };
  const confirm = () => {
    if (!access.enabled || !ready || total === null || total < 1 || !snapshotAt) return;
    if (total > ADMIN_RUN_EXPORT_CAP) {
      setState({ busy: false, completed: 0, message: copy.exportCap });
      return;
    }
    setConfirmation({ total, snapshotAt });
  };
  const start = async () => {
    if (!confirmation || !ready || !access.enabled) return;
    cancel();
    const version = generation.current;
    const controller = new AbortController();
    request.current = controller;
    const accountIsCurrent = access.captureScope();
    const sameGeneration = () => version === generation.current && accountIsCurrent();
    const current = () => sameGeneration() && !controller.signal.aborted;
    let timedOut = false;
    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new AdminRunExportError('cancelled'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ADMIN_REQUEST_TIMEOUT_MS);
    setState({ busy: true, completed: 0, message: null });
    try {
      const result = await Promise.race([
        fetchAdminRunExport({
          population,
          filters,
          snapshot: confirmation.snapshotAt,
          signal: controller.signal,
        }),
        aborted,
      ]);
      if (!current()) return;
      if (Date.parse(result.snapshotAt) !== Date.parse(confirmation.snapshotAt))
        throw new AdminRunExportError('drift');
      const rows = validateRunExport(
        result.items,
        result.total,
        confirmation.total,
        controller.signal,
      );
      if (!current()) return;
      save(rows, 'filtered');
      setState({ busy: false, completed: rows.length, message: copy.exported });
    } catch (error) {
      if (!sameGeneration()) return;
      setState({
        busy: false,
        completed: 0,
        message: timedOut
          ? copy.exportTimeout
          : error instanceof AdminRunExportError && error.reason === 'drift'
            ? copy.exportDrift
            : copy.exportError,
      });
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
    }
  };
  return { ...state, confirmation, confirm, start, cancel, exportPage };
}
