import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ADMINISTRATION_VIEWS,
  parseAdministrationLocation,
  serializeAdministrationLocation,
  sanitizeAdministrationContext,
  type AdministrationContextKey,
  type AdministrationGroup,
  type AdministrationLocation,
  type AdministrationView,
} from '../domain/administrationNavigation';

export interface AdministrationNavigation {
  location: AdministrationLocation;
  update: (
    transform: (previous: AdministrationLocation) => AdministrationLocation,
    replace?: boolean,
  ) => void;
  select: (group: AdministrationGroup, view?: AdministrationView) => void;
  setContext: (key: AdministrationContextKey, value: object) => void;
  selectPlayer: (id: string | null) => void;
  selectRun: (id: string | null) => void;
}
export function useAdministrationNavigation(): AdministrationNavigation {
  const [params, setParams] = useSearchParams();
  const location = useMemo(() => parseAdministrationLocation(params), [params]);
  useEffect(() => {
    if (params.has('tab')) setParams(serializeAdministrationLocation(location), { replace: true });
  }, [params, location, setParams]);
  const update = useCallback<AdministrationNavigation['update']>(
    (transform, replace = false) => {
      setParams(
        (previous) =>
          serializeAdministrationLocation(transform(parseAdministrationLocation(previous))),
        { replace },
      );
    },
    [setParams],
  );
  const select = useCallback(
    (group: AdministrationGroup, view?: AdministrationView) => {
      update((previous) => ({ ...previous, group, view: view ?? ADMINISTRATION_VIEWS[group][0] }));
    },
    [update],
  );
  const setContext = useCallback(
    (key: AdministrationContextKey, value: object) => {
      update((previous) => ({
        ...previous,
        contexts: { ...previous.contexts, [key]: sanitizeAdministrationContext(key, value) },
      }));
    },
    [update],
  );
  const selectPlayer = useCallback(
    (player: string | null) => update((previous) => ({ ...previous, player })),
    [update],
  );
  const selectRun = useCallback(
    (run: string | null) => update((previous) => ({ ...previous, run })),
    [update],
  );
  return useMemo(
    () => ({ location, update, select, setContext, selectPlayer, selectRun }),
    [location, update, select, setContext, selectPlayer, selectRun],
  );
}
