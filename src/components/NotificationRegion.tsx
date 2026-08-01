import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useRunStore } from '@/stores/runStore';

export function NotificationRegion() {
  const saveStatus = useRunStore((state) => state.saveStatus);
  const saveError = useRunStore((state) => state.saveError);
  const enhancementError = useEnhancementStore((state) => state.error);
  const [message, setMessage] = useState<string | null>(null);
  const isCritical = saveStatus === 'failed' || Boolean(enhancementError);

  useEffect(() => {
    if (saveStatus === 'saving' || saveStatus === 'retrying') {
      setMessage(fr.notifications.saving);
    }
    if (saveStatus === 'saved') setMessage(fr.notifications.runSaved);
    if (saveStatus === 'failed') setMessage(saveError || fr.notifications.saveFailed);
  }, [saveStatus, saveError]);

  useEffect(() => {
    if (enhancementError) setMessage(enhancementError);
  }, [enhancementError]);

  useEffect(() => {
    if (!message || isCritical) return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [isCritical, message]);

  const dismiss = () => {
    setMessage(null);
    if (enhancementError) useEnhancementStore.setState({ error: null });
  };

  const retrySave = () => {
    const state = useRunStore.getState();
    void state.endRun(
      state.completedRunSnapshot?.summary.won ?? false,
      state.completedRunSnapshot?.runId ?? state.runId,
      state.completedRunSnapshot?.summary,
    );
  };

  if (!message) return null;
  return (
    <div
      role={isCritical ? 'alert' : 'status'}
      aria-live={isCritical ? 'assertive' : 'polite'}
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
      <div>{message}</div>
      {saveStatus === 'failed' && (
        <button type="button" onClick={retrySave}>
          {fr.notifications.retrySave}
        </button>
      )}
      {isCritical && (
        <button type="button" onClick={dismiss} aria-label={fr.common.close}>
          {fr.common.close}
        </button>
      )}
    </div>
  );
}
