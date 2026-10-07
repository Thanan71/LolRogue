import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { latestPatchNote, unreadPatchNotes } from '@/data/patchNotes';
import { loadServerPatchNotesState, saveServerPatchNotesState } from '@/patchNotes/server';
import { readPatchNotesState, writePatchNotesState } from '@/patchNotes/storage';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';

interface PatchNotesState {
  seenByIdentity: Record<string, number>;
  readyByIdentity: Record<string, boolean>;
}
const usePatchNotesState = create<PatchNotesState>(() => ({
  seenByIdentity: {},
  readyByIdentity: {},
}));
const loading = new Map<string, Promise<void>>();

function loadIdentity(identity: string, userId: string): Promise<void> {
  const pending = loading.get(identity);
  if (pending) return pending;
  const operation = (async () => {
    try {
      const remote = await loadServerPatchNotesState(userId);
      const local = readPatchNotesState(identity);
      const merged =
        remote && (!local || remote.lastSeenSequence >= local.lastSeenSequence) ? remote : local;
      if (merged) {
        writePatchNotesState(identity, merged);
        usePatchNotesState.setState((state) => ({
          seenByIdentity: {
            ...state.seenByIdentity,
            [identity]: Math.max(state.seenByIdentity[identity] ?? 0, merged.lastSeenSequence),
          },
        }));
      }
    } catch {
      // Publication reading does not participate in the Auth bootstrap.
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

  useEffect(() => {
    if (connected && userId) void loadIdentity(identity, userId);
  }, [connected, identity, userId]);

  function markRead() {
    const latest = latestPatchNote();
    if (!latest) return;
    const record = {
      version: 1 as const,
      lastSeenSequence: Math.max(lastSeen, latest.sequence),
      lastSeenVersion: latest.version,
      pendingSync: connected,
    };
    writePatchNotesState(identity, record);
    usePatchNotesState.setState((state) => ({
      seenByIdentity: { ...state.seenByIdentity, [identity]: record.lastSeenSequence },
    }));
    if (connected)
      void saveServerPatchNotesState(record)
        .then((saved) => {
          writePatchNotesState(identity, saved);
          usePatchNotesState.setState((state) => ({
            seenByIdentity: {
              ...state.seenByIdentity,
              [identity]: Math.max(state.seenByIdentity[identity] ?? 0, saved.lastSeenSequence),
            },
          }));
        })
        .catch(() => {
          /* Reading already succeeded locally. */
        });
  }
  return { unread: ready ? unreadPatchNotes(lastSeen) : [], identity, markRead };
}
