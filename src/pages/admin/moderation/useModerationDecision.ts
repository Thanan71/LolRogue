import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminMutationOutcomeUnknown, runAdminMutation } from '../adminMutationRequest';
import type { AdminExplorerScope } from '../explorer/adminExplorerTypes';
import { ADMIN_REQUEST_TIMEOUT_MS } from '../useAdminSection';
import { sendModerationDecision } from './moderationClient';
import type { ModerationDecisionRequest, ModerationReceipt } from './moderationTypes';

export interface ModerationDecisionState {
  request: ModerationDecisionRequest;
  status: 'sending' | 'unknown' | 'rejected' | 'done';
  receipt: ModerationReceipt | null;
}

/** An uncertain write keeps its exact UUID and normalized payload; it is never retried automatically. */
export function useModerationDecision({
  access,
  active,
  allowed,
  deny,
  onSettled,
}: {
  access: AdminExplorerScope;
  active: boolean;
  allowed: boolean;
  deny: () => void;
  onSettled: () => void;
}) {
  const [state, setState] = useState<{
    scope: object;
    value: ModerationDecisionState | null;
  }>({ scope: access.scope, value: null });
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const current = state.scope === access.scope ? state.value : null;

  useEffect(() => {
    return () => {
      generation.current += 1;
      pending.current?.abort();
      pending.current = null;
    };
  }, [access.scope]);
  const send = useCallback(
    async (request: ModerationDecisionRequest) => {
      if (!allowed || !active || pending.current) return false;
      const isAccountCurrent = access.captureScope();
      const controller = new AbortController();
      pending.current = controller;
      const version = ++generation.current;
      const isCurrent = () => version === generation.current && isAccountCurrent();
      setState({ scope: access.scope, value: { request, status: 'sending', receipt: null } });
      try {
        const receipt = await runAdminMutation(
          (signal) => sendModerationDecision(request, signal),
          controller,
          ADMIN_REQUEST_TIMEOUT_MS,
        );
        if (!isCurrent()) return false;
        if (receipt.code === 'admin_access_denied') {
          deny();
          setState({ scope: access.scope, value: null });
          return false;
        }
        setState({
          scope: access.scope,
          value: {
            request,
            status: receipt.outcome === 'rejected' ? 'rejected' : 'done',
            receipt,
          },
        });
        onSettled();
        return receipt.outcome !== 'rejected';
      } catch (error) {
        if (!isCurrent()) return false;
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
        if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
          deny();
          setState({ scope: access.scope, value: null });
          return false;
        }
        const knownRejection = typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(code);
        setState({
          scope: access.scope,
          value: {
            request,
            status:
              error instanceof AdminMutationOutcomeUnknown || !knownRejection
                ? 'unknown'
                : 'rejected',
            receipt: null,
          },
        });
        if (knownRejection && !(error instanceof AdminMutationOutcomeUnknown)) onSettled();
        return false;
      } finally {
        if (pending.current === controller) pending.current = null;
      }
    },
    [allowed, active, access.scope, access.captureScope, deny, onSettled],
  );
  const retry = useCallback(() => {
    if (current?.status !== 'unknown') return Promise.resolve(false);
    return send(current.request);
  }, [current, send]);
  const clear = useCallback(() => {
    if (pending.current || current?.status === 'unknown') return;
    setState({ scope: access.scope, value: null });
  }, [access.scope, current]);

  return {
    state: allowed ? current : null,
    send,
    retry,
    clear,
    locked: current?.status === 'sending' || current?.status === 'unknown',
  };
}
