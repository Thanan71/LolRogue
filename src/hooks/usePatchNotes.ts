import { create } from 'zustand';
import { latestPatchNote, unreadPatchNotes } from '@/data/patchNotes';
import { useAuthStore } from '@/stores/authStore';

interface PatchNotesState {
  seenByIdentity: Record<string, number>;
}
const usePatchNotesState = create<PatchNotesState>(() => ({ seenByIdentity: {} }));

export function usePatchNotes() {
  const userId = useAuthStore((state) => state.user?.id);
  const isGuest = useAuthStore((state) => state.isGuest);
  const identity = !isGuest && userId ? `user:${userId}` : 'guest';
  const lastSeen = usePatchNotesState((state) => state.seenByIdentity[identity] ?? 0);
  function markRead() {
    const latest = latestPatchNote();
    if (!latest) return;
    usePatchNotesState.setState((state) => ({
      seenByIdentity: { ...state.seenByIdentity, [identity]: Math.max(lastSeen, latest.sequence) },
    }));
  }
  return { unread: unreadPatchNotes(lastSeen), identity, markRead };
}
