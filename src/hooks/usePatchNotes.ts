import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { latestPatchNote, unreadPatchNotes } from '@/data/patchNotes';
import { loadServerPatchNotesState, saveServerPatchNotesState } from '@/patchNotes/server';
import {
  type PatchNotesReadState,
  readPatchNotesState,
  writePatchNotesState,
} from '@/patchNotes/storage';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';

interface PatchNotesState {
  seenByIdentity: Record<string, number>;
  authGeneration: number;
  fallbackByIdentity: Record<string, boolean>;
}
const usePatchNotesState = create<PatchNotesState>(() => ({
  seenByIdentity: {},
  authGeneration: 0,
  fallbackByIdentity: {},
}));
// Changes while no menu is mounted still invalidate cached account readiness.
useAuthStore.subscribe((auth, previous) => {
  if (auth.user?.id !== previous.user?.id || auth.isGuest !== previous.isGuest) {
    usePatchNotesState.setState((state) => ({ authGeneration: state.authGeneration + 1 }));
  }
});
const loading = new Map<string, Promise<void>>();
function applyRecord(identity: string, record: PatchNotesReadState): void {
  const local = readPatchNotesState(identity);
  if (local && local.lastSeenSequence > record.lastSeenSequence) return;
  writePatchNotesState(identity, record);
  usePatchNotesState.setState((state) => ({
    seenByIdentity: {
      ...state.seenByIdentity,
      [identity]: Math.max(state.seenByIdentity[identity] ?? 0, record.lastSeenSequence),
    },
  }));
}
function isCurrentUser(userId: string, generation: number): boolean {
  const auth = useAuthStore.getState();
  return (
    !auth.isGuest &&
    auth.user?.id === userId &&
    usePatchNotesState.getState().authGeneration === generation
  );
}
function setFallback(identity: string, enabled: boolean): void {
  usePatchNotesState.setState((state) => ({
    fallbackByIdentity: { ...state.fallbackByIdentity, [identity]: enabled },
  }));
}
function loadIdentity(identity: string, userId: string, generation: number): Promise<void> {
  const requestKey = `${identity}:${generation}`;
  const pending = loading.get(requestKey);
  if (pending) return pending;
  const operation = (async () => {
    try {
      const remote = await loadServerPatchNotesState(userId);
      if (!isCurrentUser(userId, generation)) return;
      const local = readPatchNotesState(identity);
      const merged =
        remote && (!local || remote.lastSeenSequence >= local.lastSeenSequence) ? remote : local;
      if (merged) applyRecord(identity, merged);
      if (merged?.pendingSync && isCurrentUser(userId, generation)) {
        const saved = await saveServerPatchNotesState(userId, merged);
        if (!isCurrentUser(userId, generation)) return;
        applyRecord(identity, saved);
      }
      setFallback(identity, false);
    } catch {
      // Timeout, offline mode and missing migrations all keep local reading usable.
      if (isCurrentUser(userId, generation)) setFallback(identity, true);
    } finally {
      loading.delete(requestKey);
    }
  })();
  loading.set(requestKey, operation);
  return operation;
}

export function usePatchNotes() {
  const userId = useAuthStore((state) => state.user?.id);
  const isGuest = useAuthStore((state) => state.isGuest);
  const connected = Boolean(!isGuest && userId && isSupabaseConfigured);
  const identity = !isGuest && userId ? `user:${userId}` : 'guest';
  const generation = usePatchNotesState((state) => state.authGeneration);
  const requestKey = `${identity}:${generation}`;
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const localSeen = useMemo(() => readPatchNotesState(identity)?.lastSeenSequence ?? 0, [identity]);
  const lastSeen = usePatchNotesState((state) => state.seenByIdentity[identity] ?? localSeen);
  const ready = !connected || hydratedKey === requestKey;
  const localFallback = usePatchNotesState((state) => Boolean(state.fallbackByIdentity[identity]));

  useEffect(() => {
    if (!connected || !userId) return;
    let active = true;
    const retry = () => {
      if (isCurrentUser(userId, generation))
        void loadIdentity(identity, userId, generation).then(() => {
          if (active && isCurrentUser(userId, generation)) setHydratedKey(requestKey);
        });
    };
    const retryVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    retry();
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retryVisible);
    return () => {
      active = false;
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retryVisible);
    };
  }, [connected, identity, userId, generation, requestKey]);

  function markRead() {
    const latest = latestPatchNote();
    if (!latest) return;
    const existing = readPatchNotesState(identity);
    const record =
      existing && existing.lastSeenSequence > latest.sequence
        ? existing
        : {
            version: 1 as const,
            lastSeenSequence: latest.sequence,
            lastSeenVersion: latest.version,
            pendingSync: connected,
          };
    applyRecord(identity, record);
    if (connected && userId && isCurrentUser(userId, generation))
      void saveServerPatchNotesState(userId, record)
        .then((saved) => {
          if (!isCurrentUser(userId, generation)) return;
          applyRecord(identity, saved);
          setFallback(identity, false);
        })
        .catch(() => {
          if (isCurrentUser(userId, generation)) setFallback(identity, true);
        });
  }
  return {
    unread: ready ? unreadPatchNotes(lastSeen) : [],
    identity,
    markRead,
    localFallback: ready && localFallback,
  };
}
