import { useEffect, useRef } from 'react';
import type { AdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import { adminRunNumber } from './adminRunDisplay';

export function AdminRunExportDialog({
  total,
  populationLabel,
  copy,
  onConfirm,
  onCancel,
}: {
  total: number;
  populationLabel: string;
  copy: AdminRunExplorerCopy;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Preserve the opener across StrictMode's repeated effect setup.
    if (previousFocus.current === null && document.activeElement instanceof HTMLElement)
      previousFocus.current = document.activeElement;
    const currentDialog = dialog.current;
    if (currentDialog?.showModal) currentDialog.showModal();
    else currentDialog?.setAttribute('open', '');
    confirm.current?.focus();
    return () => {
      // React removes the modal after effect cleanup; focus can leave its top layer afterwards.
      queueMicrotask(() => {
        if (!currentDialog?.isConnected && previousFocus.current?.isConnected)
          previousFocus.current.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="admin-export-dialog"
      aria-labelledby="admin-export-title"
      aria-describedby="admin-export-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        if (event.shiftKey && document.activeElement === confirm.current) {
          event.preventDefault();
          cancel.current?.focus();
        } else if (!event.shiftKey && document.activeElement === cancel.current) {
          event.preventDefault();
          confirm.current?.focus();
        }
      }}
    >
      <h3 id="admin-export-title">{copy.exportTitle}</h3>
      <p id="admin-export-description">{copy.exportDescription}</p>
      <dl className="admin-explorer-facts">
        <dt>{copy.exportScope}</dt>
        <dd>
          {populationLabel} · {copy.exportFiltered}
        </dd>
        <dt>{copy.exportCount}</dt>
        <dd>{adminRunNumber(total, copy.unavailable)}</dd>
      </dl>
      <p>{copy.exportCap}</p>
      <div className="runs-actions">
        <button ref={confirm} type="button" onClick={onConfirm}>
          {copy.exportConfirm}
        </button>
        <button ref={cancel} type="button" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </dialog>
  );
}
