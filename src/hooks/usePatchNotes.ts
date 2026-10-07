import { create } from 'zustand';
import { unreadPatchNotes } from '@/data/patchNotes';
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
  return { unread: unreadPatchNotes(lastSeen), identity };
}
