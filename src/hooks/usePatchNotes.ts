import { useMemo } from 'react';
import { create } from 'zustand';
import { latestPatchNote, unreadPatchNotes } from '@/data/patchNotes';
import { readPatchNotesState, writePatchNotesState } from '@/patchNotes/storage';
import { useAuthStore } from '@/stores/authStore';

interface PatchNotesState {
  seenByIdentity: Record<string, number>;
}
const usePatchNotesState = create<PatchNotesState>(() => ({ seenByIdentity: {} }));

export function usePatchNotes() {
  const userId = useAuthStore((state) => state.user?.id);
  const isGuest = useAuthStore((state) => state.isGuest);
  const identity = !isGuest && userId ? `user:${userId}` : 'guest';
  const localSeen = useMemo(() => readPatchNotesState(identity)?.lastSeenSequence ?? 0, [identity]);
  const lastSeen = usePatchNotesState((state) => state.seenByIdentity[identity] ?? localSeen);
  function markRead() {
    const latest = latestPatchNote();
    if (!latest) return;
    writePatchNotesState(identity, {
      version: 1,
      lastSeenSequence: Math.max(lastSeen, latest.sequence),
      lastSeenVersion: latest.version,
      pendingSync: false,
    });
    usePatchNotesState.setState((state) => ({
      seenByIdentity: { ...state.seenByIdentity, [identity]: Math.max(lastSeen, latest.sequence) },
    }));
  }
  return { unread: unreadPatchNotes(lastSeen), identity, markRead };
}
