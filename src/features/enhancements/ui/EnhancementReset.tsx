import { useEffect, useRef, useState } from 'react';
import type { EnhancementContentLocale } from '@/i18n/enhancementContent';
import type { EnhancementResetPreview } from '@/services/interfaces/IEnhancementRepository';
import type { EnhancementUiCopy } from './copy';
import { EnhancementDialog } from './EnhancementDialog';
import { historicalNodeName } from './presentation';

export function EnhancementReset({
  previewReset,
  resetTree,
  disabled,
  copy,
  locale,
}: {
  previewReset: () => Promise<EnhancementResetPreview | null>;
  resetTree: (revision: number) => Promise<boolean>;
  disabled: boolean;
  copy: EnhancementUiCopy;
  locale: EnhancementContentLocale;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EnhancementResetPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load() {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    setPreview(null);
    setOpen(true);
    try {
      const result = await previewReset();
      if (alive.current) {
        setPreview(result);
        setError(!result);
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!preview?.eligible || busy || disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const success = await resetTree(preview.revision);
      if (alive.current) {
        if (success) setOpen(false);
        else {
          setError(true);
          setPreview(null);
        }
      }
    } catch {
      if (alive.current) {
        setError(true);
        setPreview(null);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="enhancement-reset-button"
        disabled={disabled || busy}
        onClick={() => void load()}
      >
        {copy.reset}
      </button>
      {open && (
        <EnhancementDialog
          title={copy.resetTitle}
          busy={busy}
          confirmLabel={copy.confirmReset}
          cancelLabel={copy.cancel}
          canConfirm={preview?.eligible === true && !disabled}
          onConfirm={() => void confirm()}
          onCancel={() => setOpen(false)}
        >
          {busy && <p role="status">{preview ? copy.saving : copy.resetLoading}</p>}
          {error && (
            <div role="alert">
              <p>{copy.failed}</p>
              <button type="button" onClick={() => void load()} disabled={busy}>
                {copy.retry}
              </button>
            </div>
          )}
          {preview && (
            <>
              {!preview.eligible && (
                <p role="alert">
                  {preview.reason === 'tree_empty'
                    ? copy.resetEmpty
                    : preview.reason === 'balance_limit'
                      ? copy.resetLimit
                      : preview.historyUnavailable
                        ? copy.resetUnavailable
                        : copy.failed}
                </p>
              )}
              <dl className="enhancement-facts">
                <dt>{copy.refund}</dt>
                <dd>{preview.refundAmount.toLocaleString(locale)}</dd>
                <dt>{copy.fee}</dt>
                <dd>{preview.feeAmount.toLocaleString(locale)}</dd>
                <dt>{copy.finalBalance}</dt>
                <dd>{preview.remainingCandies.toLocaleString(locale)}</dd>
              </dl>
              <p>
                {copy.removed}: {preview.removedNodeIds.length.toLocaleString(locale)}
              </p>
              <ul className="enhancement-reset-nodes">
                {preview.removedNodeIds.map((id) => (
                  <li key={id}>{historicalNodeName(locale, id)}</li>
                ))}
              </ul>
            </>
          )}
          <p>{copy.preserved}</p>
        </EnhancementDialog>
      )}
    </>
  );
}
