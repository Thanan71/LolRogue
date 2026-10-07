import { useEffect, useMemo } from 'react';
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
  readyByIdentity: Record<string, boolean>;
  fallbackByIdentity: Record<string, boolean>;
}
const usePatchNotesState = create<PatchNotesState>(() => ({
  seenByIdentity: {},
  readyByIdentity: {},
  fallbackByIdentity: {},
}));
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
function isCurrentUser(userId: string): boolean {
  const auth = useAuthStore.getState();
  return !auth.isGuest && auth.user?.id === userId;
}
function setFallback(identity: string, enabled: boolean): void {
  usePatchNotesState.setState((state) => ({
    fallbackByIdentity: { ...state.fallbackByIdentity, [identity]: enabled },
  }));
}
function loadIdentity(identity: string, userId: string): Promise<void> {
  const pending = loading.get(identity);
  if (pending) return pending;
  const operation = (async () => {
    try {
      const remote = await loadServerPatchNotesState(userId);
      if (!isCurrentUser(userId)) return;
      const local = readPatchNotesState(identity);
      const merged =
        remote && (!local || remote.lastSeenSequence >= local.lastSeenSequence) ? remote : local;
      if (merged) applyRecord(identity, merged);
      if (merged?.pendingSync && isCurrentUser(userId)) {
        applyRecord(identity, await saveServerPatchNotesState(userId, merged));
      }
      setFallback(identity, false);
    } catch {
      // Timeout, offline mode and missing migrations all keep local reading usable.
      setFallback(identity, true);
    } finally {
      usePatchNotesState.setState((state) => ({
        readyByIdentity: { ...state.readyByIdentity, [identity]: true },
      }));
      loading.delete(identity);
    }
  })();
  loading.set(identity, operation);
  return operation;
}

export function usePatchNotes() {
  const userId = useAuthStore((state) => state.user?.id);
  const isGuest = useAuthStore((state) => state.isGuest);
  const connected = Boolean(!isGuest && userId && isSupabaseConfigured);
  const identity = !isGuest && userId ? `user:${userId}` : 'guest';
  const localSeen = useMemo(() => readPatchNotesState(identity)?.lastSeenSequence ?? 0, [identity]);
  const lastSeen = usePatchNotesState((state) => state.seenByIdentity[identity] ?? localSeen);
  const ready = usePatchNotesState(
    (state) => !connected || Boolean(state.readyByIdentity[identity]),
  );
  const localFallback = usePatchNotesState((state) => Boolean(state.fallbackByIdentity[identity]));

  useEffect(() => {
    if (!connected || !userId) return;
    const retry = () => {
      if (isCurrentUser(userId)) void loadIdentity(identity, userId);
    };
    const retryVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    retry();
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retryVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retryVisible);
    };
  }, [connected, identity, userId]);

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
    if (connected && userId && isCurrentUser(userId))
      void saveServerPatchNotesState(userId, record)
        .then((saved) => {
          applyRecord(identity, saved);
          setFallback(identity, false);
        })
        .catch(() => {
          setFallback(identity, true);
        });
  }
  return { unread: ready ? unreadPatchNotes(lastSeen) : [], identity, markRead, localFallback };
}
