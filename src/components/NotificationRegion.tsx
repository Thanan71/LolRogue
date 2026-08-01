import { useEffect, useState } from 'react';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useRunStore } from '@/stores/runStore';
import { fr } from '@/i18n/fr';

export function NotificationRegion() {
  const saveStatus = useRunStore((state) => state.saveStatus);
  const saveError = useRunStore((state) => state.saveError);
  const enhancementError = useEnhancementStore((state) => state.error);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (saveStatus === 'saved') setMessage(fr.notifications.runSaved);
    if (saveStatus === 'failed') setMessage(saveError || fr.notifications.saveFailed);
  }, [saveStatus, saveError]);

  useEffect(() => {
    if (enhancementError) setMessage(enhancementError);
  }, [enhancementError]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 10000,
        maxWidth: 360,
        padding: '12px 16px',
        border: '1px solid #c8aa6e',
        borderRadius: 8,
        background: '#101827',
        color: '#fff',
      }}
    >
      {message}
    </div>
  );
}
